import { describe, expect, it, vi } from 'vitest';
import { createSearchController } from './searchController';
import type { EntryRow, SearchFilter, SearchPageResult } from '../../shared/types';
const filter: SearchFilter = { slot1: ['Fe'], slot2: [], mode: 'AND' };
const row = (id: number) => ({ id } as EntryRow);
function deferred() {
  let resolve!: (value: SearchPageResult) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<SearchPageResult>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function setup() {
  const requests: ReturnType<typeof deferred>[] = [];
  const searchPage = vi.fn(() => { const pending = deferred(); requests.push(pending); return pending.promise; });
  const changed = vi.fn(); const error = vi.fn();
  const controller = createSearchController({ searchPage }, changed, error);
  const state = () => changed.mock.lastCall![0];
  return { controller, searchPage, requests, error, state };
}
describe('renderer search lifecycle', () => {
  it('selects across pages, preserves IDs through sorting, and resets selection with a new search', async () => {
    const t = setup(); const initial = t.controller.search(filter);
    t.requests[0].resolve({ rows: [row(8), row(3)], total: 4 }); await initial;
    t.controller.select(3);
    const page = t.controller.loadMore();
    t.requests[1].resolve({ rows: [row(12), row(6)], total: 4 }); await page;
    t.controller.select(6, { range: true });
    expect([...t.state().selection.ids]).toEqual([3, 12, 6]);
    const sorted = t.controller.sort('formula', 'desc');
    t.requests[2].resolve({ rows: [row(6), row(12)], total: 4 }); await sorted;
    expect([...t.state().selection.ids]).toEqual([3, 12, 6]);
    expect(t.state().selection.anchor).toBeNull();
    t.controller.select(12, { range: true });
    expect([...t.state().selection.ids]).toEqual([6, 12]);
    const again = t.controller.search(filter);
    t.requests[3].resolve({ rows: [row(8)], total: 4 }); await again;
    expect([...t.state().selection.ids]).toEqual([8]);
  });
  it('selects all unloaded matches symbolically and clears without changing details', async () => {
    const t = setup(); const initial = t.controller.search(filter);
    t.requests[0].resolve({ rows: [row(1), row(2)], total: 200_000 }); await initial;
    t.controller.selectAll();
    expect(t.state().selection).toMatchObject({ all: true, ids: new Set() });
    expect(t.searchPage).toHaveBeenCalledTimes(1);
    t.controller.select(2, { toggle: true });
    expect(t.state().selection).toMatchObject({ all: true, ids: new Set([2]) });
    t.controller.select(1, { focusOnly: true });
    expect(t.state().selection.ids).toEqual(new Set([2]));
    t.controller.clearSelection();
    expect(t.state().selection).toMatchObject({ all: false, ids: new Set() });
    expect(t.state().selectedEntryId).toBe(1);
    t.controller.select(999); expect(t.state().selectedEntryId).toBe(1);
    t.controller.openEntry(row(9)); t.controller.selectAll();
    expect(t.state().selection).toMatchObject({ all: false, ids: new Set([9]) });
  });
  it('keeps the prior selection and reports an excessive range', async () => {
    const t = setup(); const initial = t.controller.search(filter);
    t.requests[0].resolve({ rows: Array.from({ length: 100_001 }, (_, i) => row(i + 1)), total: 100_001 }); await initial;
    t.controller.select(100_001, { range: true });
    expect(t.error).toHaveBeenCalledWith('select structures', expect.objectContaining({ message: expect.stringContaining('100,000') }));
    expect(t.state().selectedEntryId).toBe(1);
    expect(t.state().selection.ids).toEqual(new Set([1]));
  });
  it('opens a recovery candidate without stale search responses replacing it', async () => {
    const t = setup(); const pending = t.controller.search(filter);
    t.controller.openEntry(row(9));
    t.requests[0].resolve({ rows: [row(1)], total: 1 }); await pending;
    expect(t.state()).toMatchObject({ entries: [row(9)], selectedEntryId: 9, total: 1, busy: false });
    await t.controller.refresh(); expect(t.state().entries).toEqual([]);
  });
  it('refreshes the active search after removal', async () => {
    const t = setup(); const initial = t.controller.search(filter);
    t.requests[0].resolve({ rows: [row(1), row(2)], total: 2 }); await initial;
    const refreshed = t.controller.refresh();
    t.requests[1].resolve({ rows: [row(2)], total: 1 }); await refreshed;
    expect(t.state()).toMatchObject({ entries: [row(2)], selectedEntryId: 2, total: 1 });
  });
  it('hands off filters, replaces results, selects the first row, pages once and preserves selection', async () => {
    const t = setup(); const first = t.controller.search(filter);
    expect(t.searchPage).toHaveBeenCalledWith({ filter, offset: 0, limit: 500 });
    expect(t.state().busy).toBe(true);
    t.requests[0].resolve({ rows: [row(1)], total: 2 }); await first;
    expect(t.state()).toMatchObject({ selectedEntryId: 1, active: true, busy: false, total: 2 });
    t.controller.select(1);
    const page = t.controller.loadMore(); await t.controller.loadMore();
    expect(t.searchPage).toHaveBeenCalledTimes(2);
    expect(t.searchPage.mock.lastCall).toEqual([{ filter, offset: 1, limit: 500 }]);
    t.requests[1].resolve({ rows: [row(2)], total: 2 }); await page;
    expect(t.state().entries.map((r: EntryRow) => r.id)).toEqual([1, 2]);
    expect(t.state().selectedEntryId).toBe(1);
    await t.controller.loadMore(); expect(t.searchPage).toHaveBeenCalledTimes(2);
  });
  it('ignores late success and rejection without clearing the current busy state', async () => {
    const t = setup(); const old = t.controller.search(filter);
    const current = t.controller.search({ ...filter, sgQuery: '1' });
    t.requests[0].reject(new Error('obsolete')); await old;
    expect(t.error).not.toHaveBeenCalled(); expect(t.state().busy).toBe(true);
    t.requests[1].resolve({ rows: [row(7)], total: 1 }); await current;
    const late = t.controller.sort('formula', 'desc');
    const newer = t.controller.search(filter);
    t.requests[3].resolve({ rows: [row(8)], total: 1 }); await newer;
    t.requests[2].resolve({ rows: [row(9)], total: 1 }); await late;
    expect(t.state().selectedEntryId).toBe(8);
  });
  it('does not allow stale paging/sort errors to replace a new search', async () => {
    for (const action of ['page', 'sort']) {
      const t = setup(); const initial = t.controller.search(filter);
      t.requests[0].resolve({ rows: [row(1)], total: 3 }); await initial;
      const old = action === 'page' ? t.controller.loadMore() : t.controller.sort('formula', 'asc');
      const current = t.controller.search(filter);
      t.requests[2].resolve({ rows: [], total: 0 }); await current;
      t.requests[1].reject(new Error('obsolete')); await old;
      expect(t.error).not.toHaveBeenCalled();
      expect(t.state()).toMatchObject({ entries: [], total: 0, selectedEntryId: null, busy: false, active: true });
    }
  });
  it('reports current failures and permits retry without mixing sort orders', async () => {
    const t = setup(); const first = t.controller.search(filter);
    t.requests[0].reject(new Error('validation failed')); await first;
    expect(t.error).toHaveBeenCalledWith('search entries', expect.any(Error));
    expect(t.state().busy).toBe(false);
    const retry = t.controller.search(filter);
    t.requests[1].resolve({ rows: [row(1)], total: 2 }); await retry;
    const sort = t.controller.sort('reference', 'desc');
    expect(t.searchPage.mock.lastCall).toEqual([{ filter, offset: 0, limit: 500, sortColumn: 'reference', sortDirection: 'desc' }]);
    t.requests[2].reject(new Error('sort failed')); await sort;
    await t.controller.loadMore(); expect(t.requests).toHaveLength(3);
    const sorted = t.controller.sort('reference', 'desc');
    t.requests[3].resolve({ rows: [row(2)], total: 2 }); await sorted;
    const page = t.controller.loadMore();
    expect(t.searchPage.mock.lastCall).toEqual([{ filter, offset: 1, limit: 500, sortColumn: 'reference', sortDirection: 'desc' }]);
    t.requests[4].reject(new Error('page failed')); await page;
    expect(t.error).toHaveBeenLastCalledWith('load more search results', expect.any(Error));
    expect(t.state().entries).toEqual([row(2)]);
  });
  it('clears empty criteria and reset invalidates in-flight work', async () => {
    const t = setup(); const initial = t.controller.search(filter);
    t.controller.reset(); t.requests[0].resolve({ rows: [row(1)], total: 1 }); await initial;
    expect(t.state()).toMatchObject({ entries: [], busy: false, active: false, selectedEntryId: null });
    await t.controller.search({ slot1: [], slot2: [], mode: 'AND', referenceQuery: ' ' });
    expect(t.requests).toHaveLength(1);
    await t.controller.sort('formula'); await t.controller.loadMore(); expect(t.requests).toHaveLength(1);
  });
  it.each([
    { aMin: 0 }, { slot3: ['Na'] }, { elementCountQuery: '2' }, { level: 'cell' },
    { elementSelections: [{ elements: [], groups: [1], periods: [] }] },
    { elementSelection: { elements: [], groups: [], periods: [1] } }
  ])('recognizes supported criteria %j', async extra => {
    const t = setup(); const pending = t.controller.search({ slot1: [], slot2: [], mode: 'AND', ...extra });
    expect(t.requests).toHaveLength(1); t.requests[0].resolve({ rows: [], total: 0 }); await pending;
  });
});
