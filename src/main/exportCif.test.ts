import { sanitizeFilenamePart } from '../shared/exportFilename';
import { describe, expect, it } from 'vitest';
import { buildPxrdExportFilename } from './exportCif';
import { buildCifExportFilename } from '../shared/exportFilename';

describe('CIF export filename', () => {
  it('uses Formula_SG-number.cif', () => {
    expect(buildCifExportFilename('Eu3S9Sb4', 62)).toBe('Eu3S9Sb4_62.cif');
  });

  it.each(['CON.txt', 'COM\u00b9.data', 'nul.xyz'])('avoids Windows device filenames for %s', formula => {
    expect(buildCifExportFilename(formula, 1)).toBe(`_${formula}_1.cif`);
  });

  it('uses Formula_SG-number.xy for diffraction patterns', () => {
    expect(buildPxrdExportFilename('Eu3S9Sb4', 62)).toBe('Eu3S9Sb4_62.xy');
  });

  it('sanitizes characters that are invalid in Windows filenames', () => {
    expect(sanitizeFilenamePart('Fe/O:* ')).toBe('Fe_O__');
  });

  it.each([
    ['', 'compound'], [' ... ', 'compound'], ['CON', '_CON'], ['lPt9', '_lPt9'],
    ['aux', '_aux'], ['Fe2O3.  ', 'Fe2O3'], ['../Na\\Cl', '.._Na_Cl'],
    ['Na\u0000Cl', 'Na_Cl']
  ])('makes %j safe as a filename component', (input, expected) => {
    expect(sanitizeFilenamePart(input)).toBe(expected);
    expect(buildCifExportFilename(input, 1)).toBe(`${expected}_1.cif`);
    expect(buildPxrdExportFilename(input, 1)).toBe(`${expected}_1.xy`);
  });
});
