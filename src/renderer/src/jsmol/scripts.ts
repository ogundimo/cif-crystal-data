export type CrystalRepresentation = 'atoms' | 'ball-stick' | 'spacefill';
export type CrystalAxis = 'a' | 'b' | 'c';

export const JSMOL_VERSION = '16.4.15';
export const CRYSTAL_LOAD_PRECISION = 12;
export const UNIT_CELL_LATTICE = '{555 555 1}';
export const CRYSTAL_AXES_SCALE = 2.1;
export const CRYSTAL_OVERVIEW_ZOOM = 60;
export const MIN_STRUCTURE_ZOOM = 20;
export const MAX_STRUCTURE_ZOOM = 400;
export const PROJECTED_VIEW_FILL = 0.60;

type Point3 = [number, number, number];

function point3(value: unknown): Point3 | null {
  if (Array.isArray(value) && value.length >= 3) {
    const point = value.slice(0, 3).map(Number);
    return point.every(Number.isFinite) ? point as Point3 : null;
  }
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  const point = [Number(candidate.x), Number(candidate.y), Number(candidate.z)];
  return point.every(Number.isFinite) ? point as Point3 : null;
}

export function projectedStructureZoom(
  atomInfo: unknown,
  orientationInfo: unknown,
  viewportWidth: number,
  viewportHeight: number
): number {
  if (!Array.isArray(atomInfo) || viewportWidth <= 0 || viewportHeight <= 0) return CRYSTAL_OVERVIEW_ZOOM;
  const orientation = orientationInfo && typeof orientationInfo === 'object'
    ? orientationInfo as Record<string, unknown>
    : null;
  const matrix = orientation?.rotationMatrix;
  const rows = Array.isArray(matrix) ? matrix : [];
  const rotation = rows.slice(0, 3).map((row) => Array.isArray(row) ? row.slice(0, 3).map(Number) : []);
  const modelRadius = Number(orientation?.modelRadius);
  if (rotation.length !== 3 || rotation.some((row) => row.length !== 3 || row.some((value) => !Number.isFinite(value))) ||
      !Number.isFinite(modelRadius) || modelRadius <= 0) return CRYSTAL_OVERVIEW_ZOOM;
  const points = atomInfo.map((value) => {
    const atom = value && typeof value === 'object' ? value as Record<string, unknown> : null;
    const point = point3(atom?.coord) ?? point3(atom);
    if (!point) return null;
    return [
      rotation[0][0] * point[0] + rotation[0][1] * point[1] + rotation[0][2] * point[2],
      rotation[1][0] * point[0] + rotation[1][1] * point[1] + rotation[1][2] * point[2],
      0
    ] as Point3;
  }).filter((point): point is Point3 => point !== null);
  if (points.length < 2) return CRYSTAL_OVERVIEW_ZOOM;
  const xs = points.map((point) => point[0]);
  const ys = points.map((point) => point[1]);
  const width = Math.max(...xs) - Math.min(...xs);
  const height = Math.max(...ys) - Math.min(...ys);
  const pixelsPerAngstromAt100 = Math.max(viewportWidth, viewportHeight) / (2 * modelRadius);
  const zoomCandidates = [
    width > 0.001 ? 100 * viewportWidth * PROJECTED_VIEW_FILL / (width * pixelsPerAngstromAt100) : null,
    height > 0.001 ? 100 * viewportHeight * PROJECTED_VIEW_FILL / (height * pixelsPerAngstromAt100) : null
  ].filter((value): value is number => value !== null && Number.isFinite(value) && value > 0);
  if (zoomCandidates.length === 0) return CRYSTAL_OVERVIEW_ZOOM;
  const zoom = Math.min(...zoomCandidates);
  return Math.round(Math.min(MAX_STRUCTURE_ZOOM, Math.max(MIN_STRUCTURE_ZOOM, zoom)));
}

function completion(token: number): string {
  if (!Number.isInteger(token) || token < 1) throw new TypeError('A positive load token is required.');
  return `javascript "window.CifJSmolBoundary.complete(${token})"`;
}

export function buildCrystalLoadScript(cifText: string, token: number): string {
  return [
    'set refreshing false',
    'zap',
    'set doublePrecision true',
    'set autobond false',
    `load DATA "model"\n${cifText}\nEND "model" ${UNIT_CELL_LATTICE} PACKED FILTER "PRECISION=${CRYSTAL_LOAD_PRECISION}"`,
    completion(token)
  ].join(';') + ';';
}

export function representationScript(representation: CrystalRepresentation): string {
  switch (representation) {
    case 'atoms':
      return 'select all;connect DELETE;wireframe 0;spacefill 23%';
    case 'ball-stick':
      // These radius-based connections are visual suggestions, not verified chemical bonds.
      return 'select all;connect DELETE;connect 15% 110% {*} {*} CREATE;spacefill 23%;wireframe 0.14';
    case 'spacefill':
      return 'select all;connect DELETE;wireframe 0;spacefill 100%';
  }
}

export function labelsScript(enabled: boolean): string {
  return enabled
    ? 'select all;label %[atomName];color labels white;font label 12 sans'
    : 'select all;label off';
}

export function unitCellScript(visible: boolean): string {
  return `set showUnitCell ${visible ? 'true' : 'false'}`;
}

export function cellParametersScript(visible: boolean): string {
  return `set displayCellParameters ${visible ? 'true' : 'false'}`;
}

export function initialAppearanceScript(
  token: number,
  representation: CrystalRepresentation,
  unitCellVisible: boolean,
  labelsVisible: boolean,
  zoom = CRYSTAL_OVERVIEW_ZOOM,
  cellParametersVisible = false
): string {
  return [
    unitCellScript(unitCellVisible),
    cellParametersScript(cellParametersVisible),
    representationScript(representation),
    labelsScript(labelsVisible),
    `set axesScale ${CRYSTAL_AXES_SCALE}`,
    'select all',
    'center selected',
    'moveto 0 front',
    `zoom ${zoom}`,
    'set refreshing true',
    'refresh',
    completion(token)
  ].join(';') + ';';
}

export function fitResetScript(zoom = CRYSTAL_OVERVIEW_ZOOM, token?: number): string {
  const script = `select all;center selected;moveto 1 front;zoom ${zoom}`;
  return token === undefined ? script : `${script};${completion(token)};`;
}

export function axisViewScript(axis: CrystalAxis, zoom = CRYSTAL_OVERVIEW_ZOOM, token?: number): string {
  const script = `select all;center selected;moveto 1 axis ${axis};zoom ${zoom}`;
  return token === undefined ? script : `${script};${completion(token)};`;
}

export function zoomScript(zoom: number, token?: number): string {
  const script = `zoom ${zoom};refresh`;
  return token === undefined ? script : `${script};${completion(token)};`;
}
