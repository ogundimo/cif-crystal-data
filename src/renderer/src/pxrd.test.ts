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
    const rows = serializePxrdProfile(createPxrdProfile(result.peaks)).trim().split('\n');
    expect(rows.every(row => /^\d+\.\d{4}\t\d+\.\d{6}$/.test(row))).toBe(true);
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

  it('writes two tab-separated numeric columns without a header', () => {
    expect(serializePxrdProfile(profile)).toBe('12.3457\t98.765432\n');
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
    const rows = serializePxrdProfile(profile).trim().split('\n').map(row => row.split('\t').map(Number));
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
  it('retains high-order cubic reflections at a short supported wavelength', () => {
    const wavelength=.5609;
    // d800=a/8=0.5 A; independently apply Bragg's law.
    const angle=2*Math.asin(wavelength)*180/Math.PI;
    expect(calculatePxrd(entry,[site],identity,wavelength).peaks.some(p=>Math.abs(p.twoTheta-angle)<1e-7)).toBe(true);
  });
  it('reports the exact reflection-bound limit and retains the positive capped plane', () => {
    const dMin=1.5406/(2*Math.sin(40*Math.PI/180));
    expect(calculatePxrd({...entry,cell_a_angstrom:dMin*34.5},[site],identity).status).toBe('complete');
    expect(calculatePxrd({...entry,cell_a_angstrom:dMin*35.5},[site],identity).status).toBe('incomplete');
    const length=dMin*36.5;
    const result=calculatePxrd({...entry,cell_a_angstrom:length},[site],identity);
    const angle=2*Math.asin(1.5406*36/(2*length))*180/Math.PI;
    expect(result.peaks.some(p=>Math.abs(p.twoTheta-angle)<1e-7)).toBe(true);
  });
  it('enforces operation and expanded-atom limits at their inclusive boundaries', () => {
    expect(calculatePxrd(entry,[site],Array.from({length:384},()=>identity[0])).status).toBe('complete');
    expect(calculatePxrd(entry,[site],Array.from({length:385},()=>identity[0])).diagnostics)
      .toContain('Malformed or cell-incompatible symmetry operations; no partial pattern is calculated.');
    // Tiny synthetic cell has no reflections in range; this tests resource admission,
    // not the physical plausibility of 10,000 coincident sites.
    const tiny={...entry,cell_a_angstrom:.1,cell_b_angstrom:.1,cell_c_angstrom:.1};
    expect(calculatePxrd(tiny,Array.from({length:10000},()=>site),identity).status).toBe('complete');
    expect(calculatePxrd(tiny,Array.from({length:10001},()=>site),identity).diagnostics)
      .toContain('Structure exceeds the supported calculation work limit (50 million atom/reflection evaluations).');
  });
  it('retains actionable wavelength and missing-symmetry rejection reasons', () => {
    expect(calculatePxrd(entry,[site],identity,0).diagnostics).toContain('Wavelength must be finite, positive and at most 10 Å.');
    for (const wavelength of [.1,.25,Math.sin(40*Math.PI/180)/2]) {
      expect(calculatePxrd(entry,[site],identity,wavelength).diagnostics)
        .toContain('The requested range exceeds the IT92 form-factor limit sin(θ)/λ < 2 Å⁻¹. Increase the wavelength.');
    }
    expect(calculatePxrd({...entry,sg_number:225},[site],[]).diagnostics)
      .toContain('Explicit symmetry operations are required outside P1; reimport a CIF containing them.');
  });
  it('rejects integer-coefficient overflow before admitting a symmetry operation', () => {
    const huge='1'+'0'.repeat(308);
    // Each coefficient is finite, but their sum overflows when the rotation
    // matrix is evaluated at a unit vector. At the origin both terms are zero.
    const operation_xyz=`${huge}x+${huge}x,y,z`;
    const result=calculatePxrd(entry,[site],[{...identity[0],operation_xyz}]);
    expect(result.status).toBe('unsupported');
    expect(result.diagnostics).toContain('Malformed or cell-incompatible symmetry operations; no partial pattern is calculated.');
  });
  it('validates non-reduced cells whose rotation determinant has two nonzero cross terms', () => {
    // R(y,z)=(y-2z,y-z), R^2=-I; G=[[16,-16],[-16,32]] satisfies R^T G R=G.
    const crystal={...entry,cell_b_angstrom:4,cell_c_angstrom:Math.sqrt(32),cell_angle_alpha:135};
    const original={...site,fract_x:.1,fract_y:.2,fract_z:.3};
    const operations=['x,y,z','x,y-2z,y-z','x,-y,-z','x,2z-y,z-y'].map(operation_xyz=>({...identity[0],operation_xyz}));
    const expanded=[[.2,.3],[.6,.9],[.8,.7],[.4,.1]].map(([fract_y,fract_z])=>({...original,fract_y,fract_z}));
    const actual=calculatePxrd(crystal,[original],operations),expected=calculatePxrd(crystal,expanded,identity);
    expect(actual.status).toBe('complete');
    expect(actual.peaks).toHaveLength(expected.peaks.length);
    actual.peaks.forEach((peak,i)=>expect(peak.intensity).toBeCloseTo(expected.peaks[i].intensity,7));
  });
  it('scales the metric tolerance by the largest squared length for rounded cells', () => {
    // Swapping b/c differs by about 0.00032 A^2, below 1e-5*a^2=0.001,
    // but above a tolerance based on the shortest length (0.00016).
    const crystal={...entry,cell_a_angstrom:10,cell_b_angstrom:4,cell_c_angstrom:4.00004};
    expect(calculatePxrd(crystal,[site],[{...identity[0],operation_xyz:'x,z,y'}]).status).toBe('complete');
    expect(calculatePxrd({...crystal,cell_c_angstrom:4.001},[site],[{...identity[0],operation_xyz:'x,z,y'}]).status).toBe('unsupported');
  });
  it('matches explicitly expanded mixed sites under signed fractional translations', () => {
    const sites=[{...site,fract_x:.13,fract_y:.21,fract_z:.37},
      {...site,type_symbol:'Fe',fract_x:.27,fract_y:.19,fract_z:.41}];
    const operations=[...identity,{...identity[0],operation_xyz:'-x+1/3,y+1/4,-z+1/5'}];
    const expanded=sites.flatMap(atom=>[atom,{...atom,fract_x:1/3-atom.fract_x,
      fract_y:atom.fract_y+1/4,fract_z:1+1/5-atom.fract_z}]);
    const actual=calculatePxrd(entry,sites,operations), expected=calculatePxrd(entry,expanded,identity);
    expect(actual.status).toBe('complete');
    expect(actual.peaks).toHaveLength(expected.peaks.length);
    actual.peaks.forEach((peak,i)=>expect(peak.intensity).toBeCloseTo(expected.peaks[i].intensity,8));
  });
  it('deduplicates rounded sites across the periodic boundary', () => {
    const sites=[site,{...site,type_symbol:'Fe',fract_x:.2,fract_y:.3,fract_z:.4}];
    const operations=[...identity,{...identity[0],operation_xyz:'x+999999999/1000000000,y,z'}];
    const actual=calculatePxrd(entry,sites,operations),expected=calculatePxrd(entry,sites,identity);
    expect(actual.status).toBe('complete');
    expect(actual.peaks).toHaveLength(expected.peaks.length);
    actual.peaks.forEach((peak,i)=>expect(peak.intensity).toBeCloseTo(expected.peaks[i].intensity,8));
  });
  it('deduplicates a special position reached with positive and negative coordinates', () => {
    const sodium={...site,fract_x:.5};
    const iron={...site,type_symbol:'Fe',fract_x:.2,fract_y:.13,fract_z:.27};
    const operations=[...identity,{...identity[0],operation_xyz:'-x-1,y,z'}];
    // +1/2 and -3/2 are one Na site; the Fe orbit has two distinct positions.
    const actual=calculatePxrd(entry,[sodium,iron],operations);
    const expected=calculatePxrd(entry,[sodium,iron,{...iron,fract_x:.8}],identity);
    expect(actual.status).toBe('complete');
    expect(actual.peaks).toHaveLength(expected.peaks.length);
    actual.peaks.forEach((peak,i)=>expect(peak.intensity).toBeCloseTo(expected.peaks[i].intensity,8));
  });
  it('reports missing atoms, malformed types and inferred labels explicitly', () => {
    expect(calculatePxrd(entry, [], identity).diagnostics).toContain('Atomic positions are unavailable.');
    expect(calculatePxrd(entry, [{...site, type_symbol:'Na?'}], identity).diagnostics)
      .toContain('Unrecognized atom type; supply an element symbol with an optional ionic charge.');
    const inferred = calculatePxrd(entry, [site, {...site, type_symbol:null, site_label:'Fe2', fract_x:.2}], identity);
    expect(inferred.status).toBe('complete');
    expect(inferred.diagnostics).toContain('Some elements inferred from atom labels.');
    expect(calculatePxrd(entry, [site], identity).diagnostics).not.toContain('Some elements inferred from atom labels.');
  });
  it.each(['a','b','c'] as const)('converts legacy %s lengths consistently for metric validation and peaks', axis => {
    const crystal = {...entry, cell_a_angstrom:4, cell_b_angstrom:5, cell_c_angstrom:6,
      cell_a:.4, cell_b:.5, cell_c:.6};
    const operations = [...identity, {...identity[0],operation_xyz:'-x,-y,z'}];
    const expected = calculatePxrd(crystal,[site],operations);
    const result = calculatePxrd({...crystal,[`cell_${axis}_angstrom`]:null},[site],operations);
    expect(result.status).toBe('complete');
    expect(result.peaks).toEqual(expected.peaks);
    expect(result.diagnostics).toContain('Legacy nanometre cell lengths converted to ångströms.');
    expect(expected.diagnostics).not.toContain('Legacy nanometre cell lengths converted to ångströms.');
    // A cyclic axis permutation preserves this cubic metric. Converting just one
    // legacy axis in the wrong direction makes it incorrectly incompatible.
    expect(calculatePxrd({...entry,[`cell_${axis}_angstrom`]:null},[site],
      [{...identity[0],operation_xyz:'y,z,x'}]).status).toBe('complete');
    // Exchanging unequal axes must remain incompatible after conversion.
    expect(calculatePxrd({...crystal,[`cell_${axis}_angstrom`]:null},[site],
      [{...identity[0],operation_xyz:'y,z,x'}]).status).toBe('unsupported');
    // 6 nm = 60 A needs indices beyond the cap; a wrong /10 fallback can hide it.
    expect(calculatePxrd({...entry,[`cell_${axis}_angstrom`]:null,[`cell_${axis}`]:6},[site],identity).status)
      .toBe('incomplete');
  });
  it.each(['12+x,y,z','1/12+x,y,z','1+x,y,z','x+12,y,z','x+1/12,y,z'])
    ('accepts translations before and after variables: %s', operation_xyz => {
      // A common origin shift multiplies F by a unit phase, preserving |F| squared.
      const result = calculatePxrd(entry,[site],[{...identity[0],operation_xyz}]);
      const expected = calculatePxrd(entry,[site],identity);
      expect(result.status).toBe('complete');
      expect(result.peaks).toHaveLength(expected.peaks.length);
      result.peaks.forEach((peak,i) => expect(peak.intensity).toBeCloseTo(expected.peaks[i].intensity,8));
    });
  it.each(['xray','x-ray','x ray','synchrotron','CuK','Mo K','Ag  K'])('accepts recorded X-ray radiation %s', radiation_type => {
    const result = calculatePxrd({...entry,radiation_type},[site],identity);
    expect(result.status).toBe('complete');
    expect(result.diagnostics).not.toContain('Radiation assumed: monochromatic X-rays.');
  });
  it.each(['neutron X-ray','electron synchrotron','unknown','x?ray'])('rejects unsupported radiation %s', radiation_type => {
    expect(calculatePxrd({...entry,radiation_type},[site],identity).diagnostics)
      .toContain('Only monochromatic X-ray scattering is supported; the recorded radiation type is unsupported.');
  });
  it.each(['Na+','Na+12','Na12+','Na-','Na2-'])('accepts charged element notation %s as neutral scattering', type_symbol => {
    expect(calculatePxrd(entry,[{...site,type_symbol}],identity).peaks).toEqual(calculatePxrd(entry,[site],identity).peaks);
  });
  it.each(['?Na','Na?','Na+x','Na12x','Na1?','Na+Na'])('rejects malformed atom symbols %s', type_symbol => {
    expect(calculatePxrd(entry,[site,{...site,type_symbol}],identity).status).toBe('unsupported');
  });
  it('includes Cf and zero occupancy in the supported domain', () => {
    expect(calculatePxrd(entry,[{...site,type_symbol:'Cf'}],identity).status).toBe('complete');
    const zero = calculatePxrd(entry,[{...site,occupancy:0}],identity);
    expect(zero.status).toBe('complete');
    expect(zero.peaks).toEqual([]);
    expect(zero.diagnostics).toContain('No nonzero reflections in the requested 5–80° range.');
    expect(calculatePxrd(entry,[site],identity).diagnostics).not.toContain('No nonzero reflections in the requested 5–80° range.');
  });
  it('reports only defaults actually used, including mixed site metadata', () => {
    const explicit = calculatePxrd({...entry,radiation_type:'X-ray'},[site],identity);
    expect(explicit.diagnostics).toEqual(['Neutral atoms; isotropic displacement only; no anomalous scattering, texture, absorption or instrumental corrections. Supplied symmetry must describe the complete cell.']);
    const mixed = calculatePxrd(entry,[site,{...site,occupancy:null,b_iso_or_equiv:null,u_iso_or_equiv:null}],identity);
    expect(mixed.diagnostics).toContain('Radiation assumed: monochromatic X-rays.');
    expect(mixed.diagnostics).toContain('Missing occupancies assumed to be one.');
    expect(mixed.diagnostics).toContain('Missing isotropic displacement assumed to be zero.');
    for (const displacement of [{b_iso_or_equiv:null,u_iso_or_equiv:.01},{b_iso_or_equiv:1,u_iso_or_equiv:null}]) {
      expect(calculatePxrd(entry,[{...site,...displacement}],identity).diagnostics)
        .not.toContain('Missing isotropic displacement assumed to be zero.');
    }
    expect(calculatePxrd({...entry,radiation_wavelength_angstrom:null},[site],identity,1).diagnostics)
      .not.toContain('Wavelength assumed: 1.5406 Å.');
    expect(calculatePxrd(entry,[site],identity,10).status).toBe('complete');
  });
  it.each([NaN,Infinity,-1,0,180,200])('rejects invalid cell angle %s with an actionable diagnostic', cell_angle_alpha => {
    expect(calculatePxrd({...entry,cell_angle_alpha},[site],identity).diagnostics).toContain('Invalid or degenerate unit cell.');
  });
  it.each(['a','b','c'] as const)('rejects invalid %s cell lengths before calculation', axis => {
    for (const length of [-1,0,NaN,Infinity]) {
      expect(calculatePxrd({...entry,[`cell_${axis}_angstrom`]:length},[site],identity).diagnostics)
        .toContain('Invalid or degenerate unit cell.');
    }
  });
  it.each([
    {cell_a_angstrom:.001,cell_b_angstrom:.001,cell_c_angstrom:.001},
    {cell_angle_gamma:1e-7}
  ])('rejects near-degenerate synthetic cells: %j', cell => {
    // Orthogonal volume 1e-9 A^3 and sin(1e-7 degrees) ~= 1.75e-9
    // independently fall below the declared 1e-8 volume/sine cutoffs.
    const result=calculatePxrd({...entry,...cell},[site],identity);
    expect(result.status).toBe('unsupported');
    expect(result.diagnostics).toContain('Invalid or degenerate unit cell.');
  });
  it.each([
    [{fract_x:null},'Missing or non-finite atomic coordinates; no partial pattern is calculated.'],
    [{occupancy:2},'Atomic occupancy must lie between zero and one.'],
    [{b_iso_or_equiv:-1},'Displacement parameters must be finite and nonnegative.'],
    [{type_symbol:'Xx'},'An atom has no supported neutral-atom form factor (H–Cf).'],
    [{type_symbol:'Es'},'An atom has no supported neutral-atom form factor (H–Cf).']
  ] as const)('retains rejection reason for %j', (invalid,message) => {
    expect(calculatePxrd(entry,[site,{...site,...invalid}],identity).diagnostics).toContain(message);
  });
  it.each([NaN,Infinity,-1,0,.0009,75.01])('rejects invalid profile sampling step %s', step => {
    expect(createPxrdProfile([{twoTheta:5,intensity:100,hkl:'1 0 0'}],.1,step)).toEqual([]);
  });
  it.each([{twoTheta:NaN,intensity:1},{twoTheta:40,intensity:Infinity},{twoTheta:40,intensity:-1}])
    ('does not hide invalid profile peaks among valid ones: %j', invalid => {
      expect(createPxrdProfile([{twoTheta:40,intensity:100,hkl:'1 0 0'},{...invalid,hkl:'0 1 0'}])).toEqual([]);
    });
  it('accepts inclusive sampling limits and zero intensity', () => {
    const peak={twoTheta:5,intensity:1,hkl:'1 0 0'};
    expect(createPxrdProfile([peak],.1,.001)).toHaveLength(75001);
    expect(createPxrdProfile([peak],.1,75)).toHaveLength(2);
    expect(createPxrdProfile([peak,{...peak,intensity:0}])).toEqual(createPxrdProfile([peak]));
  });
  it('writes no content for an empty profile', () => {
    expect(serializePxrdProfile([])).toBe('');
  });
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
    const exported = serializePxrdProfile(profile);
    expect(exported).not.toMatch(/#|2theta|wavelength|model=/);
    expect(exported.trim().split('\n')).toHaveLength(profile.length);
  });
  it.each(['x,y','x,y,z,x','x,,z','x+1/2/3,y,z','2x,y,z','x+y,y,z','x+1/0,y,z'])('rejects unusable operation %s', operation_xyz => {
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
