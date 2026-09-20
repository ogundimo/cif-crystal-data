// Capture before JSmol installs its Java-compatible global Error constructor.
const ApplicationError = globalThis.Error;
export type Point = [number, number, number];
const dot = (a: Point, b: Point) => a.reduce((sum, value, i) => sum + value * b[i], 0);
const subtract = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export function measurementValue(points: Point[]): number {
  const first = subtract(points[0], points[1]);
  const length = Math.hypot(...first);
  if (length < 1e-8) throw new ApplicationError('Choose distinct positions; coincident atoms cannot define this measurement.');
  if (points.length === 2) return length;
  const second = subtract(points[2], points[1]);
  const secondLength = Math.hypot(...second);
  if (secondLength < 1e-8) throw new ApplicationError('Choose distinct positions; coincident atoms cannot define an angle.');
  return Math.acos(Math.max(-1, Math.min(1, dot(first, second) / length / secondLength))) * 180 / Math.PI;
}

/** Reject collinear neighbors; JSmol supports planar coordination polygons. */
export function supportsPolyhedron(points: Point[]): boolean {
  if (points.length < 3 || points.length >= 250) return false;
  const first = points[0];
  for (let i = 1; i < points.length; i++) {
    const a = subtract(points[i], first);
    for (let j = i + 1; j < points.length; j++) {
      const b = subtract(points[j], first);
      const area = Math.hypot(a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]);
      if (area > 1e-6) return true;
    }
  }
  return false;
}

/** Unit directions: a on x; b in xy; c with positive z. Lengths do not encode cell size. */
export function projectedAxes(cell: number[], rotation: number[][]): Point[] {
  const [, , , alpha, beta, gamma] = cell;
  const rad = Math.PI / 180;
  const cy = (Math.cos(alpha * rad) - Math.cos(beta * rad) * Math.cos(gamma * rad)) / Math.sin(gamma * rad);
  const basis: Point[] = [[1, 0, 0], [Math.cos(gamma * rad), Math.sin(gamma * rad), 0],
    [Math.cos(beta * rad), cy, Math.sqrt(Math.max(0, 1 - Math.cos(beta * rad)**2 - cy**2))]];
  const scale = 30;
  return basis.map(axis => rotation.map(row => dot(row as Point, axis) * scale) as Point);
}
