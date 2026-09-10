import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseCif,
  parseFormulaMoiety,
  parseFormulaSum,
  formatFormula,
  stripUncertainty,
  buildReference,
  calculateUnitCellVolume,
  splitCifDataBlocks,
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

  it('retains angstrom cell lengths for diffraction calculations', () => {
    expect([entry.cellAAngstrom, entry.cellBAngstrom, entry.cellCAngstrom]).toEqual([5, 6, 7]);
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

  it('accepts legacy space-group number and symbol tags', () => {
    const legacy = fixtureText
      .replace('_space_group_IT_number', '_symmetry_Int_Tables_number')
      .replace('_space_group_name_H-M_alt', '_symmetry_space_group_name_H-M');
    expect(parseCif(legacy).sg_number).toBe(1);
    expect(parseCif(legacy).space_group).toBe('P1');
  });

  it('parses radiation settings and formula units', () => {
    expect(entry.formulaUnitsZ).toBe(1);
    expect(entry.radiationType).toBe('X-rays, Cu Ka');
    expect(entry.radiationWavelengthAngstrom).toBeCloseTo(1.54056, 8);
  });

  it('parses symmetry operations in source order', () => {
    expect(entry.symmetryOperations).toEqual([
      { operationId: '1', operationXyz: 'x, y, z' }
    ]);
  });

  it('parses the publication title and journal language', () => {
    expect(entry.publTitle).toBe('A synthetic structure report used for testing');
    expect(entry.journalLanguage).toBe('English');
  });

  it('parses author names with their addresses, including multi-line address blocks', () => {
    expect(entry.publAuthors).toEqual([
      { name: 'Doe, J.', address: 'Department of Chemistry Example University Springfield' },
      { name: 'Roe, A.', address: 'Institute of Synthetic Crystallography, Shelbyville' }
    ]);
  });

  it('keeps an apostrophe inside a quoted author surname', () => {
    const withApostrophe = fixtureText.replace("'Doe, J.'", "'Finkel'shtein L.D.'");
    expect(parseCif(withApostrophe).publAuthors[0]).toEqual({
      name: "Finkel'shtein L.D.",
      address: 'Department of Chemistry Example University Springfield'
    });
  });

  it('reads authors stated as scalar tags rather than a loop', () => {
    const scalarAuthors = fixtureText.replace(
      /loop_\r?\n _publ_author_name\r?\n[\s\S]*?Shelbyville'\r?\n/,
      "_publ_author_name 'Solo, H.'\n_publ_author_address 'Lone Institute'\n"
    );
    expect(parseCif(scalarAuthors).publAuthors).toEqual([
      { name: 'Solo, H.', address: 'Lone Institute' }
    ]);
  });

  it('returns no authors when the CIF omits them', () => {
    const withoutAuthors = fixtureText.replace(
      /loop_\r?\n _publ_author_name\r?\n[\s\S]*?Shelbyville'\r?\n/,
      ''
    );
    const parsed = parseCif(withoutAuthors);
    expect(parsed.publAuthors).toEqual([]);
    expect(parsed.atomSites).toHaveLength(2);
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
      occupancy: 1,
      uIsoOrEquiv: 0.0063,
      bIsoOrEquiv: 0.5
    });
    expect(entry.atomSites[1].siteLabel).toBe('Cl1');
  });

  it('parses anisotropic U and B tensors when supplied', () => {
    const withAnisotropicData = `${fixtureText}\nloop_\n` +
      `_atom_site_aniso_label\n_atom_site_aniso_U_11\n_atom_site_aniso_U_22\n` +
      `_atom_site_aniso_U_33\n_atom_site_aniso_U_12\n_atom_site_aniso_U_13\n` +
      `_atom_site_aniso_U_23\n_atom_site_aniso_B_11\nNa1 0.01 0.02 0.03 0.004 0.005 0.006 0.79\n`;
    expect(parseCif(withAnisotropicData).atomSiteAnisotropic).toEqual([{
      siteLabel: 'Na1',
      u11: 0.01,
      u22: 0.02,
      u33: 0.03,
      u12: 0.004,
      u13: 0.005,
      u23: 0.006,
      b11: 0.79,
      b22: null,
      b33: null,
      b12: null,
      b13: null,
      b23: null
    }]);
  });

  it('accepts legacy symmetry operation tags', () => {
    const legacy = fixtureText.replace(
      /_space_group_symop_id\r?\n _space_group_symop_operation_xyz/,
      '_symmetry_equiv_pos_site_id\n _symmetry_equiv_pos_as_xyz'
    );
    expect(parseCif(legacy).symmetryOperations).toEqual([
      { operationId: '1', operationXyz: 'x, y, z' }
    ]);
  });
});

