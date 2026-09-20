import { emptySelection, selectRow, type RowSelection, type SelectionGesture } from './rowSelection';
import type { CifApi, EntryRow, SearchFilter, SearchSortColumn } from '../../shared/types';

interface SearchState {
  selection: RowSelection;
  entries: EntryRow[];
  selectedEntryId: number | null;
  total: number;
  active: boolean;
  busy: boolean;
  sort: { column?: SearchSortColumn; direction?: 'asc' | 'desc' };
}
const emptyState = (): SearchState => ({ selection: emptySelection(), entries: [], selectedEntryId: null, total: 0, active: false, busy: false, sort: {} });

function hasCriteria(filter: SearchFilter): boolean {
  return [filter.slot1, filter.slot2, filter.slot3, filter.slot4].some(value => value?.length) ||
    [...(filter.elementSelections ?? []), ...(filter.elementSelection ? [filter.elementSelection] : [])]
      .some(value => value.elements.length || value.groups.length || value.periods.length) ||
    [filter.aMin, filter.aMax, filter.bMin, filter.bMax, filter.cMin, filter.cMax].some(value => value !== undefined) ||
    [filter.sgQuery, filter.spaceGroupQuery, filter.referenceQuery, filter.level, filter.elementCountQuery].some(value => value?.trim());
}

/** Owns the request generation, including failures and same-tick paging exclusion. */
export function createSearchController(api: Pick<CifApi, 'searchPage'>,
  changed: (state: SearchState) => void, error: (action: string, error: unknown) => void) {
  let state = emptyState();
  let generation = 0;
  let filter: SearchFilter | null = null;
  const update = (next: Partial<SearchState>) => { state = { ...state, ...next }; changed(state); };
  const reset = () => { generation++; filter = null; state = emptyState(); changed(state); };
  const request = async (append: boolean, action: string) => {
    if (!filter) return;
    const id = ++generation;
    const requestedFilter = filter;
    const requestedSort = state.sort;
    update({ busy: true });
    try {
      const result = await api.searchPage({ filter: requestedFilter,
        offset: append ? state.entries.length : 0, limit: 500,
        ...(requestedSort.column ? { sortColumn: requestedSort.column, sortDirection: requestedSort.direction } : {}) });
      if (id !== generation) return;
      const firstId = result.rows[0]?.id ?? null;
      const selection = !state.active && firstId !== null
        ? selectRow(emptySelection(), [firstId], firstId, {}, null) : state.selection;
      update({ selection, entries: append ? [...state.entries, ...result.rows] : result.rows,
        total: result.total, active: true,
        selectedEntryId: append ? state.selectedEntryId : result.rows[0]?.id ?? null });
    } catch (reason) { if (id === generation) error(action, reason); }
    finally { if (id === generation) update({ busy: false }); }
  };
  return {
    openEntry: (entry: EntryRow) => {
      generation++; filter = null;
      update({ selection: selectRow(emptySelection(), [entry.id], entry.id, {}, null), entries: [entry], selectedEntryId: entry.id, total: 1, active: true, busy: false, sort: {} });
    },
    refresh: async () => {
      if (!filter) { reset(); return; }
      update({ selection: emptySelection(), active: false });
      await request(false, 'refresh search results');
    },
    reset,
    select: (id: number, gesture: SelectionGesture = {}) => {
      if (!state.entries.some(entry => entry.id === id)) return;
      try {
        const selection = selectRow(state.selection, state.entries.map(entry => entry.id), id, gesture, state.selectedEntryId);
        update({ selectedEntryId: id, selection });
      } catch (reason) { error('select structures', reason); }
    },
    clearSelection: () => update({ selection: emptySelection() }),
    selectAll: () => {
      if (filter && state.active) update({ selection: { all: true, ids: new Set(), anchor: state.selectedEntryId } });
      else update({ selection: { all: false, ids: new Set(state.entries.map(entry => entry.id)), anchor: state.selectedEntryId } });
    },
    search: async (next: SearchFilter) => {
      reset();
      if (!hasCriteria(next)) return;
      filter = structuredClone(next);
      await request(false, 'search entries');
    },
    loadMore: async () => {
      if (!filter || state.busy || !state.entries.length || state.entries.length >= state.total) return;
      await request(true, 'load more search results');
    },
    sort: async (column?: SearchSortColumn, direction?: 'asc' | 'desc') => {
      if (!filter) return;
      // Discard the old order so a failed sort cannot append pages with a new order.
      update({ selection: { ...state.selection, anchor: null }, entries: [], selectedEntryId: null, sort: { column, direction } });
      await request(false, 'sort search results');
    }
  };
}
