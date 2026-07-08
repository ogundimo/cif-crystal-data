import { contextBridge, ipcRenderer } from 'electron';
import type { CifApi, SearchFilter } from '../shared/types';

const api: CifApi = {
  getAllEntries: () => ipcRenderer.invoke('cif:getAllEntries'),
  search: (filter: SearchFilter) => ipcRenderer.invoke('cif:search', filter),
  restraints: (filter: SearchFilter) => ipcRenderer.invoke('cif:restraints', filter),
  importCifFolder: () => ipcRenderer.invoke('cif:importCifFolder')
};

contextBridge.exposeInMainWorld('cifApi', api);
