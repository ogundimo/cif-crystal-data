import React from 'react';
import App from './App';
import ReactDOM from 'react-dom/client';
import QuickSearchDialog from './components/QuickSearchDialog';
import ResultsWorkspace from './components/ResultsWorkspace';
import DataGrid from './components/DataGrid';
import ImportProgressIndicator from './components/ImportProgressIndicator';
import PxrdPattern from './components/PxrdPattern';
import SourceRecovery from './components/SourceRecovery';
import type { EntryRow, SearchPageRequest, SearchPageResult, ImportProgress, ImportResult } from '../../shared/types';
import syntheticCif from '../../parser/__fixtures__/synthetic-test.cif?raw';
import './index.css';

const gridRows: EntryRow[] = Array.from({ length: 10_000 }, (_, index) => ({
  id: index + 1,
  source_filename: `${index + 1}.cif`,
  formula: index === 1 ? 'Fe2O3' : 'Fe1O1',
  cell_a: 0.1,
  cell_b: 0.2,
  cell_c: 0.3,
  cell_a_angstrom: 1,
  cell_b_angstrom: 2,
  cell_c_angstrom: 3,
  cell_angle_alpha: 90,
  cell_angle_beta: 90,
  cell_angle_gamma: 90,
  cell_volume: 6,
  sg_number: 1,
  space_group: 'P1',
  reference: index === 1 ? 'Reference 2: RE$_3$InSe$_6$' : `Reference ${index + 1}`,
  level_struct_studies: 'Complete structure determined',
  sample_type: index === 0 ? 'Sample crystal' : 'Powder',
  crystal_colour: index === 0 ? 'gray steel' : '',
  publ_title: index === 1 ? 'Synthetic RE$_3$InSe$_6$ structure report' : `Synthetic structure report ${index + 1}`,
  citation_doi: '',
  database_code_ccdc: '',
  database_code_csd: '',
  database_code_icsd: '',
  journal_language: 'English',
  formula_units_z: 1,
  radiation_type: 'X-rays, Cu Ka',
  radiation_wavelength_angstrom: 1.54056
}));

window.cifApi = {
  traceMilestone: async () => {},
  cancelImport: async () => true,
  getStartupRefresh: async () => false,
  setStartupRefresh: async () => {},
  relinkSource: async () => false,
  backupProfile: async () => false,
  getPreservedLayout: async () => ({}),
  restoreProfile: async () => false,
  getEntryCount: async () => 0,
  getAtomSites: async (entryId) => [{
    id: entryId,
    entry_id: entryId,
    site_order: 0,
    type_symbol: 'Sb',
    site_label: `Sb${entryId}`,
    symmetry_multiplicity: 4,
    wyckoff_symbol: 'c',
    fract_x: 0.0286,
    fract_y: 0.25,
    fract_z: 0.394,
    occupancy: 1,
    u_iso_or_equiv: 0.0063,
    b_iso_or_equiv: 0.5
  }],
  getDiffractionInput: async (entryId) => ({
    atomSites: [{
      id: entryId,
      entry_id: entryId,
      site_order: 0,
      type_symbol: 'Sb',
      site_label: `Sb${entryId}`,
      symmetry_multiplicity: 1,
      wyckoff_symbol: 'a',
      fract_x: 0,
      fract_y: 0,
      fract_z: 0,
      occupancy: 1,
      u_iso_or_equiv: 0.0063,
      b_iso_or_equiv: 0.5
    }],
    symmetryOperations: [{
      id: entryId,
      entry_id: entryId,
      operation_order: 0,
      operation_id: '1',
      operation_xyz: 'x, y, z'
    }]
  }),
  getDataAuthors: async (entryId) => [{ id: entryId, entry_id: entryId, author_order: 0, name: 'Data depositor', address: 'Synthetic institute' }],
  getPublAuthors: async (entryId) => [
    { id: entryId, entry_id: entryId, author_order: 0, name: 'Doe, J.', address: 'Department of Chemistry, Example University, Springfield' },
    { id: entryId + 1, entry_id: entryId, author_order: 1, name: 'Roe, A.', address: null }
  ],
  getViewerSource: async (entryId) => ({ fileName: `${entryId}.cif`, text: syntheticCif }),
  sourceRecovery: async () => ({ eligible: false }),
  getImportFolder: async () => null,
  countBatchExport: async scope => scope.kind === 'selected' ? scope.ids.length : 1205,
  batchExport: async () => null,
  cancelBatchExport: async () => true,
  onBatchExportProgress: () => () => {},
  exportCif: async () => ({ exported: false }),
  exportPxrd: async () => ({ exported: false }),
  resolvePublication: async () => ({ status: 'not-found' }),
  openExternal: async () => undefined,
  searchPage: async () => ({ rows: [], total: 0 }),
  restraints: async () => [],
  importCifFolder: async () => null,
  refreshCifFolder: async () => ({ importedCount: 0, skippedCount: 0, failures: [], total: 0 }),
  onImportProgress: () => () => undefined,
  clearCifs: async () => ({ cleared: false, deletedCount: 0 })
};

