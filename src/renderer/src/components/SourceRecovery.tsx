import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import type { EntryRow } from '../../../shared/types';
import { formatFormula } from '../formatFormula';
import { createRecoveryWorkflow } from '../sourceRecoveryWorkflow';
import type { RecoveryWorkflow } from '../sourceRecoveryWorkflow';
export default function SourceRecovery({ entry, onComplete }: { entry: EntryRow; onComplete?: (entry?: EntryRow) => void }) {
  const [workflow] = useState(() => createRecoveryWorkflow(entry, window.cifApi, updated => onComplete?.(updated)));
  const { overview, open, error } = useSyncExternalStore(workflow.subscribe, workflow.snapshot, workflow.snapshot);
  useEffect(() => {
    void workflow.inspect();
    return workflow.dispose;
  }, [workflow]);
  if (!overview && error) return <button className="btn-w32 mt-3 text-black" title={error} onClick={workflow.inspect}>Retry recovery options</button>;
  if (!overview?.eligible) return null;
  return <>
    <p className="mt-2 text-xs">The original CIF is unavailable for this entry. Its metadata is still searchable.</p>
    <button className="btn-w32 mt-3 text-black" onClick={workflow.open}>Resolve missing source…</button>
    {open && createPortal(<RecoveryDialog entry={entry} workflow={workflow} />, document.body)}
  </>;
}

export function RecoveryDialog({ entry, workflow }: { entry: EntryRow; workflow: RecoveryWorkflow }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return <dialog ref={dialogRef} aria-labelledby="source-recovery-title" className="w-[42rem] max-w-[95vw] max-h-[90vh] overflow-y-auto rounded border border-stroke bg-white p-5 text-sm text-black backdrop:bg-black/40"
    onCancel={event => { event.preventDefault(); workflow.close(); }}>
    <RecoveryContent entry={entry} workflow={workflow} />
  </dialog>;
}

export function RecoveryContent({ entry, workflow }: { entry: EntryRow; workflow: RecoveryWorkflow }) {
  const { overview, preview, choice, confirmed, busy, error, result } = workflow.snapshot();
  const selected = preview?.choices?.[choice];
  const removing = Boolean(preview?.removal);
  return <>
    <h2 id="source-recovery-title" className="mb-3 text-lg font-semibold">Resolve missing source</h2>
    <p><b>{entry.source_filename}</b> · {formatFormula(entry.formula)}</p><p className="mb-3">{entry.reference}</p>
    {result ? <>
      <p role="status">{result.completed === 'removed' ? 'The unavailable entry was removed.' : 'The source was recovered.'}</p>

      <button className="btn-w32" onClick={workflow.close}>Done</button>
    </> : <>
      <fieldset disabled={busy}>
        <p className="mb-2">Possible duplicates with working CIFs. Matching metadata alone does not prove they are the same structure.</p>
        <div className="max-h-40 overflow-y-auto">
          {overview?.candidates?.map(candidate => <div key={candidate.id} className="mb-2 border p-2">
            <p>{candidate.source_filename} · {formatFormula(candidate.formula)}</p><p>{candidate.reference}</p>
            <button className="btn-w32 mt-1" onClick={() => workflow.openCandidate(candidate)}>Open matching entry</button>
          </div>)}
          {!overview?.candidates?.length && <p>No working candidate was found in this database.</p>}
        </div>
        <div className="my-3 flex gap-2">
          <button className="btn-w32" onClick={workflow.chooseCif}>Locate CIF…</button>
          <button className="btn-w32 text-red-700" onClick={workflow.prepareRemove}>Delete this entry…</button>
        </div>
        {selected && <section className="my-3 border p-3" aria-label="Recovery comparison">
          <label>CIF block <select className="ml-2 border" value={choice} onChange={event => workflow.select(Number(event.target.value))}>
            {preview!.choices!.map(item => <option key={item.index} value={item.index}>{item.filename} — {item.block}</option>)}
          </select></label>
          <table className="my-2 w-full text-left"><thead><tr><th>Field</th><th>Current entry</th><th>Selected source</th></tr></thead><tbody>
            <tr><th>Formula</th><td>{formatFormula(entry.formula)}</td><td>{formatFormula(selected.formula)}</td></tr>
            <tr><th>Reference</th><td>{entry.reference}</td><td>{selected.reference}</td></tr>
            <tr><th>Cell (Å; degrees)</th><td>{[entry.cell_a_angstrom, entry.cell_b_angstrom, entry.cell_c_angstrom, entry.cell_angle_alpha, entry.cell_angle_beta, entry.cell_angle_gamma].join(', ')}</td><td>{selected.cell.join(', ')}</td></tr>
            <tr><th>Source block</th><td>{entry.source_filename}</td><td>{selected.block} ({selected.atoms} atom sites)</td></tr>
          </tbody></table>
          <p>This entry keeps its ID; its metadata will be replaced with the selected block. Other blocks in this file will be imported as separate entries. The original file will not be changed.</p>
          <label className="mt-2 block"><input type="checkbox" checked={confirmed} onChange={event => workflow.acknowledge(event.target.checked)} /> I confirm this is the source I want to associate with this entry. Without an original fingerprint, its historical identity cannot be verified.</label>
        </section>}
        {removing && <section className="mt-3 border border-red-300 p-3" aria-label="Delete entry confirmation">
          <p>Delete {entry.source_filename} (entry #{entry.id}) from the app?</p>
          <p className="mt-2">This deletes its saved metadata. Other entries and original CIF files are unaffected.</p>
        </section>}
        <div className="sticky bottom-0 mt-4 flex justify-end gap-2 border-t bg-white py-2">
          <button className="btn-w32" onClick={workflow.close}>Cancel</button>
          {preview?.token && <button className="btn-w32" disabled={!removing && !confirmed} onClick={workflow.confirm}>{removing ? 'Delete entry' : 'Confirm recovery'}</button>}
        </div>
      </fieldset>
      {busy && <p role="status">Checking sources…</p>}
      {error && <p role="alert" className="mt-3 text-red-700">{error}</p>}
    </>}
  </>;
}
