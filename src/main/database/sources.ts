import { readFileSync } from 'node:fs';
import type Database from 'better-sqlite3';
import { splitCifDataBlocks } from '../../parser/cifParser';
import { contentHash, sourceKey } from '../sourceIdentity';
import { getDb } from './connection';

export function readStoredCif(entryId: number, database: Database.Database = getDb()): string {
  const row = database.prepare(`SELECT f.*, c.content FROM imported_files f
    LEFT JOIN source_contents c ON c.hash = f.content_hash WHERE f.entry_id = ?`).get(entryId) as {
      content: Buffer | null; content_hash: string | null; block_hash: string | null; data_block_index: number;
    } | undefined;
  if (!row) throw new Error('Source association unavailable. Reimport the original CIF folder.');
  if (!row.content || !row.content_hash) throw new Error('This legacy record has no verified imported copy. Reimport its original CIF folder to update metadata and preserve the current source.');
  if (contentHash(row.content) !== row.content_hash) throw new Error('Stored CIF integrity check failed. Restore a verified backup.');
  const block = splitCifDataBlocks(row.content.toString('utf8'))[row.data_block_index];
  if (!block || contentHash(block.text) !== row.block_hash) throw new Error('Stored CIF block integrity check failed. Restore a verified backup.');
  return block.text;
}

/** A relink only changes location; accepting changed bytes requires an explicit import. */
export function relinkSource(entryId: number, path: string, database: Database.Database = getDb()): void {
  const row = database.prepare(`SELECT e.source_key, f.content_hash FROM entries e
    JOIN imported_files f ON f.entry_id = e.id WHERE e.id = ?`).get(entryId) as {
      source_key: string; content_hash: string | null;
    } | undefined;
  if (!row?.content_hash) throw new Error('No imported fingerprint is available for this legacy record. Reimport the original folder to establish a verified source.');
  let bytes: Buffer;
  try { bytes = readFileSync(path); }
  catch { throw new Error('Cannot read the selected CIF. Choose an accessible file or cancel; the stored copy remains available.'); }
  if (contentHash(bytes) !== row.content_hash) throw new Error('The selected file differs from the imported source (including block names/order). Choose an exact copy, or import the changed file explicitly. No records were changed.');
  const key = sourceKey(path);
  database.transaction(() => {
    if (key !== row.source_key && database.prepare('SELECT 1 FROM entries WHERE source_key = ?').get(key)) {
      throw new Error('That path already belongs to another imported source. Choose a different location.');
    }
    database.prepare(`UPDATE imported_files SET source_path = ? WHERE entry_id IN
      (SELECT id FROM entries WHERE source_key = ?)`).run(path, row.source_key);
    database.prepare('UPDATE entries SET source_key = ? WHERE source_key = ?').run(key, row.source_key);
  })();
}
