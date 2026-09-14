import type { RawCif, ParsedAtomSite, ParsedPublAuthor, ParsedSymmetryOperation, ParsedAtomSiteAnisotropic } from './types';
import { parseAtomSiteRows, parsePublAuthorRows, parseSymmetryOperationRows, parseAtomSiteAnisotropicRows } from './loops';

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

/**
 * Low-level scan of a CIF file's text into a flat tag->value map, plus a flag
 * for whether any loop_ block declares an _atom_site_aniso_label column.
 *
 * Handles: multi-line semicolon-delimited text blocks (content skipped so
 * tags cannot be accidentally matched inside them), '?' / '.' nulls,
 * single/double-quoted scalar values, and loop_ blocks in general.
 */
export function scanCif(text: string): RawCif {
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
