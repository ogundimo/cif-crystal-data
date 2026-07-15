import type { ElementSelection } from './types';

/** Element symbols in atomic-number order. */
export const ELEMENT_SYMBOLS = [
  'H', 'He', 'Li', 'Be', 'B', 'C', 'N', 'O', 'F', 'Ne', 'Na', 'Mg', 'Al', 'Si', 'P', 'S', 'Cl', 'Ar',
  'K', 'Ca', 'Sc', 'Ti', 'V', 'Cr', 'Mn', 'Fe', 'Co', 'Ni', 'Cu', 'Zn', 'Ga', 'Ge', 'As', 'Se', 'Br', 'Kr',
  'Rb', 'Sr', 'Y', 'Zr', 'Nb', 'Mo', 'Tc', 'Ru', 'Rh', 'Pd', 'Ag', 'Cd', 'In', 'Sn', 'Sb', 'Te', 'I', 'Xe',
  'Cs', 'Ba', 'La', 'Ce', 'Pr', 'Nd', 'Pm', 'Sm', 'Eu', 'Gd', 'Tb', 'Dy', 'Ho', 'Er', 'Tm', 'Yb', 'Lu',
  'Hf', 'Ta', 'W', 'Re', 'Os', 'Ir', 'Pt', 'Au', 'Hg', 'Tl', 'Pb', 'Bi', 'Po', 'At', 'Rn',
  'Fr', 'Ra', 'Ac', 'Th', 'Pa', 'U', 'Np', 'Pu', 'Am', 'Cm', 'Bk', 'Cf', 'Es', 'Fm', 'Md', 'No', 'Lr',
  'Rf', 'Db', 'Sg', 'Bh', 'Hs', 'Mt', 'Ds', 'Rg', 'Cn', 'Nh', 'Fl', 'Mc', 'Lv', 'Ts', 'Og'
] as const;

export const GROUP_TO_ELEMENTS: Readonly<Record<number, readonly string[]>> = {
  1: ['H', 'Li', 'Na', 'K', 'Rb', 'Cs', 'Fr'], 2: ['Be', 'Mg', 'Ca', 'Sr', 'Ba', 'Ra'],
  3: ['Sc', 'Y', 'La', 'Ac'], 4: ['Ti', 'Zr', 'Hf', 'Rf'], 5: ['V', 'Nb', 'Ta', 'Db'],
  6: ['Cr', 'Mo', 'W', 'Sg'], 7: ['Mn', 'Tc', 'Re', 'Bh'], 8: ['Fe', 'Ru', 'Os', 'Hs'],
  9: ['Co', 'Rh', 'Ir', 'Mt'], 10: ['Ni', 'Pd', 'Pt', 'Ds'], 11: ['Cu', 'Ag', 'Au', 'Rg'],
  12: ['Zn', 'Cd', 'Hg', 'Cn'], 13: ['B', 'Al', 'Ga', 'In', 'Tl', 'Nh'],
  14: ['C', 'Si', 'Ge', 'Sn', 'Pb', 'Fl'], 15: ['N', 'P', 'As', 'Sb', 'Bi', 'Mc'],
  16: ['O', 'S', 'Se', 'Te', 'Po', 'Lv'], 17: ['F', 'Cl', 'Br', 'I', 'At', 'Ts'],
  18: ['He', 'Ne', 'Ar', 'Kr', 'Xe', 'Rn', 'Og']
};

export const PERIOD_TO_ELEMENTS: Readonly<Record<number, readonly string[]>> = {
  1: ['H', 'He'], 2: ELEMENT_SYMBOLS.slice(2, 10), 3: ELEMENT_SYMBOLS.slice(10, 18),
  4: ELEMENT_SYMBOLS.slice(18, 36), 5: ELEMENT_SYMBOLS.slice(36, 54),
  // The picker displays the f-block on separate selectable rows, so 6P and
  // 7P contain only the elements visibly present in their main table rows.
  6: [...ELEMENT_SYMBOLS.slice(54, 57), ...ELEMENT_SYMBOLS.slice(71, 86)],
  7: [...ELEMENT_SYMBOLS.slice(86, 89), ...ELEMENT_SYMBOLS.slice(103, 118)],
  // 9 and 10 are the picker grid rows for the displayed 4f and 5f series.
  9: ELEMENT_SYMBOLS.slice(57, 71), 10: ELEMENT_SYMBOLS.slice(89, 103)
};

export const SELECTABLE_PERIODS = [1, 2, 3, 4, 5, 6, 7, 9, 10] as const;

export function formatPeriodCriterion(period: number): string {
  if (period === 9) return 'Period 4f';
  if (period === 10) return 'Period 5f';
  return `Period ${period}`;
}

export function resolveElementSelection(selection: ElementSelection): string[] {
  const resolved = new Set<string>(selection.elements);
  selection.groups.forEach((group) => GROUP_TO_ELEMENTS[group]?.forEach((symbol) => resolved.add(symbol)));
  selection.periods.forEach((period) => PERIOD_TO_ELEMENTS[period]?.forEach((symbol) => resolved.add(symbol)));
  return ELEMENT_SYMBOLS.filter((symbol) => resolved.has(symbol));
}

export function createEmptyElementSelection(): ElementSelection {
  return { elements: [], groups: [], periods: [] };
}

export function formatElementSelection(selection: ElementSelection): string {
  const content = [
    ...selection.elements,
    ...selection.groups.map((group) => `Group ${group}`),
    ...selection.periods.map(formatPeriodCriterion)
  ].join(' OR ');
  return selection.exclude && content ? `NOT(${content})` : content;
}

export function toggleElementCriterion(selection: ElementSelection, symbol: string): ElementSelection {
  return {
    ...selection,
    elements: selection.elements.includes(symbol)
      ? selection.elements.filter((element) => element !== symbol)
      : [...selection.elements, symbol]
  };
}
