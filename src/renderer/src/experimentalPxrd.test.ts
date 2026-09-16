import { describe, expect, it } from 'vitest';
import { normalizeExperimentalPxrd, parseExperimentalPxrd } from './experimentalPxrd';

describe('experimental PXRD import', () => {
  it('reads headers, comments, CSV, scientific notation and descending scans', () => {
    expect(parseExperimentalPxrd('\uFEFF2theta,intensity\r\n# scan\r\n20,2e2\r\n10,100 # point')).toEqual([
      { twoTheta: 10, intensity: 100 }, { twoTheta: 20, intensity: 200 }
    ]);
  });
  it('reads whitespace data and retains negative background values', () => {
    expect(parseExperimentalPxrd('10\t-2\n11  4')[0].intensity).toBe(-2);
  });
  it('rejects malformed rows rather than joining across missing data', () => {
    expect(() => parseExperimentalPxrd('10 1\n11 bad\n12 2')).toThrow('Line 2');
    expect(() => parseExperimentalPxrd('10 1 3\n11 2 4')).toThrow('two numeric columns');
    expect(() => parseExperimentalPxrd('10 1\n181 2')).toThrow('invalid angle');
  });
  it('rejects empty or single-angle patterns', () => {
    expect(() => parseExperimentalPxrd('# empty')).toThrow('at least two');
    expect(() => parseExperimentalPxrd('10 1\n10 2')).toThrow('different angles');
  });
  it('normalizes without mutating data or changing angles', () => {
    const points = parseExperimentalPxrd('10 -10\n11 50\n12 200');
    expect(normalizeExperimentalPxrd(points).map(point => point.intensity)).toEqual([-5, 25, 100]);
    expect(points[2].intensity).toBe(200);
    expect(() => normalizeExperimentalPxrd(parseExperimentalPxrd('10 0\n11 0'))).toThrow('positive intensity');
  });
});
