import type { ElementCount } from './types';
import { stripQuotes } from './values';

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
