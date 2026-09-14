import { describe, expect, it } from 'vitest';
import type { AtomSiteRow, EntryRow, SymmetryOperationRow } from '../../shared/types';
import { createPxrdProfile, PXRD_FWHM_TWO_THETA, serializePxrdProfile, simulatePxrd } from './pxrd';

const entry = {
  id: 1,
  cell_a: 0.4,
  cell_b: 0.4,
  cell_c: 0.4,
  cell_a_angstrom: 4,
  cell_b_angstrom: 4,
  cell_c_angstrom: 4,
  cell_angle_alpha: 90,
  cell_angle_beta: 90,
  cell_angle_gamma: 90,
  radiation_wavelength_angstrom: 1.5406
} as EntryRow;
const site = {
  id: 1,
  entry_id: 1,
  site_order: 0,
  type_symbol: 'Na',
  site_label: 'Na1',
  fract_x: 0,
  fract_y: 0,
  fract_z: 0,
  occupancy: 1,
  u_iso_or_equiv: 0,
  b_iso_or_equiv: 0
} as AtomSiteRow;
const identity = [{ id: 1, entry_id: 1, operation_order: 0, operation_id: '1', operation_xyz: 'x,y,z' }] as SymmetryOperationRow[];

describe('simulatePxrd', () => {
  it('matches the monoclinic reciprocal metric, including the signed h/l cross term', () => {
    const beta = 105 * Math.PI / 180;
    const crystal = { ...entry, cell_a_angstrom: 4, cell_b_angstrom: 5,
      cell_c_angstrom: 7, cell_angle_beta: 105 };
    const peaks = simulatePxrd(crystal, [site], identity);
    for (const [h, k, l] of [[0, 0, 1], [0, 1, 0], [1, 0, 0], [1, 0, 1], [1, 0, -1]]) {
      const reciprocalSquared = (h ** 2 / 16 + l ** 2 / 49 - 2 * h * l * Math.cos(beta) / 28) /
        Math.sin(beta) ** 2 + k ** 2 / 25;
      const angle = 2 * Math.asin(1.5406 * Math.sqrt(reciprocalSquared) / 2) * 180 / Math.PI;
      expect(peaks.some(peak => Math.abs(peak.twoTheta - angle) < 1e-8)).toBe(true);
    }
  });

  it.each([{ element: 'Na', number: 11 }, { element: 'H', number: 1 }])('matches orthorhombic Bragg positions and Fe/$element interference intensities', ({ element, number }) => {
    const crystal = { ...entry, cell_a_angstrom: 4.1, cell_b_angstrom: 5.3, cell_c_angstrom: 6.7 };
    const sites = [{ ...site, type_symbol: 'Fe' },
      { ...site, type_symbol: element, fract_x: 0.17, fract_y: 0.23, fract_z: 0.37, occupancy: 0.6 }];
    const peaks = simulatePxrd(crystal, sites, identity);
    // The first two nondegenerate families are 001 and 010. Their structure
    // factors satisfy |F|² = Z1² + (occupancy Z2)² + 2 Z1 occupancy Z2 cos(phase).
    const expected = (length: number, coordinate: number) => {
      const theta = Math.asin(1.5406 / (2 * length));
      const structure = 26 ** 2 + (0.6 * number) ** 2 + 2 * 26 * 0.6 * number * Math.cos(2 * Math.PI * coordinate);
      const scattering = Math.exp(-0.44 / (4 * length ** 2));
      const polarization = (1 + Math.cos(2 * theta) ** 2) / (Math.sin(theta) ** 2 * Math.cos(theta));
      return { angle: 2 * theta * 180 / Math.PI, intensity: structure * scattering * polarization };
    };
    const first = expected(6.7, 0.37);
    const second = expected(5.3, 0.23);
    expect(peaks[0].twoTheta).toBeCloseTo(first.angle, 8);
    expect(peaks[1].twoTheta).toBeCloseTo(second.angle, 8);
    expect(peaks[1].intensity / peaks[0].intensity).toBeCloseTo(second.intensity / first.intensity, 8);
    expect(peaks.every(peak => peak.twoTheta >= 5 && peak.twoTheta <= 80)).toBe(true);
    expect(peaks[0].hkl).toBe('0 0 1');
    expect(peaks[1].hkl).toBe('0 1 0');
  });

  it('expands fractional, signed and decorated symmetry coordinates like explicit atom positions', () => {
    const originalSite = { ...site, fract_x: 0.13, fract_y: 0.27, fract_z: 0.39 };
    const operations = [identity[0], { ...identity[0], operation_xyz: "'( -X + 1/2, 2 * Y, Z - 1/4 )'" }];
    const expected = simulatePxrd(entry, [originalSite,
      { ...originalSite, fract_x: 0.37, fract_y: 0.54, fract_z: 0.14 }], identity);
    const actual = simulatePxrd(entry, [originalSite], operations);
    expect(actual.length).toBeGreaterThan(0);
    expect(actual).toHaveLength(expected.length);
    actual.forEach((peak, index) => {
      expect(peak.twoTheta).toBeCloseTo(expected[index].twoTheta, 8);
      expect(peak.intensity).toBeCloseTo(expected[index].intensity, 8);
    });
  });

  it('obeys body-centering extinctions and the analytic cubic Bragg positions', () => {
    const centered = [...identity, { ...identity[0], operation_xyz: 'x+1/2,y+1/2,z+1/2' }];
    const peaks = simulatePxrd(entry, [site], centered);
    const angle = (squaredIndex: number) => 2 * Math.asin(1.5406 * Math.sqrt(squaredIndex) / (2 * 4)) * 180 / Math.PI;
    // For identical atoms at (0,0,0) and (1/2,1/2,1/2), odd h+k+l cancels.
    expect(peaks[0].twoTheta).toBeCloseTo(angle(2), 8); // 110, not 100
    expect(peaks.some(peak => Math.abs(peak.twoTheta - angle(1)) < 0.01)).toBe(false);
    expect(peaks.some(peak => Math.abs(peak.twoTheta - angle(3)) < 0.01)).toBe(false);
    expect(peaks.every(peak => Number.isFinite(peak.intensity) && peak.intensity > 0)).toBe(true);
  });

  it('deduplicates symmetry-equivalent special positions including negative translations', () => {
    const operations = ['x,y,z', '-x,-y,-z', 'x-1,y+1,z'].map(operation_xyz => ({ ...identity[0], operation_xyz }));
    // Keep a general site too: otherwise normalization can hide double counting of the origin.
    const sites = [site, { ...site, fract_x: 0.25, fract_y: 0.25, fract_z: 0.25 }];
    const explicit = [...sites, { ...site, fract_x: 0.75, fract_y: 0.75, fract_z: 0.75 }];
    const actual = simulatePxrd(entry, sites, operations);
    const expected = simulatePxrd(entry, explicit, identity);
    expect(actual).toHaveLength(expected.length);
    actual.forEach((peak, index) => {
      expect(peak.twoTheta).toBeCloseTo(expected[index].twoTheta, 8);
      expect(peak.intensity).toBeCloseTo(expected[index].intensity, 8);
    });
  });

  it('falls back to stored nanometre lengths, default angles and wavelength', () => {
    const legacy = { ...entry, cell_a_angstrom: null, cell_b_angstrom: null, cell_c_angstrom: null,
      cell_angle_alpha: null, cell_angle_beta: null, cell_angle_gamma: null, radiation_wavelength_angstrom: null };
    expect(simulatePxrd(legacy, [site], [])).toEqual(simulatePxrd(entry, [site], identity));
  });

  it.each([
    { cell_a_angstrom: 0 }, { cell_b_angstrom: -1 }, { cell_c_angstrom: NaN },
    { cell_angle_gamma: 0 }, { cell_angle_alpha: 170, cell_angle_beta: 10, cell_angle_gamma: 10 }
  ])('returns no reflections for a degenerate cell %j', (invalid) => {
    expect(simulatePxrd({ ...entry, ...invalid }, [site], identity)).toEqual([]);
  });

  it('ignores malformed symmetry operations and unknown elements', () => {
    const bad = ['x,y', 'x+1/0,y,z', 'bad*x,y,z'].map(operation_xyz => ({ ...identity[0], operation_xyz }));
    expect(simulatePxrd(entry, [site], [...bad, ...identity])).toEqual(simulatePxrd(entry, [site], identity));
    expect(simulatePxrd(entry, [{ ...site, type_symbol: 'Xx' }], identity)).toEqual([]);
    expect(simulatePxrd(entry, [{ ...site, occupancy: 0 }], identity)).toEqual([]);
  });

  it('uses equivalent U and B displacement parameters to damp high-angle intensity', () => {
    const u = 0.02;
    const fromU = simulatePxrd(entry, [{ ...site, b_iso_or_equiv: null, u_iso_or_equiv: u }], identity);
    const fromB = simulatePxrd(entry, [{ ...site, b_iso_or_equiv: 8 * Math.PI ** 2 * u }], identity);
    expect(fromU).toEqual(fromB);
    const cold = simulatePxrd(entry, [site], identity);
    expect(fromU.at(-1)!.intensity).toBeLessThan(cold.at(-1)!.intensity);
  });
  it('calculates and normalizes reflections from stored crystal data', () => {
    const peaks = simulatePxrd(entry, [site], identity);
    expect(peaks.length).toBeGreaterThan(5);
    expect(Math.max(...peaks.map((peak) => peak.intensity))).toBeCloseTo(100);
    expect(peaks[0].twoTheta).toBeCloseTo(22.2, 0);
  });

  it('uses a caller-provided wavelength', () => {
    const original = simulatePxrd(entry, [site], identity, 1.0);
    expect(original[0].twoTheta).toBeLessThan(simulatePxrd(entry, [site], identity, 2.0)[0].twoTheta);
  });

  it('uses a positive stored wavelength and falls back for negative wavelengths', () => {
    const stored = { ...entry, radiation_wavelength_angstrom: 1 };
    expect(simulatePxrd(stored, [site], identity)).toEqual(simulatePxrd(entry, [site], identity, 1));
    expect(simulatePxrd(stored, [site], identity, -1)).toEqual(simulatePxrd(stored, [site], identity));
    expect(simulatePxrd({ ...entry, radiation_wavelength_angstrom: -1 }, [site], identity))
      .toEqual(simulatePxrd(entry, [site], identity));
  });

  it('returns no pattern when atomic positions are unavailable', () => {
    expect(simulatePxrd(entry, [{ ...site, fract_x: null }], identity)).toEqual([]);
  });

  it('broadens peaks to a 0.1 degree FWHM in 2 theta', () => {
    expect(PXRD_FWHM_TWO_THETA).toBe(0.1);
    const profile = createPxrdProfile([{ twoTheta: 40, intensity: 100, hkl: '1 0 0' }], 0.1, 0.01);
    const intensityAt = (angle: number) => profile.find((point) => Math.abs(point.twoTheta - angle) < 0.001)?.intensity;
    expect(intensityAt(40)).toBeCloseTo(100, 5);
    expect(intensityAt(39.95)).toBeCloseTo(50, 1);
    expect(intensityAt(40.05)).toBeCloseTo(50, 1);
  });
});

