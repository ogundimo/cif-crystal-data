import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDb, getAllEntries, searchEntries, computeRestraints } from './db';
import { importCifFolder } from './ingest';
import type { SearchFilter } from '../shared/types';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#f3f3f3',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
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
  initDb(app.getPath('userData'));

  ipcMain.handle('cif:getAllEntries', () => getAllEntries());

  ipcMain.handle('cif:search', (_e, filter: SearchFilter) => searchEntries(filter));

  ipcMain.handle('cif:restraints', (_e, filter: SearchFilter) => computeRestraints(filter));

  ipcMain.handle('cif:importCifFolder', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win ?? undefined as unknown as BrowserWindow, {
      properties: ['openDirectory']
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return importCifFolder(result.filePaths[0]);
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
