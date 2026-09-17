import Database from 'better-sqlite3';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { CURRENT_SCHEMA_VERSION, migrateDatabase } from '../migrations';

let db: Database.Database | null = null;

export function initDb(userDataPath: string, appVersion?: string): Database.Database {
  const dbPath = join(userDataPath, 'cif-local.db');
  const databaseExisted = existsSync(dbPath);
  let candidate: Database.Database | undefined;
  try {
    candidate = new Database(dbPath);
    // Reject newer profiles before changing their journal mode or settings.
    const version = candidate.pragma('user_version', { simple: true }) as number;
    if (version > CURRENT_SCHEMA_VERSION) throw new Error(`Database schema version ${version} is newer than supported version ${CURRENT_SCHEMA_VERSION}`);
    candidate.pragma('journal_mode = WAL');
    candidate.pragma('foreign_keys = ON');
    migrateDatabase(candidate, dbPath, databaseExisted);
    candidate.prepare(
      `INSERT INTO app_settings (key, value) VALUES ('schema_version', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    ).run(String(candidate.pragma('user_version', { simple: true })));
    if (appVersion) {
      candidate.prepare(
        `INSERT INTO app_settings (key, value) VALUES ('last_app_version', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      ).run(appVersion);
    }
    db = candidate;
    return candidate;
  } catch (error) {
    candidate?.close();
    throw new Error(`Could not initialize the database: ${error instanceof Error ? error.message : String(error)}. Check profile access and free disk space; keep existing files and migration snapshots for recovery.`, { cause: error });
  }
}

export function getDb(): Database.Database {
  if (!db) throw new Error('Database not initialized');
  return db;
}
