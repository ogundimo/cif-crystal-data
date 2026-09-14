import Database from 'better-sqlite3';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { migrateDatabase } from '../migrations';

let db: Database.Database | null = null;

export function initDb(userDataPath: string, appVersion?: string): Database.Database {
  const dbPath = join(userDataPath, 'cif-local.db');
  const databaseExisted = existsSync(dbPath);
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrateDatabase(db, dbPath, databaseExisted);
  db.prepare(
    `INSERT INTO app_settings (key, value) VALUES ('schema_version', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(String(db.pragma('user_version', { simple: true })));
  if (appVersion) {
    db.prepare(
      `INSERT INTO app_settings (key, value) VALUES ('last_app_version', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    ).run(appVersion);
  }
  return db;
}

export function getDb(): Database.Database {
  if (!db) throw new Error('Database not initialized');
  return db;
}
