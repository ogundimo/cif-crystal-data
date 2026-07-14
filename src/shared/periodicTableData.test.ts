import { describe, expect, it } from 'vitest';
import { resolveElementSelection } from './periodicTableData';

const empty = { elements: [], groups: [], periods: [] };

describe('resolveElementSelection', () => {
  it('resolves Group 16', () => expect(resolveElementSelection({ ...empty, groups: [16] })).toEqual(['O', 'S', 'Se', 'Te', 'Po', 'Lv']));
  it('resolves Period 4', () => expect(resolveElementSelection({ ...empty, periods: [4] })).toEqual(['K', 'Ca', 'Sc', 'Ti', 'V', 'Cr', 'Mn', 'Fe', 'Co', 'Ni', 'Cu', 'Zn', 'Ga', 'Ge', 'As', 'Se', 'Br', 'Kr']));
  it('unions criteria without duplicates in atomic order', () => expect(resolveElementSelection({ elements: ['Fe'], groups: [16], periods: [4] })).toEqual(['O', 'S', 'K', 'Ca', 'Sc', 'Ti', 'V', 'Cr', 'Mn', 'Fe', 'Co', 'Ni', 'Cu', 'Zn', 'Ga', 'Ge', 'As', 'Se', 'Br', 'Kr', 'Te', 'Po', 'Lv']));
  it('keeps explicit elements independent', () => expect(resolveElementSelection({ elements: ['S'], groups: [], periods: [] })).toEqual(['S']));
  it('returns an empty list for no criteria', () => expect(resolveElementSelection(empty)).toEqual([]));
});
