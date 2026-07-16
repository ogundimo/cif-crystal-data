import { describe, expect, it } from 'vitest';
import { buildCifExportFilename, sanitizeFilenamePart } from './exportCif';

describe('CIF export filename', () => {
  it('uses Formula_SG-number.cif', () => {
    expect(buildCifExportFilename('Eu3S9Sb4', 62)).toBe('Eu3S9Sb4_62.cif');
  });

  it('sanitizes characters that are invalid in Windows filenames', () => {
    expect(sanitizeFilenamePart('Fe/O:* ')).toBe('Fe_O__');
  });
});
