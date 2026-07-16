export interface EntryRow {
  id: number;
  source_filename: string;
  formula: string;
  cell_a: number;
  cell_b: number;
  cell_c: number;
  cell_angle_alpha: number | null;
  cell_angle_beta: number | null;
  cell_angle_gamma: number | null;
  cell_volume: number | null;
  sg_number: number;
  space_group: string;
  reference: string;
  level_struct_studies: string;
  sample_type: string;
  crystal_colour: string;
}

export interface AtomSiteRow {
  id: number;
  entry_id: number;
  site_order: number;
  type_symbol: string | null;
  site_label: string | null;
  symmetry_multiplicity: number | null;
  wyckoff_symbol: string | null;
  fract_x: number | null;
  fract_y: number | null;
  fract_z: number | null;
  occupancy: number | null;
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
  /** Exclude entries containing any element resolved by this selection. */
  exclude?: boolean;
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
  /** Cell-length search bounds are expressed in ångströms. */
  aMin?: number;
  aMax?: number;
  bMin?: number;
  bMax?: number;
  cMin?: number;
  cMax?: number;
  sgQuery?: string;
  sgExclude?: boolean;
  spaceGroupQuery?: string;
  spaceGroupExclude?: boolean;
  referenceQuery?: string;
  referenceExclude?: boolean;
  level?: string;
  elementCountQuery?: string;
  elementCountExclude?: boolean;
}

export interface RestraintRow {
  field: string;
  content: string;
  entries: number;
}

export interface ExportCifResult {
  exported: boolean;
  fileName?: string;
}

export interface CifApi {
  getAllEntries: () => Promise<EntryRow[]>;
  getEntryCount: () => Promise<number>;
  getAtomSites: (entryId: number) => Promise<AtomSiteRow[]>;
  getImportFolder: () => Promise<string | null>;
  exportCif: (entryId: number) => Promise<ExportCifResult>;
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
