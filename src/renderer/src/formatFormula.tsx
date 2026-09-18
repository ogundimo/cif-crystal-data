import React from 'react';

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
