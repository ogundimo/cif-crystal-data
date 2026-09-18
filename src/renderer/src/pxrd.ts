import type { AtomSiteRow, EntryRow, SymmetryOperationRow } from '../../shared/types';
import { ELEMENT_SYMBOLS } from '../../shared/periodicTableData';
import { xrayFormFactor } from './scattering';

export interface PxrdPeak {
  twoTheta: number;
  intensity: number;
  hkl: string;
}

interface PxrdProfilePoint {
  twoTheta: number;
  intensity: number;
}

type Vec3 = [number, number, number];
interface ExpandedAtom { position: Vec3; symbol: string; occupancy: number; bIso: number }

export interface PxrdResult {
  peaks: PxrdPeak[];
  diagnostics: string[];
  status: 'complete' | 'incomplete' | 'unsupported';
  wavelength: number;
  model: string;
}

const MODEL = 'IT92-neutral-v1';

const DEG = Math.PI / 180;
const DEFAULT_WAVELENGTH = 1.5406;
const MIN_TWO_THETA = 5;
const MAX_TWO_THETA = 80;
export const PXRD_FWHM_TWO_THETA = 0.1;

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function scale(v: Vec3, amount: number): Vec3 {
  return [v[0] * amount, v[1] * amount, v[2] * amount];
}

function parseCoordinate(expression: string, point: Vec3, wrap = true, includeTranslation = true): number | null {
  const compact = expression.toLowerCase().replace(/\s|\*/g, '');
  if (!/^[+-]?(?:\d*[xyz]|\d+(?:\/\d+)?)(?:[+-](?:\d*[xyz]|\d+(?:\/\d+)?))*$/.test(compact)) return null;
  let value = 0;
  for (const rawTerm of compact.replace(/-/g, '+-').split('+').filter(Boolean)) {
    const variable = rawTerm.match(/[xyz]/)?.[0];
    if (variable) {
      const coefficientText = rawTerm.replace(variable, '');
      const coefficient = coefficientText === '' ? 1 : coefficientText === '-' ? -1 : Number(coefficientText);
      if (!Number.isFinite(coefficient)) return null;
      value += coefficient * point['xyz'.indexOf(variable)];
    } else {
      const [numerator, denominator] = rawTerm.split('/').map(Number);
      const number = denominator === undefined ? numerator : numerator / denominator;
      if (!Number.isFinite(number)) return null;
      if (includeTranslation) value += number;
    }
  }
  return wrap ? ((value % 1) + 1) % 1 : value;
}

