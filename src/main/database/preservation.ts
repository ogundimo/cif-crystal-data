import Database from 'better-sqlite3';
import { createHash, randomUUID } from 'node:crypto';
import { copyFileSync, constants, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { CURRENT_SCHEMA_VERSION } from '../migrations';
import { contentHash } from '../sourceIdentity';
import { getDb } from './connection';
import { readStoredCif } from './sources';

const TABLES = ['entries', 'entry_elements', 'app_settings', 'atom_sites', 'publ_authors', 'data_authors',
  'symmetry_operations', 'atom_site_anisotropic', 'source_contents', 'imported_files', 'sqlite_sequence'] as const;

// SQLite retains formatting in sqlite_master. Ignore formatting,
// while preserving string literals, constraints, column order and every SQL token.
function schemaTokens(sql: string | null): string[] | null {
  return sql?.match(/'(?:''|[^'])*'|"(?:""|[^"])*"|`(?:``|[^`])*`|\[[^\]]*\]|[A-Za-z_][A-Za-z_0-9]*|[^\s]/g)?.map(token => {
    if (/^['"`\[]/.test(token)) return token;
    return token.toLowerCase();
  }) ?? null;
}

function tableHashes(database: Database.Database): Record<string, string> {
  return Object.fromEntries(TABLES.map(table => {
    const hash = createHash('sha256');
    for (const row of database.prepare(`SELECT * FROM ${table} ORDER BY rowid`).iterate()) {
      hash.update(JSON.stringify(row)).update('\n');
    }
    return [table, hash.digest('hex')];
  }));
}

function validateContents(database: Database.Database): void {
  if (database.pragma('user_version', { simple: true }) !== CURRENT_SCHEMA_VERSION) throw new Error('Incompatible backup schema.');
  if (database.pragma('integrity_check', { simple: true }) !== 'ok' || (database.pragma('foreign_key_check') as unknown[]).length) {
    throw new Error('Backup database integrity check failed.');
  }
  for (const row of database.prepare('SELECT hash, content FROM source_contents').iterate() as Iterable<{ hash: string; content: Buffer }>) {
    if (!Buffer.isBuffer(row.content) || contentHash(row.content) !== row.hash) throw new Error('Backup source checksum failed.');
  }
  for (const row of database.prepare('SELECT id, source_filename FROM entries').iterate() as Iterable<{ id: number; source_filename: string }>) {
    try { readStoredCif(row.id, database); }
    catch (error) { throw new Error(`Entry ${row.id} (${row.source_filename}): ${error instanceof Error ? error.message : String(error)}`); }
  }
}

function snapshot(database: Database.Database, path: string): void {
  database.prepare('VACUUM INTO ?').run(path);
}

/** Single-file SQLite archive: data, original bytes, settings and a table integrity manifest. */
export function backupProfile(destination: string, database: Database.Database = getDb(), layout?: Record<string, string>): void {
  const temporary = join(dirname(destination), `.cif-backup-${randomUUID()}.tmp`);
  let archive: Database.Database | undefined;
  try {
    snapshot(database, temporary);
    archive = new Database(temporary);
    validateContents(archive);
    if (layout) archive.prepare(`INSERT INTO app_settings (key, value) VALUES ('renderer_layout', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(JSON.stringify(layout));
    archive.exec('CREATE TABLE backup_manifest (manifest TEXT NOT NULL)');
    archive.prepare('INSERT INTO backup_manifest VALUES (?)').run(JSON.stringify({
      format: 1, schema: CURRENT_SCHEMA_VERSION, tables: tableHashes(archive)
    }));
    archive.close(); archive = undefined;
    // Exclusive creation protects originals and existing backups, even after a dialog race.
    copyFileSync(temporary, destination, constants.COPYFILE_EXCL);
  } catch (error) {
    throw new Error(`Backup was not completed. Legacy/unavailable sources must be reimported before backup; choose a new writable destination. ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    archive?.close();
    rmSync(temporary, { force: true });
  }
}

function validateArchive(archive: Database.Database, database: Database.Database): void {
  // Never execute SQL supplied by an archive. Reject schema additions and alterations.
  const schema = (db: Database.Database) => (db.prepare(`SELECT type, name, tbl_name, sql FROM sqlite_master
    WHERE (name NOT LIKE 'sqlite_%' OR name = 'sqlite_sequence') AND name != 'backup_manifest' ORDER BY type, name`).all() as
    { type: string; name: string; tbl_name: string; sql: string | null }[])
    .map(row => ({ ...row, sql: schemaTokens(row.sql) }));
  if (JSON.stringify(schema(archive)) !== JSON.stringify(schema(database))) throw new Error('Incompatible or unexpected backup schema.');
  const manifestSchema = archive.prepare("SELECT sql FROM sqlite_master WHERE name = 'backup_manifest'").get() as { sql: string } | undefined;
  if (manifestSchema?.sql !== 'CREATE TABLE backup_manifest (manifest TEXT NOT NULL)') throw new Error('Invalid backup manifest schema.');
  const rows = archive.prepare('SELECT manifest FROM backup_manifest').all() as { manifest: string }[];
  if (rows.length !== 1) throw new Error('Missing or invalid backup integrity manifest.');
  const manifest = JSON.parse(rows[0].manifest);
  if (manifest.format !== 1 || manifest.schema !== CURRENT_SCHEMA_VERSION || JSON.stringify(manifest.tables) !== JSON.stringify(tableHashes(archive))) {
    throw new Error('Backup integrity manifest does not match its contents.');
  }
  validateContents(archive);
}

/** SQLite commits all profile rows atomically. A crash rolls back via the existing WAL. */
export function restoreProfile(path: string, database: Database.Database = getDb()): string {
  const archive = new Database(path, { readonly: true, fileMustExist: true });
  const recovery = join(dirname(database.name), `cif-local.pre-restore-${randomUUID()}.db`);
  try {
    archive.pragma('trusted_schema = OFF');
    archive.exec('BEGIN');
    validateArchive(archive, database);
    snapshot(database, recovery);
    database.pragma('foreign_keys = OFF');
    try {
      database.transaction(() => {
        for (const table of [...TABLES].reverse()) database.prepare(`DELETE FROM ${table}`).run();
        for (const table of TABLES) {
          // Explicit-ID inserts have already advanced the destination sequence. Restore
          // the archive's high-water mark too, including IDs deleted before the backup.
          if (table === 'sqlite_sequence') database.prepare('DELETE FROM sqlite_sequence').run();
          const columns = (database.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(row => row.name);
          const insert = database.prepare(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`);
          for (const row of archive.prepare(`SELECT * FROM ${table} ORDER BY rowid`).iterate() as Iterable<Record<string, unknown>>) {
            insert.run(...columns.map(column => row[column]));
          }
        }
        // Old absolute locations are provenance only; refresh requires a newly selected folder.
        database.prepare("DELETE FROM app_settings WHERE key = 'import_folder'").run();
        validateContents(database);
      })();
    } finally { database.pragma('foreign_keys = ON'); }
    return recovery;
  } finally { archive.close(); }
}
