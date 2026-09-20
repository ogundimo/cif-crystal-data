import type { RefinementMethod, ImportedCheckpoint, ExperimentalPattern, RefinementRequest, RefinementResult, RefinementProgress } from './refinement';

export interface EntryRow {
  id: number;
  source_filename: string;
  formula: string;
  cell_a: number;
  cell_b: number;
  cell_c: number;
  cell_a_angstrom: number | null;
  cell_b_angstrom: number | null;
  cell_c_angstrom: number | null;
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
  publ_title: string;
  citation_doi: string;
  database_code_ccdc: string;
  database_code_csd: string;
  database_code_icsd: string;
  journal_language: string;
  formula_units_z: number | null;
  radiation_type: string | null;
  radiation_wavelength_angstrom: number | null;
}

export interface PublAuthorRow {
  id: number;
  entry_id: number;
  author_order: number;
  name: string;
  address: string | null;
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
  u_iso_or_equiv: number | null;
  b_iso_or_equiv: number | null;
}

export interface SymmetryOperationRow {
  id: number;
  entry_id: number;
  operation_order: number;
  operation_id: string | null;
  operation_xyz: string;
}

export interface AtomSiteAnisotropicRow {
  id: number;
  entry_id: number;
  site_order: number;
  site_label: string;
  u_11: number | null;
  u_22: number | null;
  u_33: number | null;
  u_12: number | null;
  u_13: number | null;
  u_23: number | null;
  b_11: number | null;
  b_22: number | null;
  b_33: number | null;
  b_12: number | null;
  b_13: number | null;
  b_23: number | null;
}

export interface DiffractionInput {
  atomSites: AtomSiteRow[];
  symmetryOperations: SymmetryOperationRow[];
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

export type SearchSortColumn =
  | 'formula'
  | 'cell_a'
  | 'cell_b'
  | 'cell_c'
  | 'sg_number'
  | 'space_group'
  | 'reference'
  | 'level_struct_studies';

export interface SearchPageRequest {
  filter: SearchFilter;
  offset: number;
  limit: number;
  sortColumn?: SearchSortColumn;
  sortDirection?: 'asc' | 'desc';
}

export interface SearchPageResult {
  rows: EntryRow[];
  total: number;
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

export interface ExportPxrdResult {
  exported: boolean;
  fileName?: string;
}

export interface PublicationLookupRequest {
  title: string;
  reference: string;
  authors: string[];
}

export interface PublicationResolutionResult {
  status: 'verified' | 'not-found' | 'ambiguous' | 'insufficient-metadata' | 'unavailable';
  doi?: string;
  url?: string;
  matchedTitle?: string;
}

export interface CifViewerSource {
  fileName: string;
  /** Original UTF-8 CIF text read from the imported source file without rewriting. */
  text: string;
}

export interface CifApi {
  openPlotExport: (snapshot: import('./plot').PlotSnapshot) => Promise<void>;
  getPlotExport: () => Promise<import('./plot').PlotSnapshot>;
  savePlotExport: (design: import('./plot').PlotDesign, view: import('./plot').PlotView) => Promise<string | null>;
  openManual: () => Promise<void>;
  openRefinementWindow: (entryId: number, method: RefinementMethod, experimentalId?: string, wavelength?: number) => Promise<void>;
  importRefinementCheckpoint: () => Promise<ImportedCheckpoint | null>;
  importExperimental: () => Promise<ExperimentalPattern | null>;
  getExperimental: (id: string) => Promise<ExperimentalPattern>;
  refinementEngineStatus: () => Promise<{ available: boolean; message?: string }>;
  runRefinement: (request: RefinementRequest) => Promise<RefinementResult>;
  cancelRefinement: () => Promise<void>;
  openRefinementOutput: () => Promise<void>;
  onRefinementProgress: (listener: (progress: RefinementProgress) => void) => () => void;
  getAllEntries: () => Promise<EntryRow[]>;
  getEntryCount: () => Promise<number>;
  getAtomSites: (entryId: number) => Promise<AtomSiteRow[]>;
  getDiffractionInput: (entryId: number) => Promise<DiffractionInput>;
  getPublAuthors: (entryId: number) => Promise<PublAuthorRow[]>;
  getViewerSource: (entryId: number) => Promise<CifViewerSource>;
  getImportFolder: () => Promise<string | null>;
  exportCif: (entryId: number) => Promise<ExportCifResult>;
  exportPxrd: (entryId: number, contents: string) => Promise<ExportPxrdResult>;
  resolvePublication: (request: PublicationLookupRequest) => Promise<PublicationResolutionResult>;
  openExternal: (url: string) => Promise<void>;
  search: (filter: SearchFilter) => Promise<EntryRow[]>;
  searchPage: (request: SearchPageRequest) => Promise<SearchPageResult>;
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
