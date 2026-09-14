// Hand-written CIF parser: preserve this public entry point for all callers.
import { scanCif } from './cif/scanner';
import { normalizeCif } from './cif/entry';
import type { CifEntry } from './cif/types';

export type { CifEntry } from './cif/types';
export { splitCifDataBlocks } from './cif/blocks';
export { stripUncertainty } from './cif/values';
export { parseFormulaSum, parseFormulaMoiety, formatFormula } from './cif/formula';
export { buildReference, calculateUnitCellVolume } from './cif/entry';

/** Parse a single CIF block into the fields this application persists. */
export function parseCif(text: string): CifEntry {
  return normalizeCif(scanCif(text));
}
