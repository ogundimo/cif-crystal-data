// Hand-written CIF parser (plain TypeScript, no external CIF library).
// Extracts only the tags this application needs.

import { LEVEL_CELL, LEVEL_FULL } from '../shared/types';

interface ElementCount {
  element: string;
  count: number;
}

interface ParsedAtomSite {
  siteLabel: string | null;
  typeSymbol: string | null;
  symmetryMultiplicity: number | null;
  wyckoffSymbol: string | null;
  fractX: number | null;
  fractY: number | null;
  fractZ: number | null;
  occupancy: number | null;
  uIsoOrEquiv: number | null;
  bIsoOrEquiv: number | null;
}

interface ParsedSymmetryOperation {
  operationId: string | null;
  operationXyz: string;
}

interface ParsedAtomSiteAnisotropic {
  siteLabel: string;
  u11: number | null;
  u22: number | null;
  u33: number | null;
  u12: number | null;
  u13: number | null;
  u23: number | null;
  b11: number | null;
  b22: number | null;
  b33: number | null;
  b12: number | null;
  b13: number | null;
  b23: number | null;
}

interface ParsedPublAuthor {
  name: string;
  address: string | null;
}

export interface CifEntry {
  formula: string;
  elements: ElementCount[];
  cell_a: number;
  cell_b: number;
  cell_c: number;
  cellAAngstrom: number;
  cellBAngstrom: number;
  cellCAngstrom: number;
  cellAlpha: number | null;
  cellBeta: number | null;
  cellGamma: number | null;
  cellVolume: number | null;
  sg_number: number;
  space_group: string;
  reference: string;
  level: string;
  sampleType: 'Sample crystal' | 'Powder';
  crystalColour: string;
  publTitle: string;
  citationDoi: string;
  databaseCodeCcdc: string;
  databaseCodeCsd: string;
  databaseCodeIcsd: string;
  journalLanguage: string;
  formulaUnitsZ: number | null;
  radiationType: string | null;
  radiationWavelengthAngstrom: number | null;
  publAuthors: ParsedPublAuthor[];
  atomSites: ParsedAtomSite[];
  symmetryOperations: ParsedSymmetryOperation[];
  atomSiteAnisotropic: ParsedAtomSiteAnisotropic[];
}

interface CifDataBlock {
  name: string;
  text: string;
}

/** Split a physical CIF document into independently importable data_ blocks. */
export function splitCifDataBlocks(text: string): CifDataBlock[] {
  const lines = text.split(/(?<=\n)|(?<=\r)(?!\n)/);
  const starts: Array<{ offset: number; name: string }> = [];
  let offset = 0;
  let inTextBlock = false;
  for (const line of lines) {
    const content = line.replace(/[\r\n]+$/, '');
    if (content.startsWith(';')) inTextBlock = !inTextBlock;
    if (!inTextBlock) {
      const match = content.match(/^\s*data_(\S*)/i);
      if (match) starts.push({ offset, name: match[1] || `block-${starts.length + 1}` });
    }
    offset += line.length;
  }
  if (starts.length <= 1) {
    return [{ name: starts[0]?.name ?? 'block-1', text }];
  }
  return starts.map((start, index) => ({
    name: start.name,
    text: text.slice(start.offset, starts[index + 1]?.offset ?? text.length)
  }));
}

interface RawCif {
  tags: Map<string, string>;
  hasAnisoLabel: boolean;
  atomSites: ParsedAtomSite[];
  publAuthors: ParsedPublAuthor[];
  symmetryOperations: ParsedSymmetryOperation[];
  atomSiteAnisotropic: ParsedAtomSiteAnisotropic[];
}

