import coefficients from '../../shared/it92.json';

// Neutral-atom IT92, unnormalized coefficients from Gemmi 0.7.5.
// See third_party/gemmi and docs/scientific-validity.md for provenance/limits.
export function xrayFormFactor(symbol: string, sSquared: number): number | null {
  const values = (coefficients as Record<string, number[]>)[symbol];
  if (!values || !Number.isFinite(sSquared) || sSquared < 0 || sSquared >= 4) return null;
  return values[8] + values.slice(0, 4).reduce((sum, a, i) => sum + a * Math.exp(-values[i + 4] * sSquared), 0);
}
