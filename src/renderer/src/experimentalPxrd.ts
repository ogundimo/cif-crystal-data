import type { PxrdProfilePoint } from './pxrd';

/** Read two-column 2θ/intensity text without silently dropping malformed data rows. */
export function parseExperimentalPxrd(text: string): PxrdProfilePoint[] {
  const points: PxrdProfilePoint[] = [];
  const numeric = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;
  for (const [index, raw] of text.replace(/^\uFEFF/, '').split(/\r?\n/).entries()) {
    const line = raw.replace(/[#;!].*$/, '').trim();
    if (!line || line.startsWith('//')) continue;
    const columns = line.split(/[\s,]+/);
    if (!points.length && /^(?:2[θt]|two.?theta|angle)/i.test(line) && /intensity|counts/i.test(line)) continue;
    if (columns.length !== 2 || !columns.every(value => numeric.test(value))) {
      throw new Error(`Line ${index + 1}: expected two numeric columns (2θ in degrees, intensity).`);
    }
    const [twoTheta, intensity] = columns.map(Number);
    if (!Number.isFinite(twoTheta) || !Number.isFinite(intensity) || twoTheta < 0 || twoTheta > 180) {
      throw new Error(`Line ${index + 1}: invalid angle or intensity.`);
    }
    points.push({ twoTheta, intensity });
  }
  if (points.length < 2) throw new Error('The file must contain at least two data points.');
  points.sort((a, b) => a.twoTheta - b.twoTheta);
  if (points[0].twoTheta === points[points.length - 1].twoTheta) {
    throw new Error('The file must contain at least two different angles.');
  }
  return points;
}

export function normalizeExperimentalPxrd(points: PxrdProfilePoint[]): PxrdProfilePoint[] {
  const maximum = points.reduce((maximum, point) => Math.max(maximum, point.intensity), 0);
  if (maximum <= 0) throw new Error('The experimental pattern must contain a positive intensity.');
  return points.map(point => ({ ...point, intensity: point.intensity / maximum * 100 }));
}
