import { describe, expect, it } from 'vitest';
import { buildCifExportFilename, buildPxrdExportFilename, sanitizeFilenamePart } from './exportCif';

describe('CIF export filename', () => {
  it('uses Formula_SG-number.cif', () => {
    expect(buildCifExportFilename('Eu3S9Sb4', 62)).toBe('Eu3S9Sb4_62.cif');
  });

  it('uses Formula_SG-number.xy for diffraction patterns', () => {
    expect(buildPxrdExportFilename('Eu3S9Sb4', 62)).toBe('Eu3S9Sb4_62.xy');
  });

  it('sanitizes characters that are invalid in Windows filenames', () => {
    expect(sanitizeFilenamePart('Fe/O:* ')).toBe('Fe_O__');
  });
});
