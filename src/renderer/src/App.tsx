import React, { useCallback, useEffect, useState } from 'react';
import DataGrid from './components/DataGrid';
import QuickSearchDialog from './components/QuickSearchDialog';
import ImportResultsPanel from './components/ImportResultsPanel';
import type { EntryRow, ImportResult, SearchFilter } from '../../shared/types';

const NO_CRITERIA_LABEL = 'A0 (No selection criteria)';

export default function App() {
  if (typeof window.cifApi === 'undefined') {
    return (
      <div className="flex h-screen items-center justify-center bg-mica p-8">
        <div className="max-w-lg rounded-md border border-[#c42b1c] bg-white p-4">
          <p className="mb-1 font-semibold text-[#c42b1c]">Application bridge unavailable</p>
          <p>
            The preload script failed to load, so the renderer cannot reach the database. This is a
            packaging or build configuration error: rebuild the app and check the main process log
            for preload errors.
          </p>
        </div>
      </div>
    );
  }
  return <AppInner />;
}

function AppInner() {
  const [entries, setEntries] = useState<EntryRow[]>([]);
  const [qsOpen, setQsOpen] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [searchActive, setSearchActive] = useState(false);
  const [searchResetSignal, setSearchResetSignal] = useState(0);
  const [answerSetLabel, setAnswerSetLabel] = useState(NO_CRITERIA_LABEL);

  const reload = useCallback(() => {
    if (!window.cifApi) return;
    window.cifApi.getAllEntries().then(setEntries);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  if (!window.cifApi) {
    return (
      <div className="flex h-screen items-center justify-center bg-mica p-6 text-center text-sm text-red-700">
        Backend bridge failed to load. The application preload script did not run correctly.
        Please reinstall the application or contact support.
      </div>
    );
  }

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

  async function handleResetSearch() {
    const allEntries = await window.cifApi.getAllEntries();
    setEntries(allEntries);
    setAnswerSetLabel(NO_CRITERIA_LABEL);
    setSearchActive(false);
    setSearchResetSignal((value) => value + 1);
  }

  async function handleClearCifs() {
    setClearing(true);
    try {
      const result = await window.cifApi.clearCifs();
      if (!result.cleared) return;
      setEntries([]);
      setImportResult(null);
      setAnswerSetLabel(NO_CRITERIA_LABEL);
      setSearchActive(false);
      setSearchResetSignal((value) => value + 1);
    } finally {
      setClearing(false);
    }
  }

  async function handleSearch(filter: SearchFilter) {
    const hasCriteria =
      filter.slot1.length > 0 ||
      filter.slot2.length > 0 ||
      Boolean(filter.elementSelections?.some((selection) => selection.elements.length || selection.groups.length || selection.periods.length)) ||
      Boolean(filter.elementSelection && (filter.elementSelection.elements.length || filter.elementSelection.groups.length || filter.elementSelection.periods.length)) ||
      (filter.slot3?.length ?? 0) > 0 ||
      (filter.slot4?.length ?? 0) > 0 ||
      filter.aMin !== undefined ||
      filter.aMax !== undefined ||
      filter.bMin !== undefined ||
      filter.bMax !== undefined ||
      filter.cMin !== undefined ||
      filter.cMax !== undefined ||
      Boolean(filter.sgQuery && filter.sgQuery.trim()) ||
      Boolean(filter.spaceGroupQuery && filter.spaceGroupQuery.trim()) ||
      Boolean(filter.referenceQuery && filter.referenceQuery.trim()) ||
      Boolean(filter.level && filter.level.trim()) ||
      Boolean(filter.elementCountQuery && filter.elementCountQuery.trim());

    const results = await window.cifApi.search(filter);
    setEntries(results);
    setAnswerSetLabel(hasCriteria ? `A1 (${results.length} matching)` : NO_CRITERIA_LABEL);
    setSearchActive(hasCriteria);
  }

  return (
    <div className="mx-auto flex h-screen max-w-full flex-col overflow-hidden bg-mica">
      <div className="flex items-center gap-1.5 border-b border-stroke px-2.5 py-1.5">
        <button className="btn-w32 flex items-center gap-1.5 px-2.5" onClick={() => setQsOpen(true)}>
          <span>&#128269;</span> Quick search
        </button>
        <button
          className="btn-w32 flex items-center gap-1.5 px-2.5 disabled:cursor-not-allowed disabled:border-[#cfcfcf] disabled:bg-[#ededed] disabled:text-[#8a8a8a] disabled:opacity-70"
          onClick={handleResetSearch}
          disabled={!searchActive}
        >
          <span aria-hidden="true">↺</span> Reset search
        </button>
        <button className="btn-w32 flex items-center gap-1.5 px-2.5" onClick={handleImport} disabled={importing || clearing}>
          <span>&#128193;</span> {importing ? 'Importing...' : 'Import CIFs...'}
        </button>
        <button
          className="btn-w32 flex items-center gap-1.5 px-2.5 text-[#c42b1c]"
          onClick={handleClearCifs}
          disabled={importing || clearing}
          title="Remove all imported entries from the local database"
        >
          <span aria-hidden="true">⌫</span> {clearing ? 'Clearing...' : 'Clear CIFs'}
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

      <QuickSearchDialog
        open={qsOpen}
        onClose={() => setQsOpen(false)}
        onSearch={handleSearch}
        resetSignal={searchResetSignal}
      />
      {importResult && <ImportResultsPanel result={importResult} onDismiss={() => setImportResult(null)} />}
    </div>
  );
}
