import { afterEach, describe, expect, it } from 'vitest';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { importCifFolder } from './ingest';
import type { EntryWriteItem, EntryWriter } from './db';

const fixtureDirectory = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'parser',
  '__fixtures__'
);

const temporaryDirectories: string[] = [];
function temporaryDirectory() {
  const directory = mkdtempSync(join(tmpdir(), 'cif-ingest-regression-'));
  temporaryDirectories.push(directory);
  return directory;
}
afterEach(() => {
  // Only directories created by this test module are removed.
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('import recovery and refresh cleanup', () => {
  const text = readFileSync(join(fixtureDirectory, 'synthetic-test.cif'), 'utf8');

  it('retains retryable source metadata and skips stale cleanup after a sibling parse failure', () => {
    const directory = temporaryDirectory();
    const path = join(directory, 'partial.cif');
    writeFileSync(path, `${text.replace('data_synthetic_test', 'data_good')}\ndata_bad\n_cell_length_a 1\n`);
    const written: EntryWriteItem[] = [];
    const cleaned: string[] = [];
    const writer: EntryWriter = {
      writeBatch: items => { written.push(...items); return []; },
      removeStaleSourceEntries: source => { cleaned.push(source); }
    };
    const result = importCifFolder(directory, writer);
    expect(result).toMatchObject({ total: 1, importedCount: 1, skippedCount: 0,
      failures: [{ filename: 'partial.cif#2-bad', reason: 'Missing chemical formula' }] });
    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({ sourcePath: path, dataBlockIndex: 0, recordFingerprint: false });
    expect(cleaned).toEqual([]);
  });

  it('cleans stale blocks only for files whose writes all succeeded', () => {
    const directory = temporaryDirectory();
    writeFileSync(join(directory, 'bad.cif'), text);
    writeFileSync(join(directory, 'good.cif'), text);
    const cleaned: Array<[string, string[]]> = [];
    const result = importCifFolder(directory, {
      writeBatch: items => [{ item: items.find(item => item.sourceFilename === 'bad.cif')!, error: 'disk full' }],
      removeStaleSourceEntries: (source, names) => { cleaned.push([source, names]); }
    });
    expect(result).toEqual({ total: 2, importedCount: 1, skippedCount: 0,
      failures: [{ filename: 'bad.cif', reason: 'disk full' }] });
    expect(cleaned).toEqual([[join(directory, 'good.cif'), ['good.cif']]]);
  });

  it('reports a file disappearing after discovery and continues with its sibling', () => {
    const directory = temporaryDirectory();
    writeFileSync(join(directory, 'gone.cif'), text);
    writeFileSync(join(directory, 'good.cif'), text);
    const written: EntryWriteItem[] = [];
    const result = importCifFolder(directory, {
      isUnchanged: file => { if (file.path.endsWith('gone.cif')) rmSync(file.path); return false; },
      writeBatch: items => { written.push(...items); return []; }
    });
    expect(result.importedCount).toBe(1);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].filename).toBe('gone.cif');
    expect(result.failures[0].reason).toMatch(/ENOENT/);
    expect(written.map(item => item.sourceFilename)).toEqual(['good.cif']);
  });

  it('discovers nested uppercase CIFs, ignores other files, and flushes the final partial batch', () => {
    const directory = temporaryDirectory();
    const nested = join(directory, 'nested');
    mkdirSync(nested);
    for (let index = 0; index < 251; index++) writeFileSync(join(nested, `${index}.CIF`), text);
    writeFileSync(join(directory, 'ignore.txt'), text);
    const batches: number[] = [];
    const processed: number[] = [];
    const result = importCifFolder(directory, {
      writeBatch: items => { batches.push(items.length); return []; }
    }, progress => { processed.push(progress.processed); });
    expect(result).toEqual({ total: 251, importedCount: 251, skippedCount: 0, failures: [] });
    expect(batches).toEqual([250, 1]);
    expect(processed).toEqual([0, 250, 251]);
  });
});

describe('importCifFolder batching', () => {
  it('parses discovered files and sends them through the injected batch writer', () => {
    const written: EntryWriteItem[] = [];
    const progress: Array<{ processed: number; total: number; importedCount: number; skippedCount: number; failureCount: number }> = [];
    const writer: EntryWriter = {
      writeBatch: (items) => {
        written.push(...items);
        return [];
      }
    };

    const result = importCifFolder(fixtureDirectory, writer, (update) => progress.push(update));

    expect(result).toEqual({ importedCount: 1, skippedCount: 0, failures: [], total: 1 });
    expect(written).toHaveLength(1);
    expect(written[0].sourceFilename).toBe('synthetic-test.cif');
    expect(written[0].entry.formula).toBe('Cl1Na1');
    expect(progress).toEqual([
      { processed: 0, total: 1, importedCount: 0, skippedCount: 0, failureCount: 0 },
      { processed: 1, total: 1, importedCount: 1, skippedCount: 0, failureCount: 0 }
    ]);
  });

  it('skips reading and parsing files whose stored fingerprint is unchanged', () => {
    const writer: EntryWriter = {
      isUnchanged: () => true,
      writeBatch: () => {
        throw new Error('unchanged files must not be written');
      }
    };

    expect(importCifFolder(fixtureDirectory, writer)).toEqual({
      importedCount: 0,
      skippedCount: 1,
      failures: [],
      total: 1
    });
  });

  it('reports an isolated database write failure without counting it as imported', () => {
    const progress: Array<{ processed: number; total: number; importedCount: number; skippedCount: number; failureCount: number }> = [];
    const writer: EntryWriter = {
      writeBatch: (items) => [{ item: items[0], error: new Error('database write failed') }]
    };

    expect(importCifFolder(fixtureDirectory, writer, (update) => progress.push(update))).toEqual({
      importedCount: 0,
      skippedCount: 0,
      failures: [{ filename: 'synthetic-test.cif', reason: 'database write failed' }],
      total: 1
    });
    expect(progress.at(-1)).toEqual({
      processed: 1,
      total: 1,
      importedCount: 0,
      skippedCount: 0,
      failureCount: 1
    });
  });

  it('imports every data_ block in a concatenated CIF as a separate entry', () => {
    const directory = mkdtempSync(join(tmpdir(), 'cif-multi-block-'));
    const fixture = readFileSync(join(fixtureDirectory, 'synthetic-test.cif'), 'utf8');
    writeFileSync(
      join(directory, 'combined.cif'),
      `################################\n${fixture.replace('data_synthetic_test', 'data_first')}\n${fixture.replace('data_synthetic_test', 'data_second')}`
    );
    const written: EntryWriteItem[] = [];
    try {
      const result = importCifFolder(directory, {
        writeBatch: (items) => { written.push(...items); return []; }
      });
      expect(result).toEqual({ importedCount: 2, skippedCount: 0, failures: [], total: 1 });
      expect(written.map((item) => item.sourceFilename)).toEqual([
        'combined.cif#1-first',
        'combined.cif#2-second'
      ]);
      expect(written.map((item) => item.dataBlockIndex)).toEqual([0, 1]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
