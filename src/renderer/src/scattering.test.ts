import { describe, expect, it } from 'vitest';
import { xrayFormFactor } from './scattering';

describe('neutral IT92 form-factor domain', () => {
  it.each([NaN, Infinity, -Infinity, -0.01, 4, 5])('rejects s squared %s', value => {
    expect(xrayFormFactor('Na', value)).toBeNull();
  });
  it('rejects missing coefficients and retains the zero-angle sum', () => {
    expect(xrayFormFactor('Unknown', 0)).toBeNull();
    // Independent decimal transcription; Gemmi stores single-precision coefficients.
    // 5e-6 absolute tolerance accommodates their representation, not model changes.
    expect(xrayFormFactor('Na', 0)).toBeCloseTo(4.7626 + 3.1736 + 1.2674 + 1.1128 + .676, 5);
    expect(xrayFormFactor('Na', 3.999)).not.toBeNull();
  });
});
