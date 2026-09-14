export function nullableText(value: string | undefined): string | null {
  return hasCifValue(value) ? stripQuotes(value) : null;
}

export function nullableNumber(value: string | undefined): number | null {
  if (!hasCifValue(value)) return null;
  const number = stripUncertainty(stripQuotes(value));
  return Number.isFinite(number) ? number : null;
}

/** Collapse the whitespace of a multi-line address block into one readable line. */
export function normalizeAddress(address: string | null): string | null {
  if (address === null) return null;
  const collapsed = address.replace(/\s+/g, ' ').trim();
  return collapsed === '' ? null : collapsed;
}

export function stripQuotes(value: string): string {
  const s = value.trim();
  if (s.length >= 2) {
    const first = s[0];
    const last = s[s.length - 1];
    if ((first === "'" && last === "'") || (first === '"' && last === '"')) {
      return s.slice(1, -1);
    }
  }
  return s;
}

export function hasCifValue(value: string | undefined): value is string {
  if (value === undefined) return false;
  const t = value.trim();
  return t !== '' && t !== '?' && t !== '.';
}

/** Strip a trailing parenthesized uncertainty, e.g. "16.5(3)" -> 16.5 */
export function stripUncertainty(value: string): number {
  const cleaned = value.trim().replace(/\(\d+\)\s*$/, '');
  return Number(cleaned);
}

export function getClean(tags: Map<string, string>, tag: string): string | null {
  const v = tags.get(tag.toLowerCase());
  if (!hasCifValue(v)) return null;
  return stripQuotes(v);
}

export function getRaw(tags: Map<string, string>, tag: string): string | undefined {
  return tags.get(tag.toLowerCase());
}
