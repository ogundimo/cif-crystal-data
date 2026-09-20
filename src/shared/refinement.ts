export const REFINEMENT_METHODS = ['lebail', 'pawley', 'rietveld'] as const;
export type RefinementMethod = typeof REFINEMENT_METHODS[number];
export const METHOD_LABELS: Record<RefinementMethod, string> = { lebail: 'Le Bail', pawley: 'Pawley', rietveld: 'Rietveld' };
export const XRAY_WAVELENGTHS = [
  { symbol: 'Cu', wavelength: 1.5406 }, { symbol: 'Mo', wavelength: 0.7107 },
  { symbol: 'Co', wavelength: 1.7902 }, { symbol: 'Ag', wavelength: 0.5609 }
] as const;
export interface ExperimentalPattern {
  id: string; fileName: string; folder: string;
  points: { twoTheta: number; intensity: number }[];
}
export interface RefinementSettings {
  method: RefinementMethod;
  spaceGroup: string;
  cell: [number, number, number, number, number, number];
  wavelength: number;
  range: [number, number];
  geometry: 'bragg_brentano' | 'debye_scherrer';
  radius: number | null;
  polarization: number;
  zero: number;
  profile: { u: number; v: number; w: number; x: number; y: number };
  shape: 'tchz_pv' | 'voigt';
  backgroundTerms: number;
  maxIterations: number;
  maxPasses: number;
  extractionCycles: number;
  refineCell: boolean; refineProfile: boolean; refineZero: boolean;
  refineCoordinates: boolean; refineBiso: boolean; refineOccupancy: boolean;
  parameterEdits: Record<string, number>;
}
export interface RefinementRequest {
  experimentalId: string; entryId: number; settings: RefinementSettings; checkpointId?: string;
}
export interface RefinementFrame {
  experimentalProfile?: number[][];
  rp?: number | null; gof?: number | null;
  profile: number[][]; range: [number, number]; rwp: number | null; ticks: Record<string, number[]>;
}
export interface RefinementMetric { iteration: number; rp: number | null; rwp: number | null; gof: number | null; }
export interface RefinementProgress { metric?: RefinementMetric; message: string; snapshot?: RefinementFrame; checkpoint?: string }
export interface RefinementResult extends RefinementFrame {
  status: 'converged' | 'max_iter' | 'diverged' | 'cancelled'; converged: boolean;
  method: RefinementMethod; engine: string; engineVersion: string;
  settings: RefinementSettings; warnings: string[]; cell: Record<string, number>; cellEsd: Record<string, number | null>;
  parameters: { path: string; value: number; vary: boolean; editable: boolean; min: number | null; max: number | null; unit?: string | null }[];
  gof: number | null; outputFolder: string; outputBase: string; files: string[]; checkpointId: string;
}
export interface ImportedCheckpoint {
  id: string; settings: RefinementSettings; experimental: ExperimentalPattern; status: string;
}
export function validateRefinementSettings(input: unknown): RefinementSettings {
  if (!input || typeof input !== 'object') throw new Error('Missing refinement settings.');
  const s = input as RefinementSettings;
  const number = (x: number, low: number, high: number, label: string) => {
    if (typeof x !== 'number' || !Number.isFinite(x) || x < low || x > high) throw new Error(`${label} must be between ${low} and ${high}.`);
  };
  if (!REFINEMENT_METHODS.includes(s.method)) throw new Error('Select a refinement method.');
  if (typeof s.spaceGroup !== 'string' || !s.spaceGroup.trim() || s.spaceGroup.length > 80) throw new Error('Space group is required.');
  if (!Array.isArray(s.cell) || s.cell.length !== 6) throw new Error('Six cell parameters are required.');
  s.cell.forEach((v, i) => number(v, .001, i < 3 ? 200 : 179.999, 'Cell parameter'));
  const [a, b, c] = s.cell.slice(3).map(v => Math.cos(v * Math.PI / 180));
  if (1 + 2*a*b*c - a*a - b*b - c*c <= 1e-10) throw new Error('Cell must have positive volume.');
  number(s.wavelength, .05, 5, 'Wavelength');
  if (!Array.isArray(s.range) || s.range.length !== 2) throw new Error('Fit range is required.');
  s.range.forEach(v => number(v, .001, 174.999, '2θ'));
  if (s.range[0] >= s.range[1]) throw new Error('Fit range must increase.');
  if (!['bragg_brentano', 'debye_scherrer'].includes(s.geometry)) throw new Error('Measurement geometry is required.');
  if (s.radius !== null) number(s.radius, 1, 10000, 'Goniometer radius');
  if (s.geometry === 'bragg_brentano' && s.radius === null) throw new Error('Goniometer radius is required for Bragg–Brentano geometry.');
  number(s.polarization, 0, 1, 'Polarization'); number(s.zero, -.5, .5, 'Zero shift');
  if (!s.profile || !['tchz_pv', 'voigt'].includes(s.shape)) throw new Error('Select a profile model.');
  for (const k of ['u', 'v', 'w', 'x', 'y'] as const) number(s.profile[k], k === 'u' ? -.05 : k === 'v' ? -.5 : 0, k === 'v' ? .5 : 1, `Profile ${k.toUpperCase()}`);
  for (const [value, high, label] of [[s.backgroundTerms, 12, 'Background terms'], [s.maxPasses, 30, 'Maximum Le Bail passes'], [s.maxIterations, 300, 'Maximum iterations'], [s.extractionCycles, 30, 'Extraction cycles']] as const) {
    number(value, 1, high, label); if (!Number.isInteger(value)) throw new Error(`${label} must be an integer.`);
  }
  for (const key of ['refineCell', 'refineProfile', 'refineZero', 'refineCoordinates', 'refineBiso', 'refineOccupancy'] as const) if (typeof s[key] !== 'boolean') throw new Error('Invalid refinement flags.');
  if (!s.parameterEdits || typeof s.parameterEdits !== 'object' || Array.isArray(s.parameterEdits) || Object.keys(s.parameterEdits).length > 2000) throw new Error('Invalid parameter edits.');
  for (const [key, value] of Object.entries(s.parameterEdits)) if (!/^(phases|instrument)\.[\w.]+$/.test(key) || !Number.isFinite(value)) throw new Error('Invalid parameter edit.');
  return { method: s.method, spaceGroup: s.spaceGroup.trim(), cell: [...s.cell], wavelength: s.wavelength, range: [...s.range],
    geometry: s.geometry, radius: s.radius, polarization: s.polarization, zero: s.zero, profile: { ...s.profile }, shape: s.shape,
    backgroundTerms: s.backgroundTerms, maxPasses: s.maxPasses, maxIterations: s.maxIterations, extractionCycles: s.extractionCycles,
    refineCell: s.refineCell, refineProfile: s.refineProfile, refineZero: s.refineZero, refineCoordinates: s.refineCoordinates,
    refineBiso: s.refineBiso, refineOccupancy: s.refineOccupancy, parameterEdits: { ...s.parameterEdits } };
}