function tokenizeLoopLine(line: string): string[] {
  const tokens: string[] = [];
  const isWhitespace = (character: string): boolean => /\s/.test(character);
  let index = 0;

  while (index < line.length) {
    while (index < line.length && isWhitespace(line[index])) index++;
    if (index >= line.length || line[index] === '#') break;

    const openingQuote = line[index];
    if (openingQuote === "'" || openingQuote === '"') {
      index++;
      let value = '';
      while (index < line.length) {
        const character = line[index];
        // In CIF, a matching quote closes a value only at a token boundary.
        // An apostrophe followed by another word character is literal text.
        if (
          character === openingQuote &&
          (index + 1 === line.length || isWhitespace(line[index + 1]))
        ) {
          index++;
          break;
        }
        value += character;
        index++;
      }
      tokens.push(value);
      continue;
    }

    const start = index;
    while (index < line.length && !isWhitespace(line[index])) index++;
    tokens.push(line.slice(start, index));
  }

  return tokens;
}

function nullableText(value: string | undefined): string | null {
  return hasCifValue(value) ? stripQuotes(value) : null;
}

function nullableNumber(value: string | undefined): number | null {
  if (!hasCifValue(value)) return null;
  const number = stripUncertainty(stripQuotes(value));
  return Number.isFinite(number) ? number : null;
}

function parseAtomSiteRows(headers: string[], values: string[]): ParsedAtomSite[] {
  const normalized = headers.map((header) => header.toLowerCase());
  if (!normalized.includes('_atom_site_label') && !normalized.includes('_atom_site_type_symbol')) {
    return [];
  }
  const indexOf = (tag: string) => normalized.indexOf(tag.toLowerCase());
  const valueAt = (row: string[], tag: string): string | undefined => {
    const index = indexOf(tag);
    return index === -1 ? undefined : row[index];
  };
  const rows: ParsedAtomSite[] = [];
  for (let offset = 0; offset + headers.length <= values.length; offset += headers.length) {
    const row = values.slice(offset, offset + headers.length);
    const multiplicity = nullableNumber(valueAt(row, '_atom_site_symmetry_multiplicity'));
    rows.push({
      siteLabel: nullableText(valueAt(row, '_atom_site_label')),
      typeSymbol: nullableText(valueAt(row, '_atom_site_type_symbol')),
      symmetryMultiplicity:
        multiplicity !== null && Number.isInteger(multiplicity) ? multiplicity : null,
      wyckoffSymbol: nullableText(valueAt(row, '_atom_site_Wyckoff_symbol')),
      fractX: nullableNumber(valueAt(row, '_atom_site_fract_x')),
      fractY: nullableNumber(valueAt(row, '_atom_site_fract_y')),
      fractZ: nullableNumber(valueAt(row, '_atom_site_fract_z')),
      occupancy: nullableNumber(valueAt(row, '_atom_site_occupancy')),
      uIsoOrEquiv: nullableNumber(valueAt(row, '_atom_site_u_iso_or_equiv')),
      bIsoOrEquiv: nullableNumber(valueAt(row, '_atom_site_b_iso_or_equiv'))
    });
  }
  return rows;
}

function parseSymmetryOperationRows(headers: string[], values: string[]): ParsedSymmetryOperation[] {
  const normalized = headers.map((header) => header.toLowerCase());
  const operationIndex = normalized.findIndex((header) =>
    header === '_space_group_symop_operation_xyz' || header === '_symmetry_equiv_pos_as_xyz');
  if (operationIndex === -1) return [];
  const idIndex = normalized.findIndex((header) =>
    header === '_space_group_symop_id' || header === '_symmetry_equiv_pos_site_id');
  const rows: ParsedSymmetryOperation[] = [];
  for (let offset = 0; offset + headers.length <= values.length; offset += headers.length) {
    const row = values.slice(offset, offset + headers.length);
    const operationXyz = nullableText(row[operationIndex]);
    if (operationXyz === null) continue;
    rows.push({
      operationId: idIndex === -1 ? null : nullableText(row[idIndex]),
      operationXyz
    });
  }
  return rows;
}

