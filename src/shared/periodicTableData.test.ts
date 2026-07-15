import { describe, expect, it } from 'vitest';
import { formatElementSelection, resolveElementSelection, toggleElementCriterion } from './periodicTableData';

const empty = { elements: [], groups: [], periods: [] };

describe('resolveElementSelection', () => {
  it('resolves Group 16', () => expect(resolveElementSelection({ ...empty, groups: [16] })).toEqual(['O', 'S', 'Se', 'Te', 'Po', 'Lv']));
  it('resolves Period 4', () => expect(resolveElementSelection({ ...empty, periods: [4] })).toEqual(['K', 'Ca', 'Sc', 'Ti', 'V', 'Cr', 'Mn', 'Fe', 'Co', 'Ni', 'Cu', 'Zn', 'Ga', 'Ge', 'As', 'Se', 'Br', 'Kr']));
  it('keeps the detached 4f series out of the displayed 6P row', () => expect(resolveElementSelection({ ...empty, periods: [6] })).toEqual(['Cs', 'Ba', 'La', 'Hf', 'Ta', 'W', 'Re', 'Os', 'Ir', 'Pt', 'Au', 'Hg', 'Tl', 'Pb', 'Bi', 'Po', 'At', 'Rn']));
  it('keeps the detached 5f series out of the displayed 7P row', () => expect(resolveElementSelection({ ...empty, periods: [7] })).toEqual(['Fr', 'Ra', 'Ac', 'Rf', 'Db', 'Sg', 'Bh', 'Hs', 'Mt', 'Ds', 'Rg', 'Cn', 'Nh', 'Fl', 'Mc', 'Lv', 'Ts', 'Og']));
  it('resolves the displayed 4f series', () => expect(resolveElementSelection({ ...empty, periods: [9] })).toEqual(['Ce', 'Pr', 'Nd', 'Pm', 'Sm', 'Eu', 'Gd', 'Tb', 'Dy', 'Ho', 'Er', 'Tm', 'Yb', 'Lu']));
  it('resolves the displayed 5f series', () => expect(resolveElementSelection({ ...empty, periods: [10] })).toEqual(['Th', 'Pa', 'U', 'Np', 'Pu', 'Am', 'Cm', 'Bk', 'Cf', 'Es', 'Fm', 'Md', 'No', 'Lr']));
  it('unions criteria without duplicates in atomic order', () => expect(resolveElementSelection({ elements: ['Fe'], groups: [16], periods: [4] })).toEqual(['O', 'S', 'K', 'Ca', 'Sc', 'Ti', 'V', 'Cr', 'Mn', 'Fe', 'Co', 'Ni', 'Cu', 'Zn', 'Ga', 'Ge', 'As', 'Se', 'Br', 'Kr', 'Te', 'Po', 'Lv']));
  it('keeps explicit elements independent', () => expect(resolveElementSelection({ elements: ['S'], groups: [], periods: [] })).toEqual(['S']));
  it('returns an empty list for no criteria', () => expect(resolveElementSelection(empty)).toEqual([]));

  it('formats explicit criteria without expanding groups and periods', () => {
    expect(formatElementSelection({ elements: ['Fe', 'Ni'], groups: [16], periods: [4] }))
      .toBe('Fe OR Ni OR Group 16 OR Period 4');
  });

  it('formats the f-series period labels', () => {
    expect(formatElementSelection({ ...empty, periods: [9, 10] }))
      .toBe('Period 4f OR Period 5f');
  });

  it('wraps excluded selection content in NOT', () => {
    expect(formatElementSelection({ elements: ['Fe'], groups: [16], periods: [], exclude: true }))
      .toBe('NOT(Fe OR Group 16)');
    expect(formatElementSelection({ ...empty, exclude: true })).toBe('');
  });

  it('toggles elements without changing group or period criteria', () => {
    const selected = toggleElementCriterion({ elements: ['Fe'], groups: [16], periods: [4] }, 'Ni');
    expect(selected).toEqual({ elements: ['Fe', 'Ni'], groups: [16], periods: [4] });
    expect(toggleElementCriterion(selected, 'Fe')).toEqual({ elements: ['Ni'], groups: [16], periods: [4] });
  });
});
