import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildCrystalLoadScript,
  cellParametersScript,
  CRYSTAL_AXES_SCALE,
  CRYSTAL_OVERVIEW_ZOOM,
  fitResetScript,
  initialAppearanceScript,
  MAX_STRUCTURE_ZOOM,
  MIN_STRUCTURE_ZOOM,
  projectedStructureZoom,
  representationScript,
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

  it('increases the original crystallographic axis spacing by five percent', () => {
    expect(initialAppearanceScript(1, 'atoms', true, false))
      .toContain(`set axesScale ${CRYSTAL_AXES_SCALE}`);
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
});
