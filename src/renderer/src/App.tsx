import { useCallback, useEffect, useRef, useState } from 'react';
import ResultsWorkspace from './components/ResultsWorkspace';
import QuickSearchDialog from './components/QuickSearchDialog';
import ImportResultsPanel from './components/ImportResultsPanel';
import ImportProgressIndicator from './components/ImportProgressIndicator';
import type { EntryRow, ImportProgress, ImportResult, SearchFilter, SearchSortColumn } from '../../shared/types';
import AboutDialog from './components/AboutDialog';

const NO_CRITERIA_LABEL = 'A0 (No selection criteria)';
const SEARCH_PAGE_SIZE = 500;

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
  const startupScanStarted = useRef(false);
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
  const [searchTotal, setSearchTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const searchRequestId = useRef(0);
  const activeFilter = useRef<SearchFilter | null>(null);
  const [sort, setSort] = useState<{ column?: SearchSortColumn; direction?: 'asc' | 'desc' }>({});
  const activeSort = useRef<{ column?: SearchSortColumn; direction?: 'asc' | 'desc' }>({});

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

  const clearAnswerSet = useCallback((resetSearchForm = false) => {
    setEntries([]);
    setSelectedEntryId(null);
    setAnswerSetLabel(NO_CRITERIA_LABEL);
    setSearchActive(false);
    setSearchTotal(0);
    setLoadingMore(false);
    activeSort.current = {};
    setSort({});
    activeFilter.current = null;
    searchRequestId.current += 1;
    setExportMessage(null);
    if (resetSearchForm) setSearchResetSignal((value) => value + 1);
  }, []);

  useEffect(() => {
    refreshDatabaseCount();
  }, [refreshDatabaseCount]);

  useEffect(() => {
    if (startupScanStarted.current) return;
    startupScanStarted.current = true;

    async function scanSavedFolder() {
      try {
        const folder = await window.cifApi.getImportFolder();
        setImportFolder(folder);
        if (!folder) return;

        setRefreshing(true);
        setImportProgress(null);
        const result = await window.cifApi.refreshCifFolder();
        if (result.importedCount > 0 || result.failures.length > 0) setImportResult(result);
        await refreshDatabaseCount();
      } catch (error) {
        showApiError('scan the saved CIF folder at startup', error);
      } finally {
        setRefreshing(false);
        setImportProgress(null);
      }
    }

    void scanSavedFolder();
  }, [refreshDatabaseCount, showApiError]);

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

    setApiError(null);
    if (!hasCriteria) {
      clearAnswerSet();
      return;
    }
    const requestId = ++searchRequestId.current;
    setLoadingMore(true);
    try {
      activeFilter.current = filter;
      activeSort.current = {};
      setSort({});
      const result = await window.cifApi.searchPage({ filter, offset: 0, limit: SEARCH_PAGE_SIZE });
      if (requestId !== searchRequestId.current) return;
      setEntries(result.rows);
      setSearchTotal(result.total);
      setSelectedEntryId(result.rows[0]?.id ?? null);
      setAnswerSetLabel(`A1 (${result.total} matching)`);
      setSearchActive(true);
    } catch (error) {
      if (requestId === searchRequestId.current) showApiError('search entries', error);
    } finally {
      if (requestId === searchRequestId.current) setLoadingMore(false);
    }
  }

  const loadMoreResults = useCallback(async () => {
    const filter = activeFilter.current;
    if (!filter || loadingMore || entries.length >= searchTotal) return;
    const requestId = searchRequestId.current;
    setLoadingMore(true);
    try {
      const result = await window.cifApi.searchPage({
        filter,
        offset: entries.length,
        limit: SEARCH_PAGE_SIZE,
        sortColumn: activeSort.current.column,
        sortDirection: activeSort.current.direction
      });
      if (requestId !== searchRequestId.current) return;
      setEntries((current) => [...current, ...result.rows]);
      setSearchTotal(result.total);
    } catch (error) {
      showApiError('load more search results', error);
    } finally {
      if (requestId === searchRequestId.current) setLoadingMore(false);
    }
  }, [entries.length, loadingMore, searchTotal, showApiError]);

  const sortSearchResults = useCallback(async (column?: SearchSortColumn, direction?: 'asc' | 'desc') => {
    const filter = activeFilter.current;
    if (!filter) return;
    activeSort.current = { column, direction };
    setSort({ column, direction });
    const requestId = ++searchRequestId.current;
    setLoadingMore(true);
    try {
      const result = await window.cifApi.searchPage({
        filter,
        offset: 0,
        limit: SEARCH_PAGE_SIZE,
        sortColumn: column,
        sortDirection: direction
      });
      if (requestId !== searchRequestId.current) return;
      setEntries(result.rows);
      setSearchTotal(result.total);
      setSelectedEntryId(result.rows[0]?.id ?? null);
    } catch (error) {
      showApiError('sort search results', error);
    } finally {
      if (requestId === searchRequestId.current) setLoadingMore(false);
    }
  }, [showApiError]);

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
            disabled={selectedEntryId === null || importing || refreshing || clearing || exporting}
            title={selectedEntryId === null ? 'Select a Quick Search result first' : 'Export the selected original CIF file'}
          >
            <span aria-hidden="true">⇩</span> {exporting ? 'Exporting...' : 'Export CIF'}
          </button>
        </div>
        <div className="mx-1.5 h-6 w-px bg-stroke-strong" aria-hidden="true" />
        <div className="toolbar-group" role="group" aria-label="Database">
          <button className="btn-w32 flex items-center gap-1.5 px-2.5" onClick={handleImport} disabled={importing || refreshing || clearing}>
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
            disabled={!importFolder || importing || refreshing || clearing}
            title={importFolder ? `Scan again: ${importFolder}` : 'Choose a folder with Import CIFs first'}
          >
            <span aria-hidden="true">↻</span>{' '}
            {refreshing && importProgress
              ? `Refreshing ${importProgress.processed}/${importProgress.total}...`
              : refreshing
                ? 'Refreshing...'
                : 'Refresh CIFs'}
          </button>
          {(importing || refreshing) && importProgress && (
            <ImportProgressIndicator progress={importProgress} />
          )}
          <button
            className="btn-w32 flex items-center gap-1.5 px-2.5 text-[#c42b1c]"
            onClick={handleClearCifs}
            disabled={importing || refreshing || clearing}
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

      <ResultsWorkspace
        emptyMessage={loadingMore ? { title: 'Searching…', description: 'Finding matching structures.' } : searchActive ? { title: 'No matching results', description: 'Open Quick search to adjust or remove criteria.' } : databaseEntryCount === 0 ? { title: 'No structures imported', description: 'Use Import CIFs to add structures, then run a Quick search.' } : databaseEntryCount === null ? { title: 'Loading database…', description: 'Checking the available structures.' } : { title: 'Run a search', description: 'Use Quick search to filter the imported structures.' }}
        rows={entries}
        selectedId={selectedEntryId}
        onSelect={(entry) => setSelectedEntryId(entry.id)}
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
      <AboutDialog open={aboutOpen} onClose={() => setAboutOpen(false)} />
    </div>
  );
}
