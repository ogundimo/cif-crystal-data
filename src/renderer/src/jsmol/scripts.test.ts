import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildCrystalLoadScript,
  cellParametersScript,
  clearPolyhedraScript,
  clearMeasurementsScript,
  CRYSTAL_OVERVIEW_ZOOM,
  fitResetScript,
  initialAppearanceScript,
  MAX_STRUCTURE_ZOOM,
  MIN_STRUCTURE_ZOOM,
  projectedStructureZoom,
  projectedViewFit,
  projectedViewScript,
  polyhedraPickingScript,
  representationScript,
  supercellLattice,
  UNIT_CELL_LATTICE
} from './scripts';

describe('JSmol crystallographic scripts', () => {
  const representativePath = resolve(process.cwd(), '..', 'CIFS', '1140624.cif');
  const representativeCif = existsSync(representativePath)
    ? readFileSync(representativePath, 'utf8')
    : 'data_fixture\n_cell_length_a 5.25\n';

  it('embeds original CIF text unchanged in the load request', () => {
    expect(buildCrystalLoadScript(representativeCif, 1))
      .toContain(`load DATA "model"\n${representativeCif}\nEND "model"`);
  });

  it('uses the proven high-precision packed 1×1×1 load settings', () => {
    const script = buildCrystalLoadScript(representativeCif, 1);
    expect(script).toContain('set doublePrecision true');
    expect(script).toContain('set autobond false');
    expect(script).toContain(`${UNIT_CELL_LATTICE} PACKED FILTER "PRECISION=12"`);
  });

  it('renders atoms as spheres without sticks', () => {
    expect(representationScript('atoms')).toContain('wireframe 0');
    expect(representationScript('atoms')).toContain('spacefill 23%');
  });

  it('renders ball + stick with radius-based inferred visual sticks', () => {
    const script = representationScript('ball-stick');
    expect(script).toContain('connect 15% 110%');
    expect(script).toContain('wireframe 0.14');
    expect(script).toContain('spacefill 23%');
  });

  it('renders spacefill as full-size spheres without sticks', () => {
    expect(representationScript('spacefill')).toContain('wireframe 0');
    expect(representationScript('spacefill')).toContain('spacefill 100%');
  });

  it('uses an independent orientation indicator and suppresses the native popup', () => {
    const script = initialAppearanceScript(1, 'atoms', true, false);
    expect(script).toContain('axes off');
    expect(script).toContain('set disablePopupMenu true');
  });

  it('loads selectable 2×2×2 and 3×3×3 packed unit-cell blocks', () => {
    expect(supercellLattice(1)).toBe(UNIT_CELL_LATTICE);
    expect(buildCrystalLoadScript(representativeCif, 1, 2)).toContain('{2 2 2} PACKED');
    expect(buildCrystalLoadScript(representativeCif, 1, 3)).toContain('{3 3 3} PACKED');
  });

  it('hides cell parameters in compact mode and can restore them full-screen', () => {
    expect(initialAppearanceScript(1, 'atoms', true, false)).toContain('set displayCellParameters false');
    expect(cellParametersScript(true)).toBe('set displayCellParameters true');
  });

  it('uses the complete-structure overview zoom initially and after reset', () => {
    expect(initialAppearanceScript(1, 'atoms', true, false))
      .toContain(`zoom ${CRYSTAL_OVERVIEW_ZOOM}`);
    expect(fitResetScript()).toContain(`zoom ${CRYSTAL_OVERVIEW_ZOOM}`);
  });

  it('zooms smaller projected structures in and larger projected structures out', () => {
    const orientation = { rotationMatrix: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], modelRadius: 10 };
    const small = projectedStructureZoom([{ coord: [0, 0, 0] }, { coord: [2, 2, 0] }], orientation, 1000, 800);
    const medium = projectedStructureZoom([{ coord: [0, 0, 0] }, { coord: [8, 6, 0] }], orientation, 1000, 800);
    const large = projectedStructureZoom([{ coord: [0, 0, 0] }, { coord: [18, 14, 0] }], orientation, 1000, 800);
    expect(small).toBeGreaterThan(medium);
    expect(medium).toBeGreaterThan(large);
  });

  it('compensates for a long depth axis without adding it to visible width or height', () => {
    const identity = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    const atoms = [{ coord: [0, 0, -100] }, { coord: [5, 5, 100] }];
    const shallowRadius = projectedStructureZoom(atoms, { rotationMatrix: identity, modelRadius: 5 }, 1000, 800);
    const deepRadius = projectedStructureZoom(atoms, { rotationMatrix: identity, modelRadius: 100 }, 1000, 800);
    expect(deepRadius).toBeGreaterThan(shallowRadius);
  });

  it('clamps projected zoom and falls back safely when coordinates are unavailable', () => {
    const orientation = { rotationMatrix: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], modelRadius: 10 };
    expect(projectedStructureZoom([{ coord: [0, 0, 0] }, { coord: [0.01, 0.01, 0] }], orientation, 1000, 800)).toBe(MAX_STRUCTURE_ZOOM);
    expect(projectedStructureZoom([{ coord: [0, 0, 0] }, { coord: [5000, 5000, 0] }], orientation, 1000, 800)).toBe(MIN_STRUCTURE_ZOOM);
    expect(projectedStructureZoom(null, orientation, 1000, 800)).toBe(CRYSTAL_OVERVIEW_ZOOM);
  });

  it('clears completed and in-progress interactive measurements', () => {
    const script = clearMeasurementsScript();
    expect(script).toContain('measure delete');
    expect(script).toContain('set pickingstyle MEASURE OFF');
    expect(script).toContain('set picking OFF');
    expect(script).toContain('select none');
  });

  it('routes deliberate single atom picks to the application without double-click measurement conflicts', () => {
    const script = polyhedraPickingScript(true);
    expect(script).toContain('LEFT+double+click');
    expect(script).toContain('set picking IDENTIFY');
    expect(polyhedraPickingScript(false)).toContain('set picking OFF');
  });

  it('clears polyhedra and restores the selected representation connections', () => {
    const script = clearPolyhedraScript('ball-stick');
    expect(script).toContain('polyhedra {*} DELETE');
    expect(script).toContain('connect 15% 110%');
  });

  it('fits and shifts the structure away from a horizontal legend', () => {
    const orientation = { rotationMatrix: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], modelRadius: 10 };
    const atoms = [{ coord: [-5, -5, 0] }, { coord: [5, 5, 0] }];
    const unobstructed = projectedViewFit(atoms, orientation, 800, 400);
    const fitted = projectedViewFit(atoms, orientation, 800, 400, { top: 80 });
    expect(fitted.zoom).toBeLessThan(unobstructed.zoom);
    expect(fitted.translateXPercent).toBe(0);
    expect(fitted.translateYPercent).toBe(10);
    expect(projectedViewScript(fitted)).toContain('translate y 10');
  });

  it('fits and shifts the structure away from a vertical legend', () => {
    const fitted = projectedViewFit(null, null, 800, 400, { right: 160 });
    expect(fitted.translateXPercent).toBe(-10);
    expect(fitted.translateYPercent).toBe(0);
  });
});
