import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import type { EntryRow, RecoveryChoice, SourceRecoveryResult } from '../../shared/types';
import { parseCif, splitCifDataBlocks } from '../../parser/cifParser';
import { blockIdentities, contentHash, sourceKey } from '../sourceIdentity';
import { getDb } from './connection';
import { readStoredCif } from './sources';
import { createEntryWriter } from './writer';
import { validateArchive } from './preservation';

interface Payload { bytes: Buffer; path: string; mtime: number; index: number }
interface Ticket { entryId: number; database: Database.Database; stamp: string; expires: number; payloads: Payload[]; removal: boolean }
const tickets = new Map<string, Ticket>();

function entryRow(id: number, db: Database.Database): EntryRow {
  const entry = db.prepare('SELECT * FROM entries WHERE id = ?').get(id) as EntryRow | undefined;
  if (!entry) throw new Error('This entry no longer exists.');
  return entry;
}

function unavailable(id: number, db: Database.Database): boolean {
  const row = db.prepare(`SELECT f.content_hash, c.hash FROM imported_files f LEFT JOIN source_contents c
    ON c.hash = f.content_hash WHERE f.entry_id = ?`).get(id) as { content_hash: string | null; hash: string | null } | undefined;
  return !row?.hash;
}

function requireUnavailable(id: number, db: Database.Database): EntryRow {
  const entry = entryRow(id, db);
  if (!unavailable(id, db)) throw new Error('This entry has stored source content. Recovery cannot replace or remove it.');
  return entry;
}

function stamp(db: Database.Database): string {
  return JSON.stringify([db.prepare('SELECT total_changes() AS n').get(), db.pragma('data_version', { simple: true })]);
}

export function inspectSourceRecovery(id: number, db: Database.Database = getDb()): SourceRecoveryResult {
  const entry = entryRow(id, db);
  if (!unavailable(id, db)) return { eligible: false };
  // Metadata only suggests candidates. Verify each candidate's actual managed bytes.
  const rows = db.prepare('SELECT * FROM entries WHERE id != ? AND formula = ? ORDER BY id').all(id, entry.formula) as EntryRow[];
  const candidates = rows.filter(row => {
    try { readStoredCif(row.id, db); return true; } catch { return false; }
  });
  return { eligible: true, entry, candidates };
}

function saveTicket(id: number, payloads: Payload[], db: Database.Database, removal = false): string {
  for (const [key, ticket] of tickets) if (ticket.expires < Date.now()) tickets.delete(key);
  if (tickets.size >= 8) tickets.delete(tickets.keys().next().value!);
  const token = randomUUID();
  tickets.set(token, { entryId: id, database: db, stamp: stamp(db), expires: Date.now() + 15 * 60_000, payloads, removal });
  return token;
}

function choices(payloads: Payload[]): RecoveryChoice[] {
  return payloads.map((payload, index) => {
    const block = splitCifDataBlocks(payload.bytes.toString('utf8'))[payload.index];
    const entry = parseCif(block.text);
    return { index, filename: basename(payload.path), block: block.name || '(unnamed)', formula: entry.formula,
      reference: entry.reference, atoms: entry.atomSites.length,
      cell: [entry.cellAAngstrom, entry.cellBAngstrom, entry.cellCAngstrom, entry.cellAlpha, entry.cellBeta, entry.cellGamma] };
  });
}

export function previewSourceRecovery(id: number, path: string, backup: boolean, db: Database.Database = getDb()): SourceRecoveryResult {
  const entry = requireUnavailable(id, db);
  let payloads: Payload[];
  if (backup) payloads = readBackupPayloads(path, entry, db);
  else {
    if (statSync(path).size > 32 * 1024 * 1024) throw new Error('Recovery accepts CIF files up to 32 MiB.');
    const bytes = readFileSync(path);
    payloads = splitCifDataBlocks(bytes.toString('utf8')).map((_, index) => ({ bytes, path, index, mtime: statSync(path).mtimeMs }));
  }
  if (!payloads.length) throw new Error('No matching preserved sources were found in this backup.');
  const preview = choices(payloads);
  return { eligible: true, entry, choices: preview, token: saveTicket(id, payloads, db) };
}

function readBackupPayloads(path: string, entry: EntryRow, db: Database.Database): Payload[] {
  const archive = new Database(path, { readonly: true, fileMustExist: true });
  try {
    archive.pragma('trusted_schema = OFF');
    archive.exec('BEGIN');
    validateArchive(archive, db);
    return archive.prepare(`SELECT c.content, f.source_path, f.data_block_index FROM entries e
      JOIN imported_files f ON f.entry_id = e.id JOIN source_contents c ON c.hash = f.content_hash
      WHERE e.formula = ? OR e.source_filename = ? ORDER BY e.id`).all(entry.formula, entry.source_filename)
      .map(value => {
        const row = value as { content: Buffer; source_path: string; data_block_index: number };
        return { bytes: row.content, path: row.source_path, index: row.data_block_index, mtime: -1 };
      });
  } finally { archive.close(); }
}

