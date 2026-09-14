import { describe, expect, it } from 'vitest';
import { validateSearchInput, type SearchValidationInput } from './searchValidation';

const emptyInput: SearchValidationInput = {
  aMin: '',
  aMax: '',
  bMin: '',
  bMax: '',
  cMin: '',
  cMax: '',
  sgQuery: '',
  elementCountQuery: ''
};

describe('validateSearchInput', () => {
  it.each(['a', 'b', 'c'] as const)('validates both inclusive bounds on axis %s', (axis) => {
    const min = `${axis}Min` as const;
    const max = `${axis}Max` as const;
    expect(validateSearchInput({ ...emptyInput, [min]: '1', [max]: '2' })).toEqual({});
    expect(validateSearchInput({ ...emptyInput, [min]: '2', [max]: '2' })).toEqual({});
    expect(validateSearchInput({ ...emptyInput, [min]: '3', [max]: '2' })).toEqual({
      [max]: 'Maximum must be greater than or equal to minimum.'
    });
  });

  it('provides actionable messages for each validation failure', () => {
    expect(validateSearchInput({ ...emptyInput, aMin: '0', sgQuery: 'bad', elementCountQuery: 'bad' })).toEqual({
      aMin: 'Enter a number greater than 0.',
      sgQuery: 'Enter a space-group number as an integer or range (for example, 3 or 2-4).',
      elementCountQuery: 'Enter an element count as an integer or range (for example, 3 or 2-4).'
    });
    expect(validateSearchInput({ ...emptyInput, sgQuery: '231', elementCountQuery: '119' })).toEqual({
      sgQuery: 'Enter a value from 1 to 230.', elementCountQuery: 'Enter a value from 1 to 118.'
    });
    expect(validateSearchInput({ ...emptyInput, sgQuery: '2-1' }).sgQuery).toBe('Range minimum cannot exceed its maximum.');
  });

  it('accepts an empty search', () => {
    expect(validateSearchInput(emptyInput)).toEqual({});
  });

  it('accepts positive decimal cell lengths', () => {
    expect(validateSearchInput({ ...emptyInput, aMin: '0.4', aMax: '1.65' })).toEqual({});
  });

  it('accepts equal cell bounds and ignores whitespace-only fields', () => {
    expect(validateSearchInput({ ...emptyInput, aMin: '1', aMax: '1', bMin: '  ' })).toEqual({});
  });

  it.each(['Infinity', '-Infinity', 'NaN'])('rejects non-finite cell length %s', (aMin) => {
    expect(validateSearchInput({ ...emptyInput, aMin }).aMin).toBeDefined();
  });

  it.each(['1', '230', '1-230', '230-230', ' 1 - 230 ', '   '])('accepts space-group boundary %s', (sgQuery) => {
    expect(validateSearchInput({ ...emptyInput, sgQuery })).toEqual({});
  });

  it.each(['1', '118', '1-118', '118-118', ' 1 - 118 ', '   '])('accepts element-count boundary %s', (elementCountQuery) => {
    expect(validateSearchInput({ ...emptyInput, elementCountQuery })).toEqual({});
  });

  it.each(['x1', '1x', '1-231', '0-2', '1-2-3', '-1'])('rejects malformed or out-of-range query %s', (sgQuery) => {
    expect(validateSearchInput({ ...emptyInput, sgQuery }).sgQuery).toBeDefined();
  });

  it('rejects non-numeric and non-positive cell lengths', () => {
    const errors = validateSearchInput({ ...emptyInput, aMin: 'abc', bMin: '0', cMax: '-2' });
    expect(errors.aMin).toBeDefined();
    expect(errors.bMin).toBeDefined();
    expect(errors.cMax).toBeDefined();
  });

  it('rejects reversed cell-length ranges', () => {
    expect(validateSearchInput({ ...emptyInput, aMin: '2', aMax: '1' }).aMax).toContain('Maximum');
  });

  it.each(['62', '60-70', '60 - 70'])('accepts space-group query %s', (sgQuery) => {
    expect(validateSearchInput({ ...emptyInput, sgQuery })).toEqual({});
  });

  it.each(['0', '231', '70-60', 'P 21/c', '1.5'])('rejects space-group query %s', (sgQuery) => {
    expect(validateSearchInput({ ...emptyInput, sgQuery }).sgQuery).toBeDefined();
  });

  it.each(['3', '2-4', '2 - 4'])('accepts element-count query %s', (elementCountQuery) => {
    expect(validateSearchInput({ ...emptyInput, elementCountQuery })).toEqual({});
  });

  it.each(['0', '119', '4-2', 'two', '2.5'])('rejects element-count query %s', (elementCountQuery) => {
    expect(validateSearchInput({ ...emptyInput, elementCountQuery }).elementCountQuery).toBeDefined();
  });
});