function UiTestApp() {
  const [mounted, setMounted] = React.useState(true);
  Object.assign(window, { viewerMountHarness: { setMounted } });
  const [selectedId, setSelectedId] = React.useState<number | null>(gridRows[0].id);

  return (
    <div className="flex h-screen flex-col">
    {mounted && <ResultsWorkspace
      rows={gridRows}
      selectedId={selectedId}
      onSelect={(entry) => setSelectedId(entry.id)}
    />}
    <div className="fixed left-2 top-2">
      <ImportProgressIndicator
        progress={{ processed: 800, total: 1_000, importedCount: 90, skippedCount: 700, failureCount: 10 }}
      />
    </div>
    <QuickSearchDialog open onClose={() => undefined} onSearch={() => undefined} />
    </div>
  );
}

function GridShortcutTest() {
  const [state, setState] = React.useState({ids:gridRows.map(row=>row.id),selectedId:5000 as number|null,totalRows:10000,loadingMore:false});
  const calls=React.useRef({select:0,load:0,sort:0});
  // Match the real search controller's same-tick paging exclusion, before React
  // commits loadingMore. Resize/scroll events may arrive in the same frame.
  const loading = React.useRef(state.loadingMore);
  loading.current = state.loadingMore;
  Object.assign(window,{gridShortcut:{state,calls:calls.current,update:(next:Partial<typeof state>)=>setState(previous=>({...previous,...next}))}});
  return <div className="flex h-screen flex-col">
    <input aria-label="Shortcut scope test" />
    <DataGrid rows={state.ids.map(id=>gridRows[id-1])} selectedId={state.selectedId} totalRows={state.totalRows} loadingMore={state.loadingMore}
      onSelect={row=>{calls.current.select++;setState(previous=>({...previous,selectedId:row.id}));}}
      onLoadMore={()=>{if (loading.current) return; loading.current=true; calls.current.load++;setState(previous=>({...previous,loadingMore:true}));}} onSortChange={()=>{calls.current.sort++;}} />
  </div>;
}

const appRegressionMode = new URLSearchParams(location.search).has('app-regression');
const pxrdRegressionMode = new URLSearchParams(location.search).has('pxrd-regression');
function PxrdRegression() {
  const [entry,setEntry] = React.useState({...gridRows[0],cell_a_angstrom:5.64,cell_b_angstrom:5.64,cell_c_angstrom:5.64});
  const [mounted,setMounted] = React.useState(true);
  Object.assign(window,{pxrdHarness:{entry,setEntry,setMounted}});
  return <div className="grid h-screen">{mounted && <PxrdPattern entry={entry}/>}</div>;
}
const gridShortcutMode = new URLSearchParams(location.search).has('grid-shortcut');
const sourceRecoveryMode = new URLSearchParams(location.search).has('source-recovery');
function SourceRecoveryHarness() {
  const [selected, setSelected] = React.useState<number | null>(null);
  return <div className="flex h-screen flex-col items-center justify-center bg-[#071018] text-white">
    <h1>Could not display missing.cif</h1>
    <SourceRecovery entry={gridRows[0]} onComplete={entry => setSelected(entry?.id ?? -1)} />
    <output aria-label="Recovery selection">{selected}</output>
  </div>;
}
if (sourceRecoveryMode) {
  window.cifApi.sourceRecovery = async request => {
    if (request.action === 'inspect') return { eligible: true, candidates: [gridRows[1]] };
    if (request.action === 'prepare-remove') return { eligible: true, token: 'remove', removal: true };
    if (request.action === 'confirm') return { eligible: true, completed: request.token === 'remove' ? 'removed' : 'recovered',
      entry: request.token === 'remove' ? undefined : gridRows[0], snapshot: 'test-profile/pre-recovery.db' };
    return { eligible: true, token: 'recover', choices: [{ index: 0, filename: 'synthetic.cif', block: 'synthetic',
      formula: gridRows[0].formula, reference: 'Synthetic recovery fixture', atoms: 2, cell: [4,4,4,90,90,90] }] };
  };
}
if (appRegressionMode) {
  const regression = {
    progress: (_value: ImportProgress) => {},
    finishImport: (_value: ImportResult) => {},
    cancelled: false,
    requests: [] as SearchPageRequest[],
    pending: [] as Array<() => void>
  };
  Object.assign(window, { appRegression: regression });
  window.cifApi.onImportProgress = listener => { regression.progress = listener; return () => { regression.progress = () => {}; }; };
  window.cifApi.importCifFolder = () => new Promise(resolve => { regression.finishImport = resolve; });
  window.cifApi.cancelImport = async () => { regression.cancelled = true; return true; };
  window.cifApi.getStartupRefresh = async () => localStorage.getItem('test-startup-refresh') === 'true';
  window.cifApi.setStartupRefresh = async enabled => { localStorage.setItem('test-startup-refresh', String(enabled)); };
  window.cifApi.searchPage = async (request) => {
    regression.requests.push(request);
    const result = { rows: gridRows.slice(request.offset, request.offset + request.limit), total: 1000 };
    if (request.offset === 0) return result;
    return new Promise<SearchPageResult>((resolve) => regression.pending.push(() => resolve(result)));
  };
}
ReactDOM.createRoot(document.getElementById('root')!).render(sourceRecoveryMode ? <SourceRecoveryHarness /> : pxrdRegressionMode ? <PxrdRegression/> : gridShortcutMode ? <GridShortcutTest /> : appRegressionMode ? <App /> : <UiTestApp />);
