import type { SelectionGesture } from '../rowSelection';
import { type KeyboardEvent, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
  type ColumnSizingState
} from '@tanstack/react-table';
import type { EntryRow, SearchSortColumn } from '../../../shared/types';
import { useLayoutPreference, validColumnWidths } from '../layoutPreferences';
import { formatCifText, formatFormula, plainCifText } from '../formatFormula';
import { calculateVirtualRowWindow } from '../virtualRows';

const columnHelper = createColumnHelper<EntryRow>();
const ROW_HEIGHT = 20;
const HEADER_HEIGHT = 25;
const ROW_OVERSCAN = 8;

function formatCellLengthAngstrom(explicit: number | null, legacy: number): string {
  const value = explicit ?? legacy * 10;
  return Number.isFinite(value) ? value.toFixed(4) : '';
}

const columns = [
  columnHelper.accessor('formula', {
    id: 'formula',
    header: 'Formula',
    size: 150,
    cell: (info) => formatFormula(info.getValue())
  }),
  columnHelper.accessor('cell_a', {
    id: 'cell_a',
    header: 'a [Å]',
    size: 75,
    cell: (info) => formatCellLengthAngstrom(info.row.original.cell_a_angstrom, info.getValue())
  }),
  columnHelper.accessor('cell_b', {
    id: 'cell_b',
    header: 'b [Å]',
    size: 75,
    cell: (info) => formatCellLengthAngstrom(info.row.original.cell_b_angstrom, info.getValue())
  }),
  columnHelper.accessor('cell_c', {
    id: 'cell_c',
    header: 'c [Å]',
    size: 75,
    cell: (info) => formatCellLengthAngstrom(info.row.original.cell_c_angstrom, info.getValue())
  }),
  columnHelper.accessor('sg_number', {
    id: 'sg_number',
    header: 'SG number',
    size: 80,
    cell: (info) => String(info.row.original.sg_number)
  }),
  columnHelper.accessor('space_group', {
    id: 'space_group',
    header: 'Space Group',
    size: 100
  }),
  columnHelper.accessor('reference', {
    id: 'reference',
    header: 'Reference',
    cell: (info) => formatCifText(info.getValue()),
    size: 260
  }),
  columnHelper.accessor('level_struct_studies', {
    id: 'level_struct_studies',
    header: 'Level struct. studies',
    size: 260
  })
];

export interface EmptyResultsMessage { title: string; description: string; }
interface Props {
  isRowSelected?: (id: number) => boolean;
  onSelectAll?: () => void;
  onClearSelection?: () => void;
  emptyMessage?: EmptyResultsMessage;
  rows: EntryRow[];
  selectedId?: number | null;
  onSelect?: (entry: EntryRow, gesture?: SelectionGesture) => void;
  totalRows?: number;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  onSortChange?: (column?: SearchSortColumn, direction?: 'asc' | 'desc') => void;
  sortColumn?: SearchSortColumn;
  sortDirection?: 'asc' | 'desc';
}

