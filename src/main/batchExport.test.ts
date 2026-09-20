import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { initDb } from './database/connection';
import { createEntryWriter } from './database/writer';
import { parseCif, splitCifDataBlocks } from '../parser/cifParser';
import { contentHash } from './sourceIdentity';
import { batchFilename, countBatchExport, runBatchExport } from './batchExport';
import { validateBatchRequest, validateBatchScope } from './batchExportValidation';
import type { BatchExportRequest, BatchExportProgress } from '../shared/types';

const roots: string[] = [];
const databases: Database.Database[] = [];
const faults = vi.hoisted(() => ({ path: '', directoryError: false }));
vi.mock('node:fs/promises', async original => {
  const fs = await original<typeof import('node:fs/promises')>();
  return { ...fs, mkdir: async (...args: Parameters<typeof fs.mkdir>) => {
    if (faults.directoryError) throw Object.assign(new Error('Destination is read-only'), { code: 'EACCES' });
    return fs.mkdir(...args);
  }, open: async (...args: Parameters<typeof fs.open>) => {
    const file = await fs.open(...args);
    const write = file.writeFile.bind(file);
    file.writeFile = async (...values) => {
      if (String(args[0]) === faults.path) { await write('incomplete'); throw new Error('simulated disk full'); }
      return write(...values);
    };
    return file;
  } };
});
afterEach(() => { faults.path = ''; faults.directoryError = false; for (const db of databases.splice(0)) db.close(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const filter = { slot1: ['Na'], slot2: [], mode: 'AND' as const };
function fixture(count = 3) {
  const root = mkdtempSync(join(tmpdir(), 'batch-export-test-')); roots.push(root);
  const profile = join(root, 'profile'); mkdirSync(profile);
  const db = initDb(profile); databases.push(db);
  const text = readFileSync(new URL('../parser/__fixtures__/synthetic-test.cif', import.meta.url), 'utf8');
  const source = Buffer.from(text + '\n' + text.replace('data_synthetic_test', 'data_second'));
  const blocks = splitCifDataBlocks(source.toString('utf8'));
  const writer = createEntryWriter(db);
  const failures = writer.writeBatch(Array.from({ length: count }, (_, index) => ({
    sourceFilename: index % 2 ? 'CON.txt.cif' : 'same.cif', sourcePath: join(root, `input-${index}.cif`),
    sourceContent: source, sourceMtimeMs: 1, sourceSize: source.length, dataBlockIndex: index === 1 ? 1 : 0, blockKey: `label:${index === 1 ? 'second' : 'synthetic_test'}`,
    blockHash: contentHash(blocks[index === 1 ? 1 : 0].text), entry: parseCif(blocks[index === 1 ? 1 : 0].text)
  })));
  expect(failures).toEqual([]);
  const request: BatchExportRequest = { scope: { kind: 'matching', filter }, expectedCount: count };
  return { root, db, blocks, request, run: (options: Partial<BatchExportRequest> = {}, signal = new AbortController().signal,
    progress: (p: BatchExportProgress) => void = () => {}) => runBatchExport({ ...request, ...options }, root, signal, progress, db.name) };
}

describe('batch export contracts', () => {
  it('matches individual filenames and disambiguates case, sanitization and truncation collisions', () => {
    const used = new Set<string>();
    expect(batchFilename(1, 'Na1 Cl1', 225, used)).toBe('Na1 Cl1_225.cif');
    expect(batchFilename(2, 'na1 cl1', 225, used)).toBe('na1 cl1_225_entry-2.cif');
    expect(batchFilename(3, 'Fe/O', 1, used)).toBe('Fe_O_1.cif');
    expect(batchFilename(4, 'Fe:O', 1, used)).toBe('Fe_O_1_entry-4.cif');
    const first = batchFilename(5, 'x'.repeat(400), 1, used);
    const next = batchFilename(6, 'x'.repeat(401), 1, used);
    expect(first.length).toBeLessThan(200);
    expect(next).not.toBe(first);
    used.add('ca_1_entry-7.cif'); used.add('ca_1.cif');
    expect(batchFilename(7, 'Ca', 1, used)).toBe('Ca_1_entry-7-1.cif');
  });
  it('counts and exports all matches except excluded IDs, without broadening the filter', async () => {
    const f = fixture();
    const scope = { kind: 'matching' as const, filter, excludedIds: [2, 999] };
    expect(countBatchExport(scope, f.db)).toBe(2);
    const result = await f.run({ scope, expectedCount: 2 });
    expect(result).toMatchObject({ total: 2, completed: 2, failed: 0 });
    expect(readdirSync(join(f.root, result.folderName))).toEqual(['Cl1Na1_1.cif', 'Cl1Na1_1_entry-3.cif']);
    expect(countBatchExport({ ...scope, filter: { ...filter, referenceQuery: 'absent' } }, f.db)).toBe(0);
    expect(countBatchExport({ ...scope, excludedIds: [] }, f.db)).toBe(3);
    expect(countBatchExport({ ...scope, excludedIds: [1, 2, 3] }, f.db)).toBe(0);
  });
  it('validates and normalizes exclusions at the IPC boundary', () => {
    for (const excludedIds of [null, [0], [1, 1], ['1'], [Infinity], Array(100_001).fill(1)]) {
      expect(() => validateBatchScope({ kind: 'matching', filter, excludedIds })).toThrow();
    }
    expect(validateBatchScope({ kind: 'matching', filter, excludedIds: [3, 1] }))
      .toEqual({ kind: 'matching', filter, excludedIds: [1, 3] });
  });
  it('rejects malformed scopes, IDs, filters, formats and counts', () => {
    for (const scope of [null, {}, { kind: 'selected', ids: [1, 1] }, { kind: 'selected', ids: [0] }, { kind: 'selected', ids: ['2'] },
      { kind: 'matching', filter: { ...filter, aMin: Infinity } }, { kind: 'matching', filter: { ...filter, slot1: ['Bad'] } }]) expect(() => validateBatchScope(scope)).toThrow();
    expect(validateBatchScope({ kind: 'selected', ids: [4, 1] })).toEqual({ kind: 'selected', ids: [1, 4] });
    expect(() => validateBatchRequest({ scope: { kind: 'matching', filter }, mode: 'zip', expectedCount: 2 })).toThrow();
    for (const mode of ['cif', 'both', 'csv']) expect(() => validateBatchRequest({ scope: { kind: 'matching', filter }, mode, expectedCount: 2 })).toThrow();
    expect(() => validateBatchRequest({ scope: { kind: 'matching', filter }, expectedCount: 0 })).toThrow();
    expect(validateBatchRequest({ scope: { kind: 'matching', filter }, expectedCount: 2 })).toEqual({ scope: { kind: 'matching', filter }, expectedCount: 2 });
  });
  it('exports chosen blocks from managed bytes despite absent originals and reports missing IDs', async () => {
    const f = fixture();
    const result = await f.run({ scope: { kind: 'selected', ids: [1, 2, 999] } });
    expect(result).toMatchObject({ completed: 2, failed: 1, notAttempted: 0, cancelled: false });
    const folder = join(f.root, result.folderName);
    expect(readFileSync(join(folder, 'Cl1Na1_1_entry-2.cif'), 'utf8')).toBe(f.blocks[1].text);
    expect(result.failures).toEqual([{ entryId: 999, reason: 'Entry no longer available.' }]);
    expect(readdirSync(folder)).toEqual(['Cl1Na1_1.cif', 'Cl1Na1_1_entry-2.cif']);
    expect(result.folderName).toMatch(/^cif_batch_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}(?:_\d+)?$/);
  });
  it('evaluates more than 1,000 matches once with full filters and a stable snapshot under changes', async () => {
    const f = fixture(1205);
    let changed = false;
    const result = await f.run({}, undefined, p => {
      if (!changed && p.completed >= 25) { changed = true; f.db.exec('DELETE FROM entries WHERE id=1100; UPDATE entries SET formula=\'Changed\' WHERE id=1101'); }
    });
    expect(result).toMatchObject({ total: 1205, completed: 1205, failed: 0 });
    const folder = join(f.root, result.folderName);
    expect(readdirSync(folder).filter(name => name.endsWith('.cif'))).toHaveLength(1205);
    expect(readdirSync(folder)).toHaveLength(1205);
    expect(readFileSync(join(folder, 'Cl1Na1_1_entry-1100.cif'), 'utf8')).toBe(f.blocks[0].text);
    expect(readFileSync(join(folder, 'Cl1Na1_1_entry-1101.cif'), 'utf8')).toBe(f.blocks[0].text);
    expect(countBatchExport({ kind: 'matching', filter: { ...filter, referenceQuery: 'nonexistent' } }, f.db)).toBe(0);
  // This integration case fsyncs and atomically publishes 1,205 real CIF files.
  // Hosted Windows disk latency can exceed 30 seconds under coverage; elapsed
  // time is not its contract. Keep every file/snapshot assertion and allow I/O
  // to finish before fixture teardown closes and removes the temporary database.
  }, 120_000);
  it('reports corrupt and legacy blocks in memory and writes only verified CIFs', async () => {
    const f = fixture();
    f.db.exec("UPDATE imported_files SET block_hash='bad' WHERE entry_id=1; UPDATE imported_files SET content_hash=NULL WHERE entry_id=2");
    const result = await f.run();
    expect(result).toMatchObject({ completed: 1, failed: 2 });
    expect(result.failures.map(failure => failure.entryId)).toEqual([1, 2]);
    expect(result.failures.every(failure => failure.reason.includes('Verified stored block unavailable'))).toBe(true);
    expect(readdirSync(join(f.root, result.folderName))).toEqual(['Cl1Na1_1_entry-3.cif']);
  });
  it('rejects missing blocks and corrupt complete-file bytes without external substitution', async () => {
    const f = fixture();
    writeFileSync(join(f.root, 'input-0.cif'), 'modified external original');
    const good = await f.run({ scope: { kind: 'selected', ids: [1] }, expectedCount: 1 });
    expect(readFileSync(join(f.root, good.folderName, 'Cl1Na1_1.cif'), 'utf8')).toBe(f.blocks[0].text);
    f.db.exec('UPDATE imported_files SET data_block_index=99 WHERE entry_id=1');
    expect(await f.run()).toMatchObject({ completed: 2, failed: 1 });
    f.db.prepare('UPDATE source_contents SET content=?').run(Buffer.from('corrupt stored bytes'));
    expect(await f.run()).toMatchObject({ completed: 0, failed: 3 });
    expect(readFileSync(join(f.root, 'input-0.cif'), 'utf8')).toBe('modified external original');
  });
  it('creates a separate folder when the timestamp name is already reserved', async () => {
    const f = fixture();
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date(2026, 8, 20, 14, 30, 5));
      const folderName = 'cif_batch_2026-09-20_14-30-05';
      mkdirSync(join(f.root, folderName));
      writeFileSync(join(f.root, folderName, 'keep.cif'), 'existing');
      const first = await f.run();
      const second = await f.run();
      expect(first.folderName).toBe(folderName + '_2');
      expect(second.folderName).toBe(folderName + '_3');
      expect(readFileSync(join(f.root, folderName, 'keep.cif'), 'utf8')).toBe('existing');
      expect(first.completed).toBe(3); expect(second.completed).toBe(3);
    } finally { vi.useRealTimers(); }
  });
  it('cleans up failed partial writes and continues with the next entry', async () => {
    const f = fixture();
    const result = await f.run({}, undefined, () => {
      const folder = join(f.root, readdirSync(f.root).find(name => name.startsWith('cif_batch_'))!);
      faults.path = join(folder, 'Cl1Na1_1_entry-2.cif' + '.partial');
    });
    expect(result).toMatchObject({ completed: 2, failed: 1, notAttempted: 0 });
    const names = readdirSync(join(f.root, result.folderName));
    expect(names).toEqual(['Cl1Na1_1.cif', 'Cl1Na1_1_entry-3.cif']);
    expect(result.failures[0]).toMatchObject({ entryId: 2, fileName: 'Cl1Na1_1_entry-2.cif' });
    expect(names).not.toContain('Cl1Na1_1_entry-2.cif');
  });
  it('cancels at a file boundary, keeps only completed CIFs and supports a fresh retry', async () => {
    const f = fixture(60); const abort = new AbortController();
    const result = await f.run({}, abort.signal, p => { if (p.completed >= 25) abort.abort(); });
    expect(result).toMatchObject({ completed: 25, failed: 0, notAttempted: 35, cancelled: true });
    const names = readdirSync(join(f.root, result.folderName));
    expect(names).toHaveLength(25);
    expect(names.every(name => name.endsWith('.cif'))).toBe(true);
    expect(await f.run()).toMatchObject({ completed: 60, cancelled: false });
  });
  it('never overwrites a competing destination or original and isolates a write failure', async () => {
    const f = fixture(); let injected = false;
    const original = join(f.root, 'same.cif'); writeFileSync(original, 'original');
    const result = await f.run({}, undefined, () => {
      if (injected) return; injected = true;
      const folder = join(f.root, readdirSync(f.root).find(name => name.startsWith('cif_batch_'))!);
      writeFileSync(join(folder, 'Cl1Na1_1.cif'), 'existing');
      mkdirSync(join(folder, 'Cl1Na1_1_entry-2.cif' + '.partial'));
    });
    expect(result).toMatchObject({ completed: 1, failed: 2 });
    expect(readFileSync(original, 'utf8')).toBe('original');
    expect(readFileSync(join(f.root, result.folderName, 'Cl1Na1_1.cif'), 'utf8')).toBe('existing');
  });
  it('propagates folder permission failures without output and allows a fresh retry', async () => {
    const f = fixture();
    const progress = vi.fn();
    faults.directoryError = true;
    await expect(f.run({}, undefined, progress)).rejects.toMatchObject({ code: 'EACCES' });
    expect(progress).not.toHaveBeenCalled();
    expect(readdirSync(f.root)).toEqual(['profile']);
    faults.directoryError = false;
    const result = await f.run();
    expect(result).toMatchObject({ completed: 3, failed: 0, notAttempted: 0, failures: [] });
    expect(readdirSync(join(f.root, result.folderName))).toHaveLength(3);
  });
  it('rejects stale counts and invalid destinations before creating output', async () => {
    const f = fixture();
    await expect(f.run({ expectedCount: 4 })).rejects.toThrow('count changed');
    await expect(runBatchExport(f.request, 'relative', new AbortController().signal, vi.fn(), f.db.name)).rejects.toThrow('destination');
    expect(readdirSync(f.root)).toEqual(['profile']);
  });
});
