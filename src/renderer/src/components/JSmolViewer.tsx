import React, { useEffect, useRef, useState } from 'react';
import type { EntryRow } from '../../../shared/types';
import { CrystalViewerRuntime, type ViewerRequest, type ViewerResult } from '../jsmol/runtime';
import type { CrystalAxis, CrystalRepresentation } from '../jsmol/scripts';

interface Props {
  entry: EntryRow;
}

type ViewState =
  | { phase: 'initializing' | 'loading'; pendingFileName: string; result: ViewerResult | null }
  | { phase: 'ready'; pendingFileName: string; result: ViewerResult }
  | { phase: 'error'; pendingFileName: string; result: ViewerResult | null; message: string };

const initialState: ViewState = { phase: 'initializing', pendingFileName: '', result: null };

function formatUnitCell(values: [number, number, number, number, number, number]): string {
  const [a, b, c, alpha, beta, gamma] = values;
  return `a ${a.toFixed(4)} · b ${b.toFixed(4)} · c ${c.toFixed(4)} Å · α ${alpha.toFixed(2)}° · β ${beta.toFixed(2)}° · γ ${gamma.toFixed(2)}°`;
}

export default function JSmolViewer({ entry }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<CrystalViewerRuntime | null>(null);
  const readyRef = useRef(false);
  const desiredRequest = useRef<ViewerRequest | null>(null);
  const [representation, setRepresentation] = useState<CrystalRepresentation>('atoms');
  const [unitCellVisible, setUnitCellVisible] = useState(true);
  const [labelsVisible, setLabelsVisible] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [view, setView] = useState<ViewState>(initialState);

  useEffect(() => {
    if (!hostRef.current) return;
    let active = true;
    const runtime = new CrystalViewerRuntime(
      hostRef.current,
      (entryId) => window.cifApi.getViewerSource(entryId),
      {
        requested: (fileName) => setView((current) => ({ phase: 'loading', pendingFileName: fileName, result: current.result })),
        loading: (fileName) => setView((current) => ({ phase: 'loading', pendingFileName: fileName, result: current.result })),
        ready: (result) => setView({ phase: 'ready', pendingFileName: result.fileName, result }),
        error: (fileName, errorMessage) => setView((current) => ({
          phase: 'error', pendingFileName: fileName, result: current.result, message: errorMessage
        }))
      }
    );
    runtimeRef.current = runtime;
    runtime.initialize(() => undefined).then(
      () => {
        if (!active) return;
        readyRef.current = true;
        if (desiredRequest.current) runtime.request(desiredRequest.current);
      },
      (error) => {
        if (active) setView({
          phase: 'error',
          pendingFileName: desiredRequest.current?.expectedFileName ?? entry.source_filename,
          result: null,
          message: error instanceof Error ? error.message : 'The local JSmol runtime could not initialize.'
        });
      }
    );
    return () => {
      active = false;
      readyRef.current = false;
      runtime.dispose();
      runtimeRef.current = null;
    };
  }, []);

  useEffect(() => {
    const request: ViewerRequest = {
      entryId: entry.id,
      expectedFileName: entry.source_filename,
      representation,
      unitCellVisible,
      labelsVisible
    };
    desiredRequest.current = request;
    setView((current) => ({ phase: 'loading', pendingFileName: entry.source_filename, result: current.result }));
    if (readyRef.current) runtimeRef.current?.request(request);
  }, [entry.id, entry.source_filename]);

  function chooseRepresentation(value: CrystalRepresentation): void {
    setRepresentation(value);
    runtimeRef.current?.setRepresentation(value);
  }

  function toggleUnitCell(): void {
    setUnitCellVisible((current) => {
      runtimeRef.current?.setUnitCell(!current);
      return !current;
    });
  }

  function toggleLabels(): void {
    setLabelsVisible((current) => {
      runtimeRef.current?.setLabels(!current);
      return !current;
    });
  }

  function axisButton(axis: CrystalAxis) {
    return (
      <button className="btn-w32 px-2" disabled={controlsDisabled} onClick={() => runtimeRef.current?.viewAxis(axis)} title={`View down crystallographic ${axis} axis`}>
        {axis}
      </button>
    );
  }

  const controlsDisabled = view.phase !== 'ready';
  const status = view.result?.status ?? null;

  return (
    <section
      className={controlsOpen
        ? 'fixed inset-0 z-[100] isolate flex min-h-0 min-w-0 flex-col bg-white'
        : 'relative isolate flex min-h-0 min-w-0 flex-col border border-stroke bg-white'}
      aria-label="Crystal structure viewer"
    >
      {controlsOpen && (
        <div className="flex flex-wrap items-center gap-1 border-b border-stroke bg-[#eef2f5] p-1">
          <button
            className="btn-w32 px-2"
            onClick={() => {
              runtimeRef.current?.setCellParametersVisible(false);
              setControlsOpen(false);
            }}
            aria-label="Back to quick search results"
          >
            ← Back to results
          </button>
          <span className="mx-1 h-5 w-px bg-stroke" />
          {(['atoms', 'ball-stick', 'spacefill'] as const).map((value) => (
            <button
              key={value}
              className={`btn-w32 px-2 ${representation === value ? 'btn-on' : ''}`}
              disabled={controlsDisabled}
              onClick={() => chooseRepresentation(value)}
            >
              {value === 'ball-stick' ? 'Ball + stick' : value === 'spacefill' ? 'Space fill' : 'Atoms'}
            </button>
          ))}
          <span className="mx-1 h-5 w-px bg-stroke" />
          <button className={`btn-w32 px-2 ${unitCellVisible ? 'btn-on' : ''}`} disabled={controlsDisabled} onClick={toggleUnitCell}>Cells</button>
          <button className={`btn-w32 px-2 ${labelsVisible ? 'btn-on' : ''}`} disabled={controlsDisabled} onClick={toggleLabels}>Labels</button>
          <button className="btn-w32 px-2" disabled={controlsDisabled} onClick={() => runtimeRef.current?.fitReset()}>Fit / reset</button>
          <span className="ml-auto text-[10px] text-text-dim">View down</span>
          <div className="contents" role="group" aria-label="Crystallographic axis view">
            {axisButton('a')}{axisButton('b')}{axisButton('c')}
          </div>
        </div>
      )}

      <div
        className="relative min-h-0 flex-1 overflow-hidden bg-[#071018]"
        onDoubleClickCapture={() => {
          if (!controlsOpen) {
            runtimeRef.current?.setCellParametersVisible(true);
            setControlsOpen(true);
          }
        }}
        title={controlsOpen ? undefined : 'Double-click to open viewer controls'}
      >
        <div ref={hostRef} className="absolute inset-0" data-testid="jsmol-host" />
        {view.phase !== 'ready' && (
          <div className="absolute inset-0 z-[10000] flex flex-col items-center justify-center bg-[#071018] px-6 text-center text-white">
            {view.phase === 'error' ? (
              <>
                <strong className="text-[#ffb4ab]">Could not display {view.pendingFileName}</strong>
                <span className="mt-2 max-w-md text-xs text-[#d7e3ee]">{view.message}</span>
              </>
            ) : (
              <>
                <span className="h-6 w-6 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                <strong className="mt-3">Preparing {view.pendingFileName || 'the local viewer'}</strong>
                <span className="mt-1 text-[10px] text-[#b8c7d5]">The previous structure remains concealed until this latest request finishes.</span>
              </>
            )}
          </div>
        )}
        {controlsOpen && view.phase === 'ready' && (
          <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-black/70 px-2 py-1 text-white shadow">
            <strong className="block text-xs">{view.result.fileName}</strong>
            <span className="text-[10px] text-[#d7e3ee]">1×1×1 unit cell</span>
          </div>
        )}
      </div>

      {controlsOpen && <div className="border-t border-stroke bg-[#f7f9fb] px-2 py-1 text-[10px] leading-4 text-[#33475b]" aria-live="polite">
        {status ? (
          <>
            <div>
              <b>Loaded:</b> {status.loaded ? 'yes' : 'no'} · <b>JSmol:</b> {status.runtimeVersion ?? 'unavailable'} · <b>Atoms:</b> {status.atomCount ?? 'unavailable'} · <b>Space group:</b> {status.spaceGroup ?? 'unavailable'}
            </div>
            <div>{status.unitCell ? formatUnitCell(status.unitCell) : 'Unit-cell parameters unavailable.'}</div>
            {status.warning && <div className="text-[#9a6700]">{status.warning}</div>}
          </>
        ) : (
          <span>JSmol structural evidence will appear after parsing.</span>
        )}
        <div className="text-text-dim">Ball + stick connections are radius-based visual suggestions, not verified chemical bonds.</div>
      </div>}
    </section>
  );
}
