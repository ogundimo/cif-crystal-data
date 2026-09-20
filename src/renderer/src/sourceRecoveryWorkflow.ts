import type { CifApi, EntryRow, SourceRecoveryRequest, SourceRecoveryResult } from '../../shared/types';

export function createRecoveryWorkflow(entry: EntryRow, api: Pick<CifApi, 'sourceRecovery'>, completed: (entry?: EntryRow) => void) {
  let state = { overview: null as SourceRecoveryResult | null, preview: null as SourceRecoveryResult | null,
    result: null as SourceRecoveryResult | null, open: false, busy: false, error: '', choice: 0, confirmed: false };
  let generation = 0;
  const listeners = new Set<() => void>();
  const update = (patch: Partial<typeof state>) => { state = { ...state, ...patch }; listeners.forEach(listener => listener()); };
  const run = async (request: SourceRecoveryRequest) => {
    if (state.busy) return;
    const current = generation;
    update({ busy: true, error: '' });
    try {
      const response = await api.sourceRecovery(request);
      if (current !== generation) return;
      if (response.completed) update({ result: response });
      else if (!response.cancelled) update({ preview: response, choice: 0, confirmed: false });
    } catch (reason) {
      if (current === generation) update({ error: reason instanceof Error ? reason.message : String(reason) });
    } finally { if (current === generation) update({ busy: false }); }
  };
  return {
    snapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    dispose: () => { generation++; },
    inspect: async () => {
      const current = generation;
      try {
        const overview = await api.sourceRecovery({ action: 'inspect', entryId: entry.id });
        if (current === generation) update({ overview, error: '' });
      } catch { if (current === generation) update({ error: 'Recovery options are temporarily unavailable. Try again after other data operations finish.' }); }
    },
    open: () => update({ open: true, preview: null, result: null, confirmed: false, error: '' }),
    close: () => {
      if (state.busy) return;
      update({ open: false });
      if (state.result) completed(state.result.entry);
    },
    openCandidate: (candidate: EntryRow) => { if (!state.busy) { update({ open: false }); completed(candidate); } },
    select: (choice: number) => update({ choice, confirmed: false }),
    acknowledge: (confirmed: boolean) => update({ confirmed }),
    chooseCif: () => run({ action: 'choose-cif', entryId: entry.id }),
    prepareRemove: () => run({ action: 'prepare-remove', entryId: entry.id }),
    confirm: async () => {
      if ((state.confirmed || state.preview?.removal) && state.preview?.token) await run({ action: 'confirm', entryId: entry.id, token: state.preview.token, choice: state.choice });
    }
  };
}
export type RecoveryWorkflow = ReturnType<typeof createRecoveryWorkflow>;
