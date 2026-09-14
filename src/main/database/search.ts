import type Database from 'better-sqlite3';
import type { EntryRow, SearchPageRequest, SearchPageResult, SearchSortColumn } from '../../shared/types';
import { getDb } from './connection';
import { buildWhereClause } from './query';

const SEARCH_SORT_COLUMNS: ReadonlySet<SearchSortColumn> = new Set([
  'formula', 'cell_a', 'cell_b', 'cell_c', 'sg_number', 'space_group', 'reference',
  'level_struct_studies'
]);

export function searchEntriesPage(
  request: SearchPageRequest,
  database: Database.Database = getDb()
): SearchPageResult {
  const { sql, params } = buildWhereClause(request.filter);
  const limit = Math.min(1_000, Math.max(1, Math.trunc(request.limit)));
  const offset = Math.max(0, Math.trunc(request.offset));
  const sortColumn = request.sortColumn && SEARCH_SORT_COLUMNS.has(request.sortColumn)
    ? request.sortColumn
    : 'id';
  const sortDirection = request.sortDirection === 'desc' ? 'DESC' : 'ASC';
  const total = (database.prepare(`SELECT COUNT(*) AS count FROM entries WHERE ${sql}`)
    .get(...params) as { count: number }).count;
  const rows = database.prepare(
    `SELECT * FROM entries WHERE ${sql} ORDER BY ${sortColumn} ${sortDirection}, id ASC LIMIT ? OFFSET ?`
  ).all(...params, limit, offset) as EntryRow[];
  return { rows, total };
}
