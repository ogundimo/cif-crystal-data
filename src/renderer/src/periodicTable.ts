export interface ElementDef {
  symbol: string;
  z: number;
  row: number;
  col: number;
  category: string;
}

export const GROUP_LABELS = [
  '1A', '2A', '3B', '4B', '5B', '6B', '7B', '8B', '8B', '8B', '1B', '2B', '3A', '4A', '5A', '6A', '7A', '8A'
];

export const PERIOD_LABELS: Record<number, string> = {
  1: '1P',
  2: '2P',
  3: '3P',
  4: '4P',
  5: '5P',
  6: '6P',
  7: '7P',
  9: '4f',
  10: '5f'
};

export const PERIODIC_TABLE: ElementDef[] = [
  { symbol: 'H', z: 1, row: 1, col: 1, category: 'nm' }, { symbol: 'He', z: 2, row: 1, col: 18, category: 'ng' },
  { symbol: 'Li', z: 3, row: 2, col: 1, category: 'alk' }, { symbol: 'Be', z: 4, row: 2, col: 2, category: 'alk' }, { symbol: 'B', z: 5, row: 2, col: 13, category: 'metaloid' }, { symbol: 'C', z: 6, row: 2, col: 14, category: 'nm' }, { symbol: 'N', z: 7, row: 2, col: 15, category: 'nm' }, { symbol: 'O', z: 8, row: 2, col: 16, category: 'nm' }, { symbol: 'F', z: 9, row: 2, col: 17, category: 'nm' }, { symbol: 'Ne', z: 10, row: 2, col: 18, category: 'ng' },
  { symbol: 'Na', z: 11, row: 3, col: 1, category: 'alk' }, { symbol: 'Mg', z: 12, row: 3, col: 2, category: 'alk' }, { symbol: 'Al', z: 13, row: 3, col: 13, category: 'tm' }, { symbol: 'Si', z: 14, row: 3, col: 14, category: 'metaloid' }, { symbol: 'P', z: 15, row: 3, col: 15, category: 'nm' }, { symbol: 'S', z: 16, row: 3, col: 16, category: 'nm' }, { symbol: 'Cl', z: 17, row: 3, col: 17, category: 'nm' }, { symbol: 'Ar', z: 18, row: 3, col: 18, category: 'ng' },
  { symbol: 'K', z: 19, row: 4, col: 1, category: 'alk' }, { symbol: 'Ca', z: 20, row: 4, col: 2, category: 'alk' }, { symbol: 'Sc', z: 21, row: 4, col: 3, category: 'tm' }, { symbol: 'Ti', z: 22, row: 4, col: 4, category: 'tm' }, { symbol: 'V', z: 23, row: 4, col: 5, category: 'tm' }, { symbol: 'Cr', z: 24, row: 4, col: 6, category: 'tm' }, { symbol: 'Mn', z: 25, row: 4, col: 7, category: 'tm' }, { symbol: 'Fe', z: 26, row: 4, col: 8, category: 'tm' }, { symbol: 'Co', z: 27, row: 4, col: 9, category: 'tm' }, { symbol: 'Ni', z: 28, row: 4, col: 10, category: 'tm' }, { symbol: 'Cu', z: 29, row: 4, col: 11, category: 'tm' }, { symbol: 'Zn', z: 30, row: 4, col: 12, category: 'tm' }, { symbol: 'Ga', z: 31, row: 4, col: 13, category: 'tm' }, { symbol: 'Ge', z: 32, row: 4, col: 14, category: 'metaloid' }, { symbol: 'As', z: 33, row: 4, col: 15, category: 'metaloid' }, { symbol: 'Se', z: 34, row: 4, col: 16, category: 'nm' }, { symbol: 'Br', z: 35, row: 4, col: 17, category: 'nm' }, { symbol: 'Kr', z: 36, row: 4, col: 18, category: 'ng' },
  { symbol: 'Rb', z: 37, row: 5, col: 1, category: 'alk' }, { symbol: 'Sr', z: 38, row: 5, col: 2, category: 'alk' }, { symbol: 'Y', z: 39, row: 5, col: 3, category: 'tm' }, { symbol: 'Zr', z: 40, row: 5, col: 4, category: 'tm' }, { symbol: 'Nb', z: 41, row: 5, col: 5, category: 'tm' }, { symbol: 'Mo', z: 42, row: 5, col: 6, category: 'tm' }, { symbol: 'Tc', z: 43, row: 5, col: 7, category: 'tm' }, { symbol: 'Ru', z: 44, row: 5, col: 8, category: 'tm' }, { symbol: 'Rh', z: 45, row: 5, col: 9, category: 'tm' }, { symbol: 'Pd', z: 46, row: 5, col: 10, category: 'tm' }, { symbol: 'Ag', z: 47, row: 5, col: 11, category: 'tm' }, { symbol: 'Cd', z: 48, row: 5, col: 12, category: 'tm' }, { symbol: 'In', z: 49, row: 5, col: 13, category: 'tm' }, { symbol: 'Sn', z: 50, row: 5, col: 14, category: 'tm' }, { symbol: 'Sb', z: 51, row: 5, col: 15, category: 'metaloid' }, { symbol: 'Te', z: 52, row: 5, col: 16, category: 'metaloid' }, { symbol: 'I', z: 53, row: 5, col: 17, category: 'nm' }, { symbol: 'Xe', z: 54, row: 5, col: 18, category: 'ng' },
  { symbol: 'Cs', z: 55, row: 6, col: 1, category: 'alk' }, { symbol: 'Ba', z: 56, row: 6, col: 2, category: 'alk' }, { symbol: 'La', z: 57, row: 6, col: 3, category: 'lan' }, { symbol: 'Hf', z: 72, row: 6, col: 4, category: 'tm' }, { symbol: 'Ta', z: 73, row: 6, col: 5, category: 'tm' }, { symbol: 'W', z: 74, row: 6, col: 6, category: 'tm' }, { symbol: 'Re', z: 75, row: 6, col: 7, category: 'tm' }, { symbol: 'Os', z: 76, row: 6, col: 8, category: 'tm' }, { symbol: 'Ir', z: 77, row: 6, col: 9, category: 'tm' }, { symbol: 'Pt', z: 78, row: 6, col: 10, category: 'tm' }, { symbol: 'Au', z: 79, row: 6, col: 11, category: 'tm' }, { symbol: 'Hg', z: 80, row: 6, col: 12, category: 'tm' }, { symbol: 'Tl', z: 81, row: 6, col: 13, category: 'tm' }, { symbol: 'Pb', z: 82, row: 6, col: 14, category: 'tm' }, { symbol: 'Bi', z: 83, row: 6, col: 15, category: 'tm' }, { symbol: 'Po', z: 84, row: 6, col: 16, category: 'metaloid' }, { symbol: 'At', z: 85, row: 6, col: 17, category: 'nm' }, { symbol: 'Rn', z: 86, row: 6, col: 18, category: 'ng' },
  { symbol: 'Fr', z: 87, row: 7, col: 1, category: 'alk' }, { symbol: 'Ra', z: 88, row: 7, col: 2, category: 'alk' }, { symbol: 'Ac', z: 89, row: 7, col: 3, category: 'act' }, { symbol: 'Rf', z: 104, row: 7, col: 4, category: 'tm' }, { symbol: 'Db', z: 105, row: 7, col: 5, category: 'tm' }, { symbol: 'Sg', z: 106, row: 7, col: 6, category: 'tm' }, { symbol: 'Bh', z: 107, row: 7, col: 7, category: 'tm' }, { symbol: 'Hs', z: 108, row: 7, col: 8, category: 'tm' }, { symbol: 'Mt', z: 109, row: 7, col: 9, category: 'tm' }, { symbol: 'Ds', z: 110, row: 7, col: 10, category: 'tm' },
  { symbol: 'Ce', z: 58, row: 9, col: 4, category: 'lan' }, { symbol: 'Pr', z: 59, row: 9, col: 5, category: 'lan' }, { symbol: 'Nd', z: 60, row: 9, col: 6, category: 'lan' }, { symbol: 'Pm', z: 61, row: 9, col: 7, category: 'lan' }, { symbol: 'Sm', z: 62, row: 9, col: 8, category: 'lan' }, { symbol: 'Eu', z: 63, row: 9, col: 9, category: 'lan' }, { symbol: 'Gd', z: 64, row: 9, col: 10, category: 'lan' }, { symbol: 'Tb', z: 65, row: 9, col: 11, category: 'lan' }, { symbol: 'Dy', z: 66, row: 9, col: 12, category: 'lan' }, { symbol: 'Ho', z: 67, row: 9, col: 13, category: 'lan' }, { symbol: 'Er', z: 68, row: 9, col: 14, category: 'lan' }, { symbol: 'Tm', z: 69, row: 9, col: 15, category: 'lan' }, { symbol: 'Yb', z: 70, row: 9, col: 16, category: 'lan' }, { symbol: 'Lu', z: 71, row: 9, col: 17, category: 'lan' },
  { symbol: 'Th', z: 90, row: 10, col: 4, category: 'act' }, { symbol: 'Pa', z: 91, row: 10, col: 5, category: 'act' }, { symbol: 'U', z: 92, row: 10, col: 6, category: 'act' }, { symbol: 'Np', z: 93, row: 10, col: 7, category: 'act' }, { symbol: 'Pu', z: 94, row: 10, col: 8, category: 'act' }, { symbol: 'Am', z: 95, row: 10, col: 9, category: 'act' }, { symbol: 'Cm', z: 96, row: 10, col: 10, category: 'act' }, { symbol: 'Bk', z: 97, row: 10, col: 11, category: 'act' }, { symbol: 'Cf', z: 98, row: 10, col: 12, category: 'act' }, { symbol: 'Es', z: 99, row: 10, col: 13, category: 'act' }, { symbol: 'Fm', z: 100, row: 10, col: 14, category: 'act' }, { symbol: 'Md', z: 101, row: 10, col: 15, category: 'act' }, { symbol: 'No', z: 102, row: 10, col: 16, category: 'act' }, { symbol: 'Lr', z: 103, row: 10, col: 17, category: 'act' }
];

export const CATEGORY_CLASS: Record<string, string> = {
  alk: 'bg-[#fff6d6]',
  tm: 'bg-[#fdeedd]',
  metaloid: 'bg-[#e2f4e2]',
  nm: 'bg-[#e0edfb]',
  ng: 'bg-[#efe4f9]',
  lan: 'bg-[#ffe8d1]',
  act: 'bg-[#fbdfdf]'
};
