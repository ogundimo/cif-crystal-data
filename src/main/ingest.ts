import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join, extname, basename } from 'node:path';
import { parseCif } from '../parser/cifParser';
import { createEntryWriter, type EntryWriteItem, type EntryWriter } from './db';
import type { ImportFailure, ImportResult } from '../shared/types';

const IMPORT_BATCH_SIZE = 250;

function walkCifFiles(root: string): string[] {
  const results: string[] = [];
  const stack: string[] = [root];
  while (stack.length) {
    const dir = stack.pop() as string;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of entries) {
      const full = join(dir, name);
      let stat;
      try {
        stat = statSync(full);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        stack.push(full);
      } else if (extname(name).toLowerCase() === '.cif') {
        results.push(full);
      }
    }
  }
  return results;
}

export function importCifFolder(
  rootDir: string,
  writer: EntryWriter = createEntryWriter()
): ImportResult {
  const files = walkCifFiles(rootDir);
  const failures: ImportFailure[] = [];
  let importedCount = 0;
  let pending: EntryWriteItem[] = [];

  const flush = () => {
    if (pending.length === 0) return;
    const writeFailures = writer.writeBatch(pending);
    const failedItems = new Set(writeFailures.map((failure) => failure.item));
    importedCount += pending.length - failedItems.size;
    for (const failure of writeFailures) {
      failures.push({
        filename: failure.item.sourceFilename,
        reason: failure.error instanceof Error ? failure.error.message : String(failure.error)
      });
    }
    pending = [];
  };

  for (const filePath of files) {
    const filename = basename(filePath);
    try {
      const text = readFileSync(filePath, 'utf-8');
      const entry = parseCif(text);
      pending.push({ sourceFilename: filename, entry });
      if (pending.length >= IMPORT_BATCH_SIZE) flush();
    } catch (err) {
      failures.push({ filename, reason: err instanceof Error ? err.message : String(err) });
    }
  }

  flush();

  return { importedCount, failures, total: files.length };
}
