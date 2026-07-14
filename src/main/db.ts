import Database from 'better-sqlite3';
import { join } from 'node:path';
import type { CifEntry } from '../parser/cifParser';
import type { EntryRow, RestraintRow, SearchFilter } from '../shared/types';
import { resolveElementSelection } from '../shared/periodicTableData';

let db: Database.Database | null = null;

export interface EntryWriteItem {
  sourceFilename: string;
  entry: CifEntry;
}

export interface EntryWriteFailure {
  item: EntryWriteItem;
  error: unknown;
}

export interface EntryWriter {
  writeBatch: (items: EntryWriteItem[]) => EntryWriteFailure[];
}

export function initDb(userDataPath: string): Database.Database {
  const dbPath = join(userDataPath, 'cif-local.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS entries (
      id INTEGER PRIMARY KEY,
      source_filename TEXT UNIQUE,
      formula TEXT,
      cell_a REAL,
      cell_b REAL,
      cell_c REAL,
      sg_number INTEGER,
      space_group TEXT,
      reference TEXT,
      level_struct_studies TEXT
    );
    CREATE TABLE IF NOT EXISTS entry_elements (
      entry_id INTEGER REFERENCES entries(id) ON DELETE CASCADE,
      element TEXT,
      count REAL
    );
    CREATE INDEX IF NOT EXISTS idx_entry_elements_element ON entry_elements(element);
    CREATE INDEX IF NOT EXISTS idx_entry_elements_entry_id ON entry_elements(entry_id);
  `);
  return db;
}

export function getDb(): Database.Database {
  if (!db) throw new Error('Database not initialized');
  return db;
}

/** Prepare one reusable writer whose batches commit once while each file remains atomic. */
export function createEntryWriter(database: Database.Database = getDb()): EntryWriter {
  const selectEntry = database.prepare('SELECT id FROM entries WHERE source_filename = ?');
  const updateEntry = database.prepare(
    `UPDATE entries SET formula = ?, cell_a = ?, cell_b = ?, cell_c = ?, sg_number = ?,
     space_group = ?, reference = ?, level_struct_studies = ? WHERE id = ?`
  );
  const deleteElements = database.prepare('DELETE FROM entry_elements WHERE entry_id = ?');
  const insertEntry = database.prepare(
    `INSERT INTO entries
     (source_filename, formula, cell_a, cell_b, cell_c, sg_number, space_group, reference, level_struct_studies)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertElement = database.prepare(
    'INSERT INTO entry_elements (entry_id, element, count) VALUES (?, ?, ?)'
  );

  const writeOne = database.transaction(({ sourceFilename, entry }: EntryWriteItem) => {
    const existing = selectEntry.get(sourceFilename) as { id: number } | undefined;
    let entryId: number;
    if (existing) {
      entryId = existing.id;
      updateEntry.run(
        entry.formula,
        entry.cell_a,
        entry.cell_b,
        entry.cell_c,
        entry.sg_number,
        entry.space_group,
        entry.reference,
        entry.level,
        entryId
      );
      deleteElements.run(entryId);
    } else {
      const info = insertEntry.run(
        sourceFilename,
        entry.formula,
        entry.cell_a,
        entry.cell_b,
        entry.cell_c,
        entry.sg_number,
        entry.space_group,
        entry.reference,
        entry.level
      );
      entryId = Number(info.lastInsertRowid);
    }
    for (const el of entry.elements) {
      insertElement.run(entryId, el.element, el.count);
    }
  });

  const writeBatchTransaction = database.transaction((items: EntryWriteItem[]) => {
    const failures: EntryWriteFailure[] = [];
    for (const item of items) {
      try {
        // Nested better-sqlite3 transactions use savepoints, preserving per-file atomicity.
        writeOne(item);
      } catch (error) {
        failures.push({ item, error });
      }
    }
    return failures;
  });

  return { writeBatch: writeBatchTransaction };
}

export function getAllEntries(): EntryRow[] {
  return getDb().prepare('SELECT * FROM entries ORDER BY id').all() as EntryRow[];
}

/** Delete all imported CIF data in one transaction. Cascades remove entry_elements rows. */
export function clearAllEntries(database: Database.Database = getDb()): number {
  return database.transaction(() => database.prepare('DELETE FROM entries').run().changes)();
}

function buildElementCondition(elements: string[]): { sql: string; params: string[] } {
  if (elements.length === 0) return { sql: '1=1', params: [] };
  const placeholders = elements.map(() => '?').join(',');
  return {
    sql: `id IN (SELECT entry_id FROM entry_elements WHERE element IN (${placeholders}))`,
    params: elements
  };
}

