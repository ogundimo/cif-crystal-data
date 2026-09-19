import BatchExportDialog from './components/BatchExportDialog';
import { createSearchController } from './searchController';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ResultsWorkspace from './components/ResultsWorkspace';
import QuickSearchDialog from './components/QuickSearchDialog';
import ImportResultsPanel from './components/ImportResultsPanel';
import ImportProgressIndicator from './components/ImportProgressIndicator';
import type { EntryRow, ImportProgress, ImportResult, SearchFilter, SearchSortColumn } from '../../shared/types';
import AboutDialog from './components/AboutDialog';

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
  const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set());
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchFilter, setBatchFilter] = useState<SearchFilter | null>(null);
  const batchIds = useMemo(() => [...checkedIds], [checkedIds]);
  const [cancelling, setCancelling] = useState(false);
  const [entries, setEntries] = useState<EntryRow[]>([]);
  const [selectedEntryId, setSelectedEntryId] = useState<number | null>(null);
  const [qsOpen, setQsOpen] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);
  const [importing, setImporting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [importFolder, setImportFolder] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [searchActive, setSearchActive] = useState(false);
  const [searchResetSignal, setSearchResetSignal] = useState(0);
  const [answerSetLabel, setAnswerSetLabel] = useState(NO_CRITERIA_LABEL);
  const [databaseEntryCount, setDatabaseEntryCount] = useState<number | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [workspaceVersion, setWorkspaceVersion] = useState(0);
  const [searchTotal, setSearchTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);


  const [sort, setSort] = useState<{ column?: SearchSortColumn; direction?: 'asc' | 'desc' }>({});


  const showApiError = useCallback((action: string, error: unknown) => {
    const detail = error instanceof Error && error.message ? ` ${error.message}` : '';
    setApiError(`Could not ${action}.${detail}`);
  }, []);

  const refreshDatabaseCount = useCallback(async () => {
    try {
      setDatabaseEntryCount(await window.cifApi.getEntryCount());
      setApiError(null);
    } catch (error) {
      showApiError('load the database summary', error);
    }
  }, [showApiError]);

  useEffect(() => { void window.cifApi.traceMilestone('controls-ready').catch(() => {}); }, []);
  useEffect(() => { if (!importing && !refreshing) void window.cifApi.traceMilestone('controls-restored').catch(() => {}); }, [importing, refreshing]);
  const controllerRef = useRef<ReturnType<typeof createSearchController> | null>(null);
  if (!controllerRef.current) controllerRef.current = createSearchController(window.cifApi, state => {
    if (state.active && !state.busy) void window.cifApi.traceMilestone('search-results').catch(() => {});
    setEntries(state.entries);
    setSelectedEntryId(state.selectedEntryId);
    setSearchTotal(state.total);
    setSearchActive(state.active);
    setLoadingMore(state.busy);
    setSort(state.sort);
    setAnswerSetLabel(state.active ? `A1 (${state.total} matching)` : NO_CRITERIA_LABEL);
  }, showApiError);
  const controller = controllerRef.current;
  const clearAnswerSet = useCallback((resetSearchForm = false) => {
    controller.reset();
    setCheckedIds(new Set());
    setBatchFilter(null);
    setExportMessage(null);
    if (resetSearchForm) setSearchResetSignal(value => value + 1);
  }, [controller]);
  useEffect(() => {
    refreshDatabaseCount();
  }, [refreshDatabaseCount]);

  useEffect(() => {
    let active = true;
    window.cifApi.getImportFolder().then(folder => {
      if (active) setImportFolder(folder);
    }).catch(error => { if (active) showApiError('load the saved CIF folder', error); });
    return () => { active = false; };
  }, [showApiError]);

  useEffect(() => window.cifApi.onImportProgress(setImportProgress), []);

  async function handleImport() {
    setImporting(true);
    setImportProgress(null);
    setApiError(null);
    try {
      const result = await window.cifApi.importCifFolder();
      if (result) {
        setImportResult(result);
        setImportFolder(await window.cifApi.getImportFolder());
        clearAnswerSet(true);
        await refreshDatabaseCount();
      }
    } catch (error) {
      showApiError('import CIF files', error);
    } finally {
      setImporting(false);
      setImportProgress(null);
      setCancelling(false);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    setImportProgress(null);
    setApiError(null);
    try {
      const result = await window.cifApi.refreshCifFolder();
      setImportResult(result);
      clearAnswerSet(true);
      await refreshDatabaseCount();
    } catch (error) {
      showApiError('refresh CIF files', error);
    } finally {
      setRefreshing(false);
      setImportProgress(null);
      setCancelling(false);
    }
  }

  function handleResetSearch() {
    setApiError(null);
    clearAnswerSet(true);
  }

  async function handleClearCifs() {
    setClearing(true);
    setApiError(null);
    try {
      const result = await window.cifApi.clearCifs();
      if (!result.cleared) return;
      setDatabaseEntryCount(0);
      setImportResult(null);
      clearAnswerSet(true);
    } catch (error) {
      showApiError('clear imported CIF data', error);
    } finally {
      setClearing(false);
    }
  }

  async function handleExportCif() {
    if (selectedEntryId === null) return;
    setExporting(true);
    setExportMessage(null);
    setApiError(null);
    try {
      const result = await window.cifApi.exportCif(selectedEntryId);
      if (result.exported) setExportMessage(`Exported ${result.fileName ?? 'CIF file'}`);
    } catch (error) {
      showApiError('export the selected CIF', error);
    } finally {
      setExporting(false);
    }
  }

  async function handleSearch(filter: SearchFilter) {
    setCheckedIds(new Set());
    setBatchFilter(structuredClone(filter));
    setApiError(null);
    await controller.search(filter);
  }
  const loadMoreResults = controller.loadMore;
  function handleSourceRecovery(entry?: EntryRow) {
    setCheckedIds(new Set()); setBatchFilter(null); setWorkspaceVersion(value => value + 1);
    void refreshDatabaseCount();
    if (entry) { controller.openEntry(entry); setAnswerSetLabel('Selected source entry'); }
    else void controller.refresh();
  }
  const sortSearchResults = controller.sort;
  return (
    <div className="mx-auto flex h-screen max-w-full flex-col overflow-hidden bg-mica">
      <div className="app-toolbar flex items-center gap-1.5 border-b border-stroke px-2.5 py-1.5" role="toolbar" aria-label="Application actions">
        <div className="toolbar-group" role="group" aria-label="Search">
          <button className="btn-w32 flex items-center gap-1.5 px-2.5" title="Edit search criteria" onClick={() => setQsOpen(true)}>
            <span aria-hidden="true">&#128269;</span> Quick search
          </button>
          <button
            className="btn-w32 flex items-center gap-1.5 px-2.5 disabled:cursor-not-allowed disabled:border-[#cfcfcf] disabled:bg-[#ededed] disabled:text-[#8a8a8a] disabled:opacity-70"
            title={searchActive ? 'Clear the current search criteria and results' : 'No active search to reset'}
            onClick={handleResetSearch}
            disabled={!searchActive}
          >
            <span aria-hidden="true">↺</span> Reset search
          </button>
        </div>
        <div className="mx-1.5 h-6 w-px bg-stroke-strong" aria-hidden="true" />
        <div className="toolbar-group" role="group" aria-label="Selected entry">
          <button
            className="btn-w32 flex items-center gap-1.5 px-2.5 disabled:cursor-not-allowed disabled:border-[#cfcfcf] disabled:bg-[#ededed] disabled:text-[#8a8a8a] disabled:opacity-70"
            onClick={handleExportCif}
            disabled={selectedEntryId === null || importing || refreshing || clearing || batchBusy || exporting}
            title={selectedEntryId === null ? 'Select a Quick Search result first' : 'Export the selected original CIF file'}
          >
            <span aria-hidden="true">⇩</span> {exporting ? 'Exporting...' : 'Export CIF'}
          </button>
        </div>
        <div className="mx-1.5 h-6 w-px bg-stroke-strong" aria-hidden="true" />
        <div className="toolbar-group" role="group" aria-label="Database">
          <button className="btn-w32 flex items-center gap-1.5 px-2.5" onClick={handleImport} disabled={importing || refreshing || clearing || batchBusy}>
            <span aria-hidden="true">&#128193;</span>{' '}
            {importing && importProgress
              ? `Importing ${importProgress.processed}/${importProgress.total}...`
              : importing
                ? 'Importing...'
                : 'Import CIFs...'}
          </button>
          <button
            className="btn-w32 flex items-center gap-1.5 px-2.5 disabled:cursor-not-allowed disabled:border-[#cfcfcf] disabled:bg-[#ededed] disabled:text-[#8a8a8a] disabled:opacity-70"
            onClick={handleRefresh}
            disabled={!importFolder || importing || refreshing || clearing || batchBusy}
            title={importFolder ? `Scan again: ${importFolder}` : 'Choose a folder with Import CIFs first'}
          >
            <span aria-hidden="true">↻</span>{' '}
            {refreshing && importProgress
              ? `Refreshing ${importProgress.processed}/${importProgress.total}...`
              : refreshing
                ? 'Refreshing...'
                : 'Refresh CIFs'}
          </button>
          {(importing || refreshing) && <button className="btn-w32" disabled={cancelling} onClick={async () => {
            setCancelling(true);
            try { await window.cifApi.cancelImport(); } catch (error) { setCancelling(false); showApiError('cancel import', error); }
          }}>{cancelling ? 'Cancelling…' : 'Cancel import'}</button>}
          {(importing || refreshing) && importProgress && (
            <ImportProgressIndicator progress={importProgress} />
          )}
          <button
            className="btn-w32 flex items-center gap-1.5 px-2.5 text-[#c42b1c]"
            onClick={handleClearCifs}
            disabled={importing || refreshing || clearing || batchBusy}
            title="Remove all imported entries from the local database"
          >
            <span aria-hidden="true">⌫</span> {clearing ? 'Clearing...' : 'Clear CIFs'}
          </button>
        </div>
        <div className="mx-1.5 h-6 w-px bg-stroke-strong" />
        <button className="btn-w32 flex items-center gap-1.5 px-2.5" onClick={() => setAboutOpen(true)}>
          <span aria-hidden="true">ⓘ</span> About
        </button>
        <div className="mx-1.5 h-6 w-px bg-stroke-strong" />
        <span className="answer-summary text-text-dim">
          Answer set: <b>{answerSetLabel}</b> [{entries.length}]
        </span>
      </div>

      <div className="flex items-center gap-3 px-3 pt-2 text-sm">
        <button className="btn-w32" onClick={() => setBatchOpen(true)} disabled={!searchActive || importing || refreshing || clearing || batchBusy}>Batch export…</button>
        <span role="status">{checkedIds.size} selected for batch export</span>
        <button className="btn-w32" disabled={!checkedIds.size} onClick={() => setCheckedIds(new Set())}>Clear selection</button>
        <span className="text-text-dim">Checkboxes select exports; the highlighted row shows details. Selection survives paging and sorting; new searches and data refresh clear it.</span>
      </div>
      <ResultsWorkspace
        key={workspaceVersion}
        onRecovery={handleSourceRecovery}
        checkedIds={checkedIds}
        onToggleChecked={id => setCheckedIds(previous => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next; })}
        emptyMessage={loadingMore ? { title: 'Searching…', description: 'Finding matching structures.' } : searchActive ? { title: 'No matching results', description: 'Open Quick search to adjust or remove criteria.' } : databaseEntryCount === 0 ? { title: 'No structures imported', description: 'Use Import CIFs to add structures, then run a Quick search.' } : databaseEntryCount === null ? { title: 'Loading database…', description: 'Checking the available structures.' } : { title: 'Run a search', description: 'Use Quick search to filter the imported structures.' }}
        rows={entries}
        selectedId={selectedEntryId}
        onSelect={(entry) => controller.select(entry.id)}
        totalRows={searchTotal || entries.length}
        loadingMore={loadingMore}
        onLoadMore={loadMoreResults}
        onSortChange={sortSearchResults}
        sortColumn={sort.column}
        sortDirection={sort.direction}
      />

      <div className="app-status flex gap-2 border-t border-stroke px-2.5 py-1 text-text-dim" role="status">
        <div className="flex-1 px-2 py-0.5">
          {searchActive
            ? `${entries.length} of ${searchTotal} search results loaded`
            : databaseEntryCount === null
              ? 'Loading database...'
              : `${databaseEntryCount} entries indexed`}
        </div>
        <div className="px-2 py-0.5">db: cif-local.db</div>
        <div className="px-2 py-0.5">
          {importing
            ? 'Importing...'
            : refreshing
              ? 'Refreshing...'
              : clearing
                ? 'Clearing...'
                : exporting
                  ? 'Exporting...'
                  : exportMessage ?? 'Ready'}
        </div>
      </div>

      <QuickSearchDialog
        open={qsOpen}
        onClose={() => setQsOpen(false)}
        onSearch={handleSearch}
        resetSignal={searchResetSignal}
      />
      {apiError && (
        <div
          role="alert"
          className="fixed bottom-4 left-1/2 z-40 flex w-[min(42rem,calc(100vw-2rem))] -translate-x-1/2 items-start gap-3 rounded-md border border-[#c42b1c] bg-white px-3 py-2 text-[#8a1c13] shadow-2xl"
        >
          <span className="flex-1">{apiError}</span>
          <button className="rounded px-2 hover:bg-[#f5e5e3]" onClick={() => setApiError(null)} aria-label="Dismiss error">
            ✕
          </button>
        </div>
      )}
      {importResult && <ImportResultsPanel result={importResult} onDismiss={() => setImportResult(null)} />}
      {batchOpen && <BatchExportDialog ids={batchIds} filter={batchFilter} onClose={() => setBatchOpen(false)} onBusy={setBatchBusy} />}
      <AboutDialog open={aboutOpen} onClose={() => setAboutOpen(false)} />
    </div>
  );
}
