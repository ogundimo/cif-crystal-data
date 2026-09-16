import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import { stat, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  PublicationLookupRequest,
  SearchFilter,
  SearchPageRequest,
  SearchSortColumn
} from '../shared/types';
import { validateSearchFilter } from './searchFilterValidation';
import { ImportWorkerError, runImportWorker } from './importRunner';
import { buildDatabaseInitializationMessage } from './databaseDiagnostics';
import { buildCifExportFilename, buildPxrdExportFilename } from './exportCif';
import { sourceKey } from './sourceIdentity';
import { resolvePublication } from './publicationResolver';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
type DbModule = typeof import('./db');

let dbReady: Promise<DbModule> | null = null;
let dataMutationInFlight: 'import' | 'refresh' | 'clear' | 'backup' | 'restore' | 'relink' | null = null;
let lastDatabaseErrorMessage: string | null = null;

function databaseInitializationError(error: unknown): Error {
  const databasePath = join(app.getPath('userData'), 'cif-local.db');
  const message = buildDatabaseInitializationMessage(databasePath, error);
  if (message !== lastDatabaseErrorMessage) {
    lastDatabaseErrorMessage = message;
    dialog.showErrorBox('CIF database unavailable', message);
  }
  return new Error(message, { cause: error });
}

/**
 * Load the native SQLite module only when the renderer first needs data.
 * This lets Electron create and paint the application window before Windows
 * performs any native-module loading/security scanning.
 */
function getDbModule(): Promise<DbModule> {
  if (!dbReady) {
    dbReady = import('./db')
      .then((database) => {
        database.initDb(app.getPath('userData'), app.getVersion());
        lastDatabaseErrorMessage = null;
        return database;
      })
      .catch((error) => {
        dbReady = null;
        throw databaseInitializationError(error);
      });
  }
  return dbReady;
}