function parseAtomSiteAnisotropicRows(headers: string[], values: string[]): ParsedAtomSiteAnisotropic[] {
  const normalized = headers.map((header) => header.toLowerCase());
  const labelIndex = normalized.indexOf('_atom_site_aniso_label');
  if (labelIndex === -1) return [];
  const valueAt = (row: string[], tag: string): string | undefined => {
    const index = normalized.indexOf(tag);
    return index === -1 ? undefined : row[index];
  };
  const rows: ParsedAtomSiteAnisotropic[] = [];
  for (let offset = 0; offset + headers.length <= values.length; offset += headers.length) {
    const row = values.slice(offset, offset + headers.length);
    const siteLabel = nullableText(row[labelIndex]);
    if (siteLabel === null) continue;
    rows.push({
      siteLabel,
      u11: nullableNumber(valueAt(row, '_atom_site_aniso_u_11')),
      u22: nullableNumber(valueAt(row, '_atom_site_aniso_u_22')),
      u33: nullableNumber(valueAt(row, '_atom_site_aniso_u_33')),
      u12: nullableNumber(valueAt(row, '_atom_site_aniso_u_12')),
      u13: nullableNumber(valueAt(row, '_atom_site_aniso_u_13')),
      u23: nullableNumber(valueAt(row, '_atom_site_aniso_u_23')),
      b11: nullableNumber(valueAt(row, '_atom_site_aniso_b_11')),
      b22: nullableNumber(valueAt(row, '_atom_site_aniso_b_22')),
      b33: nullableNumber(valueAt(row, '_atom_site_aniso_b_33')),
      b12: nullableNumber(valueAt(row, '_atom_site_aniso_b_12')),
      b13: nullableNumber(valueAt(row, '_atom_site_aniso_b_13')),
      b23: nullableNumber(valueAt(row, '_atom_site_aniso_b_23'))
    });
  }
  return rows;
}

function parsePublAuthorRows(headers: string[], values: string[]): ParsedPublAuthor[] {
  const normalized = headers.map((header) => header.toLowerCase());
  const nameIndex = normalized.findIndex((header) =>
    header === '_citation_author_name' || header === '_publ_author_name');
  if (nameIndex === -1) return [];
  const addressIndex = normalized.indexOf('_publ_author_address');
  const rows: ParsedPublAuthor[] = [];
  for (let offset = 0; offset + headers.length <= values.length; offset += headers.length) {
    const row = values.slice(offset, offset + headers.length);
    const name = nullableText(row[nameIndex]);
    if (name === null) continue;
    rows.push({
      name,
      address: addressIndex === -1 ? null : normalizeAddress(nullableText(row[addressIndex]))
    });
  }
  return rows;
}

/** Collapse the whitespace of a multi-line address block into one readable line. */
function normalizeAddress(address: string | null): string | null {
  if (address === null) return null;
  const collapsed = address.replace(/\s+/g, ' ').trim();
  return collapsed === '' ? null : collapsed;
}

/**
 * Low-level scan of a CIF file's text into a flat tag->value map, plus a flag
 * for whether any loop_ block declares an _atom_site_aniso_label column.
 *
 * Handles: multi-line semicolon-delimited text blocks (content skipped so
 * tags cannot be accidentally matched inside them), '?' / '.' nulls,
 * single/double-quoted scalar values, and loop_ blocks in general.
 */
