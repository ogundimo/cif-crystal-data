import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { JmolApi } from './runtimeLoader';

interface StubScript {
  src: string;
  async: boolean;
  onload: () => void;
  onerror: () => void;
  remove: ReturnType<typeof vi.fn>;
}

let loadLocalJSmol: () => Promise<JmolApi>;
let scripts: StubScript[];
let browser: { setTimeout: typeof setTimeout; clearTimeout: typeof clearTimeout; Jmol?: unknown };

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  scripts = [];
  browser = { setTimeout, clearTimeout };
  vi.stubGlobal('window', browser);
  vi.stubGlobal('document', {
    baseURI: 'file:///application/dist/index.html',
    createElement: () => ({ remove: vi.fn() }) as unknown as StubScript,
    head: { append: (script: StubScript) => scripts.push(script) }
  });
  ({ loadLocalJSmol } = await import('./runtimeLoader'));
});

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('loading the vendored runtime', () => {
  it('requests the local script asynchronously and resolves with the global API', async () => {
    const pending = loadLocalJSmol();
    expect(scripts).toHaveLength(1);
    expect(scripts[0].src).toBe('file:///application/dist/vendor/jsmol/JSmol.min.js');
    expect(scripts[0].async).toBe(true);

    const api = { _applets: {} };
    browser.Jmol = api;
    scripts[0].onload();
    await expect(pending).resolves.toBe(api);
  });

  it('returns the already-loaded global without requesting the script again', async () => {
    const api = { _applets: {} };
    browser.Jmol = api;
    await expect(loadLocalJSmol()).resolves.toBe(api);
    expect(scripts).toHaveLength(0);
  });

  it('shares one in-flight request between concurrent callers', async () => {
    const first = loadLocalJSmol();
    const second = loadLocalJSmol();
    expect(scripts).toHaveLength(1);
    expect(first).toBe(second);

    browser.Jmol = { _applets: {} };
    scripts[0].onload();
    expect(await first).toBe(await second);
  });

  it('reuses the resolved promise for later callers', async () => {
    const first = loadLocalJSmol();
    browser.Jmol = { _applets: {} };
    scripts[0].onload();
    await first;
    await loadLocalJSmol();
    expect(scripts).toHaveLength(1);
  });
});

describe('load failures', () => {
  it('removes the failed script element and reports an actionable message', async () => {
    const failed = expect(loadLocalJSmol()).rejects.toThrow('The local JSmol runtime could not load. Reload the workspace to retry.');
    scripts[0].onerror();
    await failed;
    expect(scripts[0].remove).toHaveBeenCalled();
  });

  it('treats a script that loads without defining the global as a failure', async () => {
    const failed = expect(loadLocalJSmol()).rejects.toThrow('could not load');
    scripts[0].onload();
    await failed;
    expect(scripts[0].remove).toHaveBeenCalled();
  });

  it('gives up on a stalled script after thirty seconds', async () => {
    const failed = expect(loadLocalJSmol()).rejects.toThrow('could not load');
    await vi.advanceTimersByTimeAsync(30_000);
    await failed;
  });

  it('clears the shared promise so a later caller retries instead of inheriting the failure', async () => {
    const failed = expect(loadLocalJSmol()).rejects.toThrow('could not load');
    scripts[0].onerror();
    await failed;

    const retry = loadLocalJSmol();
    expect(scripts).toHaveLength(2);
    const api = { _applets: {} };
    browser.Jmol = api;
    scripts[1].onload();
    await expect(retry).resolves.toBe(api);
  });

  it('does not fire the stall timeout after the script has already failed', async () => {
    const failed = expect(loadLocalJSmol()).rejects.toThrow('could not load');
    scripts[0].onerror();
    await failed;
    scripts[0].remove.mockClear();
    // The timeout was cleared, so nothing else removes the element or rejects again.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(scripts[0].remove).not.toHaveBeenCalled();
  });
});
