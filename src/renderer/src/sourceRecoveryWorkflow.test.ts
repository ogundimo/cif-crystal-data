import { expect, it, vi } from 'vitest';
import type { EntryRow, SourceRecoveryResult } from '../../shared/types';
import { createRecoveryWorkflow } from './sourceRecoveryWorkflow';

const entry = { id: 7 } as EntryRow;
const preview: SourceRecoveryResult = { eligible: true, token: 'reviewed' };
function setup() {
  const sourceRecovery = vi.fn().mockResolvedValue({ eligible: true, candidates: [] });
  const completed = vi.fn();
  const model = createRecoveryWorkflow(entry, { sourceRecovery }, completed);
  return { model, sourceRecovery, completed };
}

it('inspects and opens candidates without mutating sources', async () => {
  const t = setup(), changed = vi.fn(), unsubscribe = t.model.subscribe(changed);
  await t.model.inspect(); expect(t.model.snapshot().overview?.eligible).toBe(true);
  t.model.open(); t.model.openCandidate({ id: 11 } as EntryRow);
  expect(t.completed).toHaveBeenCalledWith({ id: 11 }); expect(t.sourceRecovery).toHaveBeenCalledOnce();
  expect(changed).toHaveBeenCalled(); unsubscribe(); changed.mockClear(); t.model.close(); expect(changed).not.toHaveBeenCalled();
});

it('requires review for each chosen block and passes only the preview token', async () => {
  const t = setup(); t.model.open(); await t.model.confirm(); expect(t.sourceRecovery).not.toHaveBeenCalled();
  t.sourceRecovery.mockResolvedValue(preview); await t.model.chooseCif();
  await t.model.confirm(); expect(t.sourceRecovery).toHaveBeenCalledOnce();
  t.model.acknowledge(true); t.model.select(1); expect(t.model.snapshot().confirmed).toBe(false);
  t.model.acknowledge(true); t.sourceRecovery.mockResolvedValue({ eligible: true, completed: 'recovered', entry });
  await t.model.confirm(); expect(t.sourceRecovery).toHaveBeenLastCalledWith({ action: 'confirm', entryId: 7, token: 'reviewed', choice: 1 });
  t.model.close(); expect(t.completed).toHaveBeenCalledWith(entry);
});

it('keeps state on picker cancellation and reports file errors', async () => {
  const t = setup(); t.sourceRecovery.mockResolvedValue({ eligible: true, cancelled: true });
  await t.model.chooseCif(); expect(t.model.snapshot().preview).toBeNull();
  t.sourceRecovery.mockRejectedValue(new Error('Invalid backup')); await t.model.chooseCif();
  expect(t.model.snapshot().error).toBe('Invalid backup');
  t.sourceRecovery.mockRejectedValue('Unavailable'); await t.model.chooseCif(); expect(t.model.snapshot().error).toBe('Unavailable');
  t.model.close(); expect(t.completed).not.toHaveBeenCalled();
});

it('holds confirmation and close actions while busy, then completes removal without a snapshot', async () => {
  const t = setup(); t.model.open(); let finish!: (result: SourceRecoveryResult) => void;
  t.sourceRecovery.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const pending = t.model.prepareRemove(); await t.model.chooseCif(); t.model.close(); t.model.openCandidate(entry);
  expect(t.sourceRecovery).toHaveBeenCalledOnce(); expect(t.completed).not.toHaveBeenCalled(); expect(t.model.snapshot().open).toBe(true);
  finish({ eligible: true, token: 'remove', removal: true }); await pending;
  t.sourceRecovery.mockResolvedValue({ eligible: true, completed: 'removed' });
  await t.model.confirm(); t.model.close(); expect(t.completed).toHaveBeenCalledWith(undefined);
});

it('ignores late previews and inspections after selection changes', async () => {
  const t = setup(); let finish!: (value: SourceRecoveryResult) => void;
  t.sourceRecovery.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const inspection = t.model.inspect(); t.model.dispose(); finish({ eligible: true }); await inspection;
  expect(t.model.snapshot().overview).toBeNull();
  const previewing = t.model.chooseCif(); t.model.dispose(); finish(preview); await previewing;
  expect(t.model.snapshot().preview).toBeNull();
});

it('allows an inspection retry after a busy database', async () => {
  const t = setup(); t.sourceRecovery.mockRejectedValue(new Error('Busy')); await t.model.inspect();
  expect(t.model.snapshot().error).toContain('temporarily unavailable');
  t.sourceRecovery.mockResolvedValue({ eligible: false }); await t.model.inspect();
  expect(t.model.snapshot().error).toBe(''); expect(t.model.snapshot().overview?.eligible).toBe(false);
});
