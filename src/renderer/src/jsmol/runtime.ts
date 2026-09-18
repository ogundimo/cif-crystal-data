// Capture before JSmol installs its Java-compatible global Error constructor.
const ApplicationError = globalThis.Error;
import type { CifViewerSource } from '../../../shared/types';
import { LatestOnlyScheduler } from './latestOnlyScheduler';
import {
  axisViewScript,
  buildCrystalLoadScript,
  cellParametersScript,
  clearPolyhedraScript,
  clearMeasurementsScript,
  CRYSTAL_OVERVIEW_ZOOM,
  fitResetScript,
  initialAppearanceScript,
  labelsScript,
  projectedViewFit,
  projectedViewScript,
  polyhedraPickingScript,
  representationScript,
  unitCellScript,
  type ViewportObstruction,
  type CrystalAxis,
  type CrystalRepresentation,
  type CrystalSupercellSize
} from './scripts';
import { extractStructuralStatus, type StructuralStatus } from './status';
import { measurementValue, supportsPolyhedron, type Point } from './geometry';
import { releaseApplet, type OwnedApplet } from './lifecycle';

export type PickingMode = 'off' | 'distance' | 'angle' | 'polyhedra';

interface JmolApi {
  _tracker?: unknown;
  _serverUrl?: string;
  _applets: Record<string, unknown>;
  getAppletHtml: (id: string, info: Record<string, unknown>) => string;
  script: (applet: unknown, script: string) => void;
  getPropertyAsArray: (applet: unknown, name: string, parameter?: string) => unknown;
  repaint: (applet: unknown, resize: boolean) => void;
}

interface DeferredJmolApplet {
  _cover: (doCover: boolean) => void;
}

let appletSequence = 0;
let completionSequence = 0;

declare global {
  interface Window {
    Jmol?: JmolApi;
    CifJSmolBoundary?: { complete: (token: number) => void; pick: (_applet: unknown, _info: unknown, index: number) => void };
  }
}

export interface ViewerRequest {
  entryId: number;
  expectedFileName: string;
  representation: CrystalRepresentation;
  unitCellVisible: boolean;
  labelsVisible: boolean;
  supercellSize: CrystalSupercellSize;
}

export interface ViewerResult {
  fileName: string;
  status: StructuralStatus;
}

interface ViewerEvents {
  requested: (fileName: string) => void;
  loading: (fileName: string) => void;
  ready: (result: ViewerResult) => void;
  error: (fileName: string, message: string) => void;
  picking?: (mode: PickingMode, message: string) => void;
  rotation?: (matrix: number[][]) => void;
}

export function jsmolAssetUrls(base = document.baseURI): { script: string; j2s: string } {
  return {
    script: new URL('vendor/jsmol/JSmol.min.js', base).href,
    j2s: new URL('vendor/jsmol/j2s', base).href.replace(/\/$/, '')
  };
}

let runtimeLoading: Promise<JmolApi> | null = null;
function loadLocalJSmol(): Promise<JmolApi> {
  if (window.Jmol) return Promise.resolve(window.Jmol);
  if (runtimeLoading) return runtimeLoading;
  runtimeLoading = new Promise<JmolApi>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = jsmolAssetUrls().script;
    script.async = true;
    const fail = () => {
      script.remove();
      reject(new ApplicationError('The local JSmol runtime could not load. Reload the workspace to retry.'));
    };
    const timer = window.setTimeout(fail, 30_000);
    script.onerror = () => { window.clearTimeout(timer); fail(); };
    script.onload = () => {
      window.clearTimeout(timer);
      if (window.Jmol) resolve(window.Jmol); else fail();
    };
    document.head.append(script);
  }).catch(error => { runtimeLoading = null; throw error; });
  return runtimeLoading;
}

function message(error: unknown): string {
  // JSmol installs Java-compatible Error constructors. Read message structurally
  // so native/cross-realm errors still produce actionable feedback.
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string' && error.message) return error.message;
  if (error && typeof error === 'object' && 'getMessage' in error && typeof error.getMessage === 'function') {
    const detail: unknown = error.getMessage();
    if (typeof detail === 'string' && detail) return detail;
  }
  return 'JSmol could not load this CIF.';
}

