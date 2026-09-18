import { createHash } from 'node:crypto';
import ts from 'typescript';

export const digest = text => createHash('sha256').update(text.replaceAll('\r\n', '\n')).digest('hex');

// Preserve literal contents and identifiers; ignore trivia, never application tokens.
export function tokenFingerprint(text, start = 0, end = text.length, jsx = false) {
  // Parse the complete source so regex literals and JSX text retain their lexical
  // context. A bare scanner can mistake regex contents for comments.
  const source = ts.createSourceFile('clone.ts', text, ts.ScriptTarget.Latest, true,
    jsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  if (source.parseDiagnostics.length) throw new Error('Cannot fingerprint invalid TypeScript clone source');
  const tokens = [];
  const visit = node => {
    if (node.kind <= ts.SyntaxKind.LastToken && node.kind !== ts.SyntaxKind.EndOfFileToken) {
      const position = node.kind === ts.SyntaxKind.JsxText ? node.pos : node.getStart(source);
      if (position < end && node.end > start) tokens.push([node.kind, text.slice(position, node.end)]);
    } else for (const child of node.getChildren(source)) visit(child);
  };
  visit(source);
  return digest(JSON.stringify(tokens));
}

export function cloneIdentity(clone, sources) {
  const sides = [clone.a, clone.b].map(side => {
    const source = sources.get(side.file);
    if (typeof source !== 'string' || !Number.isInteger(side.start) || !Number.isInteger(side.end) ||
        side.start < 1 || side.end < side.start || side.end > source.split('\n').length) {
      throw new Error('Invalid or missing clone source/location');
    }
    const lines = source.split('\n');
    const start = lines.slice(0, side.start - 1).reduce((offset, line) => offset + line.length + 1, 0);
    const end = start + lines.slice(side.start - 1, side.end).join('\n').length;
    return { ...side, fingerprint: tokenFingerprint(source, start, end, clone.format === 'tsx') };
  }).sort((a, b) => a.file.localeCompare(b.file) || a.fingerprint.localeCompare(b.fingerprint));
  return { key: digest(JSON.stringify([clone.format, sides.map(({file, fingerprint}) => ({file, fingerprint}))])),
    format: clone.format, a: sides[0], b: sides[1] };
}

function validatePolicy(policy) {
  if (policy?.schemaVersion !== 1 || !policy.contract || !Array.isArray(policy.allowances)) throw new Error('Invalid duplication policy');
  const keys = new Set();
  for (const row of policy.allowances) {
    if (!/^[a-f0-9]{64}$/.test(row.key) || keys.has(row.key) || !Number.isInteger(row.count) || row.count < 1 ||
        !row.reason?.trim() || !row.reviewTrigger?.trim() || !row.issue?.startsWith('https://github.com/')) {
      throw new Error('Invalid, duplicate or unreviewed duplication allowance');
    }
    keys.add(row.key);
  }
}

export function compareDuplication(current, policy) {
  validatePolicy(policy);
  if (JSON.stringify(current.contract) !== JSON.stringify(policy.contract)) throw new Error('Duplication analyzer/scope contract changed; explicit policy migration required');
  if (!Array.isArray(current.clones)) throw new Error('Missing duplication measurement');
  const remaining = new Map(policy.allowances.map(row => [row.key, row.count]));
  const failures = [], accepted = [];
  for (const clone of current.clones) {
    const locations = `${clone.a.file}:${clone.a.start}–${clone.a.end} and ${clone.b.file}:${clone.b.start}–${clone.b.end}`;
    if ((remaining.get(clone.key) ?? 0) > 0) {
      remaining.set(clone.key, remaining.get(clone.key) - 1);
      accepted.push(`Retained clone: ${locations}; ${policy.allowances.find(row => row.key === clone.key).reason}`);
    } else {
      failures.push(`New/changed/expanded clone: ${locations}. Remove the duplication or request a pair-specific reviewed policy migration; see docs/duplication-policy.md.`);
    }
  }
  return { failures, accepted };
}

export function protectDuplicationPolicy(next, previous) {
  validatePolicy(next); validatePolicy(previous);
  const failures = [];
  if (JSON.stringify(next.contract) !== JSON.stringify(previous.contract)) failures.push('Duplication contract changed; separately reviewed migration required');
  for (const row of next.allowances) {
    const old = previous.allowances.find(old => old.key === row.key);
    if (!old || row.count > old.count) failures.push(`New/increased duplication allowance ${row.key}; separately reviewed migration required`);
  }
  return { failures };
}
