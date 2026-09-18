import { describe, expect, it } from 'vitest';
import { MAX_PATTERN_BYTES, parsePersonalPattern } from './patternComparison';

describe('personal XY input', () => {
  it('accepts export comments, scientific notation and CRLF; preserves source values', () => {
    const pattern = parsePersonalPattern('# exported metadata\r\n2theta\tintensity\r\n5 2e1\r\n6 40 # peak\r\n', 'sample.xy');
    expect(pattern.original.map(p => p.intensity)).toEqual([20, 40]);
    expect(pattern.normalized.map(p => p.intensity)).toEqual([50, 100]);
    expect(pattern.normalized.map(p => p.twoTheta)).toEqual([5, 6]);
  });
  it.each([
    ['', /two/], ['5 0\n6 0', /positive/], ['5 1', /two/],
    ['5 1\n5 2', /duplicates/], ['6 1\n5 2', /increase/],
    ['5 -1\n6 2', /negative/], ['5 NaN\n6 2', /numeric/],
    ['5 1e999\n6 2', /finite/], ['181 1\n182 2', /180/],
    ['5 1 2\n6 2', /two numeric/], ['angle intensity\n5 1\n6 2', /headers/]
  ])('rejects invalid input %s', (text, error) => expect(() => parsePersonalPattern(text, 'bad.xy')).toThrow(error));
  it('bounds bytes and point count', () => {
    expect(() => parsePersonalPattern(' '.repeat(MAX_PATTERN_BYTES + 1), 'large.xy')).toThrow(/4 MiB/);
    expect(() => parsePersonalPattern(Array.from({ length: 100001 }, (_, i) => `${i / 1000} 1`).join('\n'), 'large.xy')).toThrow(/100,000/);
  });
  it('normalizes extremely large finite values without overflow', () => {
    expect(parsePersonalPattern('5 1e308\n6 5e307', 'large.xy').normalized.map(p => p.intensity)).toEqual([100, 50]);
  });
});
