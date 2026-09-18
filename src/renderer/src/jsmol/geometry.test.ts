import { expect, it } from 'vitest';
import { measurementValue, projectedAxes, supportsPolyhedron } from './geometry';

it('measures Cartesian distance and an ordered angle with the second atom as vertex', () => {
  expect(measurementValue([[0,0,0],[3,4,0]])).toBe(5);
  expect(measurementValue([[1,0,0],[0,0,0],[0,1,0]])).toBeCloseTo(90, 10);
  expect(measurementValue([[1,0,0],[0,0,0],[1,Math.sqrt(3),0]])).toBeCloseTo(60, 10);
  expect(() => measurementValue([[0,0,0],[0,0,0]])).toThrow(/coincident/);
  expect(() => measurementValue([[1,0,0],[0,0,0],[0,0,0]])).toThrow(/coincident/);
});
it('distinguishes supported planar/nonplanar coordination from insufficient or collinear points', () => {
  expect(supportsPolyhedron([[1,0,0],[0,1,0],[-1,-1,0]])).toBe(true);
  expect(supportsPolyhedron([[1,0,0],[0,1,0],[0,0,1],[-1,-1,-1]])).toBe(true);
  expect(supportsPolyhedron([[0,0,0],[1,0,0]])).toBe(false);
  expect(supportsPolyhedron([[0,0,0],[1,0,0],[2,0,0]])).toBe(false);
});
it('preserves nonorthogonal cell directions under view rotation', () => {
  const axes = projectedAxes([4,4,4,90,90,60], [[1,0,0],[0,1,0],[0,0,1]]);
  expect(axes[0]).toEqual([30,0,0]);
  expect(axes[1][0]).toBeCloseTo(15, 10);
  expect(axes[1][1]).toBeCloseTo(15*Math.sqrt(3), 10);
  const rotated = projectedAxes([4,4,4,90,90,60], [[0,-1,0],[1,0,0],[0,0,1]]);
  expect(rotated[0]).toEqual([0,30,0]);
});

it.each([[4,4,40], [40,4,4], [4,40,4]])('keeps every direction visible for elongated cell lengths %j', (a, b, c) => {
  // gamma=120 puts b at (-1/2, sqrt(3)/2, 0); alpha=beta=90 puts c on z.
  // Direction lengths are a display convention, independent of lattice lengths.
  const cell = [a,b,c,90,90,120];
  const axes = projectedAxes(cell, [[1,0,0],[0,1,0],[0,0,1]]);
  for (const axis of axes) expect(Math.hypot(...axis)).toBeCloseTo(30, 10);
  expect(axes[1][0]).toBeCloseTo(-15, 10);
  expect(axes[1][1]).toBeCloseTo(15*Math.sqrt(3), 10);
  const rotated = projectedAxes(cell, [[0,-1,0],[1,0,0],[0,0,1]]);
  for (const i of [0,1]) {
    expect(Math.hypot(rotated[i][0]-axes[i][0], rotated[i][1]-axes[i][1])).toBeGreaterThan(30);
  }
  // A genuinely end-on axis is still foreshortened, not given an artificial direction.
  expect(Math.hypot(axes[2][0], axes[2][1])).toBeLessThan(1e-10);
});
