import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

async function setup() {
  vi.resetModules();
  vi.useFakeTimers();
  const scripts: Array<{ src: string; onload: () => void; onerror: () => void; remove: ReturnType<typeof vi.fn> }> = [];
  const browser = { setTimeout, clearTimeout, Jmol: undefined as unknown };
  vi.stubGlobal('window', browser);
  vi.stubGlobal('document', {
    baseURI: 'file:///application/dist/index.html',
    createElement: () => ({ remove: vi.fn() }),
    head: { append: (script: typeof scripts[number]) => scripts.push(script) }
  });
  const { CrystalViewerRuntime } = await import('./runtime');
  const create = () => new CrystalViewerRuntime(
    { replaceChildren: vi.fn() } as unknown as HTMLElement,
    vi.fn(), { requested: vi.fn(), loading: vi.fn(), ready: vi.fn(), error: vi.fn() }
  );
  return { scripts, browser, create };
}

it('shares one local script request and does not create applets after disposal', async () => {
  const { scripts, browser, create } = await setup();
  const first = create(); const second = create();
  const ready = vi.fn();
  const a = first.initialize(ready); const b = second.initialize(ready);
  expect(scripts).toHaveLength(1);
  expect(scripts[0].src).toBe('file:///application/dist/vendor/jsmol/JSmol.min.js');
  first.dispose(); second.dispose();
  const getAppletHtml = vi.fn(); browser.Jmol = { getAppletHtml };
  scripts[0].onload();
  await Promise.all([a, b]);
  expect(getAppletHtml).not.toHaveBeenCalled();
  expect(ready).not.toHaveBeenCalled();
});

it('reports a failed script and allows a subsequent local load attempt', async () => {
  const { scripts, create } = await setup();
  const first = create();
  const failed = expect(first.initialize(vi.fn())).rejects.toThrow('could not load');
  scripts[0].onerror(); await failed; first.dispose();
  expect(scripts[0].remove).toHaveBeenCalled();
  const second = create();
  const missingApi = expect(second.initialize(vi.fn())).rejects.toThrow('could not load');
  expect(scripts).toHaveLength(2);
  scripts[1].onload(); await missingApi; second.dispose();
});

it('bounds a stalled script load', async () => {
  const { create } = await setup();
  const runtime = create();
  const failed = expect(runtime.initialize(vi.fn())).rejects.toThrow('could not load');
  await vi.advanceTimersByTimeAsync(30_000);
  await failed; runtime.dispose();
});
