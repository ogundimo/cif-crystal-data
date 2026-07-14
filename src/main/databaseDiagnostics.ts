export function buildDatabaseInitializationMessage(databasePath: string, error: unknown): string {
  const reason = error instanceof Error && error.message ? error.message : String(error);
  return [
    'The local CIF database could not be opened.',
    `Database location: ${databasePath}`,
    'Close any other running copies of CIF Crystal Data and confirm that this location is writable.',
    'If the problem persists, close the app and rename cif-local.db to cif-local.db.backup, then reopen the app to create a fresh database.',
    `Technical reason: ${reason}`
  ].join('\n\n');
}
