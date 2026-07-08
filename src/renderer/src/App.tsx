import React, { useCallback, useEffect, useState } from 'react';
import DataGrid from './components/DataGrid';
import QuickSearchDialog from './components/QuickSearchDialog';
import ImportResultsPanel from './components/ImportResultsPanel';
import type { EntryRow, ImportResult, SearchFilter } from '../../shared/types';

const NO_CRITERIA_LABEL = 'A0 (No selection criteria)';

export default function App() {
  const [entries, setEntries] = useState<EntryRow[]>([]);
  const [qsOpen, setQsOpen] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [answerSetLabel, setAnswerSetLabel] = useState(NO_CRITERIA_LABEL);

  const reload = useCallback(() => {
    window.cifApi.getAllEntries().then(setEntries);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  async function handleImport() {
    setImporting(true);
    try {
      const result = await window.cifApi.importCifFolder();
      if (result) {
        setImportResult(result);
        reload();
      }
    } finally {
      setImporting(false);
    }
  }

  async function handleSearch(filter: SearchFilter) {
    const hasCriteria =
      filter.slot1.length > 0 ||
      filter.slot2.length > 0 ||
      filter.aMin !== undefined ||
      filter.aMax !== undefined ||
      filter.bMin !== undefined ||
      filter.bMax !== undefined ||
      filter.cMin !== undefined ||
      filter.cMax !== undefined ||
      Boolean(filter.sgQuery && filter.sgQuery.trim()) ||
      Boolean(filter.spaceGroupQuery && filter.spaceGroupQuery.trim()) ||
      Boolean(filter.referenceQuery && filter.referenceQuery.trim()) ||
      Boolean(filter.level && filter.level.trim());

    const results = await window.cifApi.search(filter);
    setEntries(results);
    setAnswerSetLabel(hasCriteria ? `A1 (${results.length} matching)` : NO_CRITERIA_LABEL);
  }

  return (
    <div className="mx-auto flex h-screen max-w-full flex-col overflow-hidden bg-mica">
      <div className="flex items-center gap-2.5 border-b border-stroke px-3.5 py-2 text-xs">
        <span className="flex h-4 w-4 items-center justify-center rounded bg-gradient-to-br from-[#0078d4] to-[#4cc2ff] text-[10px] text-white">
          ◈
        </span>
        <span>CIF Crystal Data - Local Database</span>
      </div>
      <div className="flex gap-0.5 px-2 py-0.5 text-xs">
        {['File', 'Edit', 'View', 'Search', 'Tools', 'Help'].map((m) => (
          <span key={m} className="cursor-default rounded-sm px-2.5 py-1 hover:bg-[#e9e9e9]">
            {m}
          </span>
        ))}
      </div>
      <div className="flex items-center gap-1.5 border-b border-stroke px-2.5 py-1.5">
        <button className="btn-w32 flex items-center gap-1.5 px-2.5" onClick={() => setQsOpen(true)}>
          <span>&#128269;</span> Quick search
        </button>
        <button className="btn-w32 flex items-center gap-1.5 px-2.5" onClick={handleImport} disabled={importing}>
          <span>&#128193;</span> {importing ? 'Importing...' : 'Import CIFs...'}
        </button>
        <div className="mx-1.5 h-6 w-px bg-stroke-strong" />
        <span className="text-text-dim">
          Answer set: <b>{answerSetLabel}</b> [{entries.length}]
        </span>
      </div>

      <DataGrid rows={entries} />

      <div className="flex gap-2 border-t border-stroke px-2.5 py-1 text-text-dim">
        <div className="flex-1 px-2 py-0.5">{entries.length} entries</div>
        <div className="px-2 py-0.5">db: cif-local.db</div>
        <div className="px-2 py-0.5">Ready</div>
      </div>

      <QuickSearchDialog open={qsOpen} onClose={() => setQsOpen(false)} onSearch={handleSearch} />
      {importResult && <ImportResultsPanel result={importResult} onDismiss={() => setImportResult(null)} />}
    </div>
  );
}
