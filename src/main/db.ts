import Database from 'better-sqlite3';
import { join } from 'node:path';
import type { CifEntry } from '../parser/cifParser';
import type { AtomSiteRow, EntryRow, RestraintRow, SearchFilter } from '../shared/types';
import { resolveElementSelection } from '../shared/periodicTableData';

let db: Database.Database | null = null;

export interface EntryWriteItem {
  sourceFilename: string;
  sourcePath?: string;
  sourceMtimeMs?: number;
  sourceSize?: number;
  entry: CifEntry;
}

export interface FileFingerprint {
  path: string;
  mtimeMs: number;
  size: number;
}

export interface EntryWriteFailure {
  item: EntryWriteItem;
  error: unknown;
}

export interface EntryWriter {
  writeBatch: (items: EntryWriteItem[]) => EntryWriteFailure[];
  isUnchanged?: (file: FileFingerprint) => boolean;
}

export function initDb(userDataPath: string): Database.Database {
  const dbPath = join(userDataPath, 'cif-local.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  const atomSitesTableExists = Boolean(
    db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'atom_sites'").get()
  );
  db.exec(`
    CREATE TABLE IF NOT EXISTS entries (
      id INTEGER PRIMARY KEY,
      source_filename TEXT UNIQUE,
      formula TEXT,
      cell_a REAL,
      cell_b REAL,
      cell_c REAL,
      cell_angle_alpha REAL,
      cell_angle_beta REAL,
      cell_angle_gamma REAL,
      cell_volume REAL,
      sg_number INTEGER,
      space_group TEXT,
      reference TEXT,
      level_struct_studies TEXT,
      sample_type TEXT NOT NULL DEFAULT '',
      crystal_colour TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS entry_elements (
      entry_id INTEGER REFERENCES entries(id) ON DELETE CASCADE,
      element TEXT,
      count REAL
    );
    CREATE INDEX IF NOT EXISTS idx_entry_elements_element ON entry_elements(element);
    CREATE INDEX IF NOT EXISTS idx_entry_elements_entry_id ON entry_elements(entry_id);
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS imported_files (
      source_filename TEXT PRIMARY KEY REFERENCES entries(source_filename) ON DELETE CASCADE,
      source_path TEXT NOT NULL,
      source_mtime_ms REAL NOT NULL,
      source_size INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_imported_files_source_path ON imported_files(source_path);
    CREATE TABLE IF NOT EXISTS atom_sites (
      id INTEGER PRIMARY KEY,
      entry_id INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
      site_order INTEGER NOT NULL,
      type_symbol TEXT,
      site_label TEXT,
      symmetry_multiplicity INTEGER,
      wyckoff_symbol TEXT,
      fract_x REAL,
      fract_y REAL,
      fract_z REAL,
      occupancy REAL,
      UNIQUE(entry_id, site_order)
    );
    CREATE INDEX IF NOT EXISTS idx_atom_sites_entry_id ON atom_sites(entry_id);
  `);
  const entryColumns = new Set(
    (db.prepare('PRAGMA table_info(entries)').all() as { name: string }[]).map((column) => column.name)
  );
  let metadataColumnsAdded = false;
  if (!entryColumns.has('sample_type')) {
    db.exec("ALTER TABLE entries ADD COLUMN sample_type TEXT NOT NULL DEFAULT ''");
    metadataColumnsAdded = true;
  }
  if (!entryColumns.has('crystal_colour')) {
    db.exec("ALTER TABLE entries ADD COLUMN crystal_colour TEXT NOT NULL DEFAULT ''");
    metadataColumnsAdded = true;
  }
  for (const column of [
    'cell_angle_alpha',
    'cell_angle_beta',
    'cell_angle_gamma',
    'cell_volume'
  ]) {
    if (!entryColumns.has(column)) {
      db.exec(`ALTER TABLE entries ADD COLUMN ${column} REAL`);
      metadataColumnsAdded = true;
    }
  }
  if (!atomSitesTableExists || metadataColumnsAdded) {
    // Force one incremental rescan so existing entries receive newly persisted CIF fields.
    db.prepare('DELETE FROM imported_files').run();
  }
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
    `UPDATE entries SET formula = ?, cell_a = ?, cell_b = ?, cell_c = ?, cell_angle_alpha = ?,
     cell_angle_beta = ?, cell_angle_gamma = ?, cell_volume = ?, sg_number = ?,
     space_group = ?, reference = ?, level_struct_studies = ?, sample_type = ?,
     crystal_colour = ? WHERE id = ?`
  );
  const deleteElements = database.prepare('DELETE FROM entry_elements WHERE entry_id = ?');
  const insertEntry = database.prepare(
    `INSERT INTO entries
     (source_filename, formula, cell_a, cell_b, cell_c, cell_angle_alpha, cell_angle_beta,
      cell_angle_gamma, cell_volume, sg_number, space_group, reference,
      level_struct_studies, sample_type, crystal_colour)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertElement = database.prepare(
    'INSERT INTO entry_elements (entry_id, element, count) VALUES (?, ?, ?)'
  );
  const deleteAtomSites = database.prepare('DELETE FROM atom_sites WHERE entry_id = ?');
  const insertAtomSite = database.prepare(
    `INSERT INTO atom_sites
     (entry_id, site_order, type_symbol, site_label, symmetry_multiplicity, wyckoff_symbol,
      fract_x, fract_y, fract_z, occupancy)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const selectFingerprint = database.prepare(
    `SELECT 1 FROM imported_files
     WHERE source_path = ? AND source_mtime_ms = ? AND source_size = ?`
  );
  const upsertFingerprint = database.prepare(
    `INSERT INTO imported_files (source_filename, source_path, source_mtime_ms, source_size)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(source_filename) DO UPDATE SET source_path = excluded.source_path,
       source_mtime_ms = excluded.source_mtime_ms, source_size = excluded.source_size`
  );

  const writeOne = database.transaction((item: EntryWriteItem) => {
    const { sourceFilename, entry } = item;
    const existing = selectEntry.get(sourceFilename) as { id: number } | undefined;
    let entryId: number;
    if (existing) {
      entryId = existing.id;
      updateEntry.run(
        entry.formula,
        entry.cell_a,
        entry.cell_b,
        entry.cell_c,
        entry.cellAlpha,
        entry.cellBeta,
        entry.cellGamma,
        entry.cellVolume,
        entry.sg_number,
        entry.space_group,
        entry.reference,
        entry.level,
        entry.sampleType,
        entry.crystalColour,
        entryId
      );
    } else {
      const info = insertEntry.run(
        sourceFilename,
        entry.formula,
        entry.cell_a,
        entry.cell_b,
        entry.cell_c,
        entry.cellAlpha,
        entry.cellBeta,
        entry.cellGamma,
        entry.cellVolume,
        entry.sg_number,
        entry.space_group,
        entry.reference,
        entry.level,
        entry.sampleType,
        entry.crystalColour
      );
      entryId = Number(info.lastInsertRowid);
    }
    deleteElements.run(entryId);
    deleteAtomSites.run(entryId);
    for (const el of entry.elements) {
      insertElement.run(entryId, el.element, el.count);
    }
    entry.atomSites.forEach((site, index) => {
      insertAtomSite.run(
        entryId,
        index,
        site.typeSymbol,
        site.siteLabel,
        site.symmetryMultiplicity,
        site.wyckoffSymbol,
        site.fractX,
        site.fractY,
        site.fractZ,
        site.occupancy
      );
    });
    if (
      item.sourcePath !== undefined &&
      item.sourceMtimeMs !== undefined &&
      item.sourceSize !== undefined
    ) {
      upsertFingerprint.run(
        sourceFilename,
        item.sourcePath,
        item.sourceMtimeMs,
        item.sourceSize
      );
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

  return {
    writeBatch: writeBatchTransaction,
    isUnchanged: (file) => Boolean(selectFingerprint.get(file.path, file.mtimeMs, file.size))
  };
}

export function getAllEntries(): EntryRow[] {
  return getDb().prepare('SELECT * FROM entries ORDER BY id').all() as EntryRow[];
}

export function getEntryCount(database: Database.Database = getDb()): number {
  const row = database.prepare('SELECT COUNT(*) AS count FROM entries').get() as { count: number };
  return row.count;
}

export function getAtomSites(
  entryId: number,
  database: Database.Database = getDb()
): AtomSiteRow[] {
  return database
    .prepare('SELECT * FROM atom_sites WHERE entry_id = ? ORDER BY site_order')
    .all(entryId) as AtomSiteRow[];
}

export interface CifExportSource {
  formula: string;
  sg_number: number;
  source_path: string | null;
}

export function getCifExportSource(
  entryId: number,
  database: Database.Database = getDb()
): CifExportSource | null {
  return (database.prepare(
    `SELECT entries.formula, entries.sg_number, imported_files.source_path
     FROM entries
     LEFT JOIN imported_files ON imported_files.source_filename = entries.source_filename
     WHERE entries.id = ?`
  ).get(entryId) as CifExportSource | undefined) ?? null;
}

/** Delete all imported CIF data in one transaction. Cascades remove entry_elements rows. */
export function clearAllEntries(database: Database.Database = getDb()): number {
  return database.transaction(() => database.prepare('DELETE FROM entries').run().changes)();
}

const IMPORT_FOLDER_SETTING = 'import_folder';

export function getImportFolder(database: Database.Database = getDb()): string | null {
  const row = database
    .prepare('SELECT value FROM app_settings WHERE key = ?')
    .get(IMPORT_FOLDER_SETTING) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setImportFolder(folderPath: string, database: Database.Database = getDb()): void {
  database
    .prepare(
      `INSERT INTO app_settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    )
    .run(IMPORT_FOLDER_SETTING, folderPath);
}

function buildElementCondition(
  elements: string[],
  exclude = false
): { sql: string; params: string[] } {
  if (elements.length === 0) return { sql: '1=1', params: [] };
  const placeholders = elements.map(() => '?').join(',');
  return {
    sql: `id ${exclude ? 'NOT IN' : 'IN'} (SELECT entry_id FROM entry_elements WHERE element IN (${placeholders}))`,
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

interface ResolvedElementGroup {
  elements: string[];
  exclude: boolean;
}

function resolveFilterElementGroups(filter: SearchFilter): ResolvedElementGroup[] {
  if (filter.elementSelections) {
    return filter.elementSelections
      .map((selection) => ({
        elements: resolveElementSelection(selection),
        exclude: Boolean(selection.exclude)
      }))
      .filter((group) => group.elements.length > 0);
  }

  const legacyResolved = filter.elementSelection ? resolveElementSelection(filter.elementSelection) : [];
  const firstElementGroup = [...new Set([...(filter.slot1 ?? []), ...legacyResolved])];
  return [
    { elements: firstElementGroup, exclude: Boolean(filter.elementSelection?.exclude) },
    { elements: filter.slot2 ?? [], exclude: false },
    { elements: filter.slot3 ?? [], exclude: false },
    { elements: filter.slot4 ?? [], exclude: false }
  ].filter((group) => group.elements.length > 0);
}

export function buildWhereClause(filter: SearchFilter): { sql: string; params: (string | number)[] } {
  const clauses: string[] = [];
  const params: (string | number)[] = [];

  const elementGroups = resolveFilterElementGroups(filter);
  if (elementGroups.length > 0) {
    const groupClauses: string[] = [];
    for (const group of elementGroups) {
      const c = buildElementCondition(group.elements, group.exclude);
      groupClauses.push(c.sql);
      params.push(...c.params);
    }
    if (groupClauses.length > 1) {
      const joiner = filter.elementSelections ? ' AND ' : filter.mode === 'OR' ? ' OR ' : ' AND ';
      clauses.push(`(${groupClauses.join(joiner)})`);
    } else {
      clauses.push(groupClauses[0]);
    }
  }

  if (filter.aMin !== undefined) {
    clauses.push('cell_a >= ?');
    params.push(filter.aMin / 10);
  }
  if (filter.aMax !== undefined) {
    clauses.push('cell_a <= ?');
    params.push(filter.aMax / 10);
  }
  if (filter.bMin !== undefined) {
    clauses.push('cell_b >= ?');
    params.push(filter.bMin / 10);
  }
  if (filter.bMax !== undefined) {
    clauses.push('cell_b <= ?');
    params.push(filter.bMax / 10);
  }
  if (filter.cMin !== undefined) {
    clauses.push('cell_c >= ?');
    params.push(filter.cMin / 10);
  }
  if (filter.cMax !== undefined) {
    clauses.push('cell_c <= ?');
    params.push(filter.cMax / 10);
  }

  const sg = parseSgQuery(filter.sgQuery);
  if (sg.sql !== '1=1') {
    clauses.push(filter.sgExclude ? `NOT (${sg.sql})` : sg.sql);
    params.push(...sg.params);
  }

  if (filter.spaceGroupQuery && filter.spaceGroupQuery.trim() !== '') {
    clauses.push(`LOWER(space_group) ${filter.spaceGroupExclude ? 'NOT LIKE' : 'LIKE'} ? ESCAPE '\\'`);
    params.push(`%${escapeLike(filter.spaceGroupQuery.trim().toLowerCase())}%`);
  }

  if (filter.referenceQuery && filter.referenceQuery.trim() !== '') {
    clauses.push(`LOWER(reference) ${filter.referenceExclude ? 'NOT LIKE' : 'LIKE'} ? ESCAPE '\\'`);
    params.push(`%${escapeLike(filter.referenceQuery.trim().toLowerCase())}%`);
  }

  if (filter.level && filter.level.trim() !== '') {
    clauses.push('level_struct_studies = ?');
    params.push(filter.level);
  }

  const ec = parseElementCountQuery(filter.elementCountQuery);
  if (ec.sql !== '1=1') {
    clauses.push(filter.elementCountExclude ? `NOT (${ec.sql})` : ec.sql);
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
    const content = elementGroups
      .map((group) => `${group.exclude ? 'NOT ' : ''}(${group.elements.join(' OR ')})`)
      .join(filter.elementSelections ? ' AND ' : ` ${filter.mode} `);
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
      content: `${filter.aMin ?? '...'} - ${filter.aMax ?? '...'} Å`,
      entries: n
    });
  }
  if (filter.bMin !== undefined || filter.bMax !== undefined) {
    const n = countForFilter({ slot1: [], slot2: [], mode: 'AND', bMin: filter.bMin, bMax: filter.bMax });
    rows.push({
      field: 'Cell length b',
      content: `${filter.bMin ?? '...'} - ${filter.bMax ?? '...'} Å`,
      entries: n
    });
  }
  if (filter.cMin !== undefined || filter.cMax !== undefined) {
    const n = countForFilter({ slot1: [], slot2: [], mode: 'AND', cMin: filter.cMin, cMax: filter.cMax });
    rows.push({
      field: 'Cell length c',
      content: `${filter.cMin ?? '...'} - ${filter.cMax ?? '...'} Å`,
      entries: n
    });
  }

  if (filter.sgQuery && filter.sgQuery.trim() !== '') {
    const n = countForFilter({ slot1: [], slot2: [], mode: 'AND', sgQuery: filter.sgQuery, sgExclude: filter.sgExclude });
    rows.push({ field: 'Space group number', content: filter.sgExclude ? `NOT('${filter.sgQuery}')` : filter.sgQuery, entries: n });
  }

  if (filter.spaceGroupQuery && filter.spaceGroupQuery.trim() !== '') {
    const n = countForFilter({ slot1: [], slot2: [], mode: 'AND', spaceGroupQuery: filter.spaceGroupQuery, spaceGroupExclude: filter.spaceGroupExclude });
    rows.push({ field: 'Space group', content: filter.spaceGroupExclude ? `NOT('${filter.spaceGroupQuery}')` : filter.spaceGroupQuery, entries: n });
  }

  if (filter.referenceQuery && filter.referenceQuery.trim() !== '') {
    const n = countForFilter({ slot1: [], slot2: [], mode: 'AND', referenceQuery: filter.referenceQuery, referenceExclude: filter.referenceExclude });
    rows.push({ field: 'Reference', content: filter.referenceExclude ? `NOT('${filter.referenceQuery}')` : filter.referenceQuery, entries: n });
  }

  if (filter.level && filter.level.trim() !== '') {
    const n = countForFilter({ slot1: [], slot2: [], mode: 'AND', level: filter.level });
    rows.push({ field: 'Level struct. studies', content: filter.level, entries: n });
  }

  if (filter.elementCountQuery && filter.elementCountQuery.trim() !== '') {
    const n = countForFilter({ slot1: [], slot2: [], mode: 'AND', elementCountQuery: filter.elementCountQuery, elementCountExclude: filter.elementCountExclude });
    rows.push({ field: 'Number of elements', content: filter.elementCountExclude ? `NOT('${filter.elementCountQuery}')` : filter.elementCountQuery, entries: n });
  }

  if (rows.length > 0) {
    const total = countForFilter(filter);
    rows.push({ field: 'Total', content: `(${rows.map((r) => r.field).join(' AND ')})`, entries: total });
  }

  return rows;
}
