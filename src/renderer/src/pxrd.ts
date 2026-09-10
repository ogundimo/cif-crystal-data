import type { AtomSiteRow, EntryRow, SymmetryOperationRow } from '../../shared/types';
import { ELEMENT_SYMBOLS } from '../../shared/periodicTableData';

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
interface ExpandedAtom { position: Vec3; atomicNumber: number; occupancy: number; bIso: number }

const DEG = Math.PI / 180;
export const DEFAULT_WAVELENGTH = 1.5406;
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

function parseCoordinate(expression: string, point: Vec3): number | null {
  const compact = expression.toLowerCase().replace(/\s|\*/g, '').replace(/-/g, '+-');
  let value = 0;
  for (const rawTerm of compact.split('+').filter(Boolean)) {
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
      value += number;
    }
  }
  return ((value % 1) + 1) % 1;
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
      const key = position.map((value) => Math.round(value * 100_000)).join(':');
      if (seen.has(key)) continue;
      seen.add(key);
      atoms.push({
        position,
        atomicNumber,
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
  if (czSquared <= 0) return null;
  const cv: Vec3 = [cx, cy, Math.sqrt(czSquared)];
  const volume = dot(av, cross(bv, cv));
  if (Math.abs(volume) < 1e-8) return null;
  return [scale(cross(bv, cv), 1 / volume), scale(cross(cv, av), 1 / volume), scale(cross(av, bv), 1 / volume)];
}

export function simulatePxrd(
  entry: EntryRow,
  sites: AtomSiteRow[],
  operations: SymmetryOperationRow[],
  wavelengthOverride?: number
): PxrdPeak[] {
  const basis = reciprocalBasis(entry);
  const atoms = expandAtoms(sites, operations);
  const wavelength = wavelengthOverride && wavelengthOverride > 0
    ? wavelengthOverride
    : entry.radiation_wavelength_angstrom && entry.radiation_wavelength_angstrom > 0
    ? entry.radiation_wavelength_angstrom
    : DEFAULT_WAVELENGTH;
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
          const formFactor = atom.atomicNumber * Math.exp(-0.22 * scattering ** 2);
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
    if (previous && Math.abs(previous.twoTheta - peak.twoTheta) < 0.025) {
      const total = previous.intensity + peak.intensity;
      if (peak.intensity > previous.intensity) previous.hkl = peak.hkl;
      previous.twoTheta = (previous.twoTheta * previous.intensity + peak.twoTheta * peak.intensity) / total;
      previous.intensity = total;
    } else {
      merged.push({ ...peak });
    }
  }
  const maximum = Math.max(...merged.map((peak) => peak.intensity), 0);
  return maximum === 0 ? [] : merged.map((peak) => ({ ...peak, intensity: peak.intensity * 100 / maximum }));
}

/** Broaden integrated reflection intensities with a Gaussian in 2θ. */
export function createPxrdProfile(
  peaks: PxrdPeak[],
  fwhm = PXRD_FWHM_TWO_THETA,
  step = 0.02
): PxrdProfilePoint[] {
  if (peaks.length === 0 || fwhm <= 0 || step <= 0) return [];
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

export function serializePxrdProfile(profile: PxrdProfilePoint[], includeHeader: boolean): string {
  const rows = profile.map((point) => `${point.twoTheta.toFixed(4)}\t${point.intensity.toFixed(6)}`);
  if (includeHeader) rows.unshift('2theta\tintensity');
  return `${rows.join('\n')}\n`;
}