function recoverySnapshot(db: Database.Database): string {
  const path = join(dirname(db.name), `cif-local.pre-source-recovery-${randomUUID()}.db`);
  db.prepare('VACUUM INTO ?').run(path);
  const snapshot = new Database(path, { readonly: true, fileMustExist: true });
  try {
    if (snapshot.pragma('integrity_check', { simple: true }) !== 'ok' || (snapshot.pragma('foreign_key_check') as unknown[]).length) {
      throw new Error('Recovery snapshot verification failed. No entry was changed.');
    }
  } finally { snapshot.close(); }
  return path;
}

export function prepareSourceRemoval(id: number, db: Database.Database = getDb()): SourceRecoveryResult {
  const entry = requireUnavailable(id, db);
  return { eligible: true, entry, removal: true, token: saveTicket(id, [], db, true) };
}

export function confirmSourceRecovery(id: number, token: string, choice: number, db: Database.Database = getDb()): SourceRecoveryResult {
  requireUnavailable(id, db);
  const ticket = tickets.get(token);
  if (!ticket || ticket.entryId !== id || ticket.database !== db || ticket.expires < Date.now() || ticket.stamp !== stamp(db)) {
    throw new Error('The recovery preview expired or the database changed. Reopen recovery and review again.');
  }
  if (ticket.removal) {
    if (choice !== 0) throw new Error('Invalid removal confirmation.');
    db.transaction(() => {
      // A surviving block must not make refresh skip this now-incomplete source.
      db.prepare(`UPDATE imported_files SET source_mtime_ms = -1 WHERE entry_id IN
        (SELECT id FROM entries WHERE source_key = (SELECT source_key FROM entries WHERE id = ?))
        OR source_path = (SELECT source_path FROM imported_files WHERE entry_id = ?)`).run(id, id);
      db.prepare('DELETE FROM entries WHERE id = ?').run(id);
    })();
    tickets.delete(token);
    return { eligible: true, completed: 'removed' };
  }
  const payload = ticket.payloads[choice];
  if (!payload) throw new Error('Select a valid CIF block.');
  const result = applyRecovery(id, payload, db);
  tickets.delete(token);
  return result;
}

function applyRecovery(id: number, payload: Payload, db: Database.Database): SourceRecoveryResult {
  const hash = contentHash(payload.bytes);
  const old = db.prepare('SELECT content_hash FROM imported_files WHERE entry_id = ?').get(id) as { content_hash: string | null } | undefined;
  if (old?.content_hash && old.content_hash !== hash) throw new Error('This file does not match the original fingerprint. Select an exact copy.');
  const key = sourceKey(payload.path);
  const owner = db.prepare(`SELECT id FROM entries WHERE id != ? AND (source_key = ? OR id IN
    (SELECT entry_id FROM imported_files WHERE source_path = ? ${process.platform === 'win32' ? 'COLLATE NOCASE' : ''}))`).get(id, key, payload.path);
  if (owner) throw new Error('That source already belongs to another entry. Open the existing entry instead; no records were merged.');
  const blocks = splitCifDataBlocks(payload.bytes.toString('utf8'));
  const identities = blockIdentities(blocks);
  // Parse the entire physical file before taking a snapshot or changing anything.
  const items = blocks.map((block, index) => ({ sourceFilename: blocks.length === 1 ? basename(payload.path) : `${basename(payload.path)}#${index + 1}-${block.name.replace(/[^A-Za-z0-9_.-]+/g, '_') || `block-${index + 1}`}`,
    sourcePath: payload.path, sourceContent: payload.bytes, sourceMtimeMs: payload.mtime, sourceSize: payload.bytes.length,
    dataBlockIndex: index, blockKey: identities[index], blockHash: contentHash(block.text), entry: parseCif(block.text) }));
  const snapshot = recoverySnapshot(db);
  db.transaction(() => {
    db.prepare('UPDATE entries SET source_key = ?, block_key = ? WHERE id = ?').run(key, identities[payload.index], id);
    const failures = createEntryWriter(db).writeBatch(items);
    if (failures.length) throw new Error('Recovery import failed; the previous entry was preserved.', { cause: failures[0].error });
    readStoredCif(id, db);
  })();
  return { eligible: true, completed: 'recovered', entry: entryRow(id, db), snapshot };
}
