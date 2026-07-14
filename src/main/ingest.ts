import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join, extname, basename } from 'node:path';
import { parseCif } from '../parser/cifParser';
import { createEntryWriter, type EntryWriteItem, type EntryWriter } from './db';
import type { ImportFailure, ImportProgress, ImportResult } from '../shared/types';

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
  writer: EntryWriter = createEntryWriter(),
  onProgress?: (progress: ImportProgress) => void
): ImportResult {
  const files = walkCifFiles(rootDir);
  const failures: ImportFailure[] = [];
  let importedCount = 0;
  onProgress?.({ processed: 0, total: files.length, importedCount: 0, failureCount: 0 });

  const writePending = (pending: EntryWriteItem[]) => {
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
  };

  for (let offset = 0; offset < files.length; offset += IMPORT_BATCH_SIZE) {
    const fileBatch = files.slice(offset, offset + IMPORT_BATCH_SIZE);
    const pending: EntryWriteItem[] = [];
    for (const filePath of fileBatch) {
      const filename = basename(filePath);
      try {
        const text = readFileSync(filePath, 'utf-8');
        const entry = parseCif(text);
        pending.push({ sourceFilename: filename, entry });
      } catch (err) {
        failures.push({ filename, reason: err instanceof Error ? err.message : String(err) });
      }
    }
    writePending(pending);
    onProgress?.({
      processed: offset + fileBatch.length,
      total: files.length,
      importedCount,
      failureCount: failures.length
    });
  }

  return { importedCount, failures, total: files.length };
}
