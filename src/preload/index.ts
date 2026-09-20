import type { RefinementProgress } from '../shared/refinement';
import { contextBridge, ipcRenderer } from 'electron';
import type {
  CifApi,
  ImportProgress,
  PublicationLookupRequest,
  SearchFilter,
  SearchPageRequest
} from '../shared/types';

const api: CifApi = {
  openPlotExport: snapshot => ipcRenderer.invoke('cif:openPlotExport', snapshot),
  getPlotExport: () => ipcRenderer.invoke('cif:getPlotExport'),
  savePlotExport: (design, view) => ipcRenderer.invoke('cif:savePlotExport', design, view),
  openManual: () => ipcRenderer.invoke('cif:openManual'),
  openRefinementWindow: (entryId, method, experimentalId, wavelength) => ipcRenderer.invoke('cif:openRefinementWindow', entryId, method, experimentalId, wavelength),
  importRefinementCheckpoint: () => ipcRenderer.invoke('cif:importRefinementCheckpoint'),
  importExperimental: () => ipcRenderer.invoke('cif:importExperimental'),
  getExperimental: id => ipcRenderer.invoke('cif:getExperimental', id),
  refinementEngineStatus: () => ipcRenderer.invoke('cif:refinementEngineStatus'),
  runRefinement: request => ipcRenderer.invoke('cif:runRefinement', request),
  cancelRefinement: () => ipcRenderer.invoke('cif:cancelRefinement'),
  openRefinementOutput: () => ipcRenderer.invoke('cif:openRefinementOutput'),
  onRefinementProgress: listener => {
    const handler = (_event: Electron.IpcRendererEvent, progress: RefinementProgress) => listener(progress);
    ipcRenderer.on('cif:refinementProgress', handler);
    return () => ipcRenderer.removeListener('cif:refinementProgress', handler);
  },
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
