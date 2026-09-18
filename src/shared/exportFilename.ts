const WINDOWS_RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

export function sanitizeFilenamePart(value: string): string {
  const sanitized = value
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/[. ]+$/g, '')
    .trim();
  if (!sanitized) return 'compound';
  return WINDOWS_RESERVED_NAME.test(sanitized) ? `_${sanitized}` : sanitized;
}
