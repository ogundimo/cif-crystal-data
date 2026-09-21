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
  it.each(['sgQuery', 'elementCountQuery'] as const)('rejects invalid numeric criteria in %s', (field) => {
    for (const query of ['abc', 'many', '1.5', '1e2', '0x10', '-1', '0', '4-2', '1-2-3', '1-999', '9'.repeat(200)]) {
      for (const exclude of [false, true]) {
        expect(() => validateSearchFilter({
          ...validFilter, [field]: query, sgExclude: exclude, elementCountExclude: exclude
        })).toThrow(`Invalid search filter: ${field}:`);
      }
    }
  });

  it.each([
    ['sgQuery', 230], ['elementCountQuery', 118]
  ] as const)('accepts only in-range boundaries for %s without changing the filter', (field, maximum) => {
    for (const query of ['', ' \t ', '1', String(maximum), ` 1 - ${maximum} `, `${maximum}-${maximum}`]) {
      const filter = { ...validFilter, [field]: query, sgExclude: true, elementCountExclude: true };
      const before = structuredClone(filter);
      expect(validateSearchFilter(filter)).toBe(filter);
      expect(filter).toEqual(before);
    }
    expect(() => validateSearchFilter({ ...validFilter, [field]: String(maximum + 1) }))
      .toThrow(`Enter a value from 1 to ${maximum}.`);
  });

  it.each([null, undefined, [], 'Fe', 7])('rejects a non-object IPC payload: %j', (value) => {
    expect(() => validateSearchFilter(value)).toThrow('payload must be an object');
  });

  it.each([
    [{ mode: 'XOR' }, 'mode must be AND or OR'],
    [{ slot3: ['Xx'] }, 'slot3 contains an invalid element symbol'],
    [{ slot4: Array(119).fill('Fe') }, 'slot4 contains too many elements'],
    [{ elementSelections: [null] }, 'elementSelections[0] must be an object'],
    [{ elementSelection: { elements: [], groups: [0], periods: [] } }, 'groups contains an out-of-range value'],
    [{ elementSelection: { elements: [], groups: [19], periods: [] } }, 'groups contains an out-of-range value'],
    [{ elementSelection: { elements: [], groups: [1.5], periods: [] } }, 'groups contains an out-of-range value'],
    [{ elementSelection: { elements: [], groups: '1', periods: [] } }, 'groups must be an array'],
    [{ elementSelection: { elements: [], groups: Array(19).fill(1), periods: [] } }, 'groups contains too many values'],
    [{ elementSelection: { elements: [], groups: [], periods: null } }, 'periods must be an array'],
    [{ elementSelection: { elements: [], groups: [], periods: Array(10).fill(1) } }, 'periods contains too many values'],
    [{ bMax: Infinity }, 'bMax must be a finite number'],
    [{ cMin: '5' }, 'cMin must be a finite number'],
    [{ referenceQuery: 'x'.repeat(201) }, 'referenceQuery must be a string of at most 200 characters'],
    [{ sgQuery: 62 }, 'sgQuery must be a string']
  ])('rejects malformed search fields %j', (fields, message) => {
    expect(() => validateSearchFilter({ ...validFilter, ...fields })).toThrow(message);
  });

  it('accepts bounded selections and maximum-length text without altering the request', () => {
    const filter = {
      ...validFilter, slot3: ['Cl'], slot4: ['Na'], referenceQuery: 'x'.repeat(200),
      elementSelection: { elements: ['Fe'], groups: [1, 18], periods: [1, 7, 9, 10], exclude: false }
    };
    const before = structuredClone(filter);
    expect(validateSearchFilter(filter)).toBe(filter);
    expect(filter).toEqual(before);
  });
  it('accepts a valid filter', () => {
    expect(validateSearchFilter(validFilter)).toBe(validFilter);
  });

  it('rejects malformed arrays before database query construction', () => {
    expect(() => validateSearchFilter({ ...validFilter, slot1: 'Fe' })).toThrow(
      'slot1 must be an array'
    );
  });

  it('rejects a non-boolean not-equal flag', () => {
    expect(() =>
      validateSearchFilter({
        ...validFilter,
        elementSelections: [
          { elements: ['Fe'], groups: [], periods: [], exclude: 'yes' }
        ]
      })
    ).toThrow('elementSelections[0].exclude must be a boolean');
  });

  it('validates textbox not-equal flags as booleans', () => {
    expect(() => validateSearchFilter({ ...validFilter, referenceExclude: true })).not.toThrow();
    expect(() => validateSearchFilter({ ...validFilter, sgExclude: 'yes' })).toThrow(
      'sgExclude must be a boolean'
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

  it('accepts 4f and 5f period criteria and rejects the spacer row', () => {
    expect(() =>
      validateSearchFilter({
        ...validFilter,
        elementSelections: [{ elements: [], groups: [], periods: [9, 10] }]
      })
    ).not.toThrow();
    expect(() =>
      validateSearchFilter({
        ...validFilter,
        elementSelections: [{ elements: [], groups: [], periods: [8] }]
      })
    ).toThrow('invalid period');
  });

  it('caps the number of independently resolved element selections', () => {
    const selection = { elements: [], groups: [], periods: [] };
    expect(() =>
      validateSearchFilter({ ...validFilter, elementSelections: Array(5).fill(selection) })
    ).toThrow('at most four selections');
  });
});
