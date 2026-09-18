import Database from 'better-sqlite3';
import { link, mkdtemp, open, stat, unlink } from 'node:fs/promises';
import { basename, isAbsolute, join } from 'node:path';
import { setImmediate } from 'node:timers/promises';
import type { BatchExportScope, BatchExportRequest, BatchExportProgress, BatchExportResult, EntryRow } from '../shared/types';
import { getDb } from './database/connection';
import { buildWhereClause } from './database/query';
import { readStoredCif } from './database/sources';
import { sanitizeFilenamePart } from '../shared/exportFilename';

type ExportRow = EntryRow & { block_key: string | null; data_block_index: number | null };

export function countBatchExport(scope: BatchExportScope, db: Database.Database = getDb()): number {
  if (scope.kind === 'selected') return scope.ids.length;
  const { sql, params } = buildWhereClause(scope.filter);
  return (db.prepare(`SELECT COUNT(*) AS count FROM entries WHERE ${sql}`).get(...params) as { count: number }).count;
}

/** ID prefix guarantees uniqueness, including case-insensitive and truncated names. */
export function batchFilename(id: number, filename: string, blockIndex: number | null): string {
  const stem = sanitizeFilenamePart(filename.replace(/\.cif$/i, '')).slice(0, 80).replace(/[. ]+$/g, '');
  // Prefix also prevents device names, including CON.txt and COM superscript aliases.
  return `entry-${id}_${stem}_block-${(blockIndex ?? 0) + 1}.cif`;
}

/** Reversible text escaping: one leading apostrophe on formula-like or apostrophe-led text. */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (typeof value === 'string' && (/^[\s\uFEFF]*[=+\-@]/.test(text) || /^[\t\r\n']/.test(text))) text = "'" + text;
  return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

const metadataColumns = ['source_filename', 'block_key', 'data_block_index', 'formula', 'cell_a_angstrom', 'cell_b_angstrom',
  'cell_c_angstrom', 'cell_angle_alpha', 'cell_angle_beta', 'cell_angle_gamma', 'cell_volume', 'sg_number', 'space_group',
  'reference', 'citation_doi', 'database_code_ccdc', 'database_code_csd', 'database_code_icsd'] as const;
const metadataHeaders = ['source_filename', 'block_identity', 'block_index_zero_based', 'formula', 'cell_a_angstrom', 'cell_b_angstrom',
  'cell_c_angstrom', 'alpha_degrees', 'beta_degrees', 'gamma_degrees', 'volume_angstrom_cubed', 'space_group_number', 'space_group_symbol',
  'reference', 'doi', 'ccdc_id', 'csd_refcode', 'icsd_id'];
const csvLine = (values: (string | number | null | undefined)[]) => values.map(csvCell).join(',') + '\r\n';

function* rowBatches(scope: BatchExportScope, db: Database.Database): Generator<Array<{ id: number; row?: ExportRow }>> {
  const select = 'SELECT e.*, f.data_block_index FROM entries e LEFT JOIN imported_files f ON f.entry_id=e.id';
  if (scope.kind === 'selected') {
    for (let offset = 0; offset < scope.ids.length; offset += 100) {
      const ids = scope.ids.slice(offset, offset + 100);
      const rows = db.prepare(`${select} WHERE e.id IN (${ids.map(() => '?').join(',')})`).all(...ids) as ExportRow[];
      const byId = new Map(rows.map(row => [row.id, row]));
      yield ids.map(id => ({ id, row: byId.get(id) }));
    }
  } else {
    const { sql, params } = buildWhereClause(scope.filter);
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
  try { await file.writeFile(contents, 'utf8'); await file.sync(); }
  finally { await file.close(); }
  // Hard-link publication is atomic and fails if the final name already exists.
  try { await link(temporary, join(folder, name)); }
  finally { await unlink(temporary).catch(() => {}); }
}

/** Each connection pins a WAL read snapshot. No CIF payloads cross IPC. */
export async function runBatchExport(request: BatchExportRequest, destination: string, signal: AbortSignal,
  progress: (value: BatchExportProgress) => void, databasePath: string = getDb().name): Promise<BatchExportResult> {
  if (!isAbsolute(destination) || !(await stat(destination)).isDirectory()) throw new TypeError('Choose an existing destination folder');
  const db = new Database(databasePath, { readonly: true, fileMustExist: true });
  let report: Awaited<ReturnType<typeof open>> | undefined;
  try {
    db.exec('BEGIN');
    const total = countBatchExport(request.scope, db);
    if (total !== request.expectedCount) throw new Error('The export count changed. Review the scope and count again.');
    const folder = await mkdtemp(join(destination, 'cif-export-'));
    const result: BatchExportResult = { total, completed: 0, failed: 0, notAttempted: total, cancelled: false, folderName: basename(folder) };
    const reportName = request.mode === 'cif' ? 'report.csv' : 'summary.csv';
    const partialReport = join(folder, reportName + '.partial');
    report = await open(partialReport, 'wx');
    try {
      await report.writeFile(csvLine(['entry_id', 'output_filename', 'status', 'reason', ...(request.mode === 'cif' ? [] : metadataHeaders)]));
      progress({ ...result });
      let reported = 0;
      for (const batch of rowBatches(request.scope, db)) {
        for (const { id, row } of batch) {
          await setImmediate();
          const name = row && request.mode !== 'csv' ? batchFilename(id, row.source_filename, row.data_block_index) : '';
          let status = 'not-attempted';
          let reason = '';
          if (signal.aborted) result.cancelled = true;
          else {
            result.notAttempted--;
            try {
              if (!row) throw new Error('missing-entry');
              if (request.mode !== 'csv') {
                let contents: string;
                try { contents = readStoredCif(id, db); }
                catch { throw new Error('source-unavailable'); }
                await publishCif(folder, name, contents);
              }
              status = 'completed'; result.completed++;
            } catch (error) {
              status = 'failed'; result.failed++;
              reason = error instanceof Error && error.message === 'missing-entry' ? 'Entry no longer available.'
                : error instanceof Error && error.message === 'source-unavailable' ? 'Verified stored block unavailable. Reimport or restore a verified backup.'
                  : 'Could not publish a new file. Check folder permissions, existing filenames and free space.';
            }
          }
          await report.writeFile(csvLine([id, name, status, reason, ...(request.mode === 'cif' ? [] : metadataColumns.map(key => {
            const value = row?.[key];
            return key === 'sg_number' && value === 0 ? null : value;
          }))]));
          if (++reported % 25 === 0 || reported === total) progress({ ...result });
        }
      }
      await report.sync(); await report.close(); report = undefined;
      await link(partialReport, join(folder, reportName));
      await unlink(partialReport).catch(() => {});
      result.reportName = reportName;
    } catch {
      result.error = 'The report could not be completed. Completed CIF files remain in the batch folder; .partial files are incomplete. Check free space and permissions before retrying.';
      if (request.mode === 'csv') { result.failed += result.completed; result.completed = 0; }
    }
    progress({ ...result });
    return result;
  } finally { await report?.close(); db.close(); }
}
