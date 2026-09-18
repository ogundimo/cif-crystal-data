// Capture before JSmol installs its Java-compatible global Error constructor.
const ApplicationError = globalThis.Error;
import { useSyncExternalStore } from 'react';

export const WAVELENGTH_PRESETS = [
  { label: 'Cu (1.5406 Å)', value: 1.5406 },
  { label: 'Mo (0.7107 Å)', value: 0.7107 },
  { label: 'Co (1.7902 Å)', value: 1.7902 },
  { label: 'Ag (0.5609 Å)', value: 0.5609 }
] as const;
export const MAX_PATTERN_BYTES = 4 * 1024 * 1024;
const MAX_POINTS = 100_000;
interface PatternPoint { twoTheta: number; intensity: number }
export interface ImportedPattern {
  fileName: string;
  original: PatternPoint[];
  normalized: PatternPoint[];
}

/** Strict ascending two-column XY; hash comments and blank lines are supported. */
export function parsePersonalPattern(text: string, fileName: string): ImportedPattern {
  if (new TextEncoder().encode(text).length > MAX_PATTERN_BYTES) throw new ApplicationError('Pattern exceeds the 4 MiB file limit.');
  const original: PatternPoint[] = [];
  let maximum = 0;
  let headerSeen = false;
  for (const [index, raw] of text.split(/\r?\n/).entries()) {
    const line = raw.replace(/#.*/, '').trim();
    if (!line) continue;
    if (!original.length && !headerSeen && /^2theta\s+intensity$/i.test(line)) { headerSeen = true; continue; }
    const columns = line.split(/\s+/);
    if (columns.length !== 2 || columns.some(value => !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(value))) {
      throw new ApplicationError(`Line ${index + 1}: expected two numeric columns (2θ and intensity); prefix headers with #.`);
    }
    const [twoTheta, intensity] = columns.map(Number);
    if (!Number.isFinite(twoTheta) || !Number.isFinite(intensity)) throw new ApplicationError(`Line ${index + 1}: values must be finite.`);
    if (twoTheta < 0 || twoTheta > 180) throw new ApplicationError(`Line ${index + 1}: 2θ must be between 0 and 180 degrees.`);
    if (intensity < 0) throw new ApplicationError(`Line ${index + 1}: negative intensity is not supported. Supply a nonnegative pattern; no baseline correction is applied.`);
    if (original.length && twoTheta <= original[original.length - 1].twoTheta) throw new ApplicationError(`Line ${index + 1}: angles must increase strictly, without duplicates.`);
    original.push({ twoTheta, intensity });
    maximum = Math.max(maximum, intensity);
    if (original.length > MAX_POINTS) throw new ApplicationError('Pattern exceeds the 100,000-point limit.');
  }
  if (original.length < 2) throw new ApplicationError('Pattern requires at least two numeric points.');
  if (maximum === 0) throw new ApplicationError('Pattern has no positive intensity to normalize.');
  return { fileName, original, normalized: original.map(point => ({ ...point, intensity: point.intensity / maximum * 100 })) };
}

// Session state survives selection, empty search results and details remounts.
let comparison: { wavelength: number; imported: ImportedPattern | null } = { wavelength: WAVELENGTH_PRESETS[0].value, imported: null };
const listeners = new Set<() => void>();
function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function usePatternComparison() {
  const state = useSyncExternalStore(subscribe, () => comparison);
  return {
    ...state,
    setWavelength: (wavelength: number) => {
      if (!WAVELENGTH_PRESETS.some(preset => preset.value === wavelength)) return;
      comparison = { ...comparison, wavelength }; listeners.forEach(listener => listener());
    },
    setImported: (imported: ImportedPattern | null) => {
      comparison = { ...comparison, imported }; listeners.forEach(listener => listener());
    }
  };
}
