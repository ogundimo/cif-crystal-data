import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initDb } from './connection';
import { createEntryWriter } from './writer';
import { parseCif } from '../../parser/cifParser';
import { importCifFolder } from '../ingest';
import { backupProfile } from './preservation';
import { readStoredCif } from './sources';
import { confirmSourceRecovery, inspectSourceRecovery, prepareSourceRemoval, previewSourceRecovery } from './sourceRecovery';

let root: string;
let db: Database.Database;
const cif = (name = 'one') => `data_${name}\n_chemical_formula_sum 'Na Cl'\n_cell_length_a 4\n_cell_length_b 4\n_cell_length_c 4\n_cell_angle_alpha 90\n_cell_angle_beta 90\n_cell_angle_gamma 90\n_space_group_IT_number 1\n_space_group_name_H-M_alt 'P 1'\nloop_\n_atom_site_label\n_atom_site_type_symbol\n_atom_site_fract_x\n_atom_site_fract_y\n_atom_site_fract_z\nNa1 Na 0 0 0\nCl1 Cl .5 .5 .5\n`;
function orphan() {
  expect(createEntryWriter(db).writeBatch([{ sourceFilename: 'unavailable.cif', entry: parseCif(cif()) }])).toEqual([]);
  return (db.prepare("SELECT id FROM entries WHERE source_filename='unavailable.cif'").get() as {id:number}).id;
}
function source(text = cif()) {
  const path = join(root, 'selected.cif'); writeFileSync(path, text); return path;
}
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'cif-recovery-')); db = initDb(root); });
afterEach(() => { vi.restoreAllMocks(); db.close(); rmSync(root, { recursive: true, force: true }); });

it('suggests only verified candidates and never mutates during inspection', () => {
  const id = orphan(); source(); importCifFolder(root, createEntryWriter(db));
  const result = inspectSourceRecovery(id, db);
  expect(result.eligible).toBe(true); expect(result.candidates).toHaveLength(1);
  expect(() => readStoredCif(id, db)).toThrow('Source association');
  db.prepare("UPDATE source_contents SET content = X'00'").run();
  expect(inspectSourceRecovery(id, db).candidates).toEqual([]);
});

it('previews without writes, preserves IDs on confirmation and keeps a recoverable snapshot', () => {
  const id = orphan(), path = source();
  const preview = previewSourceRecovery(id, path, false, db);
  expect(preview.choices?.[0]).toMatchObject({ formula: 'Cl1Na1', atoms: 2, block: 'one' });
  expect(() => readStoredCif(id, db)).toThrow('Source association');
  const result = confirmSourceRecovery(id, preview.token!, 0, db);
  expect(result.entry?.id).toBe(id); expect(readStoredCif(id, db)).toContain('data_one');
  expect(readFileSync(path, 'utf8')).toBe(cif());
  const snapshot = new Database(result.snapshot!, { readonly: true });
  expect(snapshot.prepare('SELECT id FROM entries').all()).toEqual([{ id }]);
  expect(snapshot.prepare('SELECT * FROM imported_files').all()).toEqual([]);
  snapshot.close();
});

it('imports every block transactionally while associating the explicitly chosen block', () => {
  const id = orphan(), path = source(cif('one') + cif('two'));
  const preview = previewSourceRecovery(id, path, false, db);
  confirmSourceRecovery(id, preview.token!, 1, db);
  expect(readStoredCif(id, db)).toContain('data_two');
  expect(db.prepare('SELECT id FROM entries').all()).toHaveLength(2);
});

it('rejects existing source ownership without merging entries', () => {
  const id = orphan(), path = source(); importCifFolder(root, createEntryWriter(db));
  const preview = previewSourceRecovery(id, path, false, db);
  expect(() => confirmSourceRecovery(id, preview.token!, 0, db)).toThrow('already belongs');
  expect(db.prepare('SELECT id FROM entries').all()).toHaveLength(2);
});

it('rejects stale, invalid and cross-entry confirmations', () => {
  const id = orphan(), preview = previewSourceRecovery(id, source(), false, db);
  expect(() => confirmSourceRecovery(id, 'missing', 0, db)).toThrow('expired');
  expect(() => confirmSourceRecovery(id, preview.token!, 99, db)).toThrow('valid CIF block');
  db.prepare("UPDATE entries SET reference = 'changed' WHERE id = ?").run(id);
  expect(() => confirmSourceRecovery(id, preview.token!, 0, db)).toThrow('database changed');
});

it('rolls back all entry and source changes on a dependent-row write failure', () => {
  const id = orphan(), preview = previewSourceRecovery(id, source(), false, db);
  // Create the trigger before a new preview so only the write failure is exercised.
  db.exec("CREATE TRIGGER reject_recovery BEFORE INSERT ON atom_sites BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END");
  const next = previewSourceRecovery(id, source(), false, db);
  expect(next.token).not.toBe(preview.token);
  expect(() => confirmSourceRecovery(id, next.token!, 0, db)).toThrow('Recovery import failed');
  expect(() => readStoredCif(id, db)).toThrow('Source association');
  expect(db.prepare('SELECT * FROM source_contents').all()).toEqual([]);
  expect(db.prepare('SELECT * FROM atom_sites').all()).toHaveLength(2);
});

