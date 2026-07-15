import React from 'react';
import ReactDOM from 'react-dom/client';
import QuickSearchDialog from './components/QuickSearchDialog';
import DataGrid from './components/DataGrid';
import ImportProgressIndicator from './components/ImportProgressIndicator';
import type { EntryRow } from '../../shared/types';
import './index.css';

const gridRows: EntryRow[] = Array.from({ length: 10_000 }, (_, index) => ({
  id: index + 1,
  source_filename: `${index + 1}.cif`,
  formula: 'Fe1O1',
  cell_a: 0.1,
  cell_b: 0.2,
  cell_c: 0.3,
  sg_number: 1,
  space_group: 'P1',
  reference: `Reference ${index + 1}`,
  level_struct_studies: 'Complete structure determined'
}));

window.cifApi = {
  getAllEntries: async () => [],
  getImportFolder: async () => null,
  search: async () => [],
  restraints: async () => [],
  importCifFolder: async () => null,
  refreshCifFolder: async () => ({ importedCount: 0, skippedCount: 0, failures: [], total: 0 }),
  onImportProgress: () => () => undefined,
  clearCifs: async () => ({ cleared: false, deletedCount: 0 })
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <div className="flex h-screen flex-col">
    <DataGrid rows={gridRows} />
    <div className="fixed left-2 top-2">
      <ImportProgressIndicator
        progress={{ processed: 800, total: 1_000, importedCount: 90, skippedCount: 700, failureCount: 10 }}
      />
    </div>
    <QuickSearchDialog open onClose={() => undefined} onSearch={() => undefined} />
  </div>
);
