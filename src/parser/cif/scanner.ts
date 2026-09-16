import type { RawCif } from './types';
import { parseAtomSiteRows, parsePublAuthorRows, parseSymmetryOperationRows, parseAtomSiteAnisotropicRows } from './loops';
import { getClean } from './values';

interface Token { value: string; quoted: boolean }
function tokenize(text: string): Token[] {
  const lines = text.split(/\r\n|\n|\r/);
  const result: Token[] = [];
  for (let line = 0; line < lines.length; line++) {
    let value = lines[line];
    if (value.startsWith(';')) {
      const content = [value.slice(1)];
      while (++line < lines.length && !lines[line].startsWith(';')) content.push(lines[line]);
      if (line === lines.length) throw new Error('Unterminated CIF text field');
      result.push({ value: content.join(' ').trim(), quoted: true });
      value = lines[line].slice(1);
    }
    let i = 0;
    while (i < value.length) {
      while (/\s/.test(value[i] ?? '') && i < value.length) i++;
      if (i >= value.length || value[i] === '#') break;
      const quote = value[i];
      if (quote === "'" || quote === '"') {
        const start = ++i;
        while (i < value.length && !(value[i] === quote && (i + 1 === value.length || /\s/.test(value[i + 1])))) i++;
        if (i === value.length) throw new Error('Unterminated CIF quoted value');
        result.push({ value: value.slice(start, i++), quoted: true });
      } else {
        const start = i;
        while (i < value.length && !/\s/.test(value[i])) i++;
        result.push({ value: value.slice(start, i), quoted: false });
      }
    }
  }
  return result;
}
const control = (token: Token) => !token.quoted && /^(?:_|loop_$|data_|save_|stop_$|global_$)/i.test(token.value);

/** CIF whitespace/comments do not terminate loops; quoted control words are values. */
export function scanCif(text: string): RawCif {
  const tokens = tokenize(text);
  const tags = new Map<string, string>();
  const loops: { headers: string[]; values: string[] }[] = [];
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i++];
    if (!token.quoted && token.value.toLowerCase() === 'loop_') {
      const headers: string[] = [];
      while (i < tokens.length && !tokens[i].quoted && tokens[i].value.startsWith('_')) headers.push(tokens[i++].value.toLowerCase());
      if (!headers.length) throw new Error('CIF loop has no columns');
      const values: string[] = [];
      while (i < tokens.length && !control(tokens[i])) values.push(tokens[i++].value);
      if (values.length % headers.length !== 0) throw new Error('Incomplete CIF loop row');
      loops.push({ headers, values });
    } else if (!token.quoted && token.value.startsWith('_')) {
      if (i >= tokens.length || control(tokens[i])) throw new Error(`Missing CIF value for ${token.value}`);
      tags.set(token.value.toLowerCase(), tokens[i++].value);
    }
  }
  const citations: Map<string, string>[] = [];
  for (const { headers, values } of loops) {
    if (!headers.some(h => h.startsWith('_citation_') && !h.startsWith('_citation_author_'))) continue;
    for (let offset = 0; offset < values.length; offset += headers.length) citations.push(new Map(headers.map((h, n) => [h, values[offset + n]])));
  }
  const primary = citations.find(row => getClean(row, '_citation_id')?.toLowerCase() === 'primary') ?? citations[0];
  if (primary) {
    // Scalar publication metadata describes the primary citation, never another row.
    const selectedId = getClean(primary, '_citation_id');
    if (selectedId?.toLowerCase() !== 'primary' && !(citations.length === 1 && !selectedId)) {
      for (const name of [...tags.keys()]) if (name.startsWith('_citation_') || name.startsWith('_journal_') || name === '_publ_section_title') tags.delete(name);
    }
    for (const [name, value] of primary) tags.set(name, value);
  }
  if (primary && getClean(primary, '_citation_id') && getClean(primary, '_citation_id')?.toLowerCase() !== 'primary') {
    tags.delete('_publ_author_name'); tags.delete('_publ_author_address');
  }
  const primaryId = getClean(tags, '_citation_id');
  const scalarAuthorId = getClean(tags, '_citation_author_citation_id');
  if (scalarAuthorId && scalarAuthorId !== primaryId) tags.delete('_citation_author_name');
  const authorLoops = loops.flatMap(({ headers, values }) => {
    const citationIndex = headers.indexOf('_citation_author_citation_id');
    if (citationIndex < 0) {
      if (citations.length > 1 && headers.includes('_citation_author_name')) return [];
      if (primary && getClean(primary, '_citation_id') && getClean(primary, '_citation_id')?.toLowerCase() !== 'primary' && headers.includes('_publ_author_name')) return [];
      return parsePublAuthorRows(headers, values);
    }
    if (!primaryId) return [];
    const selected = values.filter((_value, index) => values[Math.floor(index / headers.length) * headers.length + citationIndex] === primaryId);
    return parsePublAuthorRows(headers, selected);
  });
  const dataAuthors = loops.flatMap(({ headers, values }) => parsePublAuthorRows(
    headers.map(h => h.startsWith('_audit_author_') ? h.replace(/^_audit_author_/, '_publ_author_') : '_ignored' + h), values
  ).filter(() => headers.includes('_audit_author_name')));
  const scalarDataName = getClean(tags, '_audit_author_name');
  if (!dataAuthors.length && scalarDataName) dataAuthors.push({ name: scalarDataName, address: getClean(tags, '_audit_author_address') });
  return {
    tags, hasAnisoLabel: loops.some(loop => loop.headers.includes('_atom_site_aniso_label')),
    atomSites: loops.flatMap(loop => parseAtomSiteRows(loop.headers, loop.values)),
    publAuthors: authorLoops, dataAuthors,
    symmetryOperations: loops.flatMap(loop => parseSymmetryOperationRows(loop.headers, loop.values)),
    atomSiteAnisotropic: loops.flatMap(loop => parseAtomSiteAnisotropicRows(loop.headers, loop.values))
  };
}
