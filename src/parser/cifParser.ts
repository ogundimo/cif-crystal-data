// Hand-written CIF parser (plain TypeScript, no external CIF library).
// Extracts only the tags this application needs.

export interface ElementCount {
  element: string;
  count: number;
}

export interface CifEntry {
  formula: string;
  elements: ElementCount[];
  cell_a: number;
  cell_b: number;
  cell_c: number;
  sg_number: number;
  space_group: string;
  reference: string;
  level: string;
}

export const LEVEL_FULL = 'Complete structure determined';
export const LEVEL_CELL = 'Cell parameters determined and structure type assigned';

interface RawCif {
  tags: Map<string, string>;
  hasAnisoLabel: boolean;
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
  let i = 0;

  const skipTextBlock = (idx: number): number => {
    // idx points at the opening ';' line (already confirmed). Consume until
    // (and including) the line starting with the closing ';'.
    let j = idx + 1;
    while (j < lines.length && !lines[j].startsWith(';')) j++;
    return j + 1;
  };

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
      // Consume the loop's data rows.
      while (i < lines.length) {
        const t = lines[i].trim();
        if (t === '' || t === 'loop_' || t.startsWith('_') || t.startsWith('data_') || t.startsWith('#')) {
          break;
        }
        if (lines[i].startsWith(';')) {
          i = skipTextBlock(i);
          continue;
        }
        i++;
      }
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
          const start = i;
          const contentLines: string[] = [];
          let j = start + 1;
          while (j < lines.length && !lines[j].startsWith(';')) {
            contentLines.push(lines[j]);
            j++;
          }
          rest = contentLines.join(' ').trim();
          i = j + 1;
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

  return { tags, hasAnisoLabel };
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

function isNullish(value: string | undefined): value is undefined {
  if (value === undefined) return true;
  const t = value.trim();
  return t === '' || t === '?' || t === '.';
}

/** Strip a trailing parenthesized uncertainty, e.g. "16.5(3)" -> 16.5 */
export function stripUncertainty(value: string): number {
  const cleaned = value.trim().replace(/\(\d+\)\s*$/, '');
  return parseFloat(cleaned);
}

function getClean(tags: Map<string, string>, tag: string): string | null {
  const v = tags.get(tag);
  if (isNullish(v)) return null;
  return stripQuotes(v as string);
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
  if (Number.isInteger(count)) return String(count);
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
  const { tags, hasAnisoLabel } = scanCif(text);

  const sumRaw = tags.get('_chemical_formula_sum');
  if (isNullish(sumRaw)) {
    throw new Error('Missing _chemical_formula_sum');
  }
  const elements = parseFormulaSum(sumRaw as string);
  const formula = formatFormula(elements);

  const aRaw = tags.get('_cell_length_a');
  const bRaw = tags.get('_cell_length_b');
  const cRaw = tags.get('_cell_length_c');
  if (isNullish(aRaw) || isNullish(bRaw) || isNullish(cRaw)) {
    throw new Error('Missing cell length tag(s)');
  }
  const cell_a = stripUncertainty(aRaw as string) / 10;
  const cell_b = stripUncertainty(bRaw as string) / 10;
  const cell_c = stripUncertainty(cRaw as string) / 10;

  const sgRaw = tags.get('_space_group_IT_number');
  if (isNullish(sgRaw)) {
    throw new Error('Missing _space_group_IT_number');
  }
  const sg_number = parseInt(stripQuotes(sgRaw as string), 10);

  const spgRaw = tags.get('_space_group_name_H-M_alt');
  if (isNullish(spgRaw)) {
    throw new Error('Missing _space_group_name_H-M_alt');
  }
  const space_group = stripQuotes(spgRaw as string).replace(/\s+/g, '');

  const reference = buildReference(tags);
  const level = hasAnisoLabel ? LEVEL_FULL : LEVEL_CELL;

  return { formula, elements, cell_a, cell_b, cell_c, sg_number, space_group, reference, level };
}
