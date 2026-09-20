import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CrystalViewerRuntime as RuntimeType, ViewerRequest } from './runtime';
import type { CifViewerSource } from '../../../shared/types';

let CrystalViewerRuntime: typeof RuntimeType;

interface Harness {
  runtime: RuntimeType;
  host: { clientWidth: number; clientHeight: number; innerHTML: string; replaceChildren: ReturnType<typeof vi.fn> };
  script: ReturnType<typeof vi.fn>;
  repaint: ReturnType<typeof vi.fn>;
  events: {
    requested: ReturnType<typeof vi.fn>; loading: ReturnType<typeof vi.fn>;
    ready: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn>;
    picking: ReturnType<typeof vi.fn>; rotation: ReturnType<typeof vi.fn>;
  };
  fetchSource: ReturnType<typeof vi.fn>;
  applet: { _id: string; _appletPanel: { viewer: unknown; destroy: ReturnType<typeof vi.fn> } };
  ready: () => void;
  windowListeners: Map<string, () => void>;
  resize: () => void;
  properties: Map<string, unknown>;
  /** Scripts dispatched since the last call. */
  drainScripts: () => string[];
  completeNext: boolean;
}

let harness: Harness;

function atoms(count: number) {
  return Array.from({ length: count }, (_, i) => ({ x: i, y: i * 2, z: i * 3, atomIndex: i }));
}

function build(): Harness {
  const windowListeners = new Map<string, () => void>();
  const host = { clientWidth: 800, clientHeight: 600, innerHTML: '', replaceChildren: vi.fn() };
  const applet = { _id: 'cifCrystalViewer1', _cover: vi.fn(), _appletPanel: { viewer: {}, destroy: vi.fn() } };
  const properties = new Map<string, unknown>([
    ['appletInfo', { version: '16.1' }],
    ['atomInfo|(*)', atoms(3)],
    ['atomInfo|(visible)', atoms(3)],
    ['auxiliaryInfo', { models: [{ spaceGroupTitle: 'P 1' }] }],
    ['unitcellInfo', { params: [5, 5, 5, 90, 90, 90] }],
    ['orientationInfo', { rotationMatrix: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], moveTo: '' }],
    ['shapeInfo', { Polyhedra: [{}] }]
  ]);
  const dispatched: string[] = [];
  const state = { completeNext: true, ready: (() => {}) as () => void, resizeCallback: (() => {}) as () => void };

  const script = vi.fn((_applet: unknown, text: string) => {
    dispatched.push(text);
    const token = /CifJSmolBoundary\.complete\((\d+)\)/.exec(text)?.[1];
    if (token && state.completeNext) window.CifJSmolBoundary?.complete(Number(token));
  });

  const jmol = {
    _applets: {} as Record<string, unknown>,
    getAppletHtml: vi.fn((id: string, info: Record<string, unknown>) => {
      state.ready = info.readyFunction as () => void;
      jmol._applets[id] = applet;
      return '<div></div>';
    }),
    script,
    getPropertyAsArray: vi.fn((_applet: unknown, name: string, parameter?: string) =>
      properties.get(parameter === undefined ? name : `${name}|${parameter}`) ?? properties.get(name)),
    repaint: vi.fn()
  };

  class StubResizeObserver {
    constructor(callback: () => void) { state.resizeCallback = callback; }
    observe() {}
    disconnect() {}
  }

  vi.stubGlobal('window', {
    Jmol: jmol,
    setTimeout, clearTimeout, setInterval, clearInterval,
    requestAnimationFrame: (callback: () => void) => setTimeout(callback, 16) as unknown as number,
    cancelAnimationFrame: (handle: number) => clearTimeout(handle),
    addEventListener: (name: string, handler: () => void) => windowListeners.set(name, handler),
    removeEventListener: (name: string) => windowListeners.delete(name)
  });
  vi.stubGlobal('document', { baseURI: 'file:///application/dist/index.html' });
  vi.stubGlobal('ResizeObserver', StubResizeObserver);

  const events = {
    requested: vi.fn(), loading: vi.fn(), ready: vi.fn(), error: vi.fn(),
    picking: vi.fn(), rotation: vi.fn()
  };
  const fetchSource = vi.fn(async (): Promise<CifViewerSource> =>
    ({ fileName: 'sample.cif', text: 'data_sample', sourcePath: '/x/sample.cif' } as unknown as CifViewerSource));

  const runtime = new CrystalViewerRuntime(host as unknown as HTMLElement, fetchSource, events);

  return {
    runtime, host, script, events, fetchSource, applet, properties, windowListeners,
    repaint: jmol.repaint,
    get ready() { return state.ready; },
    resize: () => state.resizeCallback(),
    drainScripts: () => dispatched.splice(0, dispatched.length),
    get completeNext() { return state.completeNext; },
    set completeNext(value: boolean) { state.completeNext = value; }
  } as Harness;
}

