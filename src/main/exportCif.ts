import { sanitizeFilenamePart } from '../shared/exportFilename';

export function buildPxrdExportFilename(formula: string, spaceGroupNumber: number): string {
  return `${sanitizeFilenamePart(formula)}_${spaceGroupNumber}.xy`;
}
