import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
  type ColumnSizingState
} from '@tanstack/react-table';
import type { EntryRow } from '../../../shared/types';
import { formatFormula } from '../formatFormula';
import { calculateVirtualRowWindow } from '../virtualRows';

const columnHelper = createColumnHelper<EntryRow>();
const ROW_HEIGHT = 20;
const HEADER_HEIGHT = 25;
const ROW_OVERSCAN = 8;

function formatCellLengthAngstrom(value: number | null | undefined): string {
  return Number.isFinite(value) ? ((value as number) * 10).toFixed(4) : '';
}

const columns = [
  columnHelper.accessor('formula', {
    header: 'Formula',
    size: 150,
    cell: (info) => formatFormula(info.getValue())
  }),
  columnHelper.accessor('cell_a', {
    header: 'a [Å]',
    size: 75,
    cell: (info) => formatCellLengthAngstrom(info.getValue())
  }),
  columnHelper.accessor('cell_b', {
    header: 'b [Å]',
    size: 75,
    cell: (info) => formatCellLengthAngstrom(info.getValue())
  }),
  columnHelper.accessor('cell_c', {
    header: 'c [Å]',
    size: 75,
    cell: (info) => formatCellLengthAngstrom(info.getValue())
  }),
  columnHelper.accessor('sg_number', {
    header: 'SG number',
    size: 80
  }),
  columnHelper.accessor('space_group', {
    header: 'Space Group',
    size: 100
  }),
  columnHelper.accessor('reference', {
    header: 'Reference',
    size: 260
  }),
  columnHelper.accessor('level_struct_studies', {
    header: 'Level struct. studies',
    size: 260
  })
];

interface Props {
  rows: EntryRow[];
}

export default function DataGrid({ rows }: Props) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [viewport, setViewport] = useState({ scrollTop: 0, height: 0 });
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, columnSizing },
    onSortingChange: setSorting,
    onColumnSizingChange: setColumnSizing,
    columnResizeMode: 'onChange',
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel()
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
    setViewport((previous) => {
      const next = { scrollTop: container.scrollTop, height: container.clientHeight };
      return previous.scrollTop === next.scrollTop && previous.height === next.height
        ? previous
        : next;
    });
  }, []);

  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    measureViewport();
    const resizeObserver = new ResizeObserver(measureViewport);
    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, [measureViewport]);

  return (
    <div
      ref={scrollContainerRef}
      data-testid="data-grid-scroll"
      className="m-2 flex-1 overflow-auto rounded-md border border-stroke bg-white"
      style={{ overflowAnchor: 'none' }}
      onScroll={measureViewport}
    >
      <table
        aria-rowcount={tableRows.length + 1}
        className="w-full table-fixed border-separate border-spacing-0 text-xs"
      >
        <thead>
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              {hg.headers.map((header) => (
                <th
                  key={header.id}
                  style={{ width: header.getSize(), position: 'relative' }}
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
                key={row.id}
                aria-rowindex={rowIndex + 2}
                data-entry-id={row.original.id}
                onClick={() => setSelectedId(row.original.id)}
                style={{ height: ROW_HEIGHT }}
                className={`cursor-default ${rowIndex % 2 === 1 ? 'bg-[#fafafa]' : ''} hover:bg-[#f0f6fc] ${
                  selectedId === row.original.id ? 'bg-accent-soft hover:bg-accent-soft' : ''
                }`}
              >
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    style={{ width: cell.column.getSize() }}
                    className="overflow-hidden text-ellipsis whitespace-nowrap border-b border-[#f0f0f0] border-r border-[#f0f0f0] px-2 py-0.5"
                    title={
                      typeof cell.getValue() === 'string'
                        ? (cell.getValue() as string)
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
    </div>
  );
}
