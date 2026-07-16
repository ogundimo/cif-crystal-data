import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import { copyFile, stat } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SearchFilter } from '../shared/types';
import { validateSearchFilter } from './searchFilterValidation';
import { ImportWorkerError, runImportWorker } from './importRunner';
import { buildDatabaseInitializationMessage } from './databaseDiagnostics';
import { buildCifExportFilename } from './exportCif';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
type DbModule = typeof import('./db');

let dbReady: Promise<DbModule> | null = null;
let dataMutationInFlight: 'import' | 'refresh' | 'clear' | null = null;
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
        database.initDb(app.getPath('userData'));
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
  ipcMain.handle('cif:getAllEntries', async () => (await getDbModule()).getAllEntries());
  ipcMain.handle('cif:getEntryCount', async () => (await getDbModule()).getEntryCount());
  ipcMain.handle('cif:getAtomSites', async (_event, entryId: unknown) => {
    if (typeof entryId !== 'number' || !Number.isInteger(entryId) || entryId < 1) {
      throw new TypeError('Invalid entry id');
    }
    return (await getDbModule()).getAtomSites(entryId);
  });
  ipcMain.handle('cif:getImportFolder', async () => (await getDbModule()).getImportFolder());
  ipcMain.handle('cif:exportCif', async (event, entryId: unknown) => {
    if (typeof entryId !== 'number' || !Number.isInteger(entryId) || entryId < 1) {
      throw new TypeError('Invalid entry id');
    }
    const source = (await getDbModule()).getCifExportSource(entryId);
    if (!source) throw new Error('The selected compound is no longer in the database.');
    if (!source.source_path) throw new Error('The original CIF file location is unavailable.');
    try {
      if (!(await stat(source.source_path)).isFile()) throw new Error('Path is not a file');
    } catch {
      throw new Error(`The original CIF file could not be found: ${source.source_path}`);
    }

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
    if (resolve(result.filePath) !== resolve(source.source_path)) {
      await copyFile(source.source_path, result.filePath);
    }
    return { exported: true, fileName: basename(result.filePath) };
  });

  ipcMain.handle('cif:search', async (_e, filter: SearchFilter) =>
    (await getDbModule()).searchEntries(validateSearchFilter(filter))
  );

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
