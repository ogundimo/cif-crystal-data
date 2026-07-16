import React, { useRef, useState } from 'react';
import type { EntryRow } from '../../../shared/types';
import CompoundInfoPanel from './CompoundInfoPanel';
import DataGrid from './DataGrid';

interface Props {
  rows: EntryRow[];
  selectedId: number | null;
  onSelect: (entry: EntryRow) => void;
}

const MIN_PANEL_HEIGHT = 112;
const MIN_RESULTS_HEIGHT = 128;

export default function ResultsWorkspace({ rows, selectedId, onSelect }: Props) {
  const workspaceRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<{ y: number; height: number } | null>(null);
  const [panelHeight, setPanelHeight] = useState<number | null>(null);
  const selectedEntry = rows.find((entry) => entry.id === selectedId) ?? rows[0];

  if (rows.length === 0) return <DataGrid rows={rows} />;

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
    event.currentTarget.releasePointerCapture(event.pointerId);
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
        <DataGrid rows={rows} selectedId={selectedEntry.id} onSelect={onSelect} />
      </div>
      <div
        role="separator"
        aria-label="Resize results and compound information"
        aria-orientation="horizontal"
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
      <CompoundInfoPanel entry={selectedEntry} />
    </div>
  );
}
