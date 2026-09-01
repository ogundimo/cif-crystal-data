export interface StructuralStatus {
  loaded: boolean;
  runtimeVersion: string | null;
  atomCount: number | null;
  unitCell: [number, number, number, number, number, number] | null;
  spaceGroup: string | null;
  warning: string | null;
}

type PropertyReader = (name: string, parameter?: string) => unknown;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

function unitCellFrom(value: unknown): StructuralStatus['unitCell'] {
  const params = record(value)?.params;
  if (!Array.isArray(params) || params.length < 6) return null;
  const values = params.slice(0, 6).map(Number);
  return values.every(Number.isFinite) ? values as StructuralStatus['unitCell'] : null;
}

export function extractStructuralStatus(getProperty: PropertyReader): StructuralStatus {
  const appletInfo = record(getProperty('appletInfo'));
  const atomInfo = getProperty('atomInfo', '(*)');
  const auxiliaryInfo = record(getProperty('auxiliaryInfo'));
  const models = auxiliaryInfo?.models;
  const model = record(Array.isArray(models) ? models[0] : auxiliaryInfo);
  const spaceGroupCandidate = model?.spaceGroupTitle ?? model?.spaceGroup;
  const atomCount = Array.isArray(atomInfo) ? atomInfo.length : null;
  const unitCell = unitCellFrom(getProperty('unitcellInfo'));
  const spaceGroup = typeof spaceGroupCandidate === 'string' && spaceGroupCandidate.trim()
    ? spaceGroupCandidate.trim()
    : null;
  const runtimeVersion = typeof appletInfo?.version === 'string' ? appletInfo.version : null;
  const missing = [
    runtimeVersion ? null : 'runtime version',
    atomCount === null || atomCount < 1 ? 'atom count' : null,
    unitCell ? null : 'unit-cell parameters',
    spaceGroup ? null : 'recognized space group'
  ].filter(Boolean);
  return {
    loaded: atomCount !== null && atomCount > 0,
    runtimeVersion,
    atomCount,
    unitCell,
    spaceGroup,
    warning: missing.length ? `JSmol did not report ${missing.join(', ')}.` : null
  };
}
