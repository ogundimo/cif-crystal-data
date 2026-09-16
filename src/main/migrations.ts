import { dirname, join } from 'node:path';
import type Database from 'better-sqlite3';

export const CURRENT_SCHEMA_VERSION = 9;

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
    UPDATE imported_files SET source_mtime_ms = -1;
  `);
}

function migration3(database: Database.Database): void {
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_entries_sg_number ON entries(sg_number);
    CREATE INDEX IF NOT EXISTS idx_entries_cell_a ON entries(cell_a);
    CREATE INDEX IF NOT EXISTS idx_entries_cell_b ON entries(cell_b);
    CREATE INDEX IF NOT EXISTS idx_entries_cell_c ON entries(cell_c);
    ANALYZE;
  `);
}

function migration4(database: Database.Database): void {
  for (const column of ['publ_title', 'journal_language']) {
    if (!hasColumn(database, 'entries', column)) {
      database.exec(`ALTER TABLE entries ADD COLUMN ${column} TEXT NOT NULL DEFAULT ''`);
    }
  }
  database.exec(`
    CREATE TABLE IF NOT EXISTS publ_authors (
      id INTEGER PRIMARY KEY,
      entry_id INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
      author_order INTEGER NOT NULL,
      name TEXT NOT NULL,
      address TEXT,
      UNIQUE(entry_id, author_order)
    );
    CREATE INDEX IF NOT EXISTS idx_publ_authors_entry_id ON publ_authors(entry_id);
    UPDATE imported_files SET source_mtime_ms = -1;
  `);
}

function migration5(database: Database.Database): void {
  for (const column of [
    'cell_a_angstrom',
    'cell_b_angstrom',
    'cell_c_angstrom',
    'formula_units_z',
    'radiation_wavelength_angstrom'
  ]) {
    if (!hasColumn(database, 'entries', column)) {
      database.exec(`ALTER TABLE entries ADD COLUMN ${column} REAL`);
    }
  }
  if (!hasColumn(database, 'entries', 'radiation_type')) {
    database.exec('ALTER TABLE entries ADD COLUMN radiation_type TEXT');
  }
  for (const column of ['u_iso_or_equiv', 'b_iso_or_equiv']) {
    if (!hasColumn(database, 'atom_sites', column)) {
      database.exec(`ALTER TABLE atom_sites ADD COLUMN ${column} REAL`);
    }
  }
  database.exec(`
    CREATE TABLE IF NOT EXISTS symmetry_operations (
      id INTEGER PRIMARY KEY,
      entry_id INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
      operation_order INTEGER NOT NULL,
      operation_id TEXT,
      operation_xyz TEXT NOT NULL,
      UNIQUE(entry_id, operation_order)
    );
    CREATE INDEX IF NOT EXISTS idx_symmetry_operations_entry_id
      ON symmetry_operations(entry_id);
    CREATE TABLE IF NOT EXISTS atom_site_anisotropic (
      id INTEGER PRIMARY KEY,
      entry_id INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
      site_order INTEGER NOT NULL,
      site_label TEXT NOT NULL,
      u_11 REAL,
      u_22 REAL,
      u_33 REAL,
      u_12 REAL,
      u_13 REAL,
      u_23 REAL,
      b_11 REAL,
      b_22 REAL,
      b_33 REAL,
      b_12 REAL,
      b_13 REAL,
      b_23 REAL,
      UNIQUE(entry_id, site_order)
    );
    CREATE INDEX IF NOT EXISTS idx_atom_site_anisotropic_entry_id
      ON atom_site_anisotropic(entry_id);
    UPDATE imported_files SET source_mtime_ms = -1;
  `);
}

function migration6(database: Database.Database): void {
  for (const column of ['citation_doi', 'database_code_ccdc', 'database_code_icsd']) {
    if (!hasColumn(database, 'entries', column)) {
      database.exec(`ALTER TABLE entries ADD COLUMN ${column} TEXT NOT NULL DEFAULT ''`);
    }
  }
  if (!hasColumn(database, 'imported_files', 'data_block_index')) {
    database.exec('ALTER TABLE imported_files ADD COLUMN data_block_index INTEGER NOT NULL DEFAULT 0');
  }
  database.exec('UPDATE imported_files SET source_mtime_ms = -1');
}