describe('serializePxrdProfile', () => {
  const profile = [{ twoTheta: 12.34567, intensity: 98.7654321 }];

  it('writes two tab-separated columns with an optional header', () => {
    expect(serializePxrdProfile(profile, true)).toBe('2theta\tintensity\n12.3457\t98.765432\n');
    expect(serializePxrdProfile(profile, false)).toBe('12.3457\t98.765432\n');
  });
});

describe('profile boundaries', () => {
  it('uses the default width and truncates negligible Gaussian tails', () => {
    const peaks = [{ twoTheta: 40, intensity: 100, hkl: '1 0 0' }];
    const profile = createPxrdProfile(peaks);
    expect(profile).toEqual(createPxrdProfile(peaks, 0.1, 0.02));
    const at = (angle: number) => profile.find(point => Math.abs(point.twoTheta - angle) < 1e-8)!.intensity;
    expect(at(40.2)).toBeGreaterThan(0);
    expect(at(40.24)).toBe(0);
    expect(at(39.76)).toBe(0);
  });

  it('rejects empty patterns and nonpositive profile settings', () => {
    const peaks = [{ twoTheta: 40, intensity: 100, hkl: '1 0 0' }];
    expect(createPxrdProfile([])).toEqual([]);
    expect(createPxrdProfile(peaks, 0)).toEqual([]);
    expect(createPxrdProfile(peaks, 0.1, 0)).toEqual([]);
    expect(createPxrdProfile([{ ...peaks[0], intensity: 0 }])).toEqual([]);
  });

  it('clips broadening to the export range and exports finite ordered samples', () => {
    const profile = createPxrdProfile([{ twoTheta: 5, intensity: 100, hkl: '1 0 0' }]);
    expect(profile[0]).toEqual({ twoTheta: 5, intensity: 100 });
    expect(profile.at(-1)!.twoTheta).toBe(80);
    const rows = serializePxrdProfile(profile, false).trim().split('\n').map(row => row.split('\t').map(Number));
    expect(rows).toHaveLength(profile.length);
    expect(rows.every(([angle, intensity], index) => Number.isFinite(intensity) && intensity >= 0 && intensity <= 100 &&
      (index === 0 || angle > rows[index - 1][0]))).toBe(true);
  });
});
