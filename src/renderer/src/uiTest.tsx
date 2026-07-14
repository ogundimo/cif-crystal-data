import React from 'react';
import ReactDOM from 'react-dom/client';
import QuickSearchDialog from './components/QuickSearchDialog';
import './index.css';

window.cifApi = {
  getAllEntries: async () => [],
  search: async () => [],
  restraints: async () => [],
  importCifFolder: async () => null,
  clearCifs: async () => ({ cleared: false, deletedCount: 0 })
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <QuickSearchDialog open onClose={() => undefined} onSearch={() => undefined} />
);
