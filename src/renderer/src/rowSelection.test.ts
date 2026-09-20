import { describe, expect, it } from 'vitest';
import { emptySelection, selectRow } from './rowSelection';

const rows = [8, 3, 12, 6, 1];
describe('Explorer row selection', () => {
  it('replaces, toggles, and moves focus without changing selection', () => {
    const one = selectRow(emptySelection(), rows, 3, {}, null);
    const two = selectRow(one, rows, 6, { toggle: true }, 3);
    expect([...two.ids]).toEqual([3, 6]);
    expect(selectRow(two, rows, 12, { focusOnly: true }, 6)).toBe(two);
    expect([...selectRow(two, rows, 3, { toggle: true }, 6).ids]).toEqual([6]);
    expect([...selectRow(two, rows, 1, {}, 6).ids]).toEqual([1]);
    expect(selectRow(two, rows, 99, {}, 6)).toBe(two);
  });
  it('extends and shrinks ranges in displayed order with a stable anchor', () => {
    const one = selectRow(emptySelection(), rows, 3, {}, null);
    const range = selectRow(one, rows, 1, { range: true }, 3);
    expect([...range.ids]).toEqual([3, 12, 6, 1]);
    expect([...selectRow(range, rows, 12, { range: true }, 1).ids]).toEqual([3, 12]);
    expect([...selectRow(range, rows, 8, { range: true }, 1).ids]).toEqual([8, 3]);
    expect([...selectRow(range, rows, 8, { range: true, toggle: true }, 1).ids]).toEqual([3, 12, 6, 1, 8]);
  });
  it('uses focus as the range anchor after clearing and falls back when an anchor is absent', () => {
    expect([...selectRow(emptySelection(), rows, 1, { range: true }, 12).ids]).toEqual([12, 6, 1]);
    expect([...selectRow({ ...emptySelection(), anchor: 99 }, rows, 1, { range: true }, 12).ids]).toEqual([1]);
    expect([...selectRow(emptySelection(), rows, 1, { range: true }, null).ids]).toEqual([1]);
  });
  it('supports all matches with exclusions, including additive ranges', () => {
    const all = { all: true, ids: new Set<number>(), anchor: 3 };
    const excluded = selectRow(all, rows, 6, { toggle: true }, 3);
    expect(excluded.all).toBe(true); expect([...excluded.ids]).toEqual([6]);
    expect(selectRow(excluded, rows, 6, { toggle: true }, 6).ids.size).toBe(0);
    expect(selectRow(excluded, rows, 1, { toggle: true, range: true }, 6).ids.size).toBe(0);
    expect(selectRow(excluded, rows, 1, { range: true }, 6)).toMatchObject({ all: false, ids: new Set([6, 1]) });
  });
  it('rejects excessive explicit selections without modifying the previous state', () => {
    const many = Array.from({ length: 100_001 }, (_, i) => i + 1);
    const initial = selectRow(emptySelection(), many, 1, {}, null);
    expect(() => selectRow(initial, many, 100_001, { range: true }, 1)).toThrow('100,000');
    expect(initial.ids.size).toBe(1);
  });
});
