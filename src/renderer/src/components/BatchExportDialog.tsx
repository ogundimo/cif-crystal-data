import { useEffect, useMemo, useRef, useState } from 'react';
import type { BatchExportProgress, BatchExportRequest, BatchExportResult, BatchExportScope, SearchFilter } from '../../../shared/types';

export default function BatchExportDialog({ currentId, selectionScope, selectionCount, filter, onClose, onBusy }: {
  currentId: number | null; selectionScope: BatchExportScope; selectionCount: number; filter: SearchFilter | null; onClose: () => void; onBusy: (busy: boolean) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [kind, setKind] = useState<'current' | 'selected' | 'matching'>(selectionCount === 1 && selectionScope.kind === 'selected' ? 'current' : selectionCount ? 'selected' : filter ? 'matching' : 'current');
  const [mode, setMode] = useState<BatchExportRequest['mode']>('both');
  const [count, setCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [progress, setProgress] = useState<BatchExportProgress | null>(null);
  const [result, setResult] = useState<BatchExportResult | null>(null);
  const [singleMessage, setSingleMessage] = useState('');
  const [error, setError] = useState('');
  const scope = useMemo<BatchExportScope>(() => kind === 'selected' ? selectionScope
    : { kind: 'matching', filter: filter ?? { slot1: [], slot2: [], mode: 'AND' } }, [kind, selectionScope, filter]);
  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => window.cifApi.onBatchExportProgress(setProgress), []);
  useEffect(() => {
    let active = true;
    setCount(null); setError(''); setResult(null); setSingleMessage('');
    if (kind === 'current') { setCount(currentId === null ? 0 : 1); return; }
    window.cifApi.countBatchExport(scope).then(value => { if (active) setCount(value); }, reason => {
      if (active) setError(String(reason));
    });
    return () => { active = false; };
  }, [scope, kind, currentId]);
  async function start() {
    if (!count || busy) return;
    setBusy(true); onBusy(true); setCancelling(false); setResult(null); setProgress(null); setError(''); setSingleMessage('');
    try {
      if (kind === 'current' && currentId !== null) {
        const saved = await window.cifApi.exportCif(currentId);
        setSingleMessage(saved.exported ? `Exported ${saved.fileName ?? 'CIF file'}` : 'Export cancelled.');
      } else setResult(await window.cifApi.batchExport({ scope, mode, expectedCount: count }));
    }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); onBusy(false); }
  }
  function close() { dialog.current?.close(); onClose(); }
  return <dialog ref={dialog} role="dialog" aria-modal="true" aria-labelledby="batch-export-title" onCancel={event => {
    event.preventDefault(); if (!busy) close();
  }} className="w-[min(36rem,90vw)] rounded border border-stroke bg-white p-5 shadow-xl backdrop:bg-black/30">
    <h2 id="batch-export-title" className="mb-3 text-lg font-semibold">Export</h2>
    <fieldset disabled={busy} className="flex flex-col gap-2">
      <legend className="font-semibold">Export scope</legend>
      <label><input type="radio" name="batch-scope" checked={kind === 'current'} disabled={currentId === null} onChange={() => setKind('current')} /> {selectionCount === 1 && selectionScope.kind === 'selected' ? 'Selected structure (CIF file)' : 'Focused structure (CIF file)'}</label>
      <label><input type="radio" name="batch-scope" disabled={!selectionCount} checked={kind === 'selected'} onChange={() => setKind('selected')} /> Selected structures ({selectionCount})</label>
      <label><input type="radio" name="batch-scope" checked={kind === 'matching'} disabled={!filter} onChange={() => setKind('matching')} /> All matching the current search (including unloaded rows)</label>
      {kind !== 'current' && <label>Format <select aria-label="Batch export format" value={mode} onChange={event => setMode(event.target.value as BatchExportRequest['mode'])} className="border p-1">
        <option value="both">CIF files and CSV summary</option><option value="cif">CIF files and outcome report</option><option value="csv">CSV summary only</option>
      </select></label>}
    </fieldset>
    {kind === 'current' ? <>
      <p className="my-3">Save this structure as a CIF file. Choose a new filename in the save dialog.</p>
      {singleMessage && <p role="status">{singleMessage}</p>}
    </> : <BatchStatus count={count} busy={busy} progress={progress} result={result} />}
    {error && <p role="alert" className="my-2 text-red-700">{error}</p>}
    <div className="mt-4 flex justify-end gap-2">
      {busy ? kind === 'current' ? <span role="status">Waiting for save dialog…</span> : <button className="btn-w32" disabled={cancelling} onClick={async () => {
        setCancelling(true);
        try { await window.cifApi.cancelBatchExport(); } catch (reason) { setError(String(reason)); setCancelling(false); }
      }}>{cancelling ? 'Cancelling…' : 'Cancel export'}</button> : <>
        <button className="btn-w32" onClick={close}>Close</button>
        <button className="btn-w32" disabled={!count} onClick={start}>{kind === 'current' ? 'Save CIF…' : `Choose folder and export ${count ?? 0}`}</button>
      </>}
    </div>
  </dialog>;
}

function BatchStatus({ count, busy, progress, result }: {
  count: number | null; busy: boolean; progress: BatchExportProgress | null; result: BatchExportResult | null;
}) {
  return (
    <><p className="my-3 font-semibold" role="status">{count === null ? 'Counting structures…' : `${count} structures will be requested.`}</p>
    <p className="my-2 text-sm">Choose a destination folder; a new cif-export subfolder will be created. Entries export in stable ID order. Import, refresh, clear and restore are unavailable until export finishes.</p>
    <p className="my-2 text-sm">Cancel stops before the next entry. Completed files remain; the CSV records failed and not-attempted entries. Formula-like CSV text receives a reversible leading apostrophe.</p>

    {busy && <div role="status"><progress aria-label="Batch export progress" max={progress?.total ?? count ?? 1} value={(progress?.completed ?? 0) + (progress?.failed ?? 0)} /> {progress ? `${progress.completed} completed, ${progress.failed} failed of ${progress.total}` : 'Waiting for destination…'}</div>}
    {result && <div role="status" className="my-3 border p-2">
      <b>{result.error ? 'Export incomplete' : result.cancelled ? 'Export cancelled' : result.failed ? 'Export finished with failures' : 'Export completed'}</b>
      <p>{result.completed} completed; {result.failed} failed; {result.notAttempted} not attempted.</p>
      <p>Folder: {result.folderName}{result.reportName ? ` / ${result.reportName}` : ''}</p>
      {result.error && <p>{result.error}</p>}
    </div>}
    </>
  );
}
