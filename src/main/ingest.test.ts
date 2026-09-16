import { afterEach, describe, expect, it } from 'vitest';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, symlinkSync } from 'node:fs';
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

describe('import recovery', () => {
  const text = readFileSync(join(fixtureDirectory, 'synthetic-test.cif'), 'utf8');

  it('retains the entire previous source after a sibling parse failure', () => {
    const directory = temporaryDirectory();
    const path = join(directory, 'partial.cif');
    writeFileSync(path, `${text.replace('data_synthetic_test', 'data_good')}\ndata_bad\n_cell_length_a 1\n`);
    const written: EntryWriteItem[] = [];
    const writer: EntryWriter = {
      writeBatch: items => { written.push(...items); return []; }
    };
    const result = importCifFolder(directory, writer);
    expect(result).toMatchObject({ total: 1, importedCount: 0, skippedCount: 0,
      failures: [{ filename: 'partial.cif#2-bad', reason: 'Missing chemical formula' }] });
    expect(written).toHaveLength(0);
  });

  it('reports a file write failure while counting its successful sibling', () => {
    const directory = temporaryDirectory();
    writeFileSync(join(directory, 'bad.cif'), text);
    writeFileSync(join(directory, 'good.cif'), text);
    const result = importCifFolder(directory, {
      writeBatch: items => items.filter(item => item.sourceFilename === 'bad.cif').map(item => ({ item, error: 'disk full' }))
    });
    expect(result).toMatchObject({ total: 2, importedCount: 1, skippedCount: 0,
      failures: [{ filename: 'bad.cif', reason: 'disk full' }] });
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

  it('discovers nested uppercase CIFs, ignores other files, and commits at file boundaries', () => {
    const directory = temporaryDirectory();
    const nested = join(directory, 'nested');
    mkdirSync(nested);
    for (let index = 0; index < 251; index++) writeFileSync(join(nested, `${index}.CIF`), text);
    writeFileSync(join(directory, 'ignore.txt'), text);
    const batches: number[] = [];
    const processed: number[] = [];
    const result = importCifFolder(directory, {
      writeBatch: items => { batches.push(items.length); return []; }
    }, progress => { if (progress.phase === 'ingestion') processed.push(progress.processed); });
    expect(result).toMatchObject({ total: 251, importedCount: 251, skippedCount: 0, failures: [] });
    expect(batches).toEqual(Array(251).fill(1));
    expect(processed).toEqual(Array.from({ length: 252 }, (_, index) => index));
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

    expect(result).toMatchObject({ importedCount: 1, skippedCount: 0, failures: [], total: 1 });
    expect(written).toHaveLength(1);
    expect(written[0].sourceFilename).toBe('synthetic-test.cif');
    expect(written[0].entry.formula).toBe('Cl1Na1');
    expect(progress.filter(update => 'phase' in update && update.phase === 'ingestion')).toMatchObject([
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

    expect(importCifFolder(fixtureDirectory, writer)).toMatchObject({
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

    expect(importCifFolder(fixtureDirectory, writer, (update) => progress.push(update))).toMatchObject({
      importedCount: 0,
      skippedCount: 0,
      failures: [{ filename: 'synthetic-test.cif', reason: 'database write failed' }],
      total: 1
    });
    expect(progress.at(-1)).toMatchObject({
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
      expect(result).toMatchObject({ importedCount: 2, skippedCount: 0, failures: [], total: 1 });
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

 describe('discovery and cancellation boundaries', () => {
  const text = readFileSync(join(fixtureDirectory, 'synthetic-test.cif'), 'utf8');
  it('reports an unavailable root as a discovery failure', () => {
    const directory = temporaryDirectory();
    const result = importCifFolder(join(directory, 'missing'), { writeBatch: () => [] });
    expect(result).toMatchObject({ total: 0, processed: 0, unattempted: 0, cancelled: false,
      failures: [{ phase: 'discovery', reason: expect.stringMatching(/ENOENT/) }] });
  });
  it('cancels discovery before any commit and reports an unknown remaining total', () => {
    const directory = temporaryDirectory();
    writeFileSync(join(directory, 'first.cif'), text);
    let cancel = false;
    const result = importCifFolder(directory, { writeBatch: () => { throw new Error('must not write'); } },
      progress => { if (progress.phase === 'discovery' && progress.discovered === 1) cancel = true; }, () => cancel);
    expect(result).toMatchObject({ cancelled: true, discoveryComplete: false, importedCount: 0, processed: 0, unattempted: 1 });
  });
  it('retains committed multi-block files and permits a subsequent import', () => {
    const directory = temporaryDirectory();
    writeFileSync(join(directory, 'first.cif'), text + '\n' + text.replace('data_synthetic_test', 'data_second'));
    writeFileSync(join(directory, 'next.cif'), text);
    let cancel = false;
    const batches: EntryWriteItem[][] = [];
    const result = importCifFolder(directory, { writeBatch: items => { batches.push(items); cancel = true; return []; } }, undefined, () => cancel);
    expect(result).toMatchObject({ cancelled: true, discoveryComplete: true, total: 2, processed: 1, unattempted: 1, importedCount: 2 });
    expect(batches[0]).toHaveLength(2);
    expect(importCifFolder(directory, { writeBatch: () => [] })).toMatchObject({ cancelled: false, processed: 2, importedCount: 3 });
  });
});

it('skips junction cycles and duplicate aliases without traversing them', () => {
  const directory = temporaryDirectory();
  const real = join(directory, 'real'); mkdirSync(real);
  writeFileSync(join(real, 'file.cif'), readFileSync(join(fixtureDirectory, 'synthetic-test.cif')));
  symlinkSync(directory, join(real, 'cycle'), process.platform === 'win32' ? 'junction' : 'dir');
  symlinkSync(real, join(directory, 'alias'), process.platform === 'win32' ? 'junction' : 'dir');
  expect(importCifFolder(directory, { writeBatch: () => [] })).toMatchObject({ total: 1, importedCount: 1, skippedLinks: 2, failures: [] });
});