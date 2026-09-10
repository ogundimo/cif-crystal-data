import { describe, expect, it } from 'vitest';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { importCifFolder } from './ingest';
import type { EntryWriteItem, EntryWriter } from './db';

const fixtureDirectory = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'parser',
  '__fixtures__'
);

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
