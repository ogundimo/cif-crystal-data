// Stable entry point for the main process's dynamic import and the import worker.
// Internal modules depend on connection/query directly, never back on this facade.
export { initDb } from './database/connection';
export { createEntryWriter, clearAllEntries } from './database/writer';
export type { EntryWriteItem, EntryWriter, FileFingerprint } from './database/writer';
export {
  getStartupRefresh, setStartupRefresh, getDataAuthors,
  getEntryCount, getAtomSites, getSymmetryOperations, getPublAuthors,
  getCifViewerSourceRecord, getCifExportSource, getImportFolder, setImportFolder, getPreservedLayout
} from './database/metadata';
export { buildWhereClause } from './database/query';
export { searchEntriesPage } from './database/search';
export { computeRestraints } from './database/restraints';

export { readStoredCif, relinkSource } from './database/sources';
export { backupProfile, restoreProfile } from './database/preservation';
export { countBatchExport, runBatchExport } from './batchExport';
export { inspectSourceRecovery, previewSourceRecovery, prepareSourceRemoval, confirmSourceRecovery } from './database/sourceRecovery';
