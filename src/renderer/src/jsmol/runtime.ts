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
import { ApplicationError, loadLocalJSmol, type JmolApi } from './runtimeLoader';
import { AppletSession } from './appletSession';
import { CommandBridge } from './commandBridge';

export type PickingMode = 'off' | 'distance' | 'angle' | 'polyhedra';

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

/**
 * The crystal viewer's behaviour: what to load, how to present it, and how picks
 * become measurements. It owns the viewer's own state and delegates the JSmol
 * machinery — loading the vendored runtime, owning one applet, and dispatching
 * scripts — to runtimeLoader, AppletSession and CommandBridge respectively.
 */
export class CrystalViewerRuntime {
  private disposed = false;
  private jmol: JmolApi | null = null;
  private session: AppletSession | null = null;
  private cellParametersVisible = false;
  private pickingMode: PickingMode = 'off';
  private picked: number[] = [];
  private interactionEpoch = 0;
  private pickingBusy = false;
  private representation: CrystalRepresentation = 'atoms';
  private rotationTimer: number | null = null;
  private lastRotation = '';
  private readonly pageLeaving = () => this.dispose();
  private resizeObserver: ResizeObserver | null = null;
  private resizeFrame: number | null = null;
  private refitTimer: number | null = null;
  private modelReady = false;
  private viewportObstruction: ViewportObstruction = {};
  private observedWidth = 0;
  private observedHeight = 0;
  private readonly bridge: CommandBridge;
  private scheduler: LatestOnlyScheduler<ViewerRequest, ViewerResult>;

  constructor(
    private readonly host: HTMLElement,
    private readonly fetchSource: (entryId: number) => Promise<CifViewerSource>,
    private readonly events: ViewerEvents
  ) {
    this.bridge = new CommandBridge(
      (index) => { void this.pickAtom(index); },
      () => this.jmol,
      () => this.applet
    );
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

  private get applet(): unknown {
    return this.session?.handle ?? null;
  }

  async initialize(onRuntimeReady: () => void): Promise<void> {
    this.jmol = await loadLocalJSmol();
    if (this.disposed) return;
    window.addEventListener('pagehide', this.pageLeaving);
    window.addEventListener('beforeunload', this.pageLeaving);
    this.jmol._tracker = null;
    this.jmol._serverUrl = '';
    this.session = new AppletSession({
      jmol: this.jmol,
      host: this.host,
      pickCallback: 'CifJSmolBoundary.pick',
      onReady: () => {
        this.observeHostSize();
        this.startRotationPolling();
        onRuntimeReady();
      }
    });
    await this.session.start();
  }

  private startRotationPolling(): void {
    this.rotationTimer = window.setInterval(() => {
      if (!this.modelReady || this.disposed) return;
      const info = this.jmol?.getPropertyAsArray(this.applet, 'orientationInfo') as { rotationMatrix?: number[][] };
      const matrix = info?.rotationMatrix;
      if (!Array.isArray(matrix) || matrix.length !== 3 || !matrix.every(row => Array.isArray(row) && row.length === 3 && row.every(Number.isFinite))) return;
      const serialized = JSON.stringify(matrix);
      if (serialized !== this.lastRotation) { this.lastRotation = serialized; this.events.rotation?.(matrix); }
    }, 50);
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
    await this.bridge.run(buildCrystalLoadScript(source.text, token, request.supercellSize), token);
    const status = extractStructuralStatus((name, parameter) =>
      this.jmol!.getPropertyAsArray(this.applet, name, parameter));
    if (!status.loaded) throw new ApplicationError(status.warning ?? 'JSmol did not parse any atoms from this CIF.');
    await this.bridge.run(initialAppearanceScript(
      token,
      request.representation,
      request.unitCellVisible,
      request.labelsVisible,
      CRYSTAL_OVERVIEW_ZOOM,
      this.cellParametersVisible
    ), token);
    this.bridge.send(polyhedraPickingScript(false));
    const fit = this.projectedFit();
    await this.bridge.run(projectedViewScript(fit, token), token);
    this.modelReady = true;
    return { fileName: source.fileName, status };
  }

  private blankStatus(): StructuralStatus {
    return { loaded: false, runtimeVersion: null, atomCount: null, unitCell: null, spaceGroup: null, warning: null };
  }

  setRepresentation(value: CrystalRepresentation): void { this.representation = value; this.setPickingMode('off'); this.bridge.send(representationScript(value)); }
  setUnitCell(visible: boolean): void { this.bridge.send(unitCellScript(visible)); }
  setLabels(visible: boolean): void { this.bridge.send(labelsScript(visible)); }
  setCellParametersVisible(visible: boolean): void {
    this.cellParametersVisible = visible;
    this.bridge.send(cellParametersScript(visible));
  }
  clearMeasurements(): void { this.setPickingMode('off'); this.bridge.send(clearMeasurementsScript()); }
  setPolyhedraPicking(enabled: boolean): void {
    this.setPickingMode(enabled ? 'polyhedra' : 'off');
  }
  setPickingMode(mode: PickingMode): void {
    this.interactionEpoch++;
    this.picked = [];
    this.pickingMode = mode;
    this.bridge.send(polyhedraPickingScript(mode !== 'off'));
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
      this.bridge.send(`set measurements angstroms;measure ${this.picked.map(atom => `({atomIndex=${atom}})`).join(' ')} "%VALUE %UNITS";color measures white`);
      this.picked = [];
      this.events.picking?.(mode, `${mode === 'distance' ? 'Distance' : 'Angle'}: ${value.toFixed(4)} ${mode === 'distance' ? 'Å' : '°'}. Click ${required} atoms for another measurement (0/${required}).`);
    } catch (error) {
      this.picked = [];
      if (epoch === this.interactionEpoch) this.events.picking?.(mode, message(error));
    } finally { this.pickingBusy = false; }
  }