export default function DataGrid({
  isRowSelected,
  onSelectAll,
  onClearSelection,
  rows,
  selectedId = null,
  onSelect,
  emptyMessage = { title: "Run a search", description: "Use Quick search to filter the imported structures." },
  totalRows = rows.length,
  loadingMore = false,
  onLoadMore,
  onSortChange,
  sortColumn,
  sortDirection
}: Props) {
  const [localSorting, setSorting] = useState<SortingState>([]);
  const [columnSizing, setColumnSizing] = useLayoutPreference<ColumnSizingState>('column-widths', {}, validColumnWidths);
  const [viewport, setViewport] = useState({ scrollTop: 0, height: 0 });
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const revealedScrollTop = useRef<number | null>(null);

  const sorting: SortingState = onSortChange
    ? sortColumn ? [{ id: sortColumn, desc: sortDirection === 'desc' }] : []
    : localSorting;

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, columnSizing },
    onSortingChange: (updater) => {
      revealedScrollTop.current = null;
      const next = typeof updater === 'function' ? updater(sorting) : updater;
      setSorting(next);
      const first = next[0];
      onSortChange?.(first?.id as SearchSortColumn | undefined, first ? first.desc ? 'desc' : 'asc' : undefined);
    },
    onColumnSizingChange: setColumnSizing,
    columnResizeMode: 'onChange',
    getCoreRowModel: getCoreRowModel(),
    manualSorting: Boolean(onSortChange)
  });

  const tableRows = table.getRowModel().rows;
  const virtualWindow = useMemo(
    () =>
      calculateVirtualRowWindow({
        rowCount: tableRows.length,
        scrollTop: viewport.scrollTop,
        viewportHeight: viewport.height,
        rowHeight: ROW_HEIGHT,
        headerHeight: HEADER_HEIGHT,
        overscan: ROW_OVERSCAN
      }),
    [tableRows.length, viewport]
  );
  const visibleRows = tableRows.slice(virtualWindow.start, virtualWindow.end);

  const measureViewport = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const revealing = revealedScrollTop.current !== null && Math.abs(container.scrollTop - Math.max(0, Math.min(revealedScrollTop.current, container.scrollHeight - container.clientHeight))) < 1;
    if (!revealing) revealedScrollTop.current = null;
    setViewport((previous) => {
      const next = { scrollTop: container.scrollTop, height: container.clientHeight };
      return previous.scrollTop === next.scrollTop && previous.height === next.height
        ? previous
        : next;
    });
    if (
      !revealing && onLoadMore &&
      !loadingMore &&
      rows.length < totalRows &&
      container.scrollTop + container.clientHeight >= container.scrollHeight - ROW_HEIGHT * 20
    ) {
      onLoadMore();
    }
  }, [loadingMore, onLoadMore, rows.length, totalRows]);

  useLayoutEffect(() => { revealedScrollTop.current = null; }, [selectedId, sortColumn, sortDirection]);

  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    measureViewport();
    const resizeObserver = new ResizeObserver(measureViewport);
    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, [measureViewport]);

  function revealSelectedRow(event: KeyboardEvent<HTMLDivElement>) {
    const index = tableRows.findIndex(row => row.original.id === selectedId);
    if (index < 0) return;
    event.preventDefault();
    const container = event.currentTarget;
    const headerHeight = container.querySelector('thead')?.getBoundingClientRect().height ?? HEADER_HEIGHT;
    const target = Math.max(0, Math.min(container.scrollHeight - container.clientHeight,
      index * ROW_HEIGHT + ROW_HEIGHT / 2 - (container.clientHeight - headerHeight) / 2));
    if (Math.abs(container.scrollTop - target) >= 1) {
      container.scrollTop = target;
      // Revealing an already loaded selection must not request another page.
      revealedScrollTop.current = container.scrollTop;
      measureViewport();
    }
  }


  function moveFocus(event: KeyboardEvent<HTMLDivElement>) {
    if (!onSelect || rows.length === 0 || !['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const current = rows.findIndex(row => row.id === selectedId);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? rows.length - 1 : Math.max(0, Math.min(rows.length - 1, current + (event.key === 'ArrowDown' ? 1 : -1)));
    onSelect(rows[next], { toggle: event.ctrlKey || event.metaKey, range: event.shiftKey, focusOnly: (event.ctrlKey || event.metaKey) && !event.shiftKey });
    const container = event.currentTarget;
    const top = HEADER_HEIGHT + next * ROW_HEIGHT;
    if (top < container.scrollTop + HEADER_HEIGHT) container.scrollTop = top - HEADER_HEIGHT;
    else if (top + ROW_HEIGHT > container.scrollTop + container.clientHeight) container.scrollTop = top + ROW_HEIGHT - container.clientHeight;
    if (next === rows.length - 1 && rows.length < totalRows && !loadingMore) onLoadMore?.();
  }


  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget || event.nativeEvent.isComposing || event.altKey || document.querySelector('[role="dialog"][aria-modal="true"]')) return;
    const toggle = event.ctrlKey || event.metaKey;
    if (toggle && event.key.toLowerCase() === 'a' && onSelectAll) {
      event.preventDefault(); onSelectAll(); return;
    }
    if (event.key === 'Escape' && onClearSelection) {
      event.preventDefault(); onClearSelection(); return;
    }
    if (event.key === ' ' && selectedId !== null) {
      const entry = rows.find(row => row.id === selectedId);
      if (entry) { event.preventDefault(); onSelect?.(entry, { toggle, range: event.shiftKey }); }
      return;
    }
    if (event.ctrlKey && event.shiftKey && !event.metaKey && event.key === 'Enter') {
      revealSelectedRow(event); return;
    }
    moveFocus(event);
  }

  return (
    <div
      ref={scrollContainerRef}
      data-testid="data-grid-scroll"
      tabIndex={0}
      role="grid"
      aria-multiselectable={Boolean(isRowSelected)}
      aria-rowcount={totalRows + 1}
      aria-activedescendant={visibleRows.some(row => row.original.id === selectedId) ? `structure-row-${selectedId}` : undefined}
      aria-label="Search results. Use Up and Down arrow keys to select a row. Control+click toggles selection. Shift selects a range. Control+A selects all matches. Escape clears selection. Control+Shift+Enter shows the selected row."
      aria-keyshortcuts="Control+A Escape Control+Shift+Enter"
      onKeyDown={handleKeyDown}
      className="mx-2 mt-2 flex-1 overflow-x-auto overflow-y-scroll border border-stroke bg-white"
      style={{ overflowAnchor: 'none' }}
      onScroll={measureViewport}
      onWheel={(event) => { revealedScrollTop.current = null; if (event.deltaY > 0) measureViewport(); }}
      onPointerDown={() => { revealedScrollTop.current = null; }}
      onTouchMove={() => { revealedScrollTop.current = null; }}
    >
      {tableRows.length === 0 ? (
        <div className="flex h-full min-h-[16rem] items-center justify-center text-center">
          <div className="max-w-sm px-6 text-text-dim">
            <div className="mb-2 text-3xl" aria-hidden="true">⌕</div>
            <p className="font-semibold text-[#444]">{emptyMessage.title}</p>
            <p className="mt-1">{emptyMessage.description}</p>
          </div>
        </div>
      ) : (
        <table
          role="presentation"
          className="w-full table-fixed border-separate border-spacing-0 text-xs"
        >
        <thead>
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id} role="row">
              {hg.headers.map((header) => (
                <th
                  role="columnheader"
                  key={header.id}
                  title={header.id === 'sg_number' ? 'Space group number' : header.id === 'level_struct_studies' ? 'Level of structural studies' : String(header.column.columnDef.header)}
                  style={{ width: header.getSize(), height: HEADER_HEIGHT }}
                  className="sticky top-0 z-[2] select-none overflow-hidden whitespace-nowrap border-b border-stroke-strong border-r border-stroke bg-[#f6f6f6] px-2 py-1 text-left font-semibold text-[#333] hover:bg-[#eef4fa]"
                  onClick={header.column.getToggleSortingHandler()}
                >
                  <span className="cursor-pointer">{flexRender(header.column.columnDef.header, header.getContext())}</span>
                  {header.column.getIsSorted() && (
                    <span className="float-right text-accent">{header.column.getIsSorted() === 'asc' ? '▲' : '▼'}</span>
                  )}
                  <div
                    onMouseDown={header.getResizeHandler()}
                    onTouchStart={header.getResizeHandler()}
                    onClick={(e) => e.stopPropagation()}
                    className="absolute right-0 top-0 h-full w-1 cursor-col-resize select-none touch-none"
                  />
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {virtualWindow.paddingTop > 0 && (
            <tr aria-hidden="true" className="pointer-events-none">
              <td
                colSpan={columns.length}
                style={{ height: virtualWindow.paddingTop, padding: 0, border: 0 }}
              />
            </tr>
          )}
          {visibleRows.map((row, visibleIndex) => {
            const rowIndex = virtualWindow.start + visibleIndex;
            return (
              <tr
                role="row"
                id={`structure-row-${row.original.id}`}
                key={row.id}
                aria-rowindex={rowIndex + 2}
                data-entry-id={row.original.id}
                aria-selected={isRowSelected ? isRowSelected(row.original.id) : selectedId === row.original.id}
                data-focused={selectedId === row.original.id}
                onMouseDown={event => { if (event.shiftKey) event.preventDefault(); }}
                onClick={event => {
                  scrollContainerRef.current?.focus({ preventScroll: true });
                  onSelect?.(row.original, { toggle: event.ctrlKey || event.metaKey, range: event.shiftKey });
                }}
                style={{ height: ROW_HEIGHT }}
                className={`cursor-default select-none ${selectedId === row.original.id ? 'outline outline-1 -outline-offset-1 outline-[#6b92bb]' : ''} ${rowIndex % 2 === 1 ? 'bg-[#fafafa]' : ''} hover:bg-[#f0f6fc] ${
                  (isRowSelected ? isRowSelected(row.original.id) : selectedId === row.original.id) ? 'bg-accent-soft hover:bg-accent-soft' : ''
                }`}
              >
                {row.getVisibleCells().map((cell) => (
                  <td
                    role="gridcell"
                    key={cell.id}
                    style={{ width: cell.column.getSize() }}
                    className="overflow-hidden text-ellipsis whitespace-nowrap border-b border-[#f0f0f0] border-r border-[#f0f0f0] px-2 py-0.5 leading-[15px]"
                    title={
                      typeof cell.getValue() === 'string'
                        ? plainCifText(cell.getValue() as string)
                        : undefined
                    }
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            );
          })}
          {virtualWindow.paddingBottom > 0 && (
            <tr aria-hidden="true" className="pointer-events-none">
              <td
                colSpan={columns.length}
                style={{ height: virtualWindow.paddingBottom, padding: 0, border: 0 }}
              />
            </tr>
          )}
        </tbody>
        </table>
      )}
      {loadingMore && (
        <div className="sticky bottom-0 border-t border-stroke bg-white/95 px-3 py-1 text-center text-text-dim">
          Loading more results…
        </div>
      )}
    </div>
  );
}
