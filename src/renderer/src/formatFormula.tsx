import React from 'react';

// Explicit presentation markup only: do not infer formulas from prose or identifiers.
const scriptSpans = /\$[^$\r\n]*\$|\\\([^\r\n]*?\\\)|~([^~\r\n]+)~|\^([^\^\r\n]+)\^/g;
const marker = (kind: string, value: string) => kind === '_' || kind === 'sub' ? `~${value}~` : `^${value}^`;

function normalizeMath(source: string, body: string): string {
  // A small, explicit LaTeX subset. Unknown/nested commands remain visible verbatim.
  const unwrapped = body.replace(/\\(?:mathrm|mathit|text)\{([^{}\r\n]+)\}/g, '$1');
  const converted = unwrapped.replace(/\\?([_^])(?:\{([^{}~^\r\n]+)\}|([A-Za-z0-9+-]))/g,
    (_match, kind: string, group: string | undefined, single: string) => marker(kind, group ?? single));
  if (/[\\{}_]/.test(converted) || converted === body) return source;
  return converted;
}

function normalizePublicationText(text: string): string {
  return text
    // Only attribute-free sub/sup tags are presentation; never interpret arbitrary HTML.
    .replace(/<(?:jats:)?(sub|sup)>([^<>~^\r\n]+)<\/(?:jats:)?\1>/gi,
      (_match, kind: string, value: string) => marker(kind.toLowerCase(), value))
    .replace(/\\text(sub|super)script\{([^{}~^\r\n]+)\}/g,
      (_match, kind: string, value: string) => marker(kind === 'sub' ? '_' : '^', value))
    // Retain compatibility with publisher-generated standalone $_12$ fragments.
    .replace(/\$\\?([_^])(?:\{([^{}$~^\r\n]+)\}|([A-Za-z0-9.+-]+))\$/g,
      (_match, kind: string, braced: string | undefined, plain: string) => marker(kind, braced ?? plain))
    .replace(/\$([^$\r\n]+)\$|\\\(([^\r\n]*?)\\\)/g,
      (source, dollar: string | undefined, parenthesized: string) => normalizeMath(source, dollar ?? parenthesized))
    .replace(/\$[^$\r\n]*\$|\\\([^\r\n]*?\\\)|(?<=[A-Za-z)\]])([_^])\{([^{}~^\r\n]+)\}/g,
      (source, kind: string | undefined, value: string) => kind === undefined ? source : marker(kind, value));
}

export function plainCifText(text: string): string {
  return normalizePublicationText(text).replace(scriptSpans,
    (match, sub: string | undefined, sup: string | undefined) => sub ?? sup ?? match);
}

function renderScript(match: RegExpMatchArray): React.ReactNode {
  if (match[1] !== undefined) return <sub key={match.index}>{match[1]}</sub>;
  if (match[2] !== undefined) return <sup key={match.index}>{match[2]}</sup>;
  return match[0];
}

/** Shared by publication links, reference cells and their plain-text tooltips. */
export function formatCifText(text: string): React.ReactNode {
  const normalized = normalizePublicationText(text);
  const parts: React.ReactNode[] = [];
  let offset = 0;
  for (const match of normalized.matchAll(scriptSpans)) {
    parts.push(normalized.slice(offset, match.index));
    parts.push(renderScript(match));
    offset = match.index + match[0].length;
  }
  parts.push(normalized.slice(offset));
  return parts;
}

/** Counts after elements/groups; leading/hydrate coefficients and charges stay literal.
 * Dot decimals are counts; use a middle dot for hydrate separation. Ambiguous
 * terminal charge magnitudes after a single element or bracket stay literal.
 */
export function formatFormula(formula: string): React.ReactNode {
  const charge = formula.match(/\^\d*[+-]$|(?<=\])\d+[+-]$|(?<=^[A-Z][a-z]?)\d+[+-]$/);
  const end = charge?.index ?? formula.length;
  const body = formula.slice(0, end);
  const parts: React.ReactNode[] = [];
  const counts = /([A-Z][a-z]?|[)\]])(\d+(?:\.\d+)?)/g;
  let offset = 0;
  for (const match of body.matchAll(counts)) {
    const start = match.index! + match[1].length;
    parts.push(body.slice(offset, start), Number(match[2]) === 1 ? null : <sub key={start}>{match[2]}</sub>);
    offset = start + match[2].length;
  }
  parts.push(body.slice(offset), formula.slice(end));
  return parts;
}
