export interface RowSelection {
  all: boolean;
  /** Selected IDs, or excluded IDs when all search matches are selected. */
  ids: ReadonlySet<number>;
  anchor: number | null;
}

export interface SelectionGesture { toggle?: boolean; range?: boolean; focusOnly?: boolean; }

export const emptySelection = (): RowSelection => ({ all: false, ids: new Set(), anchor: null });

export function selectRow(selection: RowSelection, orderedIds: number[], id: number,
  gesture: SelectionGesture, focusedId: number | null): RowSelection {
  if (gesture.focusOnly) return selection;
  const target = orderedIds.indexOf(id);
  if (target < 0) return selection;
  if (gesture.range) {
    const anchorId = selection.anchor ?? focusedId ?? id;
    const anchor = orderedIds.indexOf(anchorId);
    const start = anchor < 0 ? target : anchor;
    const range = orderedIds.slice(Math.min(start, target), Math.max(start, target) + 1);
    const ids = new Set(gesture.toggle ? selection.ids : []);
    const all = gesture.toggle === true && selection.all;
    for (const entryId of range) { if (all) ids.delete(entryId); else ids.add(entryId); }
    return bounded({ all, ids, anchor: orderedIds[start] });
  }
  if (gesture.toggle) {
    const ids = new Set(selection.ids);
    if (ids.has(id)) ids.delete(id); else ids.add(id);
    return bounded({ ...selection, ids, anchor: id });
  }
  return { all: false, ids: new Set([id]), anchor: id };
}

function bounded(selection: RowSelection): RowSelection {
  if (selection.ids.size > 100_000) throw new Error('Select up to 100,000 individual structures, or use Ctrl+A for all search matches.');
  return selection;
}
