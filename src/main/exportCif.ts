import { sanitizeFilenamePart } from '../shared/exportFilename';

export function buildCifExportFilename(formula: string, spaceGroupNumber: number): string {
  return `${sanitizeFilenamePart(formula)}_${spaceGroupNumber}.cif`;
}

export function buildPxrdExportFilename(formula: string, spaceGroupNumber: number): string {
  return `${sanitizeFilenamePart(formula)}_${spaceGroupNumber}.xy`;
}