  private async showPolyhedron(index: number, epoch: number): Promise<void> {
    const token = this.bridge.nextToken();
    const center = `{atomIndex=${index}}`;
    // Temporary bonds are never rendered; restore the ordinary representation
    // after using JSmol's existing 15–125% bonding-radius neighbor definition.
    try {
      await this.bridge.run(`set refreshing false;connect DELETE;connect 15% 125% ${center} {*} CREATE;javascript "window.CifJSmolBoundary.complete(${token})";`, token);
      if (epoch !== this.interactionEpoch || this.disposed) return;
      const bonds = this.jmol!.getPropertyAsArray(this.applet, 'bondInfo', center) as {atom1:{atomIndex:number};atom2:{atomIndex:number}}[];
      const neighbors = bonds.map(bond => bond.atom1.atomIndex === index ? bond.atom2.atomIndex : bond.atom1.atomIndex);
      const valid = supportsPolyhedron(this.atomPoints(neighbors));
      if (!valid) {
        this.events.picking?.('polyhedra', `No supported polyhedron: ${neighbors.length} neighbors; at least three non-collinear neighbors are required (maximum 249). The previous polyhedron is retained. Boundary atoms may need a larger unit-cell block.`);
        return;
      }
      const completeToken = this.bridge.nextToken();
      await this.bridge.run(`polyhedra {*} DELETE;polyhedra BONDS ${center} TO {*} COLLAPSED EDGES;select ${center};color polyhedra translucent 0.45 [x66B5D8];select none;javascript "window.CifJSmolBoundary.complete(${completeToken})";`, completeToken);
      if (epoch !== this.interactionEpoch) return;
      const shape = this.jmol!.getPropertyAsArray(this.applet, 'shapeInfo') as { Polyhedra?: unknown[] };
      const formed = Object.entries(shape ?? {}).some(([key, value]) => /polyhedra/i.test(key) && Array.isArray(value) && value.length > 0);
      this.events.picking?.('polyhedra', formed ? `Coordination polyhedron: ${neighbors.length} neighbors at 15–125% of summed bonding radii.` : `JSmol could not form a supported polyhedron from ${neighbors.length} neighbors. No connection artifacts retained.`);
    } finally {
      this.bridge.send(`${representationScript(this.representation)};select none;set refreshing true;refresh`);
    }
  }
  clearPolyhedra(representation: CrystalRepresentation): void {
    this.setPickingMode('off');
    this.bridge.send(clearPolyhedraScript(representation));
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
      if (this.modelReady) this.bridge.send(projectedViewScript(this.projectedFit()));
    }, 180);
  }

  private async refitView(orient: (token: number) => string): Promise<void> {
    if (!this.jmol || !this.applet) return;
    const token = this.bridge.nextToken();
    try {
      await this.bridge.run(orient(token), token);
      this.bridge.send(projectedViewScript(this.projectedFit()));
    } catch {
      // A newer structure selection or disposal can safely supersede this view command.
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    window.removeEventListener?.('pagehide', this.pageLeaving);
    window.removeEventListener?.('beforeunload', this.pageLeaving);
    if (this.rotationTimer !== null) window.clearInterval(this.rotationTimer);
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    if (this.resizeFrame !== null) window.cancelAnimationFrame(this.resizeFrame);
    this.resizeFrame = null;
    if (this.refitTimer !== null) window.clearTimeout(this.refitTimer);
    this.refitTimer = null;
    this.bridge.dispose();
    // The session clears the host markup it wrote. If initialization is still in
    // flight, JSmol's own ready callback owns the eventual applet release.
    if (this.session) this.session.dispose(); else this.host.replaceChildren();
  }
}
