import { blockIdentities, contentHash } from './sourceIdentity';
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join, extname, basename } from 'node:path';
import { parseCif, splitCifDataBlocks } from '../parser/cifParser';
import {
  createEntryWriter,
  type EntryWriteItem,
  type EntryWriter,
  type FileFingerprint
} from './db';
import type { ImportFailure, ImportProgress, ImportResult } from '../shared/types';

const IMPORT_BATCH_SIZE = 250;

function blockSourceFilename(filename: string, blockName: string, index: number, total: number): string {
  if (total === 1) return filename;
  const safeName = blockName.replace(/[^A-Za-z0-9_.-]+/g, '_') || `block-${index + 1}`;
  return `${filename}#${index + 1}-${safeName}`;
}

function walkCifFiles(root: string): FileFingerprint[] {
  const results: FileFingerprint[] = [];
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
        results.push({ path: full, mtimeMs: stat.mtimeMs, size: stat.size });
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
  let skippedCount = 0;
  const outcomes = { created: 0, updated: 0, duplicate: 0 };
  onProgress?.({
    processed: 0,
    total: files.length,
    importedCount: 0,
    skippedCount: 0,
    failureCount: 0
  });

  const writePending = (pending: EntryWriteItem[]) => {
    if (pending.length === 0) return;
    const writeFailures = writer.writeBatch(pending);
    const failedItems = new Set(writeFailures.map((failure) => failure.item));
    importedCount += pending.length - failedItems.size;
    for (const item of pending) if (!failedItems.has(item) && item.outcome) outcomes[item.outcome]++;
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
    for (const file of fileBatch) {
      const filename = basename(file.path);
      try {
        if (writer.isUnchanged?.(file)) {
          skippedCount++;
          continue;
        }
        const sourceContent = readFileSync(file.path);
        const text = sourceContent.toString('utf8');
        const blocks = splitCifDataBlocks(text);
        const identities = blockIdentities(blocks);
        const fileItems: EntryWriteItem[] = [];
        let blockFailed = false;
        blocks.forEach((block, index) => {
          const sourceFilename = blockSourceFilename(filename, block.name, index, blocks.length);
          try {
            fileItems.push({
              sourceFilename,
              sourceContent,
              blockKey: identities[index],
              blockHash: contentHash(block.text),
              sourcePath: file.path,
              sourceMtimeMs: file.mtimeMs,
              sourceSize: file.size,
              dataBlockIndex: index,
              entry: parseCif(block.text)
            });
          } catch (error) {
            blockFailed = true;
            failures.push({
              filename: sourceFilename,
              reason: error instanceof Error ? error.message : String(error)
            });
          }
        });
        if (blockFailed) continue;
        pending.push(...fileItems);
      } catch (err) {
        failures.push({ filename, reason: err instanceof Error ? err.message : String(err) });
      }
    }
    writePending(pending);
    onProgress?.({
      processed: offset + fileBatch.length,
      total: files.length,
      importedCount,
      skippedCount,
      failureCount: failures.length
    });
  }

  return { importedCount, skippedCount, failures, total: files.length, ...(Object.values(outcomes).some(Boolean) ? { outcomes } : {}) };
}
