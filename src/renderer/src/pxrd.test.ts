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
