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
  it('accepts an empty search', () => {
    expect(validateSearchInput(emptyInput)).toEqual({});
  });

  it('accepts positive decimal cell lengths', () => {
    expect(validateSearchInput({ ...emptyInput, aMin: '0.4', aMax: '1.65' })).toEqual({});
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

