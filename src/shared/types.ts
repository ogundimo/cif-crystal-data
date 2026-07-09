export interface EntryRow {
  id: number;
  source_filename: string;
  formula: string;
  cell_a: number;
  cell_b: number;
  cell_c: number;
  sg_number: number;
  space_group: string;
  reference: string;
  level_struct_studies: string;
}

export interface ImportFailure {
  filename: string;
  reason: string;
}

export interface ImportResult {
  importedCount: number;
  failures: ImportFailure[];
  total: number;
}

export interface ElementGroup {
  elements: string[];
}

export interface SearchFilter {
  slot1: string[];
  slot2: string[];
  mode: 'AND' | 'OR';
  aMin?: number;
  aMax?: number;
  bMin?: number;
  bMax?: number;
  cMin?: number;
  cMax?: number;
  sgQuery?: string;
  spaceGroupQuery?: string;
  referenceQuery?: string;
  level?: string;
  elementCountQuery?: string;
}

export interface RestraintRow {
  field: string;
  content: string;
  entries: number;
}

export interface CifApi {
  getAllEntries: () => Promise<EntryRow[]>;
  search: (filter: SearchFilter) => Promise<EntryRow[]>;
  restraints: (filter: SearchFilter) => Promise<RestraintRow[]>;
  importCifFolder: () => Promise<ImportResult | null>;
}

declare global {
  interface Window {
    cifApi: CifApi;
  }
}