export class CrystalViewerRuntime {
  private disposed = false;
  private jmol: JmolApi | null = null;
  private applet: unknown = null;
  private commandToken = 1_000_000;
  private cellParametersVisible = false;
  private pickingMode: PickingMode = 'off';
  private picked: number[] = [];
  private interactionEpoch = 0;
  private pickingBusy = false;
  private representation: CrystalRepresentation = 'atoms';
  private rotationTimer: number | null = null;
  private lastRotation = '';
  private readonly boundary: NonNullable<Window['CifJSmolBoundary']>;
  private readonly pageLeaving = () => this.dispose();
  private cancelInitialization: (() => void) | null = null;
  private initializationPending = false;
  private resizeObserver: ResizeObserver | null = null;
  private resizeFrame: number | null = null;
  private refitTimer: number | null = null;
  private modelReady = false;
  private viewportObstruction: ViewportObstruction = {};
  private observedWidth = 0;
  private observedHeight = 0;
  private callbacks = new Map<number, { resolve: () => void; reject: (error: Error) => void; timeout: number }>();
  private scheduler: LatestOnlyScheduler<ViewerRequest, ViewerResult>;

  constructor(
    private readonly host: HTMLElement,
    private readonly fetchSource: (entryId: number) => Promise<CifViewerSource>,
    private readonly events: ViewerEvents
  ) {
    this.boundary = window.CifJSmolBoundary = {
      pick: (_applet, _info, index) => { void this.pickAtom(Number(index)); },
      complete: (token) => {
        const callback = this.callbacks.get(Number(token));
        if (!callback) return;
        window.clearTimeout(callback.timeout);
        this.callbacks.delete(Number(token));
        callback.resolve();
      }
    };
    this.scheduler = new LatestOnlyScheduler(
      (request, token) => this.load(request, token),
      {
        onRequested: (request) => events.requested(request.value.expectedFileName),
        onStarted: (request) => events.loading(request.value.expectedFileName),
        onAccepted: (result) => { if (!this.disposed) events.ready(result); },
        onError: (error, request) => { if (!this.disposed) events.error(request.value.expectedFileName, message(error)); }
      }
    );
  }

