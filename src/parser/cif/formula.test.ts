import { describe, expect, it } from 'vitest';
import { formatFormula, parseFormulaMoiety, parseFormulaSum } from './formula';

describe('formula composition', () => {
  it('retains fractional counts, implicit ones and alphabetical ordering', () => {
    const pairs = parseFormulaSum('"Na.5  O\tC1.25 H"');
    expect(pairs).toEqual([
      { element: 'C', count: 1.25 }, { element: 'H', count: 1 },
      { element: 'Na', count: 0.5 }, { element: 'O', count: 1 }
    ]);
    expect(formatFormula(pairs)).toBe('C1.25H1Na0.5O1');
  });

  it.each(['xC2', 'C2x', 'C1.2.3', 'c2', 'C-2', '123'])('rejects malformed sum token %s', (token) => {
    expect(() => parseFormulaSum(token)).toThrow(`Unable to parse formula token: "${token}"`);
  });

  it('combines decimal component multipliers and counts without floating-point residue', () => {
    expect(parseFormulaMoiety('0.1 (C0.2 H), 0.2 (C0.1 H), Na 1+, Cl 1-')).toEqual([
      { element: 'C', count: 0.04 }, { element: 'Cl', count: 1 },
      { element: 'H', count: 0.3 }, { element: 'Na', count: 1 }
    ]);
  });

  it('accepts multi-digit multipliers, decimal charges and spaced components', () => {
    expect(parseFormulaMoiety(' 10.5 (C12 H.5  12+), , Na 1.25- ')).toEqual([
      { element: 'C', count: 126 }, { element: 'H', count: 5.25 }, { element: 'Na', count: 1 }
    ]);
  });

  it.each(['', '  ', '1+', '2.5-', 'C.', 'C2x', 'xC', '2 (1+)', 'Na1+', '1+Na', 'x2 (C)', '2 (C)junk'])('rejects unusable moiety %s', (formula) => {
    expect(() => parseFormulaMoiety(formula)).toThrow('Unable to parse formula');
  });
});
