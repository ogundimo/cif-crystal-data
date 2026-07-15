import { describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { getImportFolder, setImportFolder } from './db';

describe('remembered CIF import folder', () => {
  it('returns null when no folder has been selected', () => {
    const database = {
      prepare: () => ({ get: () => undefined })
    } as unknown as Database.Database;

    expect(getImportFolder(database)).toBeNull();
  });

  it('stores and retrieves the selected folder', () => {
    let savedValue: string | undefined;
    const database = {
      prepare: (sql: string) =>
        sql.startsWith('SELECT')
          ? { get: () => (savedValue ? { value: savedValue } : undefined) }
          : { run: (_key: string, value: string) => { savedValue = value; } }
    } as unknown as Database.Database;

    setImportFolder('C:\\CIF files', database);
    expect(getImportFolder(database)).toBe('C:\\CIF files');
  });
});