function scanCif(text: string): RawCif {
  const lines = text.split(/\r\n|\n|\r/);
  const tags = new Map<string, string>();
  let hasAnisoLabel = false;
  const atomSites: ParsedAtomSite[] = [];
  const publAuthors: ParsedPublAuthor[] = [];
  const symmetryOperations: ParsedSymmetryOperation[] = [];
  const atomSiteAnisotropic: ParsedAtomSiteAnisotropic[] = [];
  let i = 0;

  // idx points at the opening ';' line (already confirmed). Reads until (and
  // including) the line starting with the closing ';'.
  const readTextBlock = (idx: number): { text: string; next: number } => {
    const contentLines: string[] = [];
    let j = idx + 1;
    while (j < lines.length && !lines[j].startsWith(';')) {
      contentLines.push(lines[j]);
      j++;
    }
    return { text: contentLines.join(' ').trim(), next: j + 1 };
  };

  const skipTextBlock = (idx: number): number => readTextBlock(idx).next;

  while (i < lines.length) {
    const raw = lines[i];
    const trimmed = raw.trim();

    if (trimmed === '' || trimmed.startsWith('#')) {
      i++;
      continue;
    }

    if (raw.startsWith(';')) {
      // Stray/unowned text block at top level; skip its content entirely.
      i = skipTextBlock(i);
      continue;
    }

    if (trimmed === 'loop_') {
      i++;
      const headers: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('_')) {
        headers.push(lines[i].trim().split(/\s+/)[0]);
        i++;
      }
      if (headers.some((header) => header.toLowerCase() === '_atom_site_aniso_label')) {
        hasAnisoLabel = true;
      }
      const values: string[] = [];
      // Consume and tokenize the loop's data rows.
      while (i < lines.length) {
        const t = lines[i].trim();
        if (t === '' || t === 'loop_' || t.startsWith('_') || t.startsWith('data_') || t.startsWith('#')) {
          break;
        }
        if (lines[i].startsWith(';')) {
          // A ';' block is one column value, so keep it as a single token.
          const block = readTextBlock(i);
          values.push(block.text);
          i = block.next;
          continue;
        }
        values.push(...tokenizeLoopLine(lines[i]));
        i++;
      }
      atomSites.push(...parseAtomSiteRows(headers, values));
      publAuthors.push(...parsePublAuthorRows(headers, values));
      symmetryOperations.push(...parseSymmetryOperationRows(headers, values));
      atomSiteAnisotropic.push(...parseAtomSiteAnisotropicRows(headers, values));
      // Bibliographic data is commonly a one-row _citation_* loop. Preserve its
      // first row in the scalar lookup used by the entry summary.
      headers.forEach((header, index) => {
        const normalized = header.toLowerCase();
        if (normalized.startsWith('_citation_') && !tags.has(normalized) && values[index] !== undefined) {
          tags.set(normalized, values[index]);
        }
      });
      continue;
    }

    if (trimmed.startsWith('_')) {
      const spaceIdx = trimmed.search(/\s/);
      let tag: string;
      let rest: string;
      if (spaceIdx === -1) {
        tag = trimmed;
        rest = '';
      } else {
        tag = trimmed.slice(0, spaceIdx);
        rest = trimmed.slice(spaceIdx + 1).trim();
      }
      i++;
      if (rest === '') {
        if (i < lines.length && lines[i].startsWith(';')) {
          const block = readTextBlock(i);
          rest = block.text;
          i = block.next;
        } else if (i < lines.length) {
          rest = lines[i].trim();
          i++;
        }
      }
      tags.set(tag.toLowerCase(), rest);
      continue;
    }

    // data_ header or anything else we don't care about.
    i++;
  }

  return { tags, hasAnisoLabel, atomSites, publAuthors, symmetryOperations, atomSiteAnisotropic };
}

function stripQuotes(value: string): string {
  const s = value.trim();
  if (s.length >= 2) {
    const first = s[0];
    const last = s[s.length - 1];
    if ((first === "'" && last === "'") || (first === '"' && last === '"')) {
      return s.slice(1, -1);
    }
  }
  return s;
}

function hasCifValue(value: string | undefined): value is string {
  if (value === undefined) return false;
  const t = value.trim();
  return t !== '' && t !== '?' && t !== '.';
}

/** Strip a trailing parenthesized uncertainty, e.g. "16.5(3)" -> 16.5 */
export function stripUncertainty(value: string): number {
  const cleaned = value.trim().replace(/\(\d+\)\s*$/, '');
  return Number(cleaned);
}

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