function parseSgQuery(sgQuery: string | undefined): { sql: string; params: (string | number)[] } {
  if (!sgQuery || sgQuery.trim() === '') return { sql: '1=1', params: [] };
  const trimmed = sgQuery.trim();
  const rangeMatch = trimmed.match(/^(\d+)\s*-\s*(\d+)$/);
  if (rangeMatch) {
    return { sql: 'sg_number BETWEEN ? AND ?', params: [Number(rangeMatch[1]), Number(rangeMatch[2])] };
  }
  const n = Number(trimmed);
  if (Number.isFinite(n)) {
    return { sql: 'sg_number = ?', params: [n] };
  }
  return { sql: '1=1', params: [] };
}

function parseElementCountQuery(query: string | undefined): { sql: string; params: number[] } {
  if (!query || query.trim() === '') return { sql: '1=1', params: [] };
  const trimmed = query.trim();
  const rangeMatch = trimmed.match(/^(\d+)\s*-\s*(\d+)$/);
  if (rangeMatch) {
    return {
      sql: 'id IN (SELECT entry_id FROM entry_elements GROUP BY entry_id HAVING COUNT(DISTINCT element) BETWEEN ? AND ?)',
      params: [Number(rangeMatch[1]), Number(rangeMatch[2])]
    };
  }
  const n = Number(trimmed);
  if (Number.isFinite(n)) {
    return {
      sql: 'id IN (SELECT entry_id FROM entry_elements GROUP BY entry_id HAVING COUNT(DISTINCT element) = ?)',
      params: [n]
    };
  }
  return { sql: '1=1', params: [] };
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

function resolveFilterElementGroups(filter: SearchFilter): string[][] {
  if (filter.elementSelections) {
    return filter.elementSelections.map(resolveElementSelection).filter((group) => group.length > 0);
  }

  const legacyResolved = filter.elementSelection ? resolveElementSelection(filter.elementSelection) : [];
  const firstElementGroup = [...new Set([...(filter.slot1 ?? []), ...legacyResolved])];
  return [firstElementGroup, filter.slot2 ?? [], filter.slot3 ?? [], filter.slot4 ?? []]
    .filter((group) => group.length > 0);
}

export function buildWhereClause(filter: SearchFilter): { sql: string; params: (string | number)[] } {
  const clauses: string[] = [];
  const params: (string | number)[] = [];

  const elementGroups = resolveFilterElementGroups(filter);
  if (elementGroups.length > 0) {
    const groupClauses: string[] = [];
    for (const group of elementGroups) {
      const c = buildElementCondition(group);
      groupClauses.push(c.sql);
      params.push(...c.params);
    }
    if (groupClauses.length > 1) {
      const joiner = filter.mode === 'OR' ? ' OR ' : ' AND ';
      clauses.push(`(${groupClauses.join(joiner)})`);
    } else {
      clauses.push(groupClauses[0]);
    }
  }

  if (filter.aMin !== undefined) {
    clauses.push('cell_a >= ?');
    params.push(filter.aMin);
  }
  if (filter.aMax !== undefined) {
    clauses.push('cell_a <= ?');
    params.push(filter.aMax);
  }
  if (filter.bMin !== undefined) {
    clauses.push('cell_b >= ?');
    params.push(filter.bMin);
  }
  if (filter.bMax !== undefined) {
    clauses.push('cell_b <= ?');
    params.push(filter.bMax);
  }
  if (filter.cMin !== undefined) {
    clauses.push('cell_c >= ?');
    params.push(filter.cMin);
  }
  if (filter.cMax !== undefined) {
    clauses.push('cell_c <= ?');
    params.push(filter.cMax);
  }

  const sg = parseSgQuery(filter.sgQuery);
  if (sg.sql !== '1=1') {
    clauses.push(sg.sql);
    params.push(...sg.params);
  }

  if (filter.spaceGroupQuery && filter.spaceGroupQuery.trim() !== '') {
    clauses.push("LOWER(space_group) LIKE ? ESCAPE '\\'");
    params.push(`%${escapeLike(filter.spaceGroupQuery.trim().toLowerCase())}%`);
  }

  if (filter.referenceQuery && filter.referenceQuery.trim() !== '') {
    clauses.push("LOWER(reference) LIKE ? ESCAPE '\\'");
    params.push(`%${escapeLike(filter.referenceQuery.trim().toLowerCase())}%`);
  }

  if (filter.level && filter.level.trim() !== '') {
    clauses.push('level_struct_studies = ?');
    params.push(filter.level);
  }

  const ec = parseElementCountQuery(filter.elementCountQuery);
  if (ec.sql !== '1=1') {
    clauses.push(ec.sql);
    params.push(...ec.params);
  }

  return { sql: clauses.length ? clauses.join(' AND ') : '1=1', params };
}

export function searchEntries(filter: SearchFilter): EntryRow[] {
  const { sql, params } = buildWhereClause(filter);
  return getDb()
    .prepare(`SELECT * FROM entries WHERE ${sql} ORDER BY id`)
    .all(...params) as EntryRow[];
}

export function countForFilter(filter: SearchFilter): number {
  const { sql, params } = buildWhereClause(filter);
  const row = getDb()
    .prepare(`SELECT COUNT(*) as c FROM entries WHERE ${sql}`)
    .get(...params) as { c: number };
  return row.c;
}

/** Compute live "restraints" rows: one per active filter field, plus a combined total. */
export function computeRestraints(filter: SearchFilter): RestraintRow[] {
  const rows: RestraintRow[] = [];

  const slot1 = filter.slot1 ?? [];
  const slot2 = filter.slot2 ?? [];
  const slot3 = filter.slot3 ?? [];
  const slot4 = filter.slot4 ?? [];
  const elementGroups = resolveFilterElementGroups(filter);
  if (elementGroups.length) {
    const content = elementGroups.map((group) => `(${group.join(' OR ')})`).join(` ${filter.mode} `);
    const n = countForFilter({
      slot1,
      slot2,
      slot3,
      slot4,
      mode: filter.mode,
      elementSelections: filter.elementSelections,
      elementSelection: filter.elementSelection
    });
    rows.push({ field: 'Elements', content, entries: n });
  }

  if (filter.aMin !== undefined || filter.aMax !== undefined) {
    const n = countForFilter({ slot1: [], slot2: [], mode: 'AND', aMin: filter.aMin, aMax: filter.aMax });
    rows.push({
      field: 'Cell length a',
      content: `${filter.aMin ?? '...'} - ${filter.aMax ?? '...'} nm`,
      entries: n
    });
  }
  if (filter.bMin !== undefined || filter.bMax !== undefined) {
    const n = countForFilter({ slot1: [], slot2: [], mode: 'AND', bMin: filter.bMin, bMax: filter.bMax });
    rows.push({
      field: 'Cell length b',
      content: `${filter.bMin ?? '...'} - ${filter.bMax ?? '...'} nm`,
      entries: n
    });
  }
  if (filter.cMin !== undefined || filter.cMax !== undefined) {
    const n = countForFilter({ slot1: [], slot2: [], mode: 'AND', cMin: filter.cMin, cMax: filter.cMax });
    rows.push({
      field: 'Cell length c',
      content: `${filter.cMin ?? '...'} - ${filter.cMax ?? '...'} nm`,
      entries: n
    });
  }

  if (filter.sgQuery && filter.sgQuery.trim() !== '') {
    const n = countForFilter({ slot1: [], slot2: [], mode: 'AND', sgQuery: filter.sgQuery });
    rows.push({ field: 'Space group number', content: filter.sgQuery, entries: n });
  }

  if (filter.spaceGroupQuery && filter.spaceGroupQuery.trim() !== '') {
    const n = countForFilter({ slot1: [], slot2: [], mode: 'AND', spaceGroupQuery: filter.spaceGroupQuery });
    rows.push({ field: 'Space group', content: filter.spaceGroupQuery, entries: n });
  }

  if (filter.referenceQuery && filter.referenceQuery.trim() !== '') {
    const n = countForFilter({ slot1: [], slot2: [], mode: 'AND', referenceQuery: filter.referenceQuery });
    rows.push({ field: 'Reference', content: filter.referenceQuery, entries: n });
  }

  if (filter.level && filter.level.trim() !== '') {
    const n = countForFilter({ slot1: [], slot2: [], mode: 'AND', level: filter.level });
    rows.push({ field: 'Level struct. studies', content: filter.level, entries: n });
  }

  if (filter.elementCountQuery && filter.elementCountQuery.trim() !== '') {
    const n = countForFilter({ slot1: [], slot2: [], mode: 'AND', elementCountQuery: filter.elementCountQuery });
    rows.push({ field: 'Number of elements', content: filter.elementCountQuery, entries: n });
  }

  if (rows.length > 0) {
    const total = countForFilter(filter);
    rows.push({ field: 'Total', content: `(${rows.map((r) => r.field).join(' AND ')})`, entries: total });
  }

  return rows;
}
