const WINDOWS_RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

export function sanitizeFilenamePart(value: string): string {
  const sanitized = value
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/[. ]+$/g, '')
    .trim();
  if (!sanitized) return 'compound';
  return WINDOWS_RESERVED_NAME.test(sanitized) ? `_${sanitized}` : sanitized;
}

export function buildCifExportFilename(formula: string, spaceGroupNumber: number): string {
  return `${sanitizeFilenamePart(formula)}_${spaceGroupNumber}.cif`;
}

export function buildPxrdExportFilename(formula: string, spaceGroupNumber: number): string {
  return `${sanitizeFilenamePart(formula)}_${spaceGroupNumber}.xy`;
}
