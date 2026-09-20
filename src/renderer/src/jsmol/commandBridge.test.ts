import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CommandBridge as CommandBridgeType } from './commandBridge';
import type { JmolApi } from './runtimeLoader';

let CommandBridge: typeof CommandBridgeType;
let browser: { setTimeout: typeof setTimeout; clearTimeout: typeof clearTimeout; CifJSmolBoundary?: unknown };
let script: ReturnType<typeof vi.fn>;
let jmol: JmolApi | null;
let applet: unknown;
let onPick: ReturnType<typeof vi.fn<(index: number) => void>>;

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  script = vi.fn();
  onPick = vi.fn();
  applet = { id: 'applet' };
  jmol = { script } as unknown as JmolApi;
  browser = { setTimeout, clearTimeout };
  vi.stubGlobal('window', browser);
  ({ CommandBridge } = await import('./commandBridge'));
});

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

function create() {
  return new CommandBridge(onPick, () => jmol, () => applet);
}

/** The token JSmol is actually told to call back with, read off the dispatched script. */
function dispatchedToken(call = 0): number {
  return Number(/complete\((\d+)\)/.exec(script.mock.calls[call][1] as string)![1]);
}

describe('the window boundary', () => {
  it('installs itself and forwards picks as numbers', () => {
    const bridge = create();
    expect(browser.CifJSmolBoundary).toBeDefined();
    (browser.CifJSmolBoundary as { pick: (a: unknown, b: unknown, i: unknown) => void }).pick(null, null, '7');
    expect(onPick).toHaveBeenCalledWith(7);
    bridge.dispose();
  });

  it('removes its own boundary on disposal', () => {
    const bridge = create();
    bridge.dispose();
    expect(browser.CifJSmolBoundary).toBeUndefined();
  });

  it('leaves a newer viewer boundary in place when an older bridge disposes', () => {
    const first = create();
    const second = create();
    const installed = browser.CifJSmolBoundary;
    first.dispose();
    expect(browser.CifJSmolBoundary).toBe(installed);
    second.dispose();
    expect(browser.CifJSmolBoundary).toBeUndefined();
  });
});

describe('awaited script dispatch', () => {
  it('rewrites the caller token to a unique one and resolves on that callback', async () => {
    const bridge = create();
    const settled = vi.fn();
    void bridge.run('load "x";javascript "CifJSmolBoundary.complete(5)";', 5).then(settled);

    expect(script).toHaveBeenCalledTimes(1);
    expect(script.mock.calls[0][0]).toBe(applet);
    const unique = dispatchedToken();
    expect(unique).not.toBe(5);
    expect(script.mock.calls[0][1]).not.toContain('complete(5)');

    (browser.CifJSmolBoundary as { complete: (t: number) => void }).complete(unique);
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toHaveBeenCalled();
    bridge.dispose();
  });

  it('gives concurrent scripts distinct tokens so a stale callback cannot settle a newer script', async () => {
    const bridge = create();
    const first = vi.fn(); const second = vi.fn();
    // The unsettled one is rejected by the dispose below; swallow that here.
    void bridge.run('javascript "CifJSmolBoundary.complete(1)";', 1).then(first, () => {});
    void bridge.run('javascript "CifJSmolBoundary.complete(1)";', 1).then(second, () => {});
    const [a, b] = [dispatchedToken(0), dispatchedToken(1)];
    expect(a).not.toBe(b);

    (browser.CifJSmolBoundary as { complete: (t: number) => void }).complete(a);
    await vi.advanceTimersByTimeAsync(0);
    expect(first).toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();
    bridge.dispose();
  });

  it('ignores a completion for an unknown token', async () => {
    const bridge = create();
    expect(() => (browser.CifJSmolBoundary as { complete: (t: number) => void }).complete(999_999)).not.toThrow();
    bridge.dispose();
  });

  it('rejects when the script does not complete in time', async () => {
    const bridge = create();
    const failed = expect(bridge.run('s', 1)).rejects.toThrow('JSmol did not complete the load within 90 seconds');
    await vi.advanceTimersByTimeAsync(90_000);
    await failed;
    bridge.dispose();
  });

  it('stops the timeout once the completion arrives', async () => {
    const bridge = create();
    const settled = bridge.run('javascript "CifJSmolBoundary.complete(3)";', 3);
    (browser.CifJSmolBoundary as { complete: (t: number) => void }).complete(dispatchedToken());
    await settled;
    // An uncleared timeout would reject the already-settled promise here.
    await vi.advanceTimersByTimeAsync(120_000);
    bridge.dispose();
  });

  it('surfaces a throwing script call as its own error', async () => {
    const bridge = create();
    script.mockImplementation(() => { throw new Error('applet gone'); });
    await expect(bridge.run('s', 1)).rejects.toThrow('applet gone');
    bridge.dispose();
  });

  it('wraps a non-Error thrown by the script call', async () => {
    const bridge = create();
    script.mockImplementation(() => { throw 'java string failure'; });
    await expect(bridge.run('s', 1)).rejects.toThrow('java string failure');
    bridge.dispose();
  });

  it('rejects immediately once disposed', async () => {
    const bridge = create();
    bridge.dispose();
    await expect(bridge.run('s', 1)).rejects.toThrow('Viewer disposed.');
    expect(script).not.toHaveBeenCalled();
  });
});

describe('fire-and-forget dispatch', () => {
  it('sends when the runtime and applet are both available', () => {
    const bridge = create();
    bridge.send('zoom 100');
    expect(script).toHaveBeenCalledWith(applet, 'zoom 100');
    bridge.dispose();
  });

  it('does nothing before the applet exists, after it is gone, or once disposed', () => {
    const bridge = create();
    applet = null;
    bridge.send('a');
    applet = { id: 'applet' };
    jmol = null;
    bridge.send('b');
    jmol = { script } as unknown as JmolApi;
    bridge.dispose();
    bridge.send('c');
    expect(script).not.toHaveBeenCalled();
  });
});

describe('teardown', () => {
  it('rejects every pending script and clears their timeouts', async () => {
    const bridge = create();
    const first = expect(bridge.run('a', 1)).rejects.toThrow('Viewer disposed.');
    const second = expect(bridge.run('b', 2)).rejects.toThrow('Viewer disposed.');
    bridge.dispose();
    await Promise.all([first, second]);
    // Timeouts were cleared, so advancing past them settles nothing further.
    await vi.advanceTimersByTimeAsync(120_000);
  });

  it('allocates caller tokens from a distinct range and keeps them increasing', () => {
    const bridge = create();
    const first = bridge.nextToken();
    const second = bridge.nextToken();
    expect(first).toBeGreaterThanOrEqual(1_000_000);
    expect(second).toBe(first + 1);
    bridge.dispose();
  });
});
