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
} from './cifParser';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(__dirname, '__fixtures__', '540062.cif');
const fixtureText = readFileSync(fixturePath, 'utf-8');

describe('parseCif against 540062.cif fixture', () => {
  const entry = parseCif(fixtureText);

  it('parses the formula', () => {
    expect(entry.formula).toBe('Eu3S9Sb4');
  });

  it('builds the reference string', () => {
    expect(entry.reference).toBe('Inorg. Mater., 1986, 22, 23-27');
  });

  it('determines level of structural studies', () => {
    expect(entry.level).toBe('Cell parameters determined and structure type assigned');
  });

  it('parses cell lengths in nm', () => {
    expect(entry.cell_a).toBeCloseTo(1.65, 10);
    expect(entry.cell_b).toBeCloseTo(0.4, 10);
    expect(entry.cell_c).toBeCloseTo(2.386, 10);
  });

  it('parses the space group number', () => {
    expect(entry.sg_number).toBe(62);
  });

  it('parses the space group symbol with spaces removed', () => {
    expect(entry.space_group).toBe('Pnma');
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
