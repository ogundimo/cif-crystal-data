import { describe, expect, it } from 'vitest';
import { validateSearchFilter } from './searchFilterValidation';

const validFilter = {
  slot1: ['Fe'],
  slot2: [],
  mode: 'AND' as const,
  aMin: 0.1,
  referenceQuery: 'Inorg. Mater.'
};

describe('validateSearchFilter', () => {
  it('accepts a valid filter', () => {
    expect(validateSearchFilter(validFilter)).toBe(validFilter);
  });

  it('rejects malformed arrays before database query construction', () => {
    expect(() => validateSearchFilter({ ...validFilter, slot1: 'Fe' })).toThrow(
      'slot1 must be an array'
    );
  });

  it('rejects non-finite numeric ranges', () => {
    expect(() => validateSearchFilter({ ...validFilter, aMin: Number.NaN })).toThrow(
      'aMin must be a finite number'
    );
  });

  it('rejects invalid element selection values', () => {
    expect(() =>
      validateSearchFilter({
        ...validFilter,
        elementSelections: [{ elements: ['NotAnElement'], groups: [], periods: [] }]
      })
    ).toThrow('invalid element symbol');
  });

  it('caps the number of independently resolved element selections', () => {
    const selection = { elements: [], groups: [], periods: [] };
    expect(() =>
      validateSearchFilter({ ...validFilter, elementSelections: Array(5).fill(selection) })
    ).toThrow('at most four selections');
  });
});
