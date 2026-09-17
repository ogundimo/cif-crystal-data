import { LEVEL_CELL, LEVEL_FULL } from '../../shared/types';
import type { CifEntry, RawCif } from './types';
import { getClean, getRaw, hasCifValue, stripQuotes, stripUncertainty, nullableNumber, normalizeAddress } from './values';
import { parseFormulaSum, parseFormulaMoiety, formatFormula } from './formula';

export function calculateUnitCellVolume(
  a: number,
  b: number,
  c: number,
  alpha: number,
  beta: number,
  gamma: number
): number | null {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const cosAlpha = Math.cos(radians(alpha));
  const cosBeta = Math.cos(radians(beta));
  const cosGamma = Math.cos(radians(gamma));
  const radicand =
    1 + 2 * cosAlpha * cosBeta * cosGamma -
    cosAlpha ** 2 - cosBeta ** 2 - cosGamma ** 2;
  if (![a, b, c, alpha, beta, gamma].every(Number.isFinite) || a <= 0 || b <= 0 || c <= 0) {
    return null;
  }
  if (radicand < -1e-12) return null;
  return a * b * c * Math.sqrt(Math.max(0, radicand));
}

/** Build the "{journal}, {year}, {volume}, {first}-{last}" reference string, omitting missing parts cleanly. */
export function buildReference(tags: Map<string, string>): string {
  const firstValue = (...names: string[]): string | null =>
    names.map((name) => getClean(tags, name)).find((value) => value !== null) ?? null;
  const name = firstValue('_citation_journal_full', '_journal_name_full');
  const year = firstValue('_citation_year', '_journal_year');
  const volume = firstValue('_citation_journal_volume', '_journal_volume');
  const first = firstValue('_citation_page_first', '_journal_page_first');
  const last = firstValue('_citation_page_last', '_journal_page_last');
  const pages = first !== null && last !== null ? `${first}-${last}` : first;
  const parts = [name, year, volume, pages].filter((p): p is string => p !== null);
  if (!name || !year || !volume || !first) {
    const title = firstValue('_citation_title', '_publ_section_title');
    const doi = firstValue('_citation_doi', '_journal_paper_doi');
    if (title) parts.push(title);
    if (doi) parts.push(cleanDoi(doi));
  }
  return parts.join(', ');
}

const SAMPLE_SPACE_GROUP_NUMBERS = new Map<string, number>([
  ['p61', 169],
  ['imma', 74]
]);

function normalizedSpaceGroupSymbol(value: string): string {
  return stripQuotes(value).toLowerCase().replace(/[\s_()]/g, '');
}

function cleanDoi(value: string | null): string {
  return (value ?? '')
    .trim()
    .replace(/^doi\s*:\s*/i, '')
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
    .replace(/[\s.,;]+$/, '');
}

