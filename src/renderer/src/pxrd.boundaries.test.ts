import { describe, expect, it } from 'vitest';
import type { AtomSiteRow, EntryRow, SymmetryOperationRow } from '../../shared/types';
import { calculatePxrd } from './pxrd';

const entry = { sg_number:1, cell_a:0.4, cell_b:0.4, cell_c:0.4,
  cell_a_angstrom:4, cell_b_angstrom:4, cell_c_angstrom:4,
  cell_angle_alpha:90, cell_angle_beta:90, cell_angle_gamma:90,
  radiation_wavelength_angstrom:1.5406 } as EntryRow;
const site = { type_symbol:'Na', site_label:'Na1', fract_x:0, fract_y:0, fract_z:0,
  occupancy:1, u_iso_or_equiv:0, b_iso_or_equiv:0 } as AtomSiteRow;
const identity = [{operation_xyz:'x,y,z'}] as SymmetryOperationRow[];
const dMin = 1.5406 / (2 * Math.sin(40 * Math.PI / 180));

describe('PXRD numerical and resource boundaries', () => {
  it('includes an exactly representable 5-degree reflection and rejects one below it', () => {
    const c = 1.5406 / (2 * Math.sin(2.5 * Math.PI / 180));
    const cell = {...entry,cell_a_angstrom:0.1,cell_b_angstrom:0.1,cell_c_angstrom:c};
    expect(calculatePxrd(cell,[site],identity).peaks[0]).toMatchObject({twoTheta:5,hkl:'0 0 1'});
    expect(calculatePxrd({...cell,cell_c_angstrom:c*(1+1e-12)},[site],identity).peaks[0].hkl).toBe('0 0 2');
  });

  it('retains the integer reciprocal endpoint and brackets the 80-degree cutoff', () => {
    const cell = {...entry,cell_a_angstrom:0.1,cell_b_angstrom:0.1,cell_c_angstrom:10*dMin};
    const last = calculatePxrd(cell,[site],identity).peaks.at(-1)!;
    expect(last.hkl).toBe('0 0 10');
    expect(last.twoTheta).toBeCloseTo(80,12);
    expect(calculatePxrd({...cell,cell_c_angstrom:10*dMin*(1-1e-12)},[site],identity).peaks.at(-1)!.hkl).toBe('0 0 9');
  });

  it.each([
    ['cell_a_angstrom','36 0 0'], ['cell_b_angstrom','0 36 0'], ['cell_c_angstrom','0 0 36']
  ])('includes the positive capped %s index and marks the result incomplete', (axis, hkl) => {
    const length = 36.5*dMin;
    const result = calculatePxrd({...entry,cell_a_angstrom:0.1,cell_b_angstrom:0.1,cell_c_angstrom:0.1,
      [axis]:length},[site],identity);
    expect(result.status).toBe('incomplete');
    expect(result.peaks.at(-1)!.hkl).toBe(hkl);
    expect(result.peaks.at(-1)!.twoTheta).toBeCloseTo(2*Math.asin(36*1.5406/(2*length))*180/Math.PI,10);
  });

  it('admits equality at the sine and volume degeneracy guards', () => {
    const gamma = Math.asin(1e-8)/(Math.PI/180);
    expect(calculatePxrd({...entry,cell_angle_gamma:gamma},[site],identity).status).toBe('complete');
    expect(calculatePxrd({...entry,cell_angle_gamma:gamma*(1-Number.EPSILON)},[site],identity).status).toBe('unsupported');
    const tiny = {...entry,cell_a_angstrom:1,cell_b_angstrom:1,cell_c_angstrom:1e-8};
    expect(calculatePxrd(tiny,[site],identity).status).toBe('complete');
    expect(calculatePxrd({...tiny,cell_c_angstrom:1e-8*(1-Number.EPSILON)},[site],identity).status).toBe('unsupported');
  });

  it('excludes raw intensity equal to the absolute cutoff before normalization', () => {
    // Analytic 001: d=1.3 Å; occupancy solves (occupancy*f_Na)^2*LP=1e-8.
    // The fixed value uses the pinned IT92 coefficients, not a production helper.
    const occupancy = 0.000008983789640712616;
    const cell = {...entry,cell_a_angstrom:1,cell_b_angstrom:1,cell_c_angstrom:1.3};
    expect(calculatePxrd(cell,[{...site,occupancy}],identity).peaks).toEqual([]);
    const above = calculatePxrd(cell,[{...site,occupancy:occupancy*(1+1e-12)}],identity).peaks;
    expect(above).toHaveLength(1);
    expect(above[0].hkl).toBe('0 0 1');
    expect(above[0].intensity).toBeCloseTo(100,12);
  });

  it('merges below the angular tolerance and separates above it', () => {
    const near = calculatePxrd({...entry,cell_b_angstrom:4*(1+2e-9)},[site],identity).peaks;
    const far = calculatePxrd({...entry,cell_b_angstrom:4*(1+1e-8)},[site],identity).peaks;
    expect(near[1].twoTheta-near[0].twoTheta).toBeGreaterThan(1);
    expect(far[1].twoTheta-far[0].twoTheta).toBeGreaterThan(1e-7);
    expect(far[1].twoTheta-far[0].twoTheta).toBeLessThan(3e-7);
    // Every binary64 angle in [5,80] is a multiple of 2^-50. Their difference
    // cannot equal this cutoff, whose binary representation has finer bits.
    expect(Number.isInteger(1e-7*2**50)).toBe(false);
  });

  it('accepts exact metric tolerance and rejects the adjacent tighter scale', () => {
    // Swapping b=1 and c=sqrt(11) changes G by exactly 10 Å²;
    // 1e-5*a² is exactly 10 for a=1000 Å.
    const cell = {...entry,cell_a_angstrom:1000,cell_b_angstrom:1,cell_c_angstrom:Math.sqrt(11)};
    const operations = [...identity,{...identity[0],operation_xyz:'x,z,y'}];
    expect(calculatePxrd(cell,[site],operations).status).toBe('incomplete');
    expect(calculatePxrd({...cell,cell_a_angstrom:999.9999999999999},[site],operations).status).toBe('unsupported');
  });

  it('admits exactly 50 million estimated evaluations and rejects the next site', () => {
    // Each required bound is 12: (2*12+1)^3 * 6400/2 = 50,000,000.
    // A narrow gamma rejects most reciprocal points before the atom loop.
    const cell = {...entry,cell_a_angstrom:10.5*dMin,cell_b_angstrom:10.5*dMin,
      cell_c_angstrom:10.5*dMin,cell_angle_gamma:0.001};
    const accepted = calculatePxrd(cell,Array.from({length:6400},()=>site),identity);
    expect(accepted.status).toBe('complete');
    expect(accepted.peaks.length).toBeGreaterThan(0);
    const rejected = calculatePxrd(cell,Array.from({length:6401},()=>site),identity);
    expect(rejected.status).toBe('unsupported');
    expect(rejected.diagnostics.at(-1)).toContain('50 million');
  });

  it('admits exactly 10,000 reflections and rejects the next shell', () => {
    // Independent inverse-metric enumeration is retained in the milestone evidence.
    const scale = 4.003265380859375;
    const cell = {...entry,cell_a_angstrom:4.1*scale,cell_b_angstrom:5.3*scale,
      cell_c_angstrom:6.7*scale,cell_angle_alpha:73,cell_angle_beta:82,cell_angle_gamma:67};
    const accepted = calculatePxrd(cell,[site],identity);
    expect(accepted.status).toBe('complete');
    expect(accepted.peaks).toHaveLength(10000);
    const rejected = calculatePxrd({...cell,cell_a_angstrom:4.1*4.0035400390625,
      cell_b_angstrom:5.3*4.0035400390625,cell_c_angstrom:6.7*4.0035400390625},[site],identity);
    expect(rejected.status).toBe('unsupported');
    expect(rejected.peaks).toEqual([]);
    expect(rejected.diagnostics.at(-1)).toContain('10,000 distinct reflections');
  });

  it('preserves periodic grid rounding numerically at a half-grid boundary', () => {
    const sites = [{...site,fract_x:0.000015}, {...site,type_symbol:'Fe',fract_x:0.173,fract_y:0.213}];
    const result = calculatePxrd(entry,sites,[...identity,{...identity[0],operation_xyz:'x+1/100000,y,z'}]);
    // Binary64 wrapping puts both Na images in grid bin 2. Fe images remain
    // distinct. Explicit expansion independently supplies that deduplicated cell.
    const explicit = calculatePxrd(entry,[sites[0],sites[1],{...sites[1],fract_x:0.17301}],identity);
    expect(result.peaks).toHaveLength(explicit.peaks.length);
    result.peaks.forEach((peak,i) => {
      expect(peak.twoTheta).toBeCloseTo(explicit.peaks[i].twoTheta,10);
      expect(peak.intensity).toBeCloseTo(explicit.peaks[i].intensity,9);
      expect(peak.hkl).toBe(explicit.peaks[i].hkl);
    });
  });
});
