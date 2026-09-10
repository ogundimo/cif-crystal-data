import React from 'react';
import App from './App';
import ReactDOM from 'react-dom/client';
import QuickSearchDialog from './components/QuickSearchDialog';
import ResultsWorkspace from './components/ResultsWorkspace';
import ImportProgressIndicator from './components/ImportProgressIndicator';
import type { EntryRow, SearchPageRequest, SearchPageResult } from '../../shared/types';
import syntheticCif from '../../parser/__fixtures__/synthetic-test.cif?raw';
import './index.css';

const gridRows: EntryRow[] = Array.from({ length: 10_000 }, (_, index) => ({
  id: index + 1,
  source_filename: `${index + 1}.cif`,
  formula: 'Fe1O1',
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
  reference: `Reference ${index + 1}`,
  level_struct_studies: 'Complete structure determined',
  sample_type: index === 0 ? 'Sample crystal' : 'Powder',
  crystal_colour: index === 0 ? 'gray steel' : '',
  publ_title: `Synthetic structure report ${index + 1}`,
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
  getPublAuthors: async (entryId) => [
    { id: entryId, entry_id: entryId, author_order: 0, name: 'Doe, J.', address: 'Department of Chemistry, Example University, Springfield' },
    { id: entryId + 1, entry_id: entryId, author_order: 1, name: 'Roe, A.', address: null }
  ],
  getViewerSource: async (entryId) => ({ fileName: `${entryId}.cif`, text: syntheticCif }),
  getImportFolder: async () => null,
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
  const [selectedId, setSelectedId] = React.useState<number | null>(gridRows[0].id);

  return (
    <div className="flex h-screen flex-col">
    <ResultsWorkspace
      rows={gridRows}
      selectedId={selectedId}
      onSelect={(entry) => setSelectedId(entry.id)}
    />
    <div className="fixed left-2 top-2">
      <ImportProgressIndicator
        progress={{ processed: 800, total: 1_000, importedCount: 90, skippedCount: 700, failureCount: 10 }}
      />
    </div>
    <QuickSearchDialog open onClose={() => undefined} onSearch={() => undefined} />
    </div>
  );
}

const appRegressionMode = new URLSearchParams(location.search).has('app-regression');
if (appRegressionMode) {
  const regression = {
    requests: [] as SearchPageRequest[],
    pending: [] as Array<() => void>
  };
  Object.assign(window, { appRegression: regression });
  window.cifApi.searchPage = async (request) => {
    regression.requests.push(request);
    const result = { rows: gridRows.slice(request.offset, request.offset + request.limit), total: 1000 };
    if (request.offset === 0) return result;
    return new Promise<SearchPageResult>((resolve) => regression.pending.push(() => resolve(result)));
  };
}
ReactDOM.createRoot(document.getElementById('root')!).render(appRegressionMode ? <App /> : <UiTestApp />);
