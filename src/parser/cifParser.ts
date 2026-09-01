// Hand-written CIF parser (plain TypeScript, no external CIF library).
// Extracts only the tags this application needs.

import { LEVEL_CELL, LEVEL_FULL } from '../shared/types';

export interface ElementCount {
  element: string;
  count: number;
}

export interface ParsedAtomSite {
  siteLabel: string | null;
  typeSymbol: string | null;
  symmetryMultiplicity: number | null;
  wyckoffSymbol: string | null;
  fractX: number | null;
  fractY: number | null;
  fractZ: number | null;
  occupancy: number | null;
}

export interface ParsedPublAuthor {
  name: string;
  address: string | null;
}

export interface CifEntry {
  formula: string;
  elements: ElementCount[];
  cell_a: number;
  cell_b: number;
  cell_c: number;
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
  journalLanguage: string;
  publAuthors: ParsedPublAuthor[];
  atomSites: ParsedAtomSite[];
}

interface RawCif {
  tags: Map<string, string>;
  hasAnisoLabel: boolean;
  atomSites: ParsedAtomSite[];
  publAuthors: ParsedPublAuthor[];
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
      occupancy: nullableNumber(valueAt(row, '_atom_site_occupancy'))
    });
  }
  return rows;
}

function parsePublAuthorRows(headers: string[], values: string[]): ParsedPublAuthor[] {
  const normalized = headers.map((header) => header.toLowerCase());
  const nameIndex = normalized.indexOf('_publ_author_name');
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
      if (headers.some((h) => h.startsWith('_atom_site_aniso_label'))) {
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
      tags.set(tag, rest);
      continue;
    }

    // data_ header or anything else we don't care about.
    i++;
  }

  return { tags, hasAnisoLabel, atomSites, publAuthors };
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
  const v = tags.get(tag);
  if (!hasCifValue(v)) return null;
  return stripQuotes(v);
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

function formatCount(count: number): string {
  return String(count);
}

export function formatFormula(pairs: ElementCount[]): string {
  return pairs.map((p) => `${p.element}${formatCount(p.count)}`).join('');
}

/** Build the "{journal}, {year}, {volume}, {first}-{last}" reference string, omitting missing parts cleanly. */
export function buildReference(tags: Map<string, string>): string {
  const name = getClean(tags, '_journal_name_full');
  const year = getClean(tags, '_journal_year');
  const volume = getClean(tags, '_journal_volume');
  const first = getClean(tags, '_journal_page_first');
  const last = getClean(tags, '_journal_page_last');
  const pages = first !== null && last !== null ? `${first}-${last}` : null;
  const parts = [name, year, volume, pages].filter((p): p is string => p !== null);
  return parts.join(', ');
}

/** Parse full CIF file text into the fields this app persists. */
export function parseCif(text: string): CifEntry {
  const { tags, hasAnisoLabel, atomSites, publAuthors } = scanCif(text);

  const sumRaw = tags.get('_chemical_formula_sum');
  if (!hasCifValue(sumRaw)) {
    throw new Error('Missing _chemical_formula_sum');
  }
  const elements = parseFormulaSum(sumRaw);
  const formula = formatFormula(elements);

  const aRaw = tags.get('_cell_length_a');
  const bRaw = tags.get('_cell_length_b');
  const cRaw = tags.get('_cell_length_c');
  if (!hasCifValue(aRaw) || !hasCifValue(bRaw) || !hasCifValue(cRaw)) {
    throw new Error('Missing cell length tag(s)');
  }
  const cell_a = stripUncertainty(aRaw) / 10;
  const cell_b = stripUncertainty(bRaw) / 10;
  const cell_c = stripUncertainty(cRaw) / 10;
  if (!Number.isFinite(cell_a)) throw new Error('Invalid _cell_length_a');
  if (!Number.isFinite(cell_b)) throw new Error('Invalid _cell_length_b');
  if (!Number.isFinite(cell_c)) throw new Error('Invalid _cell_length_c');

  const validAngle = (tag: string): number | null => {
    const value = nullableNumber(tags.get(tag));
    return value !== null && value > 0 && value < 180 ? value : null;
  };
  const cellAlpha = validAngle('_cell_angle_alpha');
  const cellBeta = validAngle('_cell_angle_beta');
  const cellGamma = validAngle('_cell_angle_gamma');
  const providedVolume = nullableNumber(tags.get('_cell_volume'));
  const cellVolume =
    providedVolume !== null && providedVolume > 0
      ? providedVolume
      : cellAlpha !== null && cellBeta !== null && cellGamma !== null
        ? calculateUnitCellVolume(cell_a * 10, cell_b * 10, cell_c * 10, cellAlpha, cellBeta, cellGamma)
        : null;

  const sgRaw = tags.get('_space_group_IT_number');
  if (!hasCifValue(sgRaw)) {
    throw new Error('Missing _space_group_IT_number');
  }
  const sg_number = Number(stripQuotes(sgRaw));
  if (!Number.isInteger(sg_number) || sg_number < 1 || sg_number > 230) {
    throw new Error('Invalid _space_group_IT_number');
  }

  const spgRaw = tags.get('_space_group_name_H-M_alt');
  if (!hasCifValue(spgRaw)) {
    throw new Error('Missing _space_group_name_H-M_alt');
  }
  const space_group = stripQuotes(spgRaw).replace(/\s+/g, '');

  const reference = buildReference(tags);
  const level = hasAnisoLabel ? LEVEL_FULL : LEVEL_CELL;
  const sampleType = hasAnisoLabel ? 'Sample crystal' : 'Powder';
  const crystalColour = getClean(tags, '_exptl_crystal_colour') ?? '';
  const publTitle = getClean(tags, '_publ_section_title') ?? '';
  const journalLanguage = getClean(tags, '_journal_language') ?? '';
  // A single-author paper may state the tags as scalars instead of a loop.
  const scalarAuthorName = getClean(tags, '_publ_author_name');
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
    journalLanguage,
    publAuthors: authors,
    atomSites
  };
}
