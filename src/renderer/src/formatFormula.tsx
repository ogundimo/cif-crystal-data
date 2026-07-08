import React from 'react';

/** Render a plain formula string like "Eu3S9Sb4" with digit runs as <sub> elements. */
export function formatFormula(formula: string): React.ReactNode {
  const parts = formula.split(/(\d+\.?\d*)/).filter((p) => p !== '');
  return parts.map((part, i) =>
    /^\d/.test(part) ? <sub key={i}>{part}</sub> : <React.Fragment key={i}>{part}</React.Fragment>
  );
}
