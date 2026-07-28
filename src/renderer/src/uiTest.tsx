import React from 'react';
import ReactDOM from 'react-dom/client';
import QuickSearchDialog from './components/QuickSearchDialog';
import ResultsWorkspace from './components/ResultsWorkspace';
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
  journal_language: 'English'
}));

window.cifApi = {
  getAllEntries: async () => [],
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
    occupancy: 1
  }],
  getImportFolder: async () => null,
  exportCif: async () => ({ exported: false }),
  search: async () => [],
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

ReactDOM.createRoot(document.getElementById('root')!).render(<UiTestApp />);
