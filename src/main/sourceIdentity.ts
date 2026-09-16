import { createHash } from 'node:crypto';
import { resolve, win32 } from 'node:path';

export function contentHash(content: string | Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

export function sourceKey(path: string): string {
  return process.platform === 'win32' || /^[A-Za-z]:[\\/]/.test(path)
    ? win32.resolve(path).toLowerCase()
    : resolve(path);
}

/** Unique labels survive reorder/edit. Ambiguous labels use content plus occurrence. */
export function blockIdentities(blocks: Array<{ label: string; text: string }>): string[] {
  const labels = blocks.map(block => block.label.toLowerCase());
  const counts = new Map<string, number>();
  for (const label of labels) counts.set(label, (counts.get(label) ?? 0) + 1);
  const occurrences = new Map<string, number>();
  return blocks.map((block, index) => {
    const label = labels[index];
    if (label && counts.get(label) === 1) return `label:${label}`;
    const hash = contentHash(block.text.trim());
    const occurrence = (occurrences.get(hash) ?? 0) + 1;
    occurrences.set(hash, occurrence);
    return `content:${hash}:${occurrence}`;
  });
}
