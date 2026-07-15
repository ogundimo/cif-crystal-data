import { contextBridge, ipcRenderer } from 'electron';
import type { CifApi, ImportProgress, SearchFilter } from '../shared/types';

const api: CifApi = {
  getAllEntries: () => ipcRenderer.invoke('cif:getAllEntries'),
  getImportFolder: () => ipcRenderer.invoke('cif:getImportFolder'),
  search: (filter: SearchFilter) => ipcRenderer.invoke('cif:search', filter),
  restraints: (filter: SearchFilter) => ipcRenderer.invoke('cif:restraints', filter),
  importCifFolder: () => ipcRenderer.invoke('cif:importCifFolder'),
  refreshCifFolder: () => ipcRenderer.invoke('cif:refreshCifFolder'),
  onImportProgress: (listener: (progress: ImportProgress) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: ImportProgress) => listener(progress);
    ipcRenderer.on('cif:importProgress', handler);
    return () => ipcRenderer.removeListener('cif:importProgress', handler);
  },
  clearCifs: () => ipcRenderer.invoke('cif:clearCifs')
};

contextBridge.exposeInMainWorld('cifApi', api);
