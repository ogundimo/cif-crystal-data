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
it('preserves nonorthogonal cell angles and lengths under view rotation', () => {
  const axes = projectedAxes([4,4,4,90,90,60], [[1,0,0],[0,1,0],[0,0,1]]);
  expect(axes[0]).toEqual([30,0,0]);
  expect(axes[1][0]).toBeCloseTo(15, 10);
  expect(axes[1][1]).toBeCloseTo(15*Math.sqrt(3), 10);
  const rotated = projectedAxes([4,4,4,90,90,60], [[0,-1,0],[1,0,0],[0,0,1]]);
  expect(rotated[0]).toEqual([0,30,0]);
});
