import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join, extname, basename } from 'node:path';
import { parseCif } from '../parser/cifParser';
import { upsertEntry } from './db';
import type { ImportFailure, ImportResult } from '../shared/types';

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

export function importCifFolder(rootDir: string): ImportResult {
  const files = walkCifFiles(rootDir);
  const failures: ImportFailure[] = [];
  let importedCount = 0;

  for (const filePath of files) {
    const filename = basename(filePath);
    try {
      const text = readFileSync(filePath, 'utf-8');
      const entry = parseCif(text);
      upsertEntry(filename, entry);
      importedCount++;
    } catch (err) {
      failures.push({ filename, reason: err instanceof Error ? err.message : String(err) });
    }
  }

  return { importedCount, failures, total: files.length };
}
