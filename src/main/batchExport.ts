import Database from 'better-sqlite3';
import { link, mkdir, open, stat, unlink } from 'node:fs/promises';
import { basename, isAbsolute, join } from 'node:path';
import { setImmediate } from 'node:timers/promises';
import type { BatchExportScope, BatchExportRequest, BatchExportProgress, BatchExportResult, EntryRow } from '../shared/types';
import { getDb } from './database/connection';
import { buildWhereClause } from './database/query';
import { readStoredCif } from './database/sources';
import { buildCifExportFilename } from '../shared/exportFilename';

type ExportRow = Pick<EntryRow, 'id' | 'formula' | 'sg_number'>;

function matchingWhere(scope: Extract<BatchExportScope, { kind: 'matching' }>) {
  const { sql, params } = buildWhereClause(scope.filter);
  if (!scope.excludedIds?.length) return { sql, params };
  return { sql: `(${sql}) AND id NOT IN (SELECT value FROM json_each(?))`,
    params: [...params, JSON.stringify(scope.excludedIds)] };
}

export function countBatchExport(scope: BatchExportScope, db: Database.Database = getDb()): number {
  if (scope.kind === 'selected') return scope.ids.length;
  const { sql, params } = matchingWhere(scope);
  return (db.prepare(`SELECT COUNT(*) AS count FROM entries WHERE ${sql}`).get(...params) as { count: number }).count;
}

/** Reserve names case-insensitively, including sanitized and truncated collisions. */
export function batchFilename(id: number, formula: string, spaceGroupNumber: number, used: Set<string>): string {
  const base = buildCifExportFilename(formula, spaceGroupNumber);
  let name = base;
  let suffix = 0;
  while (used.has(name.toLowerCase())) {
    name = `${base.slice(0, -4)}_entry-${id}${suffix ? `-${suffix}` : ''}.cif`;
    suffix++;
  }
  used.add(name.toLowerCase());
  return name;
}

function* rowBatches(scope: BatchExportScope, db: Database.Database): Generator<Array<{ id: number; row?: ExportRow }>> {
  const select = 'SELECT e.id, e.formula, e.sg_number FROM entries e';
  if (scope.kind === 'selected') {
    for (let offset = 0; offset < scope.ids.length; offset += 100) {
      const ids = scope.ids.slice(offset, offset + 100);
      const rows = db.prepare(`${select} WHERE e.id IN (${ids.map(() => '?').join(',')})`).all(...ids) as ExportRow[];
      const byId = new Map(rows.map(row => [row.id, row]));
      yield ids.map(id => ({ id, row: byId.get(id) }));
    }
  } else {
    const { sql, params } = matchingWhere(scope);
    let lastId = 0;
    for (;;) {
      // The existing validated predicate expects the unaliased entries table.
      const rows = db.prepare(`${select} WHERE e.id IN (SELECT id FROM entries WHERE (${sql}) AND id > ? ORDER BY id LIMIT 100) ORDER BY e.id`)
        .all(...params, lastId) as ExportRow[];
      if (!rows.length) return;
      lastId = rows[rows.length - 1].id;
      yield rows.map(row => ({ id: row.id, row }));
    }
  }
}

async function publishCif(folder: string, name: string, contents: string): Promise<void> {
  const temporary = join(folder, name + '.partial');
  const file = await open(temporary, 'wx');
  try {
    try { await file.writeFile(contents, 'utf8'); await file.sync(); }
    finally { await file.close(); }
    // Hard-link publication is atomic and fails if the final name already exists.
    await link(temporary, join(folder, name));
  } finally { await unlink(temporary); }
}

async function createBatchFolder(destination: string): Promise<string> {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  for (let suffix = 0; ; suffix++) {
    const folder = join(destination, `cif_batch_${stamp}${suffix ? `_${suffix + 1}` : ''}`);
    try { await mkdir(folder); return folder; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
  }
}

/** Each connection pins a WAL read snapshot. No CIF payloads cross IPC. */
export async function runBatchExport(request: BatchExportRequest, destination: string, signal: AbortSignal,
  progress: (value: BatchExportProgress) => void, databasePath: string = getDb().name): Promise<BatchExportResult> {
  if (!isAbsolute(destination) || !(await stat(destination)).isDirectory()) throw new TypeError('Choose an existing destination folder');
  const db = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    db.exec('BEGIN');
    const total = countBatchExport(request.scope, db);
    if (total !== request.expectedCount) throw new Error('The export count changed. Review the scope and count again.');
    const folder = await createBatchFolder(destination);
    const result: BatchExportResult = { total, completed: 0, failed: 0, notAttempted: total, cancelled: false, folderName: basename(folder), failures: [] };
    progress({ total, completed: 0, failed: 0, notAttempted: total });
    const usedNames = new Set<string>();
    for (const batch of rowBatches(request.scope, db)) {
      for (const { id, row } of batch) {
        await setImmediate();
        if (signal.aborted) { result.cancelled = true; break; }
        const name = row ? batchFilename(id, row.formula, row.sg_number, usedNames) : undefined;
        result.notAttempted--;
        try {
          if (!row) throw new Error('missing-entry');
          let contents: string;
          try { contents = readStoredCif(id, db); }
          catch { throw new Error('source-unavailable'); }
          await publishCif(folder, name!, contents);
          result.completed++;
        } catch (error) {
          result.failed++;
          const reason = error instanceof Error && error.message === 'missing-entry' ? 'Entry no longer available.'
            : error instanceof Error && error.message === 'source-unavailable' ? 'Verified stored block unavailable. Reimport or restore a verified backup.'
              : 'Could not publish a new file. Check folder permissions, existing filenames and free space. Any remaining .partial file is incomplete.';
          result.failures.push({ entryId: id, fileName: name, reason });
        }
        const { total, completed, failed, notAttempted } = result;
        if ((completed + failed) % 25 === 0 || notAttempted === 0) progress({ total, completed, failed, notAttempted });
      }
      if (result.cancelled) break;
    }
    const { completed, failed, notAttempted } = result;
    progress({ total, completed, failed, notAttempted });
    return result;
  } finally { db.close(); }
}