function getClean(tags: Map<string, string>, tag: string): string | null {
  const v = tags.get(tag.toLowerCase());
  if (!hasCifValue(v)) return null;
  return stripQuotes(v);
}

function getRaw(tags: Map<string, string>, tag: string): string | undefined {
  return tags.get(tag.toLowerCase());
}

/** Parse a quoted, space-separated chemical formula sum into element/count pairs. */
export function parseFormulaSum(rawSum: string): ElementCount[] {
  const stripped = stripQuotes(rawSum);
  const tokens = stripped.trim().split(/\s+/).filter(Boolean);
  const pairs: ElementCount[] = tokens.map((tok) => {
    const m = tok.match(/^([A-Z][a-z]?)(\d*\.?\d*)$/);
    if (!m) {
      throw new Error(`Unable to parse formula token: "${tok}"`);
    }
    const element = m[1];
    const countStr = m[2];
    const count = countStr === '' ? 1 : parseFloat(countStr);
    return { element, count };
  });
  pairs.sort((a, b) => a.element.localeCompare(b.element));
  return pairs;
}

/**
 * Reduce the comma-separated component notation used by the CCDC/CSD samples
 * to an overall elemental composition. Charge tokens are metadata rather than
 * atoms, while numeric prefixes multiply a parenthesized component.
 */
export function parseFormulaMoiety(rawMoiety: string): ElementCount[] {
  const text = stripQuotes(rawMoiety).trim();
  const components: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < text.length; index++) {
    if (text[index] === '(') depth++;
    else if (text[index] === ')') depth = Math.max(0, depth - 1);
    else if (text[index] === ',' && depth === 0) {
      components.push(text.slice(start, index));
      start = index + 1;
    }
  }
  components.push(text.slice(start));

  const totals = new Map<string, number>();
  for (const rawComponent of components) {
    const component = rawComponent.trim();
    if (!component) continue;
    const grouped = component.match(/^(\d+(?:\.\d+)?)\s*\((.*)\)\s*$/);
    const multiplier = grouped ? Number(grouped[1]) : 1;
    const body = grouped ? grouped[2] : component;
    const tokens = body.split(/\s+/).filter(Boolean);
    let parsedElements = 0;
    for (const token of tokens) {
      if (/^\d+(?:\.\d+)?[+-]$/.test(token)) continue;
      const match = token.match(/^([A-Z][a-z]?)(\d*\.?\d*)$/);
      if (!match) throw new Error(`Unable to parse formula token: "${token}"`);
      const count = match[2] === '' ? 1 : Number(match[2]);
      if (!Number.isFinite(count)) throw new Error(`Unable to parse formula token: "${token}"`);
      totals.set(match[1], (totals.get(match[1]) ?? 0) + count * multiplier);
      parsedElements++;
    }
    if (parsedElements === 0) throw new Error(`Unable to parse formula component: "${component}"`);
  }
  if (totals.size === 0) throw new Error('Unable to parse formula moiety');
  return [...totals.entries()]
    .map(([element, count]) => ({ element, count: Math.round(count * 1e9) / 1e9 }))
    .sort((a, b) => a.element.localeCompare(b.element));
}

function formatCount(count: number): string {
  return String(count);
}

export function formatFormula(pairs: ElementCount[]): string {
  return pairs.map((p) => `${p.element}${formatCount(p.count)}`).join('');
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
  const pages = first !== null && last !== null ? `${first}-${last}` : null;
  const parts = [name, year, volume, pages].filter((p): p is string => p !== null);
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

/** Parse full CIF file text into the fields this app persists. */
export function parseCif(text: string): CifEntry {
  const { tags, hasAnisoLabel, atomSites, publAuthors, symmetryOperations, atomSiteAnisotropic } = scanCif(text);

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
    atomSites,
    symmetryOperations,
    atomSiteAnisotropic
  };
}
