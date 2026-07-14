import { describe, expect, it } from 'vitest';
import { buildDatabaseInitializationMessage } from './databaseDiagnostics';

describe('buildDatabaseInitializationMessage', () => {
  it('includes the database location, recovery steps, and underlying reason', () => {
    const message = buildDatabaseInitializationMessage(
      'C:\\Users\\Example\\AppData\\cif-local.db',
      new Error('database is locked')
    );

    expect(message).toContain('C:\\Users\\Example\\AppData\\cif-local.db');
    expect(message).toContain('Close any other running copies');
    expect(message).toContain('rename cif-local.db to cif-local.db.backup');
    expect(message).toContain('database is locked');
  });

  it('formats non-Error causes without losing their value', () => {
    expect(buildDatabaseInitializationMessage('cif-local.db', 'permission denied')).toContain(
      'Technical reason: permission denied'
    );
  });
});