it('deletes only the confirmed entry without a snapshot and never reuses the ID', () => {
  const id = orphan();
  const prepared = prepareSourceRemoval(id, db);
  expect(db.prepare('SELECT id FROM entries').all()).toEqual([{ id }]);
  expect(() => confirmSourceRecovery(id, prepared.token!, 1, db)).toThrow('Invalid removal');
  expect(confirmSourceRecovery(id, prepared.token!, 0, db).completed).toBe('removed');
  expect(db.prepare('SELECT * FROM atom_sites').all()).toEqual([]);
  const next = orphan(); expect(next).toBeGreaterThan(id);
  expect(prepared.snapshot).toBeUndefined();
  expect(readdirSync(root).some(name => name.includes('pre-source-recovery'))).toBe(false);
});

it('recovers from a validated portable backup without restoring unrelated profile data', () => {
  const path = source(); importCifFolder(root, createEntryWriter(db));
  const backup = join(root, 'source.cifbackup'); backupProfile(backup, db);
  db.prepare('DELETE FROM entries').run();
  const id = orphan();
  const preview = previewSourceRecovery(id, backup, true, db);
  expect(preview.choices).toHaveLength(1);
  rmSync(path);
  confirmSourceRecovery(id, preview.token!, 0, db);
  expect(readStoredCif(id, db)).toContain('data_one');
  expect(db.prepare('SELECT id FROM entries').all()).toEqual([{ id }]);
});

it('rejects corrupt archives and healthy targets', () => {
  source(); importCifFolder(root, createEntryWriter(db));
  const healthy = (db.prepare('SELECT id FROM entries').get() as {id:number}).id;
  expect(inspectSourceRecovery(healthy, db).eligible).toBe(false);
  expect(() => prepareSourceRemoval(healthy, db)).toThrow('stored source');
  const backup = join(root, 'source.cifbackup'); backupProfile(backup, db);
  const archive = new Database(backup); archive.prepare("UPDATE source_contents SET content = X'00'").run(); archive.close();
  expect(() => previewSourceRecovery(orphan(), backup, true, db)).toThrow('manifest');
});

it('does not attempt a snapshot when deleting an entry', () => {
  const id = orphan();
  const prepare = db.prepare.bind(db);
  vi.spyOn(db, 'prepare').mockImplementation((sql: string) => {
    if (sql.startsWith('VACUUM')) throw new Error('Snapshot destination unavailable');
    return prepare(sql);
  });
  const preview = prepareSourceRemoval(id, db);
  confirmSourceRecovery(id, preview.token!, 0, db);
  expect(db.prepare('SELECT id FROM entries').all()).toEqual([]);
});

it('rejects expired previews and malformed sibling blocks without modifying the entry', () => {
  const id = orphan(), path = source();
  const preview = previewSourceRecovery(id, path, false, db);
  const now = Date.now(); vi.spyOn(Date, 'now').mockReturnValue(now + 16 * 60_000);
  expect(() => confirmSourceRecovery(id, preview.token!, 0, db)).toThrow('expired');
  expect(() => previewSourceRecovery(id, source(cif() + 'data_bad\n_chemical_formula_sum ?\n'), false, db)).toThrow();
  expect(() => readStoredCif(id, db)).toThrow('Source association');
});

it('imports the reviewed bytes even if the external file changes after preview', () => {
  const id = orphan(), path = source();
  const preview = previewSourceRecovery(id, path, false, db);
  writeFileSync(path, cif('later'));
  confirmSourceRecovery(id, preview.token!, 0, db);
  expect(readStoredCif(id, db)).toContain('data_one');
  expect(readFileSync(path, 'utf8')).toContain('data_later');
});

it('refresh reimports a deleted block, preserves its sibling ID and never changes original bytes', () => {
  const bytes = cif('one') + cif('two'), path = source(bytes);
  importCifFolder(root, createEntryWriter(db));
  const rows = db.prepare('SELECT id FROM entries ORDER BY id').all() as { id: number }[];
  const id = rows[0].id, sibling = rows[1].id;
  // Reproduce the missing association while another block retains its fingerprint.
  db.prepare('DELETE FROM imported_files WHERE entry_id = ?').run(id);
  const preview = prepareSourceRemoval(id, db);
  confirmSourceRecovery(id, preview.token!, 0, db);
  expect(readFileSync(path, 'utf8')).toBe(bytes);
  expect(db.prepare('SELECT id FROM entries').all()).toEqual([{ id: sibling }]);
  expect(readStoredCif(sibling, db)).toContain('data_two');
  importCifFolder(root, createEntryWriter(db));
  const restored = db.prepare('SELECT id FROM entries ORDER BY id').all() as { id: number }[];
  expect(restored).toHaveLength(2);
  expect(restored[0].id).toBe(sibling);
  expect(restored[1].id).toBeGreaterThan(sibling);
  expect(readStoredCif(restored[1].id, db)).toContain('data_one');
  expect(readFileSync(path, 'utf8')).toBe(bytes);
  expect(readdirSync(root).some(name => name.includes('pre-source-recovery'))).toBe(false);
});

it('does not recreate a deleted unavailable entry when the source file is absent', () => {
  const id = orphan(), preview = prepareSourceRemoval(id, db);
  confirmSourceRecovery(id, preview.token!, 0, db);
  importCifFolder(root, createEntryWriter(db));
  expect(db.prepare('SELECT id FROM entries').all()).toEqual([]);
});
