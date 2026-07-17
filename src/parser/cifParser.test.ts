import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseCif,
  parseFormulaSum,
  formatFormula,
  stripUncertainty,
  buildReference,
  calculateUnitCellVolume,
} from './cifParser';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(__dirname, '__fixtures__', 'synthetic-test.cif');
const fixtureText = readFileSync(fixturePath, 'utf-8');

describe('parseCif against the synthetic CIF fixture', () => {
  const entry = parseCif(fixtureText);

  it('parses the formula', () => {
    expect(entry.formula).toBe('Cl1Na1');
  });

  it('builds the reference string', () => {
    expect(entry.reference).toBe('Synthetic Test Journal, 2026, 1, 1-2');
  });

  it('determines level of structural studies', () => {
    expect(entry.level).toBe('Cell parameters determined and structure type assigned');
  });

  it('classifies the sample from the anisotropic atom-site label', () => {
    expect(entry.sampleType).toBe('Powder');
  });

  it('parses the experimental crystal colour', () => {
    expect(entry.crystalColour).toBe('blue');
  });

  it('classifies a CIF with an anisotropic atom-site label as a sample crystal', () => {
    const withAnisoLabel = `${fixtureText}\nloop_\n_atom_site_aniso_label\nSb1\n`;
    expect(parseCif(withAnisoLabel).sampleType).toBe('Sample crystal');
  });

  it('leaves colour blank when the CIF colour is missing', () => {
    const withoutColour = fixtureText.replace(
      /(_exptl_crystal_colour\s+)blue/,
      '$1?'
    );
    expect(parseCif(withoutColour).crystalColour).toBe('');
  });

  it('parses cell lengths in nm', () => {
    expect(entry.cell_a).toBeCloseTo(0.5, 10);
    expect(entry.cell_b).toBeCloseTo(0.6, 10);
    expect(entry.cell_c).toBeCloseTo(0.7, 10);
  });

  it('parses cell angles and prefers the CIF-provided volume', () => {
    expect([entry.cellAlpha, entry.cellBeta, entry.cellGamma]).toEqual([90, 90, 90]);
    expect(entry.cellVolume).toBe(210);
  });

  it('calculates volume from lengths and angles when _cell_volume is missing', () => {
    const withoutVolume = fixtureText.replace(/(_cell_volume\s+)\S+/, '$1?');
    expect(parseCif(withoutVolume).cellVolume).toBeCloseTo(210, 8);
  });

  it('parses the space group number', () => {
    expect(entry.sg_number).toBe(1);
  });

  it('parses the space group symbol with spaces removed', () => {
    expect(entry.space_group).toBe('P1');
  });

  it('parses atom-site loop rows in their original order', () => {
    expect(entry.atomSites).toHaveLength(2);
    expect(entry.atomSites[0]).toEqual({
      siteLabel: 'Na1',
      typeSymbol: 'Na',
      symmetryMultiplicity: 1,
      wyckoffSymbol: 'a',
      fractX: 0,
      fractY: 0,
      fractZ: 0,
      occupancy: 1
    });
    expect(entry.atomSites[1].siteLabel).toBe('Cl1');
  });
});

describe('stripUncertainty', () => {
  it('strips a trailing parenthesized uncertainty', () => {
    expect(stripUncertainty('16.5(3)')).toBe(16.5);
  });

  it('handles values with no uncertainty', () => {
    expect(stripUncertainty('4')).toBe(4);
  });

  it('handles multi-digit uncertainties', () => {
    expect(stripUncertainty('23.860(12)')).toBeCloseTo(23.86, 10);
  });

  it('does not accept a partially numeric malformed value', () => {
    expect(stripUncertainty('16.5junk')).toBeNaN();
  });
});

describe('calculateUnitCellVolume', () => {
  it('uses the general non-orthogonal unit-cell volume formula', () => {
    expect(calculateUnitCellVolume(5, 6, 7, 80, 75, 70)).toBeCloseTo(189.771269, 5);
  });
});

describe('parseCif numeric validation', () => {
  function withTagValue(tag: string, value: string): string {
    const pattern = new RegExp(`(${tag}\\s+)(?:'[^']*'|"[^"]*"|\\S+)`);
    return fixtureText.replace(pattern, `$1${value}`);
  }

  it('rejects a non-numeric cell length instead of returning NaN', () => {
    expect(() => parseCif(withTagValue('_cell_length_a', 'junk'))).toThrow(
      'Invalid _cell_length_a'
    );
  });

  it('rejects a malformed space-group number instead of partially parsing it', () => {
    expect(() => parseCif(withTagValue('_space_group_IT_number', '62junk'))).toThrow(
      'Invalid _space_group_IT_number'
    );
  });
});

describe('buildReference - missing components', () => {
  const base = new Map<string, string>([
    ['_journal_name_full', "'Inorg. Mater.'"],
    ['_journal_year', '1986'],
    ['_journal_volume', '22'],
    ['_journal_page_first', '23'],
    ['_journal_page_last', '27'],
  ]);

  it('builds the full reference when nothing is missing', () => {
    expect(buildReference(base)).toBe('Inorg. Mater., 1986, 22, 23-27');
  });

  it('omits the journal name cleanly when missing', () => {
    const m = new Map(base);
    m.set('_journal_name_full', '?');
    expect(buildReference(m)).toBe('1986, 22, 23-27');
  });

  it('omits the year cleanly when missing', () => {
    const m = new Map(base);
    m.delete('_journal_year');
    expect(buildReference(m)).toBe('Inorg. Mater., 22, 23-27');
  });

  it('omits the volume cleanly when missing', () => {
    const m = new Map(base);
    m.set('_journal_volume', '?');
    expect(buildReference(m)).toBe('Inorg. Mater., 1986, 23-27');
  });

  it('omits the pages cleanly when either page bound is missing', () => {
    const m1 = new Map(base);
    m1.set('_journal_page_first', '?');
    expect(buildReference(m1)).toBe('Inorg. Mater., 1986, 22');

    const m2 = new Map(base);
    m2.delete('_journal_page_last');
    expect(buildReference(m2)).toBe('Inorg. Mater., 1986, 22');
  });
});

describe('parseFormulaSum / formatFormula', () => {
  it('parses and sorts pairs alphabetically, reassembling with no spaces', () => {
    const pairs = parseFormulaSum("'Eu3 S9 Sb4'");
    expect(pairs).toEqual([
      { element: 'Eu', count: 3 },
      { element: 'S', count: 9 },
      { element: 'Sb', count: 4 },
    ]);
    expect(formatFormula(pairs)).toBe('Eu3S9Sb4');
  });

  it('handles decimal counts', () => {
    const pairs = parseFormulaSum("'Fe0.5 O1.5'");
    expect(pairs).toEqual([
      { element: 'Fe', count: 0.5 },
      { element: 'O', count: 1.5 },
    ]);
    expect(formatFormula(pairs)).toBe('Fe0.5O1.5');
  });

  it('treats an omitted count as implicit 1', () => {
    const pairs = parseFormulaSum("'Cl Na'");
    expect(pairs).toEqual([
      { element: 'Cl', count: 1 },
      { element: 'Na', count: 1 },
    ]);
    expect(formatFormula(pairs)).toBe('Cl1Na1');
  });

  it('sorts out-of-order tokens alphabetically', () => {
    const pairs = parseFormulaSum("'Sb4 Eu3 S9'");
    expect(formatFormula(pairs)).toBe('Eu3S9Sb4');
  });
});
