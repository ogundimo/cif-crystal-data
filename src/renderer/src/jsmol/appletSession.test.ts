import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppletSession as AppletSessionType, AppletSessionConfig } from './appletSession';
import type { JmolApi } from './runtimeLoader';

type ReadyFunction = () => void;

let AppletSession: typeof AppletSessionType;
let host: { innerHTML: string; replaceChildren: ReturnType<typeof vi.fn> };
let applets: Record<string, unknown>;
let ready: ReadyFunction;
let appletHtml: string;
let cover: ReturnType<typeof vi.fn>;
let unsetMouse: ReturnType<typeof vi.fn>;
let destroy: ReturnType<typeof vi.fn>;
let jmol: JmolApi;
let onReady: ReturnType<typeof vi.fn<() => void>>;

function makeApplet(id: string) {
  return {
    _id: id,
    _canvas: { tag: 'canvas' },
    _appletPanel: { viewer: {}, destroy },
    _cover: cover
  };
}

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  cover = vi.fn();
  unsetMouse = vi.fn();
  destroy = vi.fn();
  onReady = vi.fn();
  applets = {};
  appletHtml = '<div><img src="x" onerror="Jmol._startAppletJS()"></div>';
  host = { innerHTML: '', replaceChildren: vi.fn() };
  vi.stubGlobal('window', { setTimeout, clearTimeout });
  vi.stubGlobal('document', { baseURI: 'file:///application/dist/index.html' });
  jmol = {
    _applets: applets,
    _unsetMouse: unsetMouse,
    getAppletHtml: vi.fn((id: string, info: Record<string, unknown>) => {
      ready = info.readyFunction as ReadyFunction;
      applets[id] = makeApplet(id);
      return appletHtml;
    }),
    script: vi.fn(),
    getPropertyAsArray: vi.fn(),
    repaint: vi.fn()
  } as unknown as JmolApi;
  ({ AppletSession } = await import('./appletSession'));
});

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

function create(overrides: Partial<AppletSessionConfig> = {}) {
  return new AppletSession({
    jmol,
    host: host as unknown as HTMLElement,
    pickCallback: 'CifJSmolBoundary.pick',
    onReady,
    ...overrides
  });
}

describe('applet creation', () => {
  it('reports ready once JSmol signals it, and exposes the applet handle', async () => {
    const session = create();
    const started = session.start();
    expect(session.pending).toBe(true);
    expect(session.handle).toBe(applets['cifCrystalViewer1']);
    expect(cover).toHaveBeenCalledWith(false);

    ready();
    await started;
    expect(onReady).toHaveBeenCalledTimes(1);
    expect(session.pending).toBe(false);
  });

  it('strips the inline onerror handler before the markup reaches the host', async () => {
    const session = create();
    const started = session.start();
    expect(host.innerHTML).toBe('<div><img src="x"></div>');
    expect(host.innerHTML).not.toMatch(/onerror/i);
    ready(); await started;
  });

  it('gives each session its own applet id', async () => {
    const first = create();
    const a = first.start(); ready(); await a;
    const second = create();
    const b = second.start(); ready(); await b;
    expect(Object.keys(applets)).toEqual(['cifCrystalViewer1', 'cifCrystalViewer2']);
    expect(first.handle).not.toBe(second.handle);
  });

  it('rejects when JSmol does not register an applet, without marking the session pending', async () => {
    jmol.getAppletHtml = vi.fn((_id, info) => { ready = info.readyFunction as ReadyFunction; return appletHtml; });
    const session = create();
    await expect(session.start()).rejects.toThrow('JSmol did not create its local HTML5 applet');
    expect(session.pending).toBe(false);
    expect(host.innerHTML).toBe('');
  });

  it('rejects when JSmol never reports ready within the timeout', async () => {
    const session = create();
    const failed = expect(session.start()).rejects.toThrow('The local JSmol runtime did not initialize');
    await vi.advanceTimersByTimeAsync(90_000);
    await failed;
    expect(onReady).not.toHaveBeenCalled();
  });

  it('honours a shortened timeout', async () => {
    const session = create({ timeoutMs: 500 });
    const failed = expect(session.start()).rejects.toThrow('did not initialize');
    await vi.advanceTimersByTimeAsync(500);
    await failed;
  });
});

describe('cancellation during the readiness handshake', () => {
  it('settles start() without reporting ready, and lets the late callback release the applet', async () => {
    const session = create();
    const started = session.start();
    const applet = session.handle as { _appletPanel?: unknown };

    session.cancel();
    await started;
    expect(onReady).not.toHaveBeenCalled();
    expect(destroy).not.toHaveBeenCalled();

    // JSmol still runs its own ready callback; that callback owns the release.
    ready();
    expect(onReady).not.toHaveBeenCalled();
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(unsetMouse).toHaveBeenCalledTimes(1);
    expect(applets).toEqual({});
    expect(applet._appletPanel).not.toBe(undefined);
  });

  it('does not release while the ready callback is still in flight', async () => {
    const session = create();
    const started = session.start();
    expect(session.pending).toBe(true);

    session.dispose();
    await started;
    expect(destroy).not.toHaveBeenCalled();
    expect(applets['cifCrystalViewer1']).toBeDefined();
    expect(host.replaceChildren).toHaveBeenCalledTimes(1);

    ready();
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(applets).toEqual({});
  });

  it('releases exactly once when disposal follows a completed handshake', async () => {
    const session = create();
    const started = session.start();
    ready(); await started;
    expect(session.pending).toBe(false);

    session.dispose();
    session.dispose();
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(host.replaceChildren).toHaveBeenCalledTimes(2);
  });

  it('clears the timeout on cancel so no late rejection surfaces', async () => {
    const session = create();
    const started = session.start();
    session.cancel();
    await started;
    await vi.advanceTimersByTimeAsync(120_000);
    // Nothing further to await: an uncleared timeout would reject the settled promise.
    expect(onReady).not.toHaveBeenCalled();
  });
});

describe('teardown without a live applet', () => {
  it('clears the host when the session never started', () => {
    const session = create();
    session.dispose();
    expect(host.replaceChildren).toHaveBeenCalledTimes(1);
    expect(destroy).not.toHaveBeenCalled();
  });

  it('clears the host after a failed applet registration', async () => {
    jmol.getAppletHtml = vi.fn((_id, info) => { ready = info.readyFunction as ReadyFunction; return appletHtml; });
    const session = create();
    await expect(session.start()).rejects.toThrow('did not create');
    session.dispose();
    expect(host.replaceChildren).toHaveBeenCalledTimes(1);
  });
});

describe('applet configuration', () => {
  it('requests a local HTML5 applet with no server URL and the caller pick callback', async () => {
    const session = create();
    const started = session.start();
    const info = (jmol.getAppletHtml as ReturnType<typeof vi.fn>).mock.calls[0][1] as Record<string, unknown>;
    expect(info).toMatchObject({
      use: 'HTML5',
      serverURL: '',
      j2sPath: 'file:///application/dist/vendor/jsmol/j2s',
      disableJ2SLoadMonitor: true,
      disableInitialConsole: true,
      addSelectionOptions: false,
      pickCallback: 'CifJSmolBoundary.pick'
    });
    ready(); await started;
  });
});