function applySymmetry(operation: string, point: Vec3): Vec3 | null {
  const parts = operation.replace(/[()'\"]/g, '').split(',');
  if (parts.length !== 3) return null;
  const result = parts.map((part) => parseCoordinate(part, point));
  return result.every((value): value is number => value !== null)
    ? [result[0], result[1], result[2]]
    : null;
}

function elementAtomicNumber(symbol: string | null): number | null {
  if (!symbol) return null;
  const normalized = symbol.match(/[A-Z][a-z]?/i)?.[0];
  if (!normalized) return null;
  const canonical = normalized[0].toUpperCase() + normalized.slice(1).toLowerCase();
  const index = ELEMENT_SYMBOLS.indexOf(canonical as typeof ELEMENT_SYMBOLS[number]);
  return index < 0 ? null : index + 1;
}

function expandAtoms(sites: AtomSiteRow[], operations: SymmetryOperationRow[]): ExpandedAtom[] {
  const symmetry = operations.length ? operations.map((row) => row.operation_xyz) : ['x,y,z'];
  const atoms: ExpandedAtom[] = [];
  for (const site of sites) {
    if (site.fract_x === null || site.fract_y === null || site.fract_z === null) continue;
    const atomicNumber = elementAtomicNumber(site.type_symbol ?? site.site_label);
    if (atomicNumber === null) continue;
    const source: Vec3 = [site.fract_x, site.fract_y, site.fract_z];
    const seen = new Set<string>();
    for (const operation of symmetry) {
      const position = applySymmetry(operation, source);
      if (!position) continue;
      const key = position.map((value) => Math.round(value * 100_000) % 100_000).join(':');
      if (seen.has(key)) continue;
      seen.add(key);
      atoms.push({
        position,
        symbol: ELEMENT_SYMBOLS[atomicNumber - 1],
        occupancy: site.occupancy ?? 1,
        bIso: site.b_iso_or_equiv ?? (site.u_iso_or_equiv === null ? 0 : 8 * Math.PI ** 2 * site.u_iso_or_equiv)
      });
    }
  }
  return atoms;
}

function reciprocalBasis(entry: EntryRow): [Vec3, Vec3, Vec3] | null {
  const a = entry.cell_a_angstrom ?? entry.cell_a * 10;
  const b = entry.cell_b_angstrom ?? entry.cell_b * 10;
  const c = entry.cell_c_angstrom ?? entry.cell_c * 10;
  const alpha = (entry.cell_angle_alpha ?? 90) * DEG;
  const beta = (entry.cell_angle_beta ?? 90) * DEG;
  const gamma = (entry.cell_angle_gamma ?? 90) * DEG;
  if (![a, b, c, alpha, beta, gamma].every(Number.isFinite) || a <= 0 || b <= 0 || c <= 0 || Math.abs(Math.sin(gamma)) < 1e-8) return null;
  const av: Vec3 = [a, 0, 0];
  const bv: Vec3 = [b * Math.cos(gamma), b * Math.sin(gamma), 0];
  const cx = c * Math.cos(beta);
  const cy = c * (Math.cos(alpha) - Math.cos(beta) * Math.cos(gamma)) / Math.sin(gamma);
  const czSquared = c ** 2 - cx ** 2 - cy ** 2;
  if (!Number.isFinite(czSquared) || czSquared <= 0) return null;
  const cv: Vec3 = [cx, cy, Math.sqrt(czSquared)];
  const volume = dot(av, cross(bv, cv));
  if (!Number.isFinite(volume) || Math.abs(volume) < 1e-8) return null;
  return [scale(cross(bv, cv), 1 / volume), scale(cross(cv, av), 1 / volume), scale(cross(av, bv), 1 / volume)];
}

function calculatePeaks(
  entry: EntryRow,
  sites: AtomSiteRow[],
  operations: SymmetryOperationRow[],
  wavelength: number
): PxrdPeak[] {
  const basis = reciprocalBasis(entry);
  const atoms = expandAtoms(sites, operations);
  if (!basis || atoms.length === 0) return [];
  const thetaMax = MAX_TWO_THETA * DEG / 2;
  const dMin = wavelength / (2 * Math.sin(thetaMax));
  const lengths = [entry.cell_a_angstrom ?? entry.cell_a * 10, entry.cell_b_angstrom ?? entry.cell_b * 10, entry.cell_c_angstrom ?? entry.cell_c * 10];
  const limits = lengths.map((length) => Math.min(36, Math.max(1, Math.ceil(length / dMin) + 1)));
  const raw: PxrdPeak[] = [];
  for (let h = -limits[0]; h <= limits[0]; h += 1) {
    for (let k = -limits[1]; k <= limits[1]; k += 1) {
      for (let l = -limits[2]; l <= limits[2]; l += 1) {
        if ((h === 0 && k === 0 && l === 0) || h < 0 || (h === 0 && k < 0) || (h === 0 && k === 0 && l < 0)) continue;
        const q: Vec3 = [
          h * basis[0][0] + k * basis[1][0] + l * basis[2][0],
          h * basis[0][1] + k * basis[1][1] + l * basis[2][1],
          h * basis[0][2] + k * basis[1][2] + l * basis[2][2]
        ];
        const qLength = Math.sqrt(dot(q, q));
        const sinTheta = wavelength * qLength / 2;
        if (sinTheta <= 0 || sinTheta >= 1) continue;
        const theta = Math.asin(sinTheta);
        const twoTheta = 2 * theta / DEG;
        if (twoTheta < MIN_TWO_THETA || twoTheta > MAX_TWO_THETA) continue;
        const scattering = qLength / 2;
        let real = 0;
        let imaginary = 0;
        for (const atom of atoms) {
          const formFactor = xrayFormFactor(atom.symbol, scattering ** 2)!;
          const temperature = Math.exp(-atom.bIso * scattering ** 2);
          const phase = 2 * Math.PI * (h * atom.position[0] + k * atom.position[1] + l * atom.position[2]);
          const amplitude = atom.occupancy * formFactor * temperature;
          real += amplitude * Math.cos(phase);
          imaginary += amplitude * Math.sin(phase);
        }
        const lp = (1 + Math.cos(2 * theta) ** 2) / Math.max(1e-8, Math.sin(theta) ** 2 * Math.cos(theta));
        const intensity = (real ** 2 + imaginary ** 2) * lp;
        if (intensity > 1e-8) raw.push({ twoTheta, intensity, hkl: `${h} ${k} ${l}` });
      }
    }
  }
  raw.sort((a, b) => a.twoTheta - b.twoTheta);
  const merged: PxrdPeak[] = [];
  for (const peak of raw) {
    const previous = merged.at(-1);
    if (previous && Math.abs(previous.twoTheta - peak.twoTheta) < 1e-7) {
      const total = previous.intensity + peak.intensity;
      // The first enumerated member labels this degenerate family deterministically.
      previous.twoTheta = (previous.twoTheta * previous.intensity + peak.twoTheta * peak.intensity) / total;
      previous.intensity = total;
    } else {
      merged.push({ ...peak });
    }
  }
  const maximum = merged.reduce((value, peak) => Math.max(value, peak.intensity), 0);
  return maximum === 0 ? [] : merged.map((peak) => ({ ...peak, intensity: peak.intensity * 100 / maximum }));
}

function validOperation(operation: string, entry: EntryRow): boolean {
  const parts = operation.replace(/[()'\"]/g, '').split(',');
  if (parts.length !== 3) return false;
  const origin: Vec3 = [0, 0, 0];
  const translation = parts.map(part => parseCoordinate(part, origin, false));
  if (translation.some(value => value === null)) return false;
  // Read the linear terms directly: subtracting fractional translations can
  // turn an exact integer coefficient into 0.9999999999999999 (e.g. z+2/3).
  const matrix = parts.map(part => [0, 1, 2].map(j => {
    const point: Vec3 = [0, 0, 0]; point[j] = 1;
    return parseCoordinate(part, point, false, false)!;
  }));
  if (!matrix.flat().every(Number.isInteger)) return false;
  const determinant = dot(matrix[0] as Vec3, cross(matrix[1] as Vec3, matrix[2] as Vec3));
  if (Math.abs(determinant) !== 1) return false;
  const lengths = [entry.cell_a_angstrom ?? entry.cell_a * 10, entry.cell_b_angstrom ?? entry.cell_b * 10, entry.cell_c_angstrom ?? entry.cell_c * 10];
  const angles = [entry.cell_angle_alpha ?? 90, entry.cell_angle_beta ?? 90, entry.cell_angle_gamma ?? 90];
  const g = lengths.map((a, i) => lengths.map((b, j) => i === j ? a*a : a*b*Math.cos(angles[3-i-j]*DEG)));
  return g.every((row, i) => row.every((value, j) => {
    let transformed = 0;
    for (let k = 0; k < 3; k++) for (let l = 0; l < 3; l++) transformed += matrix[k][i]*g[k][l]*matrix[l][j];
    return Math.abs(transformed-value) <= 1e-5 * Math.max(...lengths.map(a => a*a));
  }));
}

export function calculatePxrd(entry: EntryRow, sites: AtomSiteRow[], operations: SymmetryOperationRow[], wavelengthOverride?: number): PxrdResult {
  const diagnostics: string[] = [];
  const wavelength = wavelengthOverride ?? entry.radiation_wavelength_angstrom ?? DEFAULT_WAVELENGTH;
  const result: PxrdResult = { peaks: [], diagnostics, status: 'unsupported', wavelength, model: MODEL };
  const reject = (message: string) => { diagnostics.push(message); return result; };
  if (!Number.isFinite(wavelength) || wavelength <= 0 || wavelength > 10) return reject('Wavelength must be finite, positive and at most 10 Å.');
  if (Math.sin(MAX_TWO_THETA*DEG/2)/wavelength >= 2) return reject('The requested range exceeds the IT92 form-factor limit sin(θ)/λ < 2 Å⁻¹. Increase the wavelength.');
  if (wavelengthOverride === undefined && entry.radiation_wavelength_angstrom == null) diagnostics.push('Wavelength assumed: 1.5406 Å.');
  if (!entry.radiation_type) diagnostics.push('Radiation assumed: monochromatic X-rays.');
  else if (!/x[ -]?ray|synchrotron|\b(?:Cu|Mo|Co|Fe|Cr|Ag)\s*K/i.test(entry.radiation_type) || /neutron|electron/i.test(entry.radiation_type)) {
    return reject('Only monochromatic X-ray scattering is supported; the recorded radiation type is unsupported.');
  }
  const angles = [entry.cell_angle_alpha, entry.cell_angle_beta, entry.cell_angle_gamma];
  if (angles.some(value => value == null)) diagnostics.push('Missing cell angles assumed to be 90°. Confirm the cell geometry.');
  if (angles.some(value => value != null && (!Number.isFinite(value) || value <= 0 || value >= 180)) || !reciprocalBasis(entry)) return reject('Invalid or degenerate unit cell.');
  if ([entry.cell_a_angstrom, entry.cell_b_angstrom, entry.cell_c_angstrom].some(value => value == null)) diagnostics.push('Legacy nanometre cell lengths converted to ångströms.');
  if (!operations.length) {
    if (entry.sg_number !== 1) return reject('Explicit symmetry operations are required outside P1; reimport a CIF containing them.');
    diagnostics.push('P1 identity symmetry assumed.');
  }
  if (operations.length > 384 || operations.some(row => !validOperation(row.operation_xyz, entry))) return reject('Malformed or cell-incompatible symmetry operations; no partial pattern is calculated.');
  if (!sites.length) return reject('Atomic positions are unavailable.');
  for (const site of sites) {
    if ([site.fract_x, site.fract_y, site.fract_z].some(value => value == null || !Number.isFinite(value))) return reject('Missing or non-finite atomic coordinates; no partial pattern is calculated.');
    if (site.type_symbol && !/^[A-Z][a-z]?(?:[+-]\d*|\d+[+-])?$/i.test(site.type_symbol)) return reject('Unrecognized atom type; supply an element symbol with an optional ionic charge.');
    const z = elementAtomicNumber(site.type_symbol ?? site.site_label);
    if (z === null || z > 98) return reject('An atom has no supported neutral-atom form factor (H–Cf).');
    if (site.occupancy != null && (!Number.isFinite(site.occupancy) || site.occupancy < 0 || site.occupancy > 1)) return reject('Atomic occupancy must lie between zero and one.');
    if ([site.b_iso_or_equiv, site.u_iso_or_equiv].some(value => value != null && (!Number.isFinite(value) || value < 0))) return reject('Displacement parameters must be finite and nonnegative.');
  }
  if (sites.some(site => !site.type_symbol)) diagnostics.push('Some elements inferred from atom labels.');
  if (sites.some(site => site.occupancy == null)) diagnostics.push('Missing occupancies assumed to be one.');
  if (sites.some(site => site.b_iso_or_equiv == null && site.u_iso_or_equiv == null)) diagnostics.push('Missing isotropic displacement assumed to be zero.');
  diagnostics.push('Neutral atoms; isotropic displacement only; no anomalous scattering, texture, absorption or instrumental corrections. Supplied symmetry must describe the complete cell.');
  const lengths = [entry.cell_a_angstrom ?? entry.cell_a*10, entry.cell_b_angstrom ?? entry.cell_b*10, entry.cell_c_angstrom ?? entry.cell_c*10];
  const required = lengths.map(length => Math.ceil(length*2*Math.sin(MAX_TWO_THETA*DEG/2)/wavelength)+1);
  const expanded = expandAtoms(sites, operations);
  const work = required.reduce((total, n) => total*(2*Math.min(36,n)+1), 1)*expanded.length/2;
  if (work > 50_000_000 || expanded.length > 10000) return reject('Structure exceeds the supported calculation work limit (50 million atom/reflection evaluations).');
  result.status = required.some(n => n > 36) ? 'incomplete' : 'complete';
  if (result.status === 'incomplete') diagnostics.push('Incomplete reflection search: one or more index bounds exceed 36. Peaks may be missing.');
  result.peaks = calculatePeaks(entry, sites, operations, wavelength);
  if (result.peaks.length > 10000) {
    result.peaks = []; result.status = 'unsupported';
    return reject('More than 10,000 distinct reflections exceed the supported plotting limit.');
  }
  if (!result.peaks.length) diagnostics.push('No nonzero reflections in the requested 5–80° range.');
  return result;
}

export function simulatePxrd(entry: EntryRow, sites: AtomSiteRow[], operations: SymmetryOperationRow[], wavelengthOverride?: number): PxrdPeak[] {
  return calculatePxrd(entry, sites, operations, wavelengthOverride).peaks;
}

/** Broaden integrated reflection intensities with a Gaussian in 2θ. */
export function createPxrdProfile(
  peaks: PxrdPeak[],
  fwhm = PXRD_FWHM_TWO_THETA,
  step = 0.02
): PxrdProfilePoint[] {
  if (peaks.length === 0 || !Number.isFinite(fwhm) || fwhm <= 0 || !Number.isFinite(step) || step < 0.001 || step > 75 ||
      peaks.some(peak => !Number.isFinite(peak.twoTheta) || !Number.isFinite(peak.intensity) || peak.intensity < 0)) return [];
  const sigma = fwhm / (2 * Math.sqrt(2 * Math.log(2)));
  const pointCount = Math.round((MAX_TWO_THETA - MIN_TWO_THETA) / step) + 1;
  const intensities = new Float64Array(pointCount);
  const radius = 5 * sigma;
  for (const peak of peaks) {
    const first = Math.max(0, Math.floor((peak.twoTheta - radius - MIN_TWO_THETA) / step));
    const last = Math.min(pointCount - 1, Math.ceil((peak.twoTheta + radius - MIN_TWO_THETA) / step));
    for (let index = first; index <= last; index += 1) {
      const angle = MIN_TWO_THETA + index * step;
      const offset = (angle - peak.twoTheta) / sigma;
      intensities[index] += peak.intensity * Math.exp(-0.5 * offset ** 2);
    }
  }
  const maximum = Math.max(...intensities);
  if (maximum === 0) return [];
  return Array.from(intensities, (intensity, index) => ({
    twoTheta: MIN_TWO_THETA + index * step,
    intensity: intensity * 100 / maximum
  }));
}

export const PXRD_RANGE = { min: MIN_TWO_THETA, max: MAX_TWO_THETA } as const;

export function serializePxrdProfile(profile: PxrdProfilePoint[], includeHeader: boolean, metadata?: { result: PxrdResult; fwhm: number }): string {
  const rows = profile.map((point) => `${point.twoTheta.toFixed(4)}\t${point.intensity.toFixed(6)}`);
  if (includeHeader) rows.unshift('2theta\tintensity');
  if (includeHeader && metadata) rows.unshift(
    `# model=${metadata.result.model}; radiation=monochromatic X-ray; status=${metadata.result.status}`,
    `# wavelength_A=${metadata.result.wavelength}; Gaussian_FWHM_2theta_deg=${metadata.fwhm}; range_2theta_deg=5:80; step_deg=0.02; normalized_max=100`,
    ...metadata.result.diagnostics.map(message => `# ${message.replace(/[\r\n]/g, ' ')}`)
  );
  return `${rows.join('\n')}\n`;
}