const viewerRequest: ViewerRequest = {
  entryId: 1, expectedFileName: 'sample.cif', representation: 'atoms',
  unitCellVisible: true, labelsVisible: false, supercellSize: 1
};

/** Initialize and settle the applet readiness handshake. */
async function initialized(onReady = vi.fn()) {
  const started = harness.runtime.initialize(onReady);
  await vi.advanceTimersByTimeAsync(0);
  harness.ready();
  await started;
  harness.drainScripts();
  return onReady;
}

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  ({ CrystalViewerRuntime } = await import('./runtime'));
  harness = build();
});

afterEach(() => { harness.runtime.dispose(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('initialization', () => {
  it('reports the runtime ready and registers page-teardown listeners', async () => {
    const onReady = await initialized();
    expect(onReady).toHaveBeenCalledTimes(1);
    expect([...harness.windowListeners.keys()].sort()).toEqual(['beforeunload', 'pagehide']);
  });

  it('does nothing further when disposal wins the race with the runtime load', async () => {
    harness.runtime.dispose();
    await harness.runtime.initialize(vi.fn());
    expect(harness.windowListeners.size).toBe(0);
    expect(harness.host.innerHTML).toBe('');
  });

  it('propagates a failure to create the applet', async () => {
    harness.runtime.dispose();
    const fresh = build();
    (window.Jmol as { _applets: Record<string, unknown> })._applets = {};
    (window.Jmol as { getAppletHtml: unknown }).getAppletHtml = vi.fn(() => '<div></div>');
    await expect(fresh.runtime.initialize(vi.fn())).rejects.toThrow('did not create its local HTML5 applet');
    fresh.runtime.dispose();
  });
});

describe('structure loading', () => {
  it('reports requested, loading and ready for a successful load', async () => {
    await initialized();
    harness.runtime.request(viewerRequest);
    await vi.advanceTimersByTimeAsync(0);

    expect(harness.events.requested).toHaveBeenCalledWith('sample.cif');
    expect(harness.events.loading).toHaveBeenCalledWith('sample.cif');
    expect(harness.events.ready).toHaveBeenCalledTimes(1);
    expect(harness.events.ready.mock.calls[0][0]).toMatchObject({
      fileName: 'sample.cif',
      status: { loaded: true, atomCount: 3, spaceGroup: 'P 1', runtimeVersion: '16.1' }
    });
    expect(harness.events.error).not.toHaveBeenCalled();
  });

  it('reports an error when the applet is not ready', async () => {
    harness.runtime.request(viewerRequest);
    await vi.advanceTimersByTimeAsync(0);
    expect(harness.events.error).toHaveBeenCalledWith('sample.cif', 'JSmol is not ready.');
  });

  it('reports the structural warning when JSmol parses no atoms', async () => {
    await initialized();
    harness.properties.set('atomInfo|(*)', []);
    harness.runtime.request(viewerRequest);
    await vi.advanceTimersByTimeAsync(0);
    expect(harness.events.error).toHaveBeenCalledTimes(1);
    expect(harness.events.error.mock.calls[0][1]).toContain('JSmol did not report');
    expect(harness.events.ready).not.toHaveBeenCalled();
  });

  it('surfaces a rejected source fetch through the error event', async () => {
    await initialized();
    harness.fetchSource.mockRejectedValueOnce(new Error('source unavailable'));
    harness.runtime.request(viewerRequest);
    await vi.advanceTimersByTimeAsync(0);
    expect(harness.events.error).toHaveBeenCalledWith('sample.cif', 'source unavailable');
  });

  it('reads a Java-style getMessage when the failure carries no message property', async () => {
    await initialized();
    harness.fetchSource.mockRejectedValueOnce({ getMessage: () => 'java side failure' });
    harness.runtime.request(viewerRequest);
    await vi.advanceTimersByTimeAsync(0);
    expect(harness.events.error).toHaveBeenCalledWith('sample.cif', 'java side failure');
  });

  it('falls back to a generic message for an unreadable failure', async () => {
    await initialized();
    harness.fetchSource.mockRejectedValueOnce({});
    harness.runtime.request(viewerRequest);
    await vi.advanceTimersByTimeAsync(0);
    expect(harness.events.error).toHaveBeenCalledWith('sample.cif', 'JSmol could not load this CIF.');
  });

  it('discards a superseded load without reporting it ready', async () => {
    await initialized();
    harness.runtime.request(viewerRequest);
    harness.runtime.request({ ...viewerRequest, entryId: 2, expectedFileName: 'second.cif' });
    await vi.advanceTimersByTimeAsync(0);
    expect(harness.events.ready).toHaveBeenCalledTimes(1);
    expect(harness.events.ready.mock.calls[0][0].fileName).toBe('sample.cif');
    expect(harness.events.ready.mock.calls[0][0].status.loaded).toBe(true);
  });
});

describe('view controls', () => {
  beforeEach(async () => {
    await initialized();
    harness.runtime.request(viewerRequest);
    await vi.advanceTimersByTimeAsync(0);
    harness.drainScripts();
  });

  it('dispatches representation, unit cell, label and cell-parameter scripts', () => {
    harness.runtime.setRepresentation('ball-stick');
    harness.runtime.setUnitCell(false);
    harness.runtime.setLabels(true);
    harness.runtime.setCellParametersVisible(true);
    harness.runtime.clearMeasurements();
    const sent = harness.drainScripts().join('\n');
    expect(sent).toMatch(/wireframe|spacefill/i);
    expect(sent).toMatch(/unitcell/i);
    expect(sent).toMatch(/label/i);
    expect(sent).toMatch(/measure/i);
  });

  it('re-fits after a view axis change and after fit reset', async () => {
    harness.runtime.viewAxis('a');
    await vi.advanceTimersByTimeAsync(0);
    expect(harness.drainScripts().length).toBeGreaterThan(0);
    harness.runtime.fitReset();
    await vi.advanceTimersByTimeAsync(0);
    expect(harness.drainScripts().length).toBeGreaterThan(0);
  });

  it('swallows a superseded view command rather than surfacing it', async () => {
    harness.completeNext = false;
    harness.runtime.fitReset();
    await vi.advanceTimersByTimeAsync(90_000);
    expect(harness.events.error).not.toHaveBeenCalled();
  });

  it('ignores a repeated viewport obstruction and refits when it changes', async () => {
    harness.runtime.setViewportObstruction({ top: 10 });
    await vi.advanceTimersByTimeAsync(180);
    const first = harness.drainScripts();
    expect(first.length).toBeGreaterThan(0);

    harness.runtime.setViewportObstruction({ top: 10 });
    await vi.advanceTimersByTimeAsync(180);
    expect(harness.drainScripts()).toEqual([]);
  });

  it('repaints and refits when the host is resized to a new size', async () => {
    harness.host.clientWidth = 1000;
    harness.resize();
    await vi.advanceTimersByTimeAsync(200);
    expect(harness.repaint).toHaveBeenCalled();
  });

  it('ignores a resize that reports the same or an empty size', async () => {
    harness.resize();
    harness.host.clientWidth = 0;
    harness.resize();
    await vi.advanceTimersByTimeAsync(200);
    expect(harness.repaint).not.toHaveBeenCalled();
  });

  it('emits a rotation only when the matrix changes', async () => {
    await vi.advanceTimersByTimeAsync(100);
    expect(harness.events.rotation).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(100);
    expect(harness.events.rotation).toHaveBeenCalledTimes(1);

    harness.properties.set('orientationInfo', { rotationMatrix: [[0, 1, 0], [1, 0, 0], [0, 0, 1]] });
    await vi.advanceTimersByTimeAsync(100);
    expect(harness.events.rotation).toHaveBeenCalledTimes(2);
  });

  it('ignores a malformed rotation matrix', async () => {
    harness.properties.set('orientationInfo', { rotationMatrix: [[1, 0], [0, 1]] });
    await vi.advanceTimersByTimeAsync(100);
    expect(harness.events.rotation).not.toHaveBeenCalled();
  });
});

describe('picking and measurement', () => {
  function pick(index: number) {
    window.CifJSmolBoundary!.pick(null, null, index);
  }

  beforeEach(async () => {
    await initialized();
    harness.runtime.request(viewerRequest);
    await vi.advanceTimersByTimeAsync(0);
    for (let i = 0; i < 4; i++) harness.properties.set(`atomInfo|{atomIndex=${i}}`, [{ x: i, y: 0, z: 0 }]);
    harness.events.picking.mockClear();
  });

  it('describes each picking mode as it is selected', () => {
    harness.runtime.setPickingMode('distance');
    expect(harness.events.picking).toHaveBeenLastCalledWith('distance', expect.stringContaining('two distinct atoms'));
    harness.runtime.setPickingMode('angle');
    expect(harness.events.picking).toHaveBeenLastCalledWith('angle', expect.stringContaining('three ordered atoms'));
    harness.runtime.setPolyhedraPicking(true);
    expect(harness.events.picking).toHaveBeenLastCalledWith('polyhedra', expect.stringContaining('coordination polyhedron'));
    harness.runtime.setPolyhedraPicking(false);
    expect(harness.events.picking).toHaveBeenLastCalledWith('off', expect.stringContaining('Picking off'));
  });

  it('ignores picks while picking is off or the index is not a valid atom', async () => {
    pick(0);
    await vi.advanceTimersByTimeAsync(0);
    harness.runtime.setPickingMode('distance');
    harness.events.picking.mockClear();
    pick(-1); pick(1.5);
    await vi.advanceTimersByTimeAsync(0);
    expect(harness.events.picking).not.toHaveBeenCalled();
  });

  it('reports progress then the distance for two atoms', async () => {
    harness.runtime.setPickingMode('distance');
    harness.events.picking.mockClear();
    pick(0);
    await vi.advanceTimersByTimeAsync(0);
    expect(harness.events.picking).toHaveBeenLastCalledWith('distance', expect.stringContaining('1/2'));

    pick(2);
    await vi.advanceTimersByTimeAsync(0);
    expect(harness.events.picking).toHaveBeenLastCalledWith('distance', expect.stringContaining('Distance: 2.0000 Å'));
    expect(harness.drainScripts().join('\n')).toContain('measure');
  });

  it('rejects a repeated atom instead of treating it as a measurement', async () => {
    harness.runtime.setPickingMode('distance');
    pick(1);
    await vi.advanceTimersByTimeAsync(0);
    harness.events.picking.mockClear();
    pick(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(harness.events.picking).toHaveBeenLastCalledWith('distance', expect.stringContaining('Choose a different atom'));
  });

  it('reports an angle once three atoms are picked', async () => {
    // A right angle at atom 1: (1,0,0) - (0,0,0) - (0,1,0).
    harness.properties.set('atomInfo|{atomIndex=0}', [{ x: 1, y: 0, z: 0 }]);
    harness.properties.set('atomInfo|{atomIndex=1}', [{ x: 0, y: 0, z: 0 }]);
    harness.properties.set('atomInfo|{atomIndex=2}', [{ x: 0, y: 1, z: 0 }]);
    harness.runtime.setPickingMode('angle');
    harness.events.picking.mockClear();
    pick(0); await vi.advanceTimersByTimeAsync(0);
    pick(1); await vi.advanceTimersByTimeAsync(0);
    expect(harness.events.picking).toHaveBeenLastCalledWith('angle', expect.stringContaining('2/3'));
    pick(2); await vi.advanceTimersByTimeAsync(0);
    expect(harness.events.picking).toHaveBeenLastCalledWith('angle', expect.stringContaining('Angle:'));
  });

  it('reports unavailable atom coordinates rather than a measurement', async () => {
    harness.properties.set('atomInfo|{atomIndex=2}', [{ x: Number.NaN, y: 0, z: 0 }]);
    harness.runtime.setPickingMode('distance');
    pick(0); await vi.advanceTimersByTimeAsync(0);
    harness.events.picking.mockClear();
    pick(2); await vi.advanceTimersByTimeAsync(0);
    expect(harness.events.picking).toHaveBeenLastCalledWith('distance', expect.stringContaining('Atom coordinates unavailable'));
  });
});

describe('coordination polyhedra', () => {
  function pick(index: number) { window.CifJSmolBoundary!.pick(null, null, index); }

  beforeEach(async () => {
    await initialized();
    harness.runtime.request(viewerRequest);
    await vi.advanceTimersByTimeAsync(0);
    for (const [index, point] of [[0, [0, 0, 0]], [1, [1, 0, 0]], [2, [0, 1, 0]], [3, [0, 0, 1]]] as [number, number[]][]) {
      harness.properties.set(`atomInfo|{atomIndex=${index}}`, [{ x: point[0], y: point[1], z: point[2] }]);
    }
    harness.properties.set('bondInfo|{atomIndex=0}', [1, 2, 3].map(i => ({ atom1: { atomIndex: 0 }, atom2: { atomIndex: i } })));
    harness.runtime.setPolyhedraPicking(true);
    harness.events.picking.mockClear();
    harness.drainScripts();
  });

  it('reports a formed polyhedron and restores the representation afterwards', async () => {
    pick(0);
    await vi.advanceTimersByTimeAsync(0);
    expect(harness.events.picking).toHaveBeenLastCalledWith('polyhedra', expect.stringContaining('Coordination polyhedron: 3 neighbors'));
    expect(harness.drainScripts().join('\n')).toContain('set refreshing true');
  });

  it('reports when JSmol forms no polyhedron from the neighbours', async () => {
    harness.properties.set('shapeInfo', {});
    pick(0);
    await vi.advanceTimersByTimeAsync(0);
    expect(harness.events.picking).toHaveBeenLastCalledWith('polyhedra', expect.stringContaining('could not form a supported polyhedron'));
  });

  it('rejects a neighbour set that cannot support a polyhedron', async () => {
    harness.properties.set('atomInfo|{atomIndex=2}', [{ x: 2, y: 0, z: 0 }]);
    harness.properties.set('atomInfo|{atomIndex=3}', [{ x: 3, y: 0, z: 0 }]);
    pick(0);
    await vi.advanceTimersByTimeAsync(0);
    expect(harness.events.picking).toHaveBeenLastCalledWith('polyhedra', expect.stringContaining('No supported polyhedron'));
  });

  it('clears polyhedra and returns picking to off', () => {
    harness.runtime.clearPolyhedra('atoms');
    expect(harness.events.picking).toHaveBeenLastCalledWith('off', expect.stringContaining('Picking off'));
    expect(harness.drainScripts().join('\n')).toMatch(/polyhedra/i);
  });
});

describe('teardown', () => {
  it('removes listeners, clears the host and releases the applet', async () => {
    await initialized();
    // releaseApplet swaps in an inert panel, so capture the spy before disposal.
    const destroy = harness.applet._appletPanel.destroy;
    harness.runtime.dispose();
    expect(harness.windowListeners.size).toBe(0);
    expect(harness.host.replaceChildren).toHaveBeenCalled();
    expect(destroy).toHaveBeenCalled();
    expect(window.CifJSmolBoundary).toBeUndefined();
  });

  it('is idempotent', async () => {
    await initialized();
    const destroy = harness.applet._appletPanel.destroy;
    harness.runtime.dispose();
    harness.runtime.dispose();
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('rejects an in-flight load and suppresses its error event', async () => {
    await initialized();
    harness.completeNext = false;
    harness.runtime.request(viewerRequest);
    await vi.advanceTimersByTimeAsync(0);
    harness.runtime.dispose();
    await vi.advanceTimersByTimeAsync(0);
    expect(harness.events.error).not.toHaveBeenCalled();
    expect(harness.events.ready).not.toHaveBeenCalled();
  });

  it('stops the rotation poll', async () => {
    await initialized();
    harness.runtime.request(viewerRequest);
    await vi.advanceTimersByTimeAsync(100);
    harness.events.rotation.mockClear();
    harness.runtime.dispose();
    harness.properties.set('orientationInfo', { rotationMatrix: [[9, 0, 0], [0, 9, 0], [0, 0, 9]] });
    await vi.advanceTimersByTimeAsync(500);
    expect(harness.events.rotation).not.toHaveBeenCalled();
  });

  it('disposes when the page is navigated away from', async () => {
    await initialized();
    harness.windowListeners.get('pagehide')!();
    expect(harness.host.replaceChildren).toHaveBeenCalled();
  });
});