/** Normalize scanned CIF values into the fields this app persists. */
export function normalizeCif(raw: RawCif): CifEntry {
  const { tags, hasAnisoLabel, atomSites, publAuthors, symmetryOperations, atomSiteAnisotropic } = raw;

  const sumRaw = getRaw(tags, '_chemical_formula_sum');
  const moietyRaw = getRaw(tags, '_chemical_formula_moiety');
  if (!hasCifValue(sumRaw) && !hasCifValue(moietyRaw)) {
    throw new Error('Missing chemical formula');
  }
  const elements = hasCifValue(sumRaw)
    ? parseFormulaSum(sumRaw)
    : parseFormulaMoiety(moietyRaw as string);
  const formula = formatFormula(elements);

  const aRaw = getRaw(tags, '_cell_length_a');
  const bRaw = getRaw(tags, '_cell_length_b');
  const cRaw = getRaw(tags, '_cell_length_c');
  if (!hasCifValue(aRaw) || !hasCifValue(bRaw) || !hasCifValue(cRaw)) {
    throw new Error('Missing cell length tag(s)');
  }
  const cellAAngstrom = stripUncertainty(aRaw);
  const cellBAngstrom = stripUncertainty(bRaw);
  const cellCAngstrom = stripUncertainty(cRaw);
  // These legacy searchable columns remain in nanometres; explicit columns below store Å.
  const cell_a = cellAAngstrom / 10;
  const cell_b = cellBAngstrom / 10;
  const cell_c = cellCAngstrom / 10;
  if (!Number.isFinite(cell_a)) throw new Error('Invalid _cell_length_a');
  if (!Number.isFinite(cell_b)) throw new Error('Invalid _cell_length_b');
  if (!Number.isFinite(cell_c)) throw new Error('Invalid _cell_length_c');

  const validAngle = (tag: string): number | null => {
    const value = nullableNumber(getRaw(tags, tag));
    return value !== null && value > 0 && value < 180 ? value : null;
  };
  const cellAlpha = validAngle('_cell_angle_alpha');
  const cellBeta = validAngle('_cell_angle_beta');
  const cellGamma = validAngle('_cell_angle_gamma');
  const providedVolume = nullableNumber(getRaw(tags, '_cell_volume'));
  const cellVolume =
    providedVolume !== null && providedVolume > 0
      ? providedVolume
      : cellAlpha !== null && cellBeta !== null && cellGamma !== null
        ? calculateUnitCellVolume(cellAAngstrom, cellBAngstrom, cellCAngstrom, cellAlpha, cellBeta, cellGamma)
        : null;

  const spgRaw = getRaw(tags, '_space_group_name_H-M_alt') ??
    getRaw(tags, '_symmetry_space_group_name_H-M');
  if (!hasCifValue(spgRaw)) {
    throw new Error('Missing _space_group_name_H-M_alt');
  }
  const space_group = stripQuotes(spgRaw).replace(/\s+/g, '');
  const sgRaw = getRaw(tags, '_space_group_IT_number') ??
    getRaw(tags, '_symmetry_Int_Tables_number');
  const sg_number = hasCifValue(sgRaw)
    ? Number(stripQuotes(sgRaw))
    : SAMPLE_SPACE_GROUP_NUMBERS.get(normalizedSpaceGroupSymbol(spgRaw)) ?? Number.NaN;
  if (!Number.isInteger(sg_number) || sg_number < 1 || sg_number > 230) {
    throw new Error(hasCifValue(sgRaw)
      ? 'Invalid _space_group_IT_number'
      : 'Unresolved space-group number');
  }

  const reference = buildReference(tags);
  const level = hasAnisoLabel ? LEVEL_FULL : LEVEL_CELL;
  const sampleType = hasAnisoLabel ? 'Sample crystal' : 'Powder';
  const crystalColour = getClean(tags, '_exptl_crystal_colour') ?? '';
  const publTitle = getClean(tags, '_citation_title') ??
    getClean(tags, '_publ_section_title') ?? '';
  const citationDoi = cleanDoi(
    getClean(tags, '_citation_doi') ?? getClean(tags, '_journal_paper_doi')
  );
  const databaseCodeCcdc = getClean(tags, '_database_code_depnum_ccdc_archive') ?? '';
  const databaseCodeCsd = getClean(tags, '_database_code_csd') ?? '';
  const databaseCodeIcsd = getClean(tags, '_database_code_icsd') ?? '';
  const journalLanguage = getClean(tags, '_journal_language') ?? '';
  const formulaUnitsValue = nullableNumber(getRaw(tags, '_cell_formula_units_z'));
  const formulaUnitsZ = formulaUnitsValue !== null && formulaUnitsValue > 0 ? formulaUnitsValue : null;
  const radiationType = getClean(tags, '_diffrn_radiation_type') ??
    getClean(tags, '_cell_measurement_radiation');
  const wavelengthValue = nullableNumber(getRaw(tags, '_diffrn_radiation_wavelength')) ??
    nullableNumber(getRaw(tags, '_cell_measurement_wavelength'));
  const radiationWavelengthAngstrom = wavelengthValue !== null && wavelengthValue > 0
    ? wavelengthValue
    : null;
  // A single-author paper may state the tags as scalars instead of a loop.
  const scalarAuthorName = getClean(tags, '_citation_author_name') ??
    getClean(tags, '_publ_author_name');
  const authors = publAuthors.length > 0
    ? publAuthors
    : scalarAuthorName !== null
      ? [{ name: scalarAuthorName, address: normalizeAddress(getClean(tags, '_publ_author_address')) }]
      : [];

  return {
    formula,
    elements,
    cell_a,
    cell_b,
    cell_c,
    cellAAngstrom,
    cellBAngstrom,
    cellCAngstrom,
    cellAlpha,
    cellBeta,
    cellGamma,
    cellVolume,
    sg_number,
    space_group,
    reference,
    level,
    sampleType,
    crystalColour,
    publTitle,
    citationDoi,
    databaseCodeCcdc,
    databaseCodeCsd,
    databaseCodeIcsd,
    journalLanguage,
    formulaUnitsZ,
    radiationType,
    radiationWavelengthAngstrom,
    publAuthors: authors,
    dataAuthors: raw.dataAuthors ?? [],
    atomSites,
    symmetryOperations,
    atomSiteAnisotropic
  };
}