function migration7(database: Database.Database): void {
  if (!hasColumn(database, 'entries', 'database_code_csd')) {
    database.exec("ALTER TABLE entries ADD COLUMN database_code_csd TEXT NOT NULL DEFAULT ''");
  }
  database.exec('UPDATE imported_files SET source_mtime_ms = -1');
}

// Invalidate old completion markers without discarding source locations. This also
// retries files marked complete by the former per-block fingerprint logic.
function migration8(database: Database.Database): void {
  database.exec('UPDATE imported_files SET source_mtime_ms = -1');
}

function migration9(database: Database.Database): void {
  // Rebuild only the parent and source map; dependent rows retain their entry IDs.
  const schema = (database.prepare("SELECT sql FROM sqlite_master WHERE name = 'entries'").get() as { sql: string }).sql;
  database.exec(schema.replace('CREATE TABLE entries', 'CREATE TABLE entries_new').replace('source_filename TEXT UNIQUE', 'source_filename TEXT').replace('id INTEGER PRIMARY KEY,', 'id INTEGER PRIMARY KEY AUTOINCREMENT,'));
  database.exec(`CREATE TEMP TABLE legacy_sources AS SELECT entries.id AS entry_id, imported_files.*
      FROM imported_files JOIN entries USING(source_filename);
    INSERT INTO entries_new SELECT * FROM entries;
    DROP TABLE imported_files;
    DROP TABLE entries;
    ALTER TABLE entries_new RENAME TO entries;
    ALTER TABLE entries ADD COLUMN source_key TEXT;
    ALTER TABLE entries ADD COLUMN block_key TEXT;
    CREATE UNIQUE INDEX idx_entries_identity ON entries(source_key, block_key);
    CREATE INDEX idx_entries_sg_number ON entries(sg_number);
    CREATE INDEX idx_entries_cell_a ON entries(cell_a);
    CREATE INDEX idx_entries_cell_b ON entries(cell_b);
    CREATE INDEX idx_entries_cell_c ON entries(cell_c);
    CREATE TABLE source_contents (hash TEXT PRIMARY KEY, content BLOB NOT NULL);
    CREATE TABLE imported_files (
      entry_id INTEGER PRIMARY KEY REFERENCES entries(id) ON DELETE CASCADE,
      source_filename TEXT NOT NULL,
      source_path TEXT NOT NULL,
      source_mtime_ms REAL NOT NULL,
      source_size INTEGER NOT NULL,
      data_block_index INTEGER NOT NULL DEFAULT 0,
      content_hash TEXT REFERENCES source_contents(hash),
      block_hash TEXT
    );
    INSERT INTO imported_files(entry_id, source_filename, source_path, source_mtime_ms, source_size, data_block_index)
      SELECT entry_id, source_filename, source_path, -1, source_size, data_block_index FROM legacy_sources;
    DROP TABLE legacy_sources;
    CREATE INDEX idx_imported_files_source_path ON imported_files(source_path);
    CREATE INDEX idx_imported_files_content_hash ON imported_files(content_hash);
  `);
}

const migrations: Record<number, (database: Database.Database) => void> = {
  1: migration1,
  2: migration2,
  3: migration3,
  4: migration4,
  5: migration5,
  6: migration6,
  7: migration7,
  8: migration8,
  9: migration9
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

interface MigrationResult {
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
  const foreignKeys = database.pragma('foreign_keys', { simple: true });
  database.pragma('foreign_keys = OFF');
  try {
    database.transaction(() => {
      for (let version = fromVersion + 1; version <= CURRENT_SCHEMA_VERSION; version++) {
        const migration = migrations[version];
        if (!migration) throw new Error(`Missing database migration ${version}`);
        migration(database);
        database.pragma(`user_version = ${version}`);
      }
      if ((database.pragma('foreign_key_check') as unknown[]).length) throw new Error('Migration foreign-key validation failed');
    })();
  } finally { database.pragma(`foreign_keys = ${foreignKeys ? 'ON' : 'OFF'}`); }
  return { fromVersion, toVersion: CURRENT_SCHEMA_VERSION, backupPath };
}
