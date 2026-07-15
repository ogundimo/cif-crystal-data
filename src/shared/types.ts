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

export const LEVEL_FULL = 'Complete structure determined';
export const LEVEL_CELL = 'Cell parameters determined and structure type assigned';

export interface ImportFailure {
  filename: string;
  reason: string;
}

export interface ImportResult {
  importedCount: number;
  skippedCount: number;
  failures: ImportFailure[];
  total: number;
}

export interface ImportProgress {
  processed: number;
  total: number;
  importedCount: number;
  skippedCount: number;
  failureCount: number;
}

export interface ClearCifsResult {
  cleared: boolean;
  deletedCount: number;
}

export interface ElementGroup {
  elements: string[];
}

export interface ElementSelection {
  elements: string[];
  groups: number[];
  periods: number[];
}

export type ElementSelections = [ElementSelection, ElementSelection, ElementSelection, ElementSelection];

export interface SearchFilter {
  slot1: string[];
  slot2: string[];
  slot3?: string[];
  slot4?: string[];
  mode: 'AND' | 'OR';
  /** Per-textbox criteria used by the active-field periodic-table workflow. */
  elementSelections?: ElementSelection[];
  /** Legacy global criteria retained for compatibility with older saved filters. */
  elementSelection?: ElementSelection;
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
  getImportFolder: () => Promise<string | null>;
  search: (filter: SearchFilter) => Promise<EntryRow[]>;
  restraints: (filter: SearchFilter) => Promise<RestraintRow[]>;
  importCifFolder: () => Promise<ImportResult | null>;
  refreshCifFolder: () => Promise<ImportResult>;
  onImportProgress: (listener: (progress: ImportProgress) => void) => () => void;
  clearCifs: () => Promise<ClearCifsResult>;
}

declare global {
  interface Window {
    cifApi: CifApi;
  }
}
