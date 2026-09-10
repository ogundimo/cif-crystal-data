import { contextBridge, ipcRenderer } from 'electron';
import type {
  CifApi,
  ImportProgress,
  PublicationLookupRequest,
  SearchFilter,
  SearchPageRequest
} from '../shared/types';

const api: CifApi = {
  getAllEntries: () => ipcRenderer.invoke('cif:getAllEntries'),
  getEntryCount: () => ipcRenderer.invoke('cif:getEntryCount'),
  getAtomSites: (entryId: number) => ipcRenderer.invoke('cif:getAtomSites', entryId),
  getDiffractionInput: (entryId: number) => ipcRenderer.invoke('cif:getDiffractionInput', entryId),
  getPublAuthors: (entryId: number) => ipcRenderer.invoke('cif:getPublAuthors', entryId),
  getViewerSource: (entryId: number) => ipcRenderer.invoke('cif:getViewerSource', entryId),
  getImportFolder: () => ipcRenderer.invoke('cif:getImportFolder'),
  exportCif: (entryId: number) => ipcRenderer.invoke('cif:exportCif', entryId),
  exportPxrd: (entryId: number, contents: string) => ipcRenderer.invoke('cif:exportPxrd', entryId, contents),
  resolvePublication: (request: PublicationLookupRequest) => ipcRenderer.invoke('cif:resolvePublication', request),
  openExternal: (url: string) => ipcRenderer.invoke('cif:openExternal', url),
  search: (filter: SearchFilter) => ipcRenderer.invoke('cif:search', filter),
  searchPage: (request: SearchPageRequest) => ipcRenderer.invoke('cif:searchPage', request),
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
