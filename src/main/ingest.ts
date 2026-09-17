import { blockIdentities, contentHash } from './sourceIdentity';
import { readdirSync, lstatSync, readFileSync } from 'node:fs';
import { join, extname, basename } from 'node:path';
import { parseCif, splitCifDataBlocks } from '../parser/cifParser';
import { createEntryWriter } from './db';
import type { EntryWriteItem, EntryWriter, FileFingerprint } from './db';
import type { ImportFailure, ImportProgress, ImportResult } from '../shared/types';
import { traceEvent } from './runtimeTrace';

function blockSourceFilename(filename: string, blockName: string, index: number, total: number): string {
  if (total === 1) return filename;
  const safeName = blockName.replace(/[^A-Za-z0-9_.-]+/g, '_') || `block-${index + 1}`;
  return `${filename}#${index + 1}-${safeName}`;
}

/** Do not follow symlinks or Windows junctions, including a linked root. */
export function importCifFolder(
  rootDir: string,
  writer: EntryWriter = createEntryWriter(),
  onProgress?: (progress: ImportProgress) => void,
  isCancelled: () => boolean = () => false
): ImportResult {
  const files: FileFingerprint[] = [];
  const failures: ImportFailure[] = [];
  const stack = [rootDir];
  let skippedLinks = 0;
  let importedCount = 0;
  let skippedCount = 0;
  let processed = 0;
  const outcomes = { created: 0, updated: 0, duplicate: 0 };
  const report = (phase: 'discovery' | 'ingestion') => onProgress?.({
    phase, discovered: files.length, processed, total: files.length,
    importedCount, skippedCount, failureCount: failures.length
  });
  const failure = (filename: string, phase: ImportFailure['phase'], error: unknown) => {
    failures.push({ filename, phase, reason: error instanceof Error ? error.message : String(error) });
  };
  traceEvent('import.discovery.start');
  report('discovery');
  while (stack.length && !isCancelled()) {
    const path = stack.pop()!;
    try {
      const stat = lstatSync(path);
      if (stat.isSymbolicLink()) skippedLinks++;
      else if (stat.isDirectory()) {
        const names = readdirSync(path);
        for (let i = names.length - 1; i >= 0; i--) stack.push(join(path, names[i]));
      } else if (stat.isFile() && extname(path).toLowerCase() === '.cif') {
        files.push({ path, mtimeMs: stat.mtimeMs, size: stat.size });
      }
    } catch (error) { failure(path, 'discovery', error); }
    report('discovery');
  }
  const discoveryComplete = stack.length === 0 && !isCancelled();
  traceEvent(discoveryComplete ? 'import.discovery.complete' : 'import.discovery.cancelled');
  report('ingestion');
  for (const file of files) {
    if (isCancelled()) break;
    const filename = basename(file.path);
    try {
      if (writer.isUnchanged?.(file)) skippedCount++;
      else {
        const sourceContent = readFileSync(file.path);
        const blocks = splitCifDataBlocks(sourceContent.toString('utf8'));
        const identities = blockIdentities(blocks);
        const items: EntryWriteItem[] = [];
        let blockFailed = false;
        blocks.forEach((block, index) => {
          const sourceFilename = blockSourceFilename(filename, block.name, index, blocks.length);
          try {
            items.push({ sourceFilename, sourceContent, blockKey: identities[index],
              blockHash: contentHash(block.text), sourcePath: file.path,
              sourceMtimeMs: file.mtimeMs, sourceSize: file.size, dataBlockIndex: index,
              entry: parseCif(block.text) });
          } catch (error) { blockFailed = true; failure(sourceFilename, 'parse', error); }
        });
        if (!blockFailed) {
          try {
            const writeFailures = writer.writeBatch(items);
            const failed = new Set(writeFailures.map(value => value.item));
            importedCount += items.length - failed.size;
            for (const item of items) if (!failed.has(item) && item.outcome) outcomes[item.outcome]++;
            for (const value of writeFailures) failure(value.item.sourceFilename, 'write', value.error);
          } catch (error) { failure(filename, 'write', error); }
        }
      }
    } catch (error) { failure(filename, 'read', error); }
    processed++;
    report('ingestion');
  }
  const cancelled = isCancelled();
  traceEvent(cancelled ? 'import.cancelled' : 'import.complete');
  return { importedCount, skippedCount, failures, total: files.length, processed,
    cancelled, discoveryComplete, unattempted: files.length - processed, skippedLinks,
    ...(Object.values(outcomes).some(Boolean) ? { outcomes } : {}) };
}
