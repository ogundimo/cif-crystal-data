export function buildDatabaseInitializationMessage(databasePath: string, error: unknown): string {
  const reason = error instanceof Error && error.message ? error.message : String(error);
  return [
    'The local CIF database could not be opened.',
    `Database location: ${databasePath}`,
    'Close any other running copies of CIF Crystal Data and confirm that this location is writable.',
    'Before recovery, close every copy of the app and preserve a copy of the entire profile, including cif-local.db, any -wal/-shm files, and migration/restore snapshots. Do not delete or replace individual files in an open profile.',
    'For a newer schema, reopen with a compatible application version. For corruption, keep the original profile and recover from a verified portable backup or migration snapshot in a separate profile.',
    `Technical reason: ${reason}`
  ].join('\n\n');
}
