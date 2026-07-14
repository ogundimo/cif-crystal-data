import { describe, expect, it } from 'vitest';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
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
    const writer: EntryWriter = {
      writeBatch: (items) => {
        written.push(...items);
        return [];
      }
    };

    const result = importCifFolder(fixtureDirectory, writer);

    expect(result).toEqual({ importedCount: 1, failures: [], total: 1 });
    expect(written).toHaveLength(1);
    expect(written[0].sourceFilename).toBe('540062.cif');
    expect(written[0].entry.formula).toBe('Eu3S9Sb4');
  });

  it('reports an isolated database write failure without counting it as imported', () => {
    const writer: EntryWriter = {
      writeBatch: (items) => [{ item: items[0], error: new Error('database write failed') }]
    };

    expect(importCifFolder(fixtureDirectory, writer)).toEqual({
      importedCount: 0,
      failures: [{ filename: '540062.cif', reason: 'database write failed' }],
      total: 1
    });
  });
});
