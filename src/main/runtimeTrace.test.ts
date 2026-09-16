import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { traceEvent, traceOperation } from './runtimeTrace';
const roots: string[] = [];
afterEach(() => { vi.unstubAllEnvs(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
describe('opt-in tracing', () => {
  it('is disabled by default and preserves results and exceptions', async () => {
    vi.stubEnv('CIF_TRACE_FILE', ''); traceEvent('disabled');
    expect(await traceOperation('test', () => 12)).toBe(12);
    await expect(traceOperation('failure', () => { throw new Error('private'); })).rejects.toThrow('private');
  });
  it('records event timing but never operation results or exception payloads', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cif-trace-')); roots.push(root);
    const path = join(root, 'trace.jsonl'); vi.stubEnv('CIF_TRACE_FILE', path);
    await traceOperation('search', () => 'private search result');
    await expect(traceOperation('import', () => { throw new Error('private path'); })).rejects.toThrow();
    const text = readFileSync(path, 'utf8'); expect(text).not.toContain('private');
    const events = text.trim().split('\n').map(line => JSON.parse(line));
    expect(events.map(event => event.event)).toEqual(['search.start', 'search.complete', 'import.start', 'import.error']);
    expect(events[1].elapsedMs).toBeGreaterThanOrEqual(0);
    vi.stubEnv('CIF_TRACE_FILE', join(root, 'missing', 'trace.jsonl'));
    expect(await traceOperation('unwritable', () => 42)).toBe(42);
  });
});