function createWindow(): void {
  const win = new BrowserWindow({
    title: 'CIF Crystal Data',
    width: 1200,
    height: 800,
    minWidth: 1100,
    minHeight: 650,
    backgroundColor: '#f3f3f3',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    win.loadFile(join(__dirname, '../../dist/index.html'));
  }
}

app.whenReady().then(() => {
  ipcMain.handle('cif:getEntryCount', async () => (await getDbModule()).getEntryCount());
  ipcMain.handle('cif:getAtomSites', async (_event, entryId: unknown) => {
    if (typeof entryId !== 'number' || !Number.isInteger(entryId) || entryId < 1) {
      throw new TypeError('Invalid entry id');
    }
    return (await getDbModule()).getAtomSites(entryId);
  });
  ipcMain.handle('cif:getDiffractionInput', async (_event, entryId: unknown) => {
    if (typeof entryId !== 'number' || !Number.isInteger(entryId) || entryId < 1) {
      throw new TypeError('Invalid entry id');
    }
    const database = await getDbModule();
    return {
      atomSites: database.getAtomSites(entryId),
      symmetryOperations: database.getSymmetryOperations(entryId)
    };
  });
  ipcMain.handle('cif:getPublAuthors', async (_event, entryId: unknown) => {
    if (typeof entryId !== 'number' || !Number.isInteger(entryId) || entryId < 1) {
      throw new TypeError('Invalid entry id');
    }
    return (await getDbModule()).getPublAuthors(entryId);
  });
  ipcMain.handle('cif:getViewerSource', async (_event, entryId: unknown) => {
    if (typeof entryId !== 'number' || !Number.isInteger(entryId) || entryId < 1) {
      throw new TypeError('Invalid entry id');
    }
    const database = await getDbModule();
    const source = database.getCifViewerSourceRecord(entryId);
    if (!source) throw new Error('The selected compound is no longer in the database.');
    return { fileName: source.source_filename, text: database.readStoredCif(entryId) };
  });
  ipcMain.handle('cif:getImportFolder', async () => (await getDbModule()).getImportFolder());
  ipcMain.handle('cif:exportCif', async (event, entryId: unknown) => {
    if (typeof entryId !== 'number' || !Number.isInteger(entryId) || entryId < 1) {
      throw new TypeError('Invalid entry id');
    }
    const database = await getDbModule();
    const source = database.getCifExportSource(entryId);
    if (!source) throw new Error('The selected compound is no longer in the database.');
    const contents = database.readStoredCif(entryId);
    const fileName = buildCifExportFilename(source.formula, source.sg_number);
    const options = {
      title: 'Export CIF',
      defaultPath: join(app.getPath('documents'), fileName),
      filters: [{ name: 'Crystallographic Information File', extensions: ['cif'] }]
    };
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = win
      ? await dialog.showSaveDialog(win, options)
      : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return { exported: false };
    if (source.source_path && sourceKey(result.filePath) === sourceKey(source.source_path)) {
      throw new Error('Choose a different destination so the imported source file is not overwritten.');
    }
    await writeFile(result.filePath, contents, { encoding: 'utf8', flag: 'wx' });
    return { exported: true, fileName: basename(result.filePath) };
  });

  ipcMain.handle('cif:exportPxrd', async (event, entryId: unknown, contents: unknown) => {
    if (typeof entryId !== 'number' || !Number.isInteger(entryId) || entryId < 1) {
      throw new TypeError('Invalid entry id');
    }
    if (typeof contents !== 'string' || contents.length === 0 || contents.length > 10_000_000) {
      throw new TypeError('Invalid PXRD export contents');
    }
    const database = await getDbModule();
    const source = database.getCifExportSource(entryId);
    if (!source) throw new Error('The selected compound is no longer in the database.');
    const fileName = buildPxrdExportFilename(source.formula, source.sg_number);
    const options = {
      title: 'Export PXRD pattern',
      defaultPath: join(app.getPath('documents'), fileName),
      filters: [{ name: 'XY diffraction pattern', extensions: ['xy'] }]
    };
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return { exported: false };
    await writeFile(result.filePath, contents, { encoding: 'utf8', flag: 'wx' });
    return { exported: true, fileName: basename(result.filePath) };
  });

  ipcMain.handle('cif:relinkSource', async (_event, entryId: unknown) => {
    if (typeof entryId !== 'number' || !Number.isInteger(entryId) || entryId < 1) throw new TypeError('Invalid entry id');
    if (dataMutationInFlight) throw new Error('A CIF data operation is already in progress');
    dataMutationInFlight = 'relink';
    try {
      const result = await dialog.showOpenDialog({ title: 'Relink to an exact copy of the imported CIF', properties: ['openFile'], filters: [{ name: 'CIF', extensions: ['cif'] }] });
      if (result.canceled || !result.filePaths.length) return false;
      (await getDbModule()).relinkSource(entryId, result.filePaths[0]);
      return true;
    } finally { dataMutationInFlight = null; }
  });

  ipcMain.handle('cif:getPreservedLayout', async () => (await getDbModule()).getPreservedLayout());
  ipcMain.handle('cif:backupProfile', async (_event, layout: unknown = {}) => {
    if (!layout || typeof layout !== 'object' || Array.isArray(layout) || JSON.stringify(layout).length > 100_000 ||
      Object.entries(layout).some(([key, value]) => !key.startsWith('cif-layout-v1:') || typeof value !== 'string')) {
      throw new TypeError('Invalid layout settings');
    }
    if (dataMutationInFlight) throw new Error('A CIF data operation is already in progress');
    dataMutationInFlight = 'backup';
    try {
      const result = await dialog.showSaveDialog({ title: 'Save portable backup (choose a new filename)', filters: [{ name: 'CIF backup', extensions: ['cifbackup'] }] });
      if (result.canceled || !result.filePath) return false;
      (await getDbModule()).backupProfile(result.filePath, undefined, layout as Record<string, string>);
      return true;
    } finally { dataMutationInFlight = null; }
  });

  ipcMain.handle('cif:restoreProfile', async () => {
    if (dataMutationInFlight) throw new Error('A CIF data operation is already in progress');
    dataMutationInFlight = 'restore';
    try {
      const result = await dialog.showOpenDialog({ title: 'Restore portable backup', properties: ['openFile'], filters: [{ name: 'CIF backup', extensions: ['cifbackup'] }] });
      if (result.canceled || !result.filePaths.length) return false;
      const confirmation = await dialog.showMessageBox({ type: 'warning', title: 'Restore database', message: 'Replace the current database with this backup?',
        detail: 'The backup will be validated first. A recovery snapshot of the current database will be kept in the profile folder. Original CIF files will not be changed.', buttons: ['Cancel', 'Restore'], defaultId: 0, cancelId: 0 });
      if (confirmation.response !== 1) return false;
      (await getDbModule()).restoreProfile(result.filePaths[0]);
      return true;
    } finally { dataMutationInFlight = null; }
  });

  ipcMain.handle('cif:openExternal', async (_event, url: unknown) => {
    if (typeof url !== 'string') throw new TypeError('Invalid external URL');
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') throw new TypeError('Only HTTPS links are allowed');
    await shell.openExternal(parsed.toString());
  });

  ipcMain.handle('cif:resolvePublication', async (_event, request: unknown) => {
    if (!request || typeof request !== 'object') throw new TypeError('Invalid publication lookup');
    const candidate = request as Partial<PublicationLookupRequest>;
    if (typeof candidate.title !== 'string' || candidate.title.length > 1_000) {
      throw new TypeError('Invalid publication title');
    }
    if (typeof candidate.reference !== 'string' || candidate.reference.length > 2_000) {
      throw new TypeError('Invalid publication reference');
    }
    if (
      !Array.isArray(candidate.authors) ||
      candidate.authors.length > 20 ||
      candidate.authors.some((author) => typeof author !== 'string' || author.length > 500)
    ) {
      throw new TypeError('Invalid publication authors');
    }
    return resolvePublication({
      title: candidate.title,
      reference: candidate.reference,
      authors: candidate.authors as string[]
    });
  });

  ipcMain.handle('cif:searchPage', async (_e, request: SearchPageRequest) => {
    if (!request || typeof request !== 'object') throw new TypeError('Invalid search page request');
    const offset = Number(request.offset);
    const limit = Number(request.limit);
    if (!Number.isInteger(offset) || offset < 0) throw new TypeError('Invalid search offset');
    if (!Number.isInteger(limit) || limit < 1 || limit > 1_000) throw new TypeError('Invalid search limit');
    const allowedSortColumns = new Set<SearchSortColumn>([
      'formula', 'cell_a', 'cell_b', 'cell_c', 'sg_number', 'space_group', 'reference',
      'level_struct_studies'
    ]);
    if (request.sortColumn !== undefined && !allowedSortColumns.has(request.sortColumn)) {
      throw new TypeError('Invalid search sort column');
    }
    if (request.sortDirection !== undefined && request.sortDirection !== 'asc' && request.sortDirection !== 'desc') {
      throw new TypeError('Invalid search sort direction');
    }
    return (await getDbModule()).searchEntriesPage({
      ...request,
      filter: validateSearchFilter(request.filter)
    });
  });

  ipcMain.handle('cif:restraints', async (_e, filter: SearchFilter) =>
    (await getDbModule()).computeRestraints(validateSearchFilter(filter))
  );

  ipcMain.handle('cif:importCifFolder', async (event) => {
    if (dataMutationInFlight) throw new Error('A CIF data operation is already in progress');
    dataMutationInFlight = 'import';
    const win = BrowserWindow.fromWebContents(event.sender);
    try {
      const options = { properties: ['openDirectory'] as ['openDirectory'] };
      const result = win
        ? await dialog.showOpenDialog(win, options)
        : await dialog.showOpenDialog(options);
      if (result.canceled || result.filePaths.length === 0) return null;
      try {
        const importResult = await runImportWorker(result.filePaths[0], app.getPath('userData'), (progress) => {
          if (!event.sender.isDestroyed()) event.sender.send('cif:importProgress', progress);
        });
        (await getDbModule()).setImportFolder(result.filePaths[0]);
        lastDatabaseErrorMessage = null;
        return importResult;
      } catch (error) {
        if (error instanceof ImportWorkerError && error.phase === 'database') {
          throw databaseInitializationError(error);
        }
        throw error;
      }
    } finally {
      dataMutationInFlight = null;
    }
  });

  ipcMain.handle('cif:refreshCifFolder', async (event) => {
    if (dataMutationInFlight) throw new Error('A CIF data operation is already in progress');
    dataMutationInFlight = 'refresh';
    try {
      const folderPath = (await getDbModule()).getImportFolder();
      if (!folderPath) {
        throw new Error('No CIF folder has been selected. Use Import CIFs first.');
      }
      try {
        if (!(await stat(folderPath)).isDirectory()) throw new Error('Path is not a directory');
      } catch {
        throw new Error(`The saved CIF folder is no longer available: ${folderPath}`);
      }
      try {
        const importResult = await runImportWorker(folderPath, app.getPath('userData'), (progress) => {
          if (!event.sender.isDestroyed()) event.sender.send('cif:importProgress', progress);
        });
        lastDatabaseErrorMessage = null;
        return importResult;
      } catch (error) {
        if (error instanceof ImportWorkerError && error.phase === 'database') {
          throw databaseInitializationError(error);
        }
        throw error;
      }
    } finally {
      dataMutationInFlight = null;
    }
  });

  ipcMain.handle('cif:clearCifs', async (event) => {
    if (dataMutationInFlight) throw new Error('A CIF data operation is already in progress');
    dataMutationInFlight = 'clear';
    try {
      const win = BrowserWindow.fromWebContents(event.sender);
      const options = {
        type: 'warning' as const,
        title: 'Clear imported CIFs',
        message: 'Clear all imported CIF data?',
        detail: 'This removes every imported entry from the local database. Your original CIF files will not be deleted.',
        buttons: ['Cancel', 'Clear CIFs'],
        defaultId: 0,
        cancelId: 0,
        noLink: true
      };
      const result = win
        ? await dialog.showMessageBox(win, options)
        : await dialog.showMessageBox(options);
      if (result.response !== 1) return { cleared: false, deletedCount: 0 };
      return { cleared: true, deletedCount: (await getDbModule()).clearAllEntries() };
    } finally {
      dataMutationInFlight = null;
    }
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
