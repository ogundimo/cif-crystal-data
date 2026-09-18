import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import { initDb } from './database/connection';
import { createEntryWriter } from './database/writer';
import { parseCif, splitCifDataBlocks } from '../parser/cifParser';
import { contentHash } from './sourceIdentity';
import { batchFilename, csvCell, countBatchExport, runBatchExport } from './batchExport';
import { validateBatchRequest, validateBatchScope } from './batchExportValidation';
import type { BatchExportRequest, BatchExportProgress } from '../shared/types';

const roots: string[] = [];
const databases: Database.Database[] = [];
const faults = vi.hoisted(() => ({ path: '' }));
vi.mock('node:fs/promises', async original => {
  const fs = await original<typeof import('node:fs/promises')>();
  return { ...fs, open: async (...args: Parameters<typeof fs.open>) => {
    const file = await fs.open(...args);
    const write = file.writeFile.bind(file);
    file.writeFile = async (...values) => {
      if (String(args[0]) === faults.path) { await write('incomplete'); throw new Error('simulated disk full'); }
      return write(...values);
    };
    return file;
  } };
});
afterEach(() => { faults.path = ''; for (const db of databases.splice(0)) db.close(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
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
  const request: BatchExportRequest = { scope: { kind: 'matching', filter }, mode: 'both', expectedCount: count };
  return { root, db, blocks, request, run: (options: Partial<BatchExportRequest> = {}, signal = new AbortController().signal,
    progress: (p: BatchExportProgress) => void = () => {}) => runBatchExport({ ...request, ...options }, root, signal, progress, db.name) };
}

describe('batch export contracts', () => {
  it('uses deterministic Windows-safe names with globally unique ID suffixes', () => {
    const names = ['CON.txt.cif', 'nul.cif', 'COM¹.cif', 'A.cif', 'a.cif', '../bad:*?.cif', 'x'.repeat(400)].map((name, i) => batchFilename(i + 1, name, 1));
    expect(new Set(names.map(name => name.toLowerCase())).size).toBe(names.length);
    expect(names.every(name => !/[<>:"/\\|?*]/.test(name) && name.length < 130)).toBe(true);
    expect(batchFilename(2, 'CON.txt.cif', 1)).toBe('entry-2_CON.txt_block-2.cif');
  });
  it('quotes UTF-8 CSV, leaves missing values empty and reversibly escapes spreadsheet text', () => {
    expect(csvCell('α,"β"\nγ')).toBe('"α,""β""\nγ"');
    expect(csvCell(null)).toBe(''); expect(csvCell(0)).toBe('0'); expect(csvCell(-2.5)).toBe('-2.5');
    for (const text of ['=SUM(A1)', ' +Fe', '-Fe', '@text', '\ttext', "'original", '\ntext']) expect(csvCell(text).replace(/^"|"$/g, '')).toBe("'" + text);
    expect(csvCell('Fe2 O3')).toBe('Fe2 O3');
  });
  it('rejects malformed scopes, IDs, filters, formats and counts', () => {
    for (const scope of [null, {}, { kind: 'selected', ids: [1, 1] }, { kind: 'selected', ids: [0] }, { kind: 'selected', ids: ['2'] },
      { kind: 'matching', filter: { ...filter, aMin: Infinity } }, { kind: 'matching', filter: { ...filter, slot1: ['Bad'] } }]) expect(() => validateBatchScope(scope)).toThrow();
    expect(validateBatchScope({ kind: 'selected', ids: [4, 1] })).toEqual({ kind: 'selected', ids: [1, 4] });
    expect(() => validateBatchRequest({ scope: { kind: 'matching', filter }, mode: 'zip', expectedCount: 2 })).toThrow();
    expect(() => validateBatchRequest({ scope: { kind: 'matching', filter }, mode: 'csv', expectedCount: 0 })).toThrow();
  });
  it('exports chosen blocks from managed bytes despite absent originals and reports missing IDs', async () => {
    const f = fixture();
    const result = await f.run({ scope: { kind: 'selected', ids: [1, 2, 999] } });
    expect(result).toMatchObject({ completed: 2, failed: 1, notAttempted: 0, cancelled: false });
    const folder = join(f.root, result.folderName);
    expect(readFileSync(join(folder, batchFilename(2, 'CON.txt.cif', 1)), 'utf8')).toBe(f.blocks[1].text);
    const csv = readFileSync(join(folder, 'summary.csv'), 'utf8');
    expect(csv).toContain('999,,failed,Entry no longer available.');
    expect(csv).not.toContain(f.root); expect(csv).toContain('cell_a_angstrom');
    expect(readdirSync(folder).some(name => name.endsWith('.partial'))).toBe(false);
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
    const csv = readFileSync(join(folder, 'summary.csv'), 'utf8');
    expect(csv).not.toContain('Changed');
    expect(csv.split('\r\n').filter(Boolean)).toHaveLength(1206);
    expect(countBatchExport({ kind: 'matching', filter: { ...filter, referenceQuery: 'nonexistent' } }, f.db)).toBe(0);
  // This integration case fsyncs and atomically publishes 1,205 real CIF files.
  // Hosted Windows disk latency can exceed 30 seconds under coverage; elapsed
  // time is not its contract. Keep every file/snapshot assertion and allow I/O
  // to finish before fixture teardown closes and removes the temporary database.
  }, 120_000);
  it('handles corrupt and legacy blocks per entry, but CSV-only still exports metadata', async () => {
    const f = fixture();
    f.db.exec("UPDATE imported_files SET block_hash='bad' WHERE entry_id=1; UPDATE imported_files SET content_hash=NULL WHERE entry_id=2");
    expect(await f.run()).toMatchObject({ completed: 1, failed: 2 });
    const result = await f.run({ mode: 'csv' });
    expect(result).toMatchObject({ completed: 3, failed: 0 });
    expect(readdirSync(join(f.root, result.folderName))).toEqual(['summary.csv']);
  });
  it('rejects missing blocks and corrupt complete-file bytes without external substitution', async () => {
    const f = fixture();
    writeFileSync(join(f.root, 'input-0.cif'), 'modified external original');
    const good = await f.run({ scope: { kind: 'selected', ids: [1] }, expectedCount: 1 });
    expect(readFileSync(join(f.root, good.folderName, batchFilename(1, 'same.cif', 0)), 'utf8')).toBe(f.blocks[0].text);
    f.db.exec('UPDATE imported_files SET data_block_index=99 WHERE entry_id=1');
    expect(await f.run()).toMatchObject({ completed: 2, failed: 1 });
    f.db.prepare('UPDATE source_contents SET content=?').run(Buffer.from('corrupt stored bytes'));
    expect(await f.run()).toMatchObject({ completed: 0, failed: 3 });
    expect(readFileSync(join(f.root, 'input-0.cif'), 'utf8')).toBe('modified external original');
  });
  it('does not claim a completed CSV when atomic report publication fails', async () => {
    const f = fixture(); let injected = false;
    const result = await f.run({ mode: 'csv' }, undefined, () => {
      if (injected) return; injected = true;
      const folder = join(f.root, readdirSync(f.root).find(name => name.startsWith('cif-export-'))!);
      writeFileSync(join(folder, 'summary.csv'), 'competing file');
    });
    expect(result).toMatchObject({ completed: 0, failed: 3, notAttempted: 0 });
    expect(result.error).toContain('report could not be completed');
    expect(result.reportName).toBeUndefined();
    expect(readFileSync(join(f.root, result.folderName, 'summary.csv'), 'utf8')).toBe('competing file');
  });
  it('retains failed writes only as partial files and continues with the next entry', async () => {
    const f = fixture();
    const result = await f.run({}, undefined, () => {
      const folder = join(f.root, readdirSync(f.root).find(name => name.startsWith('cif-export-'))!);
      faults.path = join(folder, batchFilename(2, 'CON.txt.cif', 1) + '.partial');
    });
    expect(result).toMatchObject({ completed: 2, failed: 1, notAttempted: 0 });
    const names = readdirSync(join(f.root, result.folderName));
    expect(names).toContain(batchFilename(2, 'CON.txt.cif', 1) + '.partial');
    expect(names).not.toContain(batchFilename(2, 'CON.txt.cif', 1));
  });
  it('stops on report write failure without claiming unpublished CSV rows', async () => {
    const f = fixture();
    const result = await f.run({ mode: 'csv' }, undefined, () => {
      const folder = join(f.root, readdirSync(f.root).find(name => name.startsWith('cif-export-'))!);
      faults.path = join(folder, 'summary.csv.partial');
    });
    expect(result).toMatchObject({ completed: 0, failed: 1, notAttempted: 2 });
    expect(result.error).toBeTruthy();
    expect(readdirSync(join(f.root, result.folderName))).toEqual(['summary.csv.partial']);
  });
  it('cancels at a file boundary, reports every request and supports a fresh retry', async () => {
    const f = fixture(60); const abort = new AbortController();
    const result = await f.run({}, abort.signal, p => { if (p.completed >= 25) abort.abort(); });
    expect(result).toMatchObject({ completed: 25, failed: 0, notAttempted: 35, cancelled: true });
    const csv = readFileSync(join(f.root, result.folderName, 'summary.csv'), 'utf8');
    expect(csv.match(/not-attempted/g)).toHaveLength(35);
    expect(await f.run()).toMatchObject({ completed: 60, cancelled: false });
  });
  it('never overwrites a competing destination or original and isolates a write failure', async () => {
    const f = fixture(); let injected = false;
    const original = join(f.root, 'same.cif'); writeFileSync(original, 'original');
    const result = await f.run({}, undefined, () => {
      if (injected) return; injected = true;
      const folder = join(f.root, readdirSync(f.root).find(name => name.startsWith('cif-export-'))!);
      writeFileSync(join(folder, batchFilename(1, 'same.cif', 0)), 'existing');
      mkdirSync(join(folder, batchFilename(2, 'CON.txt.cif', 1) + '.partial'));
    });
    expect(result).toMatchObject({ completed: 1, failed: 2 });
    expect(readFileSync(original, 'utf8')).toBe('original');
    expect(readFileSync(join(f.root, result.folderName, batchFilename(1, 'same.cif', 0)), 'utf8')).toBe('existing');
  });
  it('rejects stale counts and invalid destinations before creating output', async () => {
    const f = fixture();
    await expect(f.run({ expectedCount: 4 })).rejects.toThrow('count changed');
    await expect(runBatchExport(f.request, 'relative', new AbortController().signal, vi.fn(), f.db.name)).rejects.toThrow('destination');
    expect(readdirSync(f.root)).toEqual(['profile']);
  });
});
