import { describe, expect, it } from 'vitest';
import { formatElementSelection, resolveElementSelection, toggleElementCriterion } from './periodicTableData';

const empty = { elements: [], groups: [], periods: [] };

describe('resolveElementSelection', () => {
  it('resolves Group 16', () => expect(resolveElementSelection({ ...empty, groups: [16] })).toEqual(['O', 'S', 'Se', 'Te', 'Po', 'Lv']));
  it('resolves Period 4', () => expect(resolveElementSelection({ ...empty, periods: [4] })).toEqual(['K', 'Ca', 'Sc', 'Ti', 'V', 'Cr', 'Mn', 'Fe', 'Co', 'Ni', 'Cu', 'Zn', 'Ga', 'Ge', 'As', 'Se', 'Br', 'Kr']));
  it('unions criteria without duplicates in atomic order', () => expect(resolveElementSelection({ elements: ['Fe'], groups: [16], periods: [4] })).toEqual(['O', 'S', 'K', 'Ca', 'Sc', 'Ti', 'V', 'Cr', 'Mn', 'Fe', 'Co', 'Ni', 'Cu', 'Zn', 'Ga', 'Ge', 'As', 'Se', 'Br', 'Kr', 'Te', 'Po', 'Lv']));
  it('keeps explicit elements independent', () => expect(resolveElementSelection({ elements: ['S'], groups: [], periods: [] })).toEqual(['S']));
  it('returns an empty list for no criteria', () => expect(resolveElementSelection(empty)).toEqual([]));

  it('formats explicit criteria without expanding groups and periods', () => {
    expect(formatElementSelection({ elements: ['Fe', 'Ni'], groups: [16], periods: [4] }))
      .toBe('Fe OR Ni OR Group 16 OR Period 4');
  });

  it('toggles elements without changing group or period criteria', () => {
    const selected = toggleElementCriterion({ elements: ['Fe'], groups: [16], periods: [4] }, 'Ni');
    expect(selected).toEqual({ elements: ['Fe', 'Ni'], groups: [16], periods: [4] });
    expect(toggleElementCriterion(selected, 'Fe')).toEqual({ elements: ['Ni'], groups: [16], periods: [4] });
  });
});
