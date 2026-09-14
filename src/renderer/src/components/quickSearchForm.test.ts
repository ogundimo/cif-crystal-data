import { describe, expect, it } from 'vitest';
import { emptyForm, hasSearchCriteria, toFilter } from './quickSearchForm';

describe('quick-search form contract', () => {
  it('keeps empty numeric fields absent and does not enable search for exclusion flags alone', () => {
    const form = { ...emptyForm, aMin: '  ', referenceQuery: '  ', sgExclude: true };
    expect(hasSearchCriteria(form)).toBe(false);
    expect(toFilter(form)).toMatchObject({ aMin: undefined, aMax: undefined, sgExclude: true });
  });

  it('preserves independent element criteria, legacy slots and text exclusions in the IPC filter', () => {
    const form = structuredClone(emptyForm);
    form.elementSelections[0] = { elements: ['Fe'], groups: [2], periods: [3], exclude: false };
    form.elementSelections[1] = { elements: ['O'], groups: [], periods: [], exclude: true };
    Object.assign(form, { aMin: ' 4.5 ', aMax: '6', bMin: '2', bMax: '3', cMin: '7', cMax: '8',
      sgQuery: '60-70', sgExclude: true, spaceGroupQuery: 'Pnma', spaceGroupExclude: true,
      referenceQuery: "O'Brien", referenceExclude: true, level: 'Unit cell determined',
      elementCountQuery: '2-4', elementCountExclude: true });
    expect(toFilter(form)).toEqual({
      slot1: ['Fe'], slot2: ['O'], slot3: [], slot4: [], mode: 'AND',
      elementSelections: form.elementSelections,
      aMin: 4.5, aMax: 6, bMin: 2, bMax: 3, cMin: 7, cMax: 8,
      sgQuery: '60-70', sgExclude: true, spaceGroupQuery: 'Pnma', spaceGroupExclude: true,
      referenceQuery: "O'Brien", referenceExclude: true, level: 'Unit cell determined',
      elementCountQuery: '2-4', elementCountExclude: true
    });
    expect(hasSearchCriteria(form)).toBe(true);
  });

  it.each(['aMin', 'aMax', 'bMin', 'bMax', 'cMin', 'cMax', 'sgQuery', 'spaceGroupQuery',
    'referenceQuery', 'level', 'elementCountQuery'] as const)('recognizes %s as a standalone criterion', field => {
    expect(hasSearchCriteria({ ...emptyForm, [field]: '1' })).toBe(true);
  });

  it.each(['elements', 'groups', 'periods'] as const)('recognizes a selection containing only %s', criterion => {
    const form = structuredClone(emptyForm);
    if (criterion === 'elements') form.elementSelections[3].elements = ['Fe'];
    else form.elementSelections[3][criterion] = [2];
    expect(hasSearchCriteria(form)).toBe(true);
  });
});