describe('citation metadata and multi-block CIF documents', () => {
  it('reads the first citation row and citation authors', () => {
    const citation = fixtureText
      .replace(/_publ_section_title[\s\S]*?testing\n/, '')
      .replace(/loop_\r?\n _publ_author_name[\s\S]*?Shelbyville'\r?\n/, '') + `
loop_
_citation_id
_citation_title
_citation_journal_full
_citation_year
_citation_journal_volume
_citation_page_first
_citation_page_last
_citation_doi
primary 'Citation title' 'Journal of Tests' 2025 12 40 49 10.1000/test
loop_
_citation_author_citation_id
_citation_author_name
primary 'Researcher, R.'
`;
    const parsed = parseCif(citation);
    expect(parsed.publTitle).toBe('Citation title');
    expect(parsed.reference).toBe('Journal of Tests, 2025, 12, 40-49');
    expect(parsed.citationDoi).toBe('10.1000/test');
    expect(parsed.publAuthors[0].name).toBe('Researcher, R.');
  });

  it('splits concatenated data blocks and ignores a leading hash line', () => {
    const blocks = splitCifDataBlocks(`0123456789abcdef\ndata_first\n_cell_length_a 1\n\ndata_second\n_cell_length_a 2\n`);
    expect(blocks).toHaveLength(2);
    expect(blocks.map((block) => block.name)).toEqual(['first', 'second']);
    expect(blocks[0].text).toContain('_cell_length_a 1');
    expect(blocks[0].text).not.toContain('0123456789abcdef');
    expect(blocks[1].text).toContain('_cell_length_a 2');
  });

  it('stores CCDC and ICSD identifiers for reference fallback', () => {
    const parsed = parseCif(`${fixtureText}\n_database_code_depnum_ccdc_archive 123456\n_database_code_CSD BEWTAY\n_database_code_ICSD 654321\n`);
    expect(parsed.databaseCodeCcdc).toBe('123456');
    expect(parsed.databaseCodeCsd).toBe('BEWTAY');
    expect(parsed.databaseCodeIcsd).toBe('654321');
  });

  it('accepts the journal DOI used by publication-style CIFs', () => {
    const parsed = parseCif(`${fixtureText}\n_journal_paper_doi 'https://doi.org/10.1000/example.'\n`);
    expect(parsed.citationDoi).toBe('10.1000/example');
  });

  it('resolves the two space-group symbols used without IT numbers in the sample corpus', () => {
    const withoutNumber = fixtureText.replace(/^_space_group_IT_number.*$/m, '');
    expect(parseCif(withoutNumber.replace("'P 1'", 'Imma')).sg_number).toBe(74);
    expect(parseCif(withoutNumber.replace("'P 1'", "'P6(1)'" )).sg_number).toBe(169);
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

describe('parseFormulaMoiety', () => {
  it('combines charged components, multipliers, and fractional solvates', () => {
    expect(parseFormulaMoiety("'C36 H30 Cl4 Fe4 S6 2-,2(C24 H20 P1 1+),0.75(C1 H2 Cl2)'"))
      .toEqual([
        { element: 'C', count: 84.75 },
        { element: 'Cl', count: 5.5 },
        { element: 'Fe', count: 4 },
        { element: 'H', count: 71.5 },
        { element: 'P', count: 2 },
        { element: 'S', count: 6 }
      ]);
  });

  it('provides the formula fallback when a sample has no sum formula', () => {
    const cif = fixtureText.replace(
      "_chemical_formula_sum                    'Na1 Cl1'",
      "_chemical_formula_moiety                 '2(C8 H20 N1 1+),Mo1 O1 S8 2-'"
    );
    expect(parseCif(cif).formula).toBe('C16H40Mo1N2O1S8');
  });
});
