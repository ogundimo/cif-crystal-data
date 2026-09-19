import type { CifApi, EntryRow, SearchFilter, SearchSortColumn } from '../../shared/types';

interface SearchState {
  entries: EntryRow[];
  selectedEntryId: number | null;
  total: number;
  active: boolean;
  busy: boolean;
  sort: { column?: SearchSortColumn; direction?: 'asc' | 'desc' };
}
const emptyState = (): SearchState => ({ entries: [], selectedEntryId: null, total: 0, active: false, busy: false, sort: {} });

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
      update({ entries: append ? [...state.entries, ...result.rows] : result.rows,
        total: result.total, active: true,
        selectedEntryId: append ? state.selectedEntryId : result.rows[0]?.id ?? null });
    } catch (reason) { if (id === generation) error(action, reason); }
    finally { if (id === generation) update({ busy: false }); }
  };
  return {
    openEntry: (entry: EntryRow) => {
      generation++; filter = null;
      update({ entries: [entry], selectedEntryId: entry.id, total: 1, active: true, busy: false, sort: {} });
    },
    refresh: async () => { if (filter) await request(false, 'refresh search results'); else reset(); },
    reset,
    select: (id: number) => update({ selectedEntryId: id }),
    search: async (next: SearchFilter) => {
      reset();
      if (!hasCriteria(next)) return;
      filter = structuredClone(next);
      await request(false, 'search entries');
    },
    loadMore: async () => {
      if (!filter || state.busy || state.entries.length >= state.total) return;
      await request(true, 'load more search results');
    },
    sort: async (column?: SearchSortColumn, direction?: 'asc' | 'desc') => {
      if (!filter) return;
      // Discard the old order so a failed sort cannot append pages with a new order.
      update({ entries: [], selectedEntryId: null, total: 0, sort: { column, direction } });
      await request(false, 'sort search results');
    }
  };
}
