import { describe, expect, it } from 'vitest';
import type { AtomSiteRow, EntryRow, SymmetryOperationRow } from '../../shared/types';
import { calculatePxrd, createPxrdProfile, PXRD_FWHM_TWO_THETA, serializePxrdProfile, simulatePxrd } from './pxrd';
import reference from './__fixtures__/pxrd-reference.json';
import { WAVELENGTH_PRESETS } from './patternComparison';

// Independently transcribed IT92 coefficients for the analytic interference checks.
function factor(z: number, s2: number): number {
  const c = z === 11 ? [4.7626,3.1736,1.2674,1.1128,3.285,8.8422,.3136,129.424,.676]
    : z === 26 ? [11.7695,7.3573,3.5222,2.3045,4.7611,.3072,15.3535,76.8805,1.0369]
    : [.493002,.322912,.140191,.04081,10.5109,26.1257,3.14236,57.7997,.003038];
  return c[8]+c.slice(0,4).reduce((sum,a,i)=>sum+a*Math.exp(-c[i+4]*s2),0);
}

const entry = {
  id: 1,
  sg_number: 1,
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
  it.each(WAVELENGTH_PRESETS)('uses the $label preset for analytic cubic 100 Bragg positions and export', ({value}) => {
    const result = calculatePxrd(entry, [site], identity, value);
    // d100 = 4 Å; first-order Bragg law 2d sin(theta) = wavelength.
    const expected = 2 * Math.asin(value / 8) * 180 / Math.PI;
    expect(result.peaks[0].twoTheta).toBeCloseTo(expected, 6);
    expect(serializePxrdProfile(createPxrdProfile(result.peaks), true, {result, fwhm:PXRD_FWHM_TWO_THETA})).toContain(`wavelength_A=${value};`);
  });
  it('accepts integer rotations with thirds translations without subtraction roundoff', () => {
    const operations = ['x,y,z', 'x,y,z+1/3', 'x,y,z+2/3'].map((operation_xyz, i) =>
      ({ ...identity[0], operation_order: i, operation_xyz }));
    const result = calculatePxrd(entry, [site], operations);
    const explicit = calculatePxrd(entry, [0, 1/3, 2/3].map(fract_z => ({ ...site, fract_z })), identity);
    expect(result.status).toBe('complete');
    expect(result.peaks.length).toBeGreaterThan(0);
    expect(result.peaks).toEqual(explicit.peaks);
  });

  it('matches the general triclinic inverse metric and mixed-site interference', () => {
    const a = 4.1, b = 5.3, c = 6.7;
    const alpha = 73 * Math.PI / 180, beta = 82 * Math.PI / 180, gamma = 67 * Math.PI / 180;
    const ca = Math.cos(alpha), cb = Math.cos(beta), cg = Math.cos(gamma);
    const determinant = 1 - ca * ca - cb * cb - cg * cg + 2 * ca * cb * cg;
    const crystal = { ...entry, cell_a_angstrom: a, cell_b_angstrom: b, cell_c_angstrom: c,
      cell_angle_alpha: 73, cell_angle_beta: 82, cell_angle_gamma: 67 };
    const peaks = simulatePxrd(crystal, [site, { ...site, type_symbol: 'Fe',
      fract_x: 0.17, fract_y: 0.23, fract_z: 0.37, occupancy: 0.6 }], identity);
    const expected = (h: number, k: number, l: number) => {
      // Cofactors of the direct-cell metric, independent of the vector basis implementation.
      const q2 = (h*h*(1-ca*ca)/(a*a) + k*k*(1-cb*cb)/(b*b) + l*l*(1-cg*cg)/(c*c)
        + 2*h*k*(ca*cb-cg)/(a*b) + 2*h*l*(ca*cg-cb)/(a*c) + 2*k*l*(cb*cg-ca)/(b*c)) / determinant;
      const theta = Math.asin(1.5406 * Math.sqrt(q2) / 2);
      const phase = 2 * Math.PI * (h*0.17 + k*0.23 + l*0.37);
      const na = factor(11,q2/4), fe = factor(26,q2/4);
      const intensity = (na**2 + (0.6*fe)**2 + 2*na*0.6*fe*Math.cos(phase))
        * (1+Math.cos(2*theta)**2)/(Math.sin(theta)**2*Math.cos(theta));
      return { angle: 2*theta*180/Math.PI, intensity };
    };
    const reference = expected(0, 0, 1);
    const first = peaks.find(p => Math.abs(p.twoTheta-reference.angle)<1e-8)!;
    expect(first).toBeDefined();
    for (const indices of [[0,1,0], [1,0,0], [1,1,0], [1,0,1], [1,0,-1], [1,-1,1]]) {
      const value = expected(...indices as [number, number, number]);
      const peak = peaks.find(p => Math.abs(p.twoTheta-value.angle)<1e-8)!;
      expect(peak, `reflection ${indices}`).toBeDefined();
      expect(peak.intensity / first.intensity).toBeCloseTo(value.intensity / reference.intensity, 5);
    }
  });

  it('accumulates cubic family multiplicities before normalization', () => {
    const peaks = simulatePxrd(entry, [site], identity);
    const intensity = (n: number, multiplicity: number) => {
      const theta = Math.asin(1.5406*Math.sqrt(n)/8);
      return multiplicity*factor(11,n/64)**2*(1+Math.cos(2*theta)**2)/(Math.sin(theta)**2*Math.cos(theta));
    };
    // Families 100 and 110 have six and twelve members including Friedel pairs.
    expect(peaks[1].intensity/peaks[0].intensity).toBeCloseTo(intensity(2,12)/intensity(1,6), 5);
  });
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
      const fe = factor(26, 1/(4*length**2)), other = factor(number, 1/(4*length**2));
      const structure = fe ** 2 + (0.6 * other) ** 2 + 2 * fe * 0.6 * other * Math.cos(2 * Math.PI * coordinate);
      const polarization = (1 + Math.cos(2 * theta) ** 2) / (Math.sin(theta) ** 2 * Math.cos(theta));
      return { angle: 2 * theta * 180 / Math.PI, intensity: structure * polarization };
    };
    const first = expected(6.7, 0.37);
    const second = expected(5.3, 0.23);
    expect(peaks[0].twoTheta).toBeCloseTo(first.angle, 8);
    expect(peaks[1].twoTheta).toBeCloseTo(second.angle, 8);
    expect(peaks[1].intensity / peaks[0].intensity).toBeCloseTo(second.intensity / first.intensity, 5);
    expect(peaks.every(peak => peak.twoTheta >= 5 && peak.twoTheta <= 80)).toBe(true);
    expect(peaks[0].hkl).toBe('0 0 1');
    expect(peaks[1].hkl).toBe('0 1 0');
  });

  it('expands fractional, signed and decorated symmetry coordinates like explicit atom positions', () => {
    const originalSite = { ...site, fract_x: 0.13, fract_y: 0.27, fract_z: 0.39 };
    const operations = [identity[0], { ...identity[0], operation_xyz: "'( -X + 1/2, -Y, Z - 1/4 )'" }];
    const expected = simulatePxrd(entry, [originalSite,
      { ...originalSite, fract_x: 0.37, fract_y: 0.73, fract_z: 0.14 }], identity);
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

  it('rejects malformed symmetry operations and unknown elements without partial output', () => {
    const bad = ['x,y', 'x+1/0,y,z', 'bad*x,y,z'].map(operation_xyz => ({ ...identity[0], operation_xyz }));
    expect(simulatePxrd(entry, [site], [...bad, ...identity])).toEqual([]);
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

  it('uses a positive stored wavelength and rejects invalid explicit wavelengths', () => {
    const stored = { ...entry, radiation_wavelength_angstrom: 1 };
    expect(simulatePxrd(stored, [site], identity)).toEqual(simulatePxrd(entry, [site], identity, 1));
    expect(simulatePxrd(stored, [site], identity, -1)).toEqual([]);
    expect(simulatePxrd({ ...entry, radiation_wavelength_angstrom: -1 }, [site], identity))
      .toEqual([]);
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

describe('independent Gemmi 0.7.5 references', () => {
  it.each(reference.cases)('$name positions, integrated intensities and Gaussian profile', fixture => {
    const [a,b,c,alpha,beta,gamma] = fixture.cell;
    const crystal = { ...entry, cell_a_angstrom:a, cell_b_angstrom:b, cell_c_angstrom:c,
      cell_angle_alpha:alpha, cell_angle_beta:beta, cell_angle_gamma:gamma };
    const sites = fixture.atoms.map(atom => {
      const [symbol, xyz, occupancy, bIso] = atom as [string, number[], number, number];
      return { ...site, type_symbol:symbol, fract_x:xyz[0], fract_y:xyz[1], fract_z:xyz[2], occupancy, b_iso_or_equiv:bIso };
    });
    const result = calculatePxrd(crystal, sites, fixture.operations.map(operation_xyz=>({...identity[0],operation_xyz})), fixture.wavelength);
    expect(result.status, result.diagnostics.join('\n')).toBe('complete');
    expect(result.peaks).toHaveLength(fixture.peaks.length);
    result.peaks.forEach((peak,i) => {
      expect(Math.abs(peak.twoTheta-fixture.peaks[i][0])).toBeLessThan(reference.positionToleranceDegrees);
      expect(Math.abs(peak.intensity-fixture.peaks[i][1])).toBeLessThan(reference.intensityTolerancePercent);
    });
    const profile = createPxrdProfile(result.peaks);
    expect(profile).toHaveLength(fixture.profile.length);
    expect(Math.max(...profile.map((point,i)=>Math.abs(point.intensity-fixture.profile[i])))).toBeLessThan(reference.profileTolerancePercent);
  });
});

describe('scientific diagnostics and reproducibility', () => {
  it('keeps distinct periodic positions whose undelimited coordinate keys collide', () => {
    // Rounded keys [1,23456,7] and [12,3456,7] both concatenate to 1234567.
    const original = {...site,fract_x:.00001,fract_y:.23456,fract_z:.00007};
    const translated = {...original,fract_x:.00012,fract_y:.03456};
    const operations = [...identity,{...identity[0],operation_xyz:'x+11/100000,y-1/5,z'}];
    const actual=simulatePxrd(entry,[original],operations);
    const expected=simulatePxrd(entry,[original,translated],identity);
    expect(actual).toHaveLength(expected.length);
    actual.forEach((peak,i)=>expect(peak.intensity).toBeCloseTo(expected[i].intensity,8));
  });
  it('retains a Gaussian maximum at the inclusive upper endpoint', () => {
    const profile=createPxrdProfile([{twoTheta:80,intensity:100,hkl:'1 0 0'}]);
    expect(profile.at(-1)).toEqual({twoTheta:80,intensity:100});
    expect(profile.at(-2)!.intensity).toBeLessThan(100);
  });
  it('exposes defaults and preserves plain two-column export', () => {
    const result = calculatePxrd({...entry,cell_angle_alpha:null,radiation_wavelength_angstrom:null}, [{...site,occupancy:null,b_iso_or_equiv:null,u_iso_or_equiv:null}], []);
    expect(result.status).toBe('complete');
    for (const text of ['Wavelength assumed','Missing cell angles','occupancies assumed','displacement assumed','identity symmetry']) expect(result.diagnostics.join(' ')).toContain(text);
    const profile = createPxrdProfile(result.peaks);
    const header = serializePxrdProfile(profile,true,{result,fwhm:.1});
    for (const text of ['IT92-neutral-v1','wavelength_A=1.5406','FWHM_2theta_deg=0.1','status=complete','step_deg=0.02']) expect(header).toContain(text);
    expect(serializePxrdProfile(profile,false,{result,fwhm:.1})).toBe(serializePxrdProfile(profile,false));
  });
  it.each(['x,,z','x+1/2/3,y,z','2x,y,z','x+y,y,z','x+1/0,y,z'])('rejects unusable operation %s', operation_xyz => {
    expect(calculatePxrd(entry,[site],[{...identity[0],operation_xyz}]).status).toBe('unsupported');
  });
  it.each([{fract_x:NaN},{fract_y:Infinity},{occupancy:-.1},{occupancy:1.1},{b_iso_or_equiv:-1},{u_iso_or_equiv:Infinity},{type_symbol:'Es'}])('rejects unsupported atoms %j', invalid => {
    expect(calculatePxrd(entry,[site,{...site,...invalid}],identity).status).toBe('unsupported');
  });
  it('rejects unsupported radiation, missing non-P1 symmetry, invalid wavelengths and oversized work', () => {
    expect(calculatePxrd({...entry,radiation_type:'neutrons'},[site],identity).status).toBe('unsupported');
    expect(calculatePxrd({...entry,sg_number:225},[site],[]).status).toBe('unsupported');
    for (const wavelength of [0,-1,NaN,Infinity,.1,11]) expect(calculatePxrd(entry,[site],identity,wavelength).status).toBe('unsupported');
    expect(calculatePxrd({...entry,cell_a_angstrom:100,cell_b_angstrom:100,cell_c_angstrom:100},Array.from({length:300},()=>site),identity).status).toBe('unsupported');
  });
  it('flags a capped search as incomplete and keeps distinct close reflections', () => {
    const result = calculatePxrd({...entry,cell_a_angstrom:60},[site],identity);
    expect(result.status).toBe('incomplete');
    expect(result.diagnostics.join(' ')).toContain('index bounds exceed 36');
    const peaks = simulatePxrd({...entry,cell_b_angstrom:4.001},[site],identity);
    expect(peaks[1].twoTheta-peaks[0].twoTheta).toBeGreaterThan(1e-7);
    expect(peaks[1].twoTheta-peaks[0].twoTheta).toBeLessThan(.025);
  });
  it('rejects a cell whose distinct reflection count exceeds the plotting bound', () => {
    const result = calculatePxrd({...entry,cell_a_angstrom:80,cell_b_angstrom:81,cell_c_angstrom:82,
      cell_angle_alpha:73,cell_angle_beta:82,cell_angle_gamma:67},[site],identity);
    expect(result.status).toBe('unsupported');
    expect(result.peaks).toEqual([]);
    expect(result.diagnostics.at(-1)).toContain('10,000 distinct reflections');
  });
  it.each([NaN,Infinity,-1,0])('rejects non-finite or nonpositive profile width %s', fwhm => {
    expect(createPxrdProfile([{twoTheta:40,intensity:100,hkl:'1 0 0'}],fwhm)).toEqual([]);
  });
});
