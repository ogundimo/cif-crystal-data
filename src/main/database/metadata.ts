import type Database from 'better-sqlite3';
import type { AtomSiteRow, PublAuthorRow, SymmetryOperationRow } from '../../shared/types';
import { getDb } from './connection';

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

export function getSymmetryOperations(
  entryId: number,
  database: Database.Database = getDb()
): SymmetryOperationRow[] {
  return database
    .prepare('SELECT * FROM symmetry_operations WHERE entry_id = ? ORDER BY operation_order')
    .all(entryId) as SymmetryOperationRow[];
}

export function getPublAuthors(
  entryId: number,
  database: Database.Database = getDb()
): PublAuthorRow[] {
  return database
    .prepare('SELECT * FROM publ_authors WHERE entry_id = ? ORDER BY author_order')
    .all(entryId) as PublAuthorRow[];
}

interface CifExportSource {
  formula: string;
  sg_number: number;
  source_path: string | null;
  data_block_index: number;
}

interface CifViewerSourceRecord {
  source_filename: string;
  source_path: string | null;
  data_block_index: number;
}

export function getCifViewerSourceRecord(
  entryId: number,
  database: Database.Database = getDb()
): CifViewerSourceRecord | null {
  return (database.prepare(
    `SELECT entries.source_filename, imported_files.source_path, imported_files.data_block_index
     FROM entries
     LEFT JOIN imported_files ON imported_files.entry_id = entries.id
     WHERE entries.id = ?`
  ).get(entryId) as CifViewerSourceRecord | undefined) ?? null;
}

export function getCifExportSource(
  entryId: number,
  database: Database.Database = getDb()
): CifExportSource | null {
  return (database.prepare(
    `SELECT entries.formula, entries.sg_number, imported_files.source_path, imported_files.data_block_index
     FROM entries
     LEFT JOIN imported_files ON imported_files.entry_id = entries.id
     WHERE entries.id = ?`
  ).get(entryId) as CifExportSource | undefined) ?? null;
}

const IMPORT_FOLDER_SETTING = 'import_folder';

export function getStartupRefresh(database: Database.Database = getDb()): boolean {
  const row = database.prepare("SELECT value FROM app_settings WHERE key = 'startup_refresh'").get() as { value: string } | undefined;
  return row?.value === 'true';
}

export function setStartupRefresh(enabled: boolean, database: Database.Database = getDb()): void {
  database.prepare("INSERT INTO app_settings(key, value) VALUES ('startup_refresh', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(String(enabled));
}

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

export function getPreservedLayout(database: Database.Database = getDb()): Record<string, string> {
  const row = database.prepare("SELECT value FROM app_settings WHERE key = 'renderer_layout'").get() as { value: string } | undefined;
  return row ? JSON.parse(row.value) : {};
}

export function getDataAuthors(entryId: number, database: Database.Database = getDb()): PublAuthorRow[] {
  return database.prepare('SELECT * FROM data_authors WHERE entry_id = ? ORDER BY author_order').all(entryId) as PublAuthorRow[];
}
