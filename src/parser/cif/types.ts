export interface ElementCount {
  element: string;
  count: number;
}

export interface ParsedAtomSite {
  siteLabel: string | null;
  typeSymbol: string | null;
  symmetryMultiplicity: number | null;
  wyckoffSymbol: string | null;
  fractX: number | null;
  fractY: number | null;
  fractZ: number | null;
  occupancy: number | null;
  uIsoOrEquiv: number | null;
  bIsoOrEquiv: number | null;
}

export interface ParsedSymmetryOperation {
  operationId: string | null;
  operationXyz: string;
}

export interface ParsedAtomSiteAnisotropic {
  siteLabel: string;
  u11: number | null;
  u22: number | null;
  u33: number | null;
  u12: number | null;
  u13: number | null;
  u23: number | null;
  b11: number | null;
  b22: number | null;
  b33: number | null;
  b12: number | null;
  b13: number | null;
  b23: number | null;
}

export interface ParsedPublAuthor {
  name: string;
  address: string | null;
}

export interface CifEntry {
  formula: string;
  elements: ElementCount[];
  cell_a: number;
  cell_b: number;
  cell_c: number;
  cellAAngstrom: number;
  cellBAngstrom: number;
  cellCAngstrom: number;
  cellAlpha: number | null;
  cellBeta: number | null;
  cellGamma: number | null;
  cellVolume: number | null;
  sg_number: number;
  space_group: string;
  reference: string;
  level: string;
  sampleType: 'Sample crystal' | 'Powder';
  crystalColour: string;
  publTitle: string;
  citationDoi: string;
  databaseCodeCcdc: string;
  databaseCodeCsd: string;
  databaseCodeIcsd: string;
  journalLanguage: string;
  formulaUnitsZ: number | null;
  radiationType: string | null;
  radiationWavelengthAngstrom: number | null;
  publAuthors: ParsedPublAuthor[];
  dataAuthors?: ParsedPublAuthor[];
  atomSites: ParsedAtomSite[];
  symmetryOperations: ParsedSymmetryOperation[];
  atomSiteAnisotropic: ParsedAtomSiteAnisotropic[];
}

export interface RawCif {
  tags: Map<string, string>;
  hasAnisoLabel: boolean;
  atomSites: ParsedAtomSite[];
  publAuthors: ParsedPublAuthor[];
  dataAuthors?: ParsedPublAuthor[];
  symmetryOperations: ParsedSymmetryOperation[];
  atomSiteAnisotropic: ParsedAtomSiteAnisotropic[];
}