  async initialize(onRuntimeReady: () => void): Promise<void> {
    this.jmol = await loadLocalJSmol();
    if (this.disposed) return;
    window.addEventListener('pagehide', this.pageLeaving);
    window.addEventListener('beforeunload', this.pageLeaving);
    this.jmol._tracker = null;
    this.jmol._serverUrl = '';
    const { j2s } = jsmolAssetUrls();
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => { this.cancelInitialization = null; reject(new ApplicationError('The local JSmol runtime did not initialize.')); }, 90_000);
      this.cancelInitialization = () => { window.clearTimeout(timeout); resolve(); };
      const info = {
        width: '100%',
        height: '100%',
        use: 'HTML5',
        color: '#071018',
        j2sPath: j2s,
        serverURL: '',
        disableJ2SLoadMonitor: true,
        disableInitialConsole: true,
        addSelectionOptions: false,
        script: 'set platformSpeed 8;set antialiasDisplay true;set autobond false;set disablePopupMenu true;unbind "LEFT+double+click";',
        pickCallback: 'CifJSmolBoundary.pick',
        readyFunction: () => {
          this.initializationPending = false;
          window.clearTimeout(timeout);
          this.cancelInitialization = null;
          if (this.disposed) { if (this.applet) releaseApplet(this.applet as OwnedApplet, this.jmol!); resolve(); return; }
          this.observeHostSize();
          this.rotationTimer = window.setInterval(() => {
            if (!this.modelReady || this.disposed) return;
            const info = this.jmol?.getPropertyAsArray(this.applet, 'orientationInfo') as { rotationMatrix?: number[][] };
            const matrix = info?.rotationMatrix;
            if (!Array.isArray(matrix) || matrix.length !== 3 || !matrix.every(row => Array.isArray(row) && row.length === 3 && row.every(Number.isFinite))) return;
            const serialized = JSON.stringify(matrix);
            if (serialized !== this.lastRotation) { this.lastRotation = serialized; this.events.rotation?.(matrix); }
          }, 50);
          onRuntimeReady();
          resolve();
        }
      };
      const appletId = `cifCrystalViewer${++appletSequence}`;
      const html = this.jmol!.getAppletHtml(appletId, info);
      this.applet = this.jmol!._applets[appletId];
      if (!this.applet) {
        window.clearTimeout(timeout);
        this.cancelInitialization = null;
        reject(new ApplicationError('JSmol did not create its local HTML5 applet.'));
        return;
      }
      // getAppletHtml uses an inline image onerror handler to start a deferred
      // applet. Keep script-src strict by removing it and making the same call
      // here from this trusted module after the generated markup is attached.
      this.initializationPending = true;
      this.host.innerHTML = html.replace(/\s+onerror=(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
      (this.applet as DeferredJmolApplet)._cover(false);
    });
  }

  private observeHostSize(): void {
    this.observedWidth = Math.round(this.host.clientWidth);
    this.observedHeight = Math.round(this.host.clientHeight);
    this.resizeObserver = new ResizeObserver(() => {
      const width = Math.round(this.host.clientWidth);
      const height = Math.round(this.host.clientHeight);
      if (width <= 0 || height <= 0 || (width === this.observedWidth && height === this.observedHeight)) return;
      this.observedWidth = width;
      this.observedHeight = height;
      if (this.resizeFrame !== null) window.cancelAnimationFrame(this.resizeFrame);
      this.resizeFrame = window.requestAnimationFrame(() => {
        this.resizeFrame = null;
        if (this.jmol && this.applet) this.jmol.repaint(this.applet, true);
      });
      this.scheduleProjectedRefit();
    });
    this.resizeObserver.observe(this.host);
  }

  request(request: ViewerRequest): number {
    this.modelReady = false;
    this.representation = request.representation;
    this.setPickingMode('off');
    return this.scheduler.request(request);
  }

  private async load(request: ViewerRequest, token: number): Promise<ViewerResult> {
    if (this.disposed || !this.jmol || !this.applet) throw new ApplicationError('JSmol is not ready.');
    const source = await this.fetchSource(request.entryId);
    if (this.disposed) throw new ApplicationError('Viewer disposed.');
    if (!this.scheduler.isLatest(token)) return { fileName: source.fileName, status: this.blankStatus() };
    await this.runScript(buildCrystalLoadScript(source.text, token, request.supercellSize), token);
    const status = extractStructuralStatus((name, parameter) =>
      this.jmol!.getPropertyAsArray(this.applet, name, parameter));
    if (!status.loaded) throw new ApplicationError(status.warning ?? 'JSmol did not parse any atoms from this CIF.');
    await this.runScript(initialAppearanceScript(
      token,
      request.representation,
      request.unitCellVisible,
      request.labelsVisible,
      CRYSTAL_OVERVIEW_ZOOM,
      this.cellParametersVisible
    ), token);
    this.command(polyhedraPickingScript(false));
    const fit = this.projectedFit();
    await this.runScript(projectedViewScript(fit, token), token);
    this.modelReady = true;
    return { fileName: source.fileName, status };
  }

  private blankStatus(): StructuralStatus {
    return { loaded: false, runtimeVersion: null, atomCount: null, unitCell: null, spaceGroup: null, warning: null };
  }

  private runScript(script: string, token: number): Promise<void> {
    if (this.disposed) return Promise.reject(new ApplicationError('Viewer disposed.'));
    const uniqueToken = ++completionSequence;
    // The bundled Java compatibility layer replaces String.replaceAll with
    // regex semantics. split/join preserves this literal callback token.
    script = script.split(`CifJSmolBoundary.complete(${token})`).join(`CifJSmolBoundary.complete(${uniqueToken})`);
    token = uniqueToken;
    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        this.callbacks.delete(token);
        reject(new ApplicationError('JSmol did not complete the load within 90 seconds.'));
      }, 90_000);
      this.callbacks.set(token, { resolve, reject, timeout });
      try {
        this.jmol!.script(this.applet, script);
      } catch (error) {
        window.clearTimeout(timeout);
        this.callbacks.delete(token);
        reject(error instanceof Error ? error : new ApplicationError(String(error)));
      }
    });
  }

  setRepresentation(value: CrystalRepresentation): void { this.representation = value; this.setPickingMode('off'); this.command(representationScript(value)); }
  setUnitCell(visible: boolean): void { this.command(unitCellScript(visible)); }
  setLabels(visible: boolean): void { this.command(labelsScript(visible)); }
  setCellParametersVisible(visible: boolean): void {
    this.cellParametersVisible = visible;
    this.command(cellParametersScript(visible));
  }
  clearMeasurements(): void { this.setPickingMode('off'); this.command(clearMeasurementsScript()); }
  setPolyhedraPicking(enabled: boolean): void {
    this.setPickingMode(enabled ? 'polyhedra' : 'off');
  }
  setPickingMode(mode: PickingMode): void {
    this.interactionEpoch++;
    this.picked = [];
    this.pickingMode = mode;
    this.command(polyhedraPickingScript(mode !== 'off'));
    this.events.picking?.(mode, mode === 'distance' ? 'Click two distinct atoms (0/2). Distance in Å.' : mode === 'angle' ? 'Click three ordered atoms (0/3); the second is the vertex. Angle in degrees.' : mode === 'polyhedra' ? 'Click an atom for its coordination polyhedron (15–125% of summed bonding radii).' : 'Picking off. Drag to rotate; scroll to zoom.');
  }

  private atomPoints(indices: number[]): Point[] {
    return indices.map(index => {
      const atoms = this.jmol!.getPropertyAsArray(this.applet, 'atomInfo', `{atomIndex=${index}}`) as {x:number;y:number;z:number}[];
      const atom = atoms?.[0];
      if (!atom || ![atom.x, atom.y, atom.z].every(Number.isFinite)) throw new ApplicationError('Atom coordinates unavailable; select the structure again.');
      return [atom.x, atom.y, atom.z];
    });
  }

  private async pickAtom(index: number): Promise<void> {
    if (!this.modelReady || this.disposed || this.pickingMode === 'off' || this.pickingBusy || !Number.isInteger(index) || index < 0) return;
    const mode = this.pickingMode;
    const epoch = this.interactionEpoch;
    try {
      if (mode === 'polyhedra') {
        this.pickingBusy = true;
        await this.showPolyhedron(index, epoch);
        return;
      }
      if (this.picked.includes(index)) throw new ApplicationError('Choose a different atom; repeated atom selections are not a measurement.');
      this.picked.push(index);
      const required = mode === 'distance' ? 2 : 3;
      if (this.picked.length < required) {
        this.events.picking?.(mode, `Selected ${this.picked.length}/${required} atoms. ${mode === 'angle' ? 'Second atom is the vertex.' : 'Choose the next atom.'}`);
        return;
      }
      const value = measurementValue(this.atomPoints(this.picked));
      // An explicit format defines/updates the measurement instead of toggling
      // an existing one off when the user repeats the same ordered picks.
      this.command(`set measurements angstroms;measure ${this.picked.map(atom => `({atomIndex=${atom}})`).join(' ')} "%VALUE %UNITS";color measures white`);
      this.picked = [];
      this.events.picking?.(mode, `${mode === 'distance' ? 'Distance' : 'Angle'}: ${value.toFixed(4)} ${mode === 'distance' ? 'Å' : '°'}. Click ${required} atoms for another measurement (0/${required}).`);
    } catch (error) {
      this.picked = [];
      if (epoch === this.interactionEpoch) this.events.picking?.(mode, message(error));
    } finally { this.pickingBusy = false; }
  }

  private async showPolyhedron(index: number, epoch: number): Promise<void> {
    const token = this.commandToken++;
    const center = `{atomIndex=${index}}`;
    // Temporary bonds are never rendered; restore the ordinary representation
    // after using JSmol's existing 15–125% bonding-radius neighbor definition.
    try {
      await this.runScript(`set refreshing false;connect DELETE;connect 15% 125% ${center} {*} CREATE;javascript "window.CifJSmolBoundary.complete(${token})";`, token);
      if (epoch !== this.interactionEpoch || this.disposed) return;
      const bonds = this.jmol!.getPropertyAsArray(this.applet, 'bondInfo', center) as {atom1:{atomIndex:number};atom2:{atomIndex:number}}[];
      const neighbors = bonds.map(bond => bond.atom1.atomIndex === index ? bond.atom2.atomIndex : bond.atom1.atomIndex);
      const valid = supportsPolyhedron(this.atomPoints(neighbors));
      if (!valid) {
        this.events.picking?.('polyhedra', `No supported polyhedron: ${neighbors.length} neighbors; at least three non-collinear neighbors are required (maximum 249). The previous polyhedron is retained. Boundary atoms may need a larger unit-cell block.`);
        return;
      }
      const completeToken = this.commandToken++;
      await this.runScript(`polyhedra {*} DELETE;polyhedra BONDS ${center} TO {*} COLLAPSED EDGES;select ${center};color polyhedra translucent 0.45 [x66B5D8];select none;javascript "window.CifJSmolBoundary.complete(${completeToken})";`, completeToken);
      if (epoch !== this.interactionEpoch) return;
      const shape = this.jmol!.getPropertyAsArray(this.applet, 'shapeInfo') as { Polyhedra?: unknown[] };
      const formed = Object.entries(shape ?? {}).some(([key, value]) => /polyhedra/i.test(key) && Array.isArray(value) && value.length > 0);
      this.events.picking?.('polyhedra', formed ? `Coordination polyhedron: ${neighbors.length} neighbors at 15–125% of summed bonding radii.` : `JSmol could not form a supported polyhedron from ${neighbors.length} neighbors. No connection artifacts retained.`);
    } finally {
      this.command(`${representationScript(this.representation)};select none;set refreshing true;refresh`);
    }
  }
  clearPolyhedra(representation: CrystalRepresentation): void {
    this.setPickingMode('off');
    this.command(clearPolyhedraScript(representation));
  }
  setViewportObstruction(obstruction: ViewportObstruction): void {
    const next = {
      top: Math.max(0, Math.round(obstruction.top ?? 0)),
      right: Math.max(0, Math.round(obstruction.right ?? 0)),
      bottom: Math.max(0, Math.round(obstruction.bottom ?? 0)),
      left: Math.max(0, Math.round(obstruction.left ?? 0))
    };
    if (
      next.top === (this.viewportObstruction.top ?? 0) &&
      next.right === (this.viewportObstruction.right ?? 0) &&
      next.bottom === (this.viewportObstruction.bottom ?? 0) &&
      next.left === (this.viewportObstruction.left ?? 0)
    ) return;
    this.viewportObstruction = next;
    this.scheduleProjectedRefit();
  }
  fitReset(): void { void this.refitView((token) => fitResetScript(CRYSTAL_OVERVIEW_ZOOM, token)); }
  viewAxis(axis: CrystalAxis): void {
    void this.refitView((token) => axisViewScript(axis, CRYSTAL_OVERVIEW_ZOOM, token));
  }

  private projectedFit() {
    if (!this.jmol || !this.applet) {
      return { zoom: CRYSTAL_OVERVIEW_ZOOM, translateXPercent: 0, translateYPercent: 0 };
    }
    const atoms = this.jmol.getPropertyAsArray(this.applet, 'atomInfo', '(visible)');
    const orientation = this.jmol.getPropertyAsArray(this.applet, 'orientationInfo');
    return projectedViewFit(
      atoms,
      orientation,
      this.host.clientWidth,
      this.host.clientHeight,
      this.viewportObstruction
    );
  }

  private scheduleProjectedRefit(): void {
    if (this.refitTimer !== null) window.clearTimeout(this.refitTimer);
    this.refitTimer = window.setTimeout(() => {
      this.refitTimer = null;
      if (this.modelReady) this.command(projectedViewScript(this.projectedFit()));
    }, 180);
  }

  private async refitView(orient: (token: number) => string): Promise<void> {
    if (!this.jmol || !this.applet) return;
    const token = this.commandToken++;
    try {
      await this.runScript(orient(token), token);
      this.command(projectedViewScript(this.projectedFit()));
    } catch {
      // A newer structure selection or disposal can safely supersede this view command.
    }
  }

  private command(script: string): void {
    if (!this.disposed && this.jmol && this.applet) this.jmol.script(this.applet, script);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelInitialization?.();
    this.cancelInitialization = null;
    window.removeEventListener?.('pagehide', this.pageLeaving);
    window.removeEventListener?.('beforeunload', this.pageLeaving);
    if (this.rotationTimer !== null) window.clearInterval(this.rotationTimer);
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    if (this.resizeFrame !== null) window.cancelAnimationFrame(this.resizeFrame);
    this.resizeFrame = null;
    if (this.refitTimer !== null) window.clearTimeout(this.refitTimer);
    this.refitTimer = null;
    for (const callback of this.callbacks.values()) {
      window.clearTimeout(callback.timeout);
      callback.reject(new ApplicationError('Viewer disposed.'));
    }
    this.callbacks.clear();
    if (window.CifJSmolBoundary === this.boundary) delete window.CifJSmolBoundary;
    // The native ready callback still resolves its applet through this registry.
    // If initialization is in flight, readyFunction owns the eventual release.
    if (this.applet && this.jmol && !this.initializationPending) releaseApplet(this.applet as OwnedApplet, this.jmol);
    this.host.replaceChildren();
  }
}
