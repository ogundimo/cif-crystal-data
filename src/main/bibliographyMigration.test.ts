import { afterEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { initDb, createEntryWriter, getPublAuthors, getDataAuthors, getStartupRefresh, setStartupRefresh, readStoredCif } from './db';
import { migrateDatabase } from './migrations';
import { parseCif, splitCifDataBlocks } from '../parser/cifParser';
import { blockIdentities, contentHash } from './sourceIdentity';
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function profile() {
  const root = mkdtempSync(join(tmpdir(), 'cif-bibliography-')); roots.push(root);
  const db = initDb(root);
  const text = readFileSync(resolve('src/parser/__fixtures__/synthetic-test.cif'), 'utf8') + `
_audit_author_name 'Data depositor'
_audit_author_address 'Test institution'
`;
  const block = splitCifDataBlocks(text)[0];
  const writer = createEntryWriter(db);
  expect(writer.writeBatch([{ sourceFilename: 'missing.cif', sourcePath: join(root, 'missing.cif'), sourceContent: Buffer.from(text),
    blockKey: blockIdentities([block])[0], blockHash: contentHash(block.text), dataBlockIndex: 0, sourceMtimeMs: 1, sourceSize: Buffer.byteLength(text), entry: parseCif(text) }])).toEqual([]);
  return { root, db, text };
}
describe('bibliography upgrade and settings', () => {
  it('repairs unchanged preserved sources with missing originals without changing IDs, bytes or atom rows', () => {
    const { root, db, text } = profile();
    try {
      const before = db.prepare('SELECT * FROM imported_files').all();
      const atoms = db.prepare('SELECT * FROM atom_sites').all();
      db.exec("DROP TABLE data_authors; PRAGMA user_version=9; UPDATE entries SET reference='', publ_title=''; DELETE FROM publ_authors;");
      const migration = migrateDatabase(db, join(root, 'cif-local.db'), true);
      expect(migration.toVersion).toBe(10);
      expect(db.prepare('SELECT * FROM imported_files').all()).toEqual(before);
      expect(db.prepare('SELECT * FROM atom_sites').all()).toEqual(atoms);
      expect(readStoredCif(1, db)).toBe(splitCifDataBlocks(text)[0].text);
      expect(getPublAuthors(1, db).length).toBeGreaterThan(0);
      expect(getDataAuthors(1, db)[0]).toMatchObject({ name: 'Data depositor', address: 'Test institution' });
      expect(db.prepare('SELECT reference FROM entries WHERE id=1').get()).toEqual({ reference: parseCif(text).reference });
      expect(readdirSync(root).some(name => name.startsWith('cif-local.pre-migration-v9'))).toBe(true);
    } finally { db.close(); }
  });
  it('rolls back corrupt stored data and leaves a snapshot and retryable schema', () => {
    const { root, db } = profile();
    try {
      db.exec("DROP TABLE data_authors; PRAGMA user_version=9; UPDATE imported_files SET block_hash='bad';");
      expect(() => migrateDatabase(db, join(root, 'cif-local.db'), true)).toThrow('checksum');
      expect(db.pragma('user_version', { simple: true })).toBe(9);
      expect(db.prepare("SELECT name FROM sqlite_master WHERE name='data_authors'").get()).toBeUndefined();
      expect(readdirSync(root).some(name => name.startsWith('cif-local.pre-migration-v9'))).toBe(true);
    } finally { db.close(); }
  });
  it('defaults startup refresh off and persists an explicit choice across restart', () => {
    const { root, db } = profile();
    expect(getStartupRefresh(db)).toBe(false); setStartupRefresh(true, db); db.close();
    const reopened = new Database(join(root, 'cif-local.db'));
    try { expect(getStartupRefresh(reopened)).toBe(true); setStartupRefresh(false, reopened); expect(getStartupRefresh(reopened)).toBe(false); }
    finally { reopened.close(); }
  });
});
