import React from 'react';

/** Render stoichiometric amounts as subscripts, omitting amounts that are exactly one. */
export function formatFormula(formula: string): React.ReactNode {
  const parts = formula.split(/(\d+\.?\d*)/).filter((p) => p !== '');
  return parts.map((part, i) =>
    /^\d/.test(part)
      ? Number(part) === 1
        ? null
        : <sub key={i}>{part}</sub>
      : <React.Fragment key={i}>{part}</React.Fragment>
  );
}
