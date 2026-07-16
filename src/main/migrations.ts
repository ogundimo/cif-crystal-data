import { dirname, join } from 'node:path';
import type Database from 'better-sqlite3';

export const CURRENT_SCHEMA_VERSION = 2;

function hasColumn(database: Database.Database, table: string, column: string): boolean {
  return (database.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[])
    .some((item) => item.name === column);
}

function migration1(database: Database.Database): void {
  database.exec(`
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
  `);
}

function migration2(database: Database.Database): void {
  const textColumns = ['sample_type', 'crystal_colour'];
  for (const column of textColumns) {
    if (!hasColumn(database, 'entries', column)) {
      database.exec(`ALTER TABLE entries ADD COLUMN ${column} TEXT NOT NULL DEFAULT ''`);
    }
  }
  for (const column of ['cell_angle_alpha', 'cell_angle_beta', 'cell_angle_gamma', 'cell_volume']) {
    if (!hasColumn(database, 'entries', column)) {
      database.exec(`ALTER TABLE entries ADD COLUMN ${column} REAL`);
    }
  }
  database.exec(`
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
    DELETE FROM imported_files;
  `);
}

const migrations: Record<number, (database: Database.Database) => void> = {
  1: migration1,
  2: migration2
};

function createMigrationBackup(
  database: Database.Database,
  databasePath: string,
  fromVersion: number
): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = join(
    dirname(databasePath),
    `cif-local.pre-migration-v${fromVersion}-${timestamp}.db`
  );
  const escaped = backupPath.replace(/'/g, "''");
  database.exec(`VACUUM INTO '${escaped}'`);
  return backupPath;
}

export interface MigrationResult {
  fromVersion: number;
  toVersion: number;
  backupPath: string | null;
}

export function migrateDatabase(
  database: Database.Database,
  databasePath: string,
  databaseExisted: boolean
): MigrationResult {
  const fromVersion = database.pragma('user_version', { simple: true }) as number;
  if (fromVersion > CURRENT_SCHEMA_VERSION) {
    throw new Error(
      `Database schema version ${fromVersion} is newer than supported version ${CURRENT_SCHEMA_VERSION}`
    );
  }
  if (fromVersion === CURRENT_SCHEMA_VERSION) {
    return { fromVersion, toVersion: fromVersion, backupPath: null };
  }

  const backupPath = databaseExisted
    ? createMigrationBackup(database, databasePath, fromVersion)
    : null;
  database.transaction(() => {
    for (let version = fromVersion + 1; version <= CURRENT_SCHEMA_VERSION; version++) {
      const migration = migrations[version];
      if (!migration) throw new Error(`Missing database migration ${version}`);
      migration(database);
      database.pragma(`user_version = ${version}`);
    }
  })();
  return { fromVersion, toVersion: CURRENT_SCHEMA_VERSION, backupPath };
}
