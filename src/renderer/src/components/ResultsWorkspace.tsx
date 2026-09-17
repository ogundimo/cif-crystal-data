import React, { Component, lazy, Suspense, useRef } from 'react';
import type { EntryRow, SearchSortColumn } from '../../../shared/types';
import { usePanelSize, usePanePercentage } from '../layoutPreferences';
import DataGrid, { type EmptyResultsMessage } from './DataGrid';

interface Props {
  emptyMessage?: EmptyResultsMessage;
  rows: EntryRow[];
  selectedId: number | null;
  onSelect: (entry: EntryRow) => void;
  totalRows?: number;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  onSortChange?: (column?: SearchSortColumn, direction?: 'asc' | 'desc') => void;
  sortColumn?: SearchSortColumn;
  sortDirection?: 'asc' | 'desc';
}

const MIN_PANEL_HEIGHT = 112;
const MIN_RESULTS_HEIGHT = 128;
const CompoundInfoPanel = lazy(() => import('./CompoundInfoPanel'));

class DetailsBoundary extends Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed
      ? <div role="alert" className="p-4">Could not load structure details. <button onClick={() => window.location.reload()}>Reload workspace</button></div>
      : this.props.children;
  }
}

export default function ResultsWorkspace({ emptyMessage, rows, selectedId, onSelect, totalRows, loadingMore, onLoadMore, onSortChange, sortColumn, sortDirection }: Props) {
  const workspaceRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<{ y: number; height: number } | null>(null);
  const [panelHeight, setPanelHeight] = usePanelSize('details-height', workspaceRef, MIN_PANEL_HEIGHT, MIN_RESULTS_HEIGHT + 6, 'height');
  const panePercentage = usePanePercentage(workspaceRef, '#compound-pane', 'height');
  const selectedEntry = rows.find((entry) => entry.id === selectedId) ?? rows[0];

  if (rows.length === 0) return <DataGrid rows={rows} emptyMessage={emptyMessage} />;

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!dragStart.current || !workspaceRef.current) return;
    const maximum = Math.max(
      MIN_PANEL_HEIGHT,
      workspaceRef.current.clientHeight - MIN_RESULTS_HEIGHT - 6
    );
    const nextHeight = dragStart.current.height - (event.clientY - dragStart.current.y);
    setPanelHeight(Math.min(maximum, Math.max(MIN_PANEL_HEIGHT, nextHeight)));
  }

  function finishResize(event: React.PointerEvent<HTMLDivElement>) {
    dragStart.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  return (
    <div
      ref={workspaceRef}
      className="grid min-h-0 flex-1"
      style={{
        gridTemplateRows:
          panelHeight === null
            ? `minmax(${MIN_RESULTS_HEIGHT}px, 40fr) 6px minmax(${MIN_PANEL_HEIGHT}px, 60fr)`
            : `minmax(${MIN_RESULTS_HEIGHT}px, 1fr) 6px ${panelHeight}px`
      }}
    >
      <div className="flex min-h-0 overflow-hidden">
        <DataGrid
          rows={rows}
          selectedId={selectedId}
          onSelect={onSelect}
          totalRows={totalRows}
          loadingMore={loadingMore}
          onLoadMore={onLoadMore}
          onSortChange={onSortChange}
          sortColumn={sortColumn}
          sortDirection={sortDirection}
        />
      </div>
      <div
        role="separator" data-resize-handle="true"
        aria-label="Resize results and compound information"
        aria-orientation="horizontal"
        aria-controls="compound-pane"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={panePercentage}
        tabIndex={0}
        title="Drag or use Up/Down arrows to resize · Enter or double-click to reset"
        onKeyDown={(event) => {
          if (event.key === 'Enter') { event.preventDefault(); setPanelHeight(null); return; }
          if (!['ArrowUp', 'ArrowDown'].includes(event.key) || !workspaceRef.current) return;
          event.preventDefault();
          const height = workspaceRef.current.clientHeight;
          const current = panelHeight ?? (height - 6) * 0.6;
          setPanelHeight(Math.min(Math.max(MIN_PANEL_HEIGHT, height - MIN_RESULTS_HEIGHT - 6), Math.max(MIN_PANEL_HEIGHT, current + (event.key === 'ArrowUp' ? 16 : -16))));
        }}
        onDoubleClick={() => {
          dragStart.current = null;
          setPanelHeight(null);
        }}
        className="mx-2 cursor-row-resize border-y border-[#d6d6d6] bg-[#eeeeee] hover:bg-[#dddddd]"
        onPointerDown={(event) => {
          const currentHeight =
            panelHeight ?? Math.max(MIN_PANEL_HEIGHT, (workspaceRef.current?.clientHeight ?? 0) * 0.6);
          dragStart.current = { y: event.clientY, height: currentHeight };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={handlePointerMove}
        onPointerUp={finishResize}
        onPointerCancel={finishResize}
      />
      <DetailsBoundary>
        <Suspense fallback={<div role="status" className="p-4">Loading structure details…</div>}>
          <CompoundInfoPanel entry={selectedEntry} />
        </Suspense>
      </DetailsBoundary>
    </div>
  );
}
