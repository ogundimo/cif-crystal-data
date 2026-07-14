import { describe, expect, it } from 'vitest';
import { calculateVirtualRowWindow } from './virtualRows';

const baseOptions = {
  rowCount: 10_000,
  viewportHeight: 400,
  rowHeight: 20,
  headerHeight: 25,
  overscan: 8
};

describe('calculateVirtualRowWindow', () => {
  it('renders the first viewport plus overscan at the top', () => {
    expect(calculateVirtualRowWindow({ ...baseOptions, scrollTop: 0 })).toEqual({
      start: 0,
      end: 28,
      paddingTop: 0,
      paddingBottom: 199_440
    });
  });

  it('returns a bounded deep-scroll slice with matching spacer heights', () => {
    const result = calculateVirtualRowWindow({ ...baseOptions, scrollTop: 180_025 });
    expect(result).toEqual({
      start: 8_992,
      end: 9_028,
      paddingTop: 179_840,
      paddingBottom: 19_440
    });
    expect(result.end - result.start).toBeLessThan(50);
  });

  it('clamps a stale scroll position after the result set shrinks', () => {
    expect(
      calculateVirtualRowWindow({ ...baseOptions, rowCount: 3, scrollTop: 100_000 })
    ).toEqual({ start: 2, end: 3, paddingTop: 40, paddingBottom: 0 });
  });

  it('handles an empty result set', () => {
    expect(calculateVirtualRowWindow({ ...baseOptions, rowCount: 0, scrollTop: 0 })).toEqual({
      start: 0,
      end: 0,
      paddingTop: 0,
      paddingBottom: 0
    });
  });
});
