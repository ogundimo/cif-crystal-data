import type { CifViewerSource } from '../../../shared/types';
import { LatestOnlyScheduler } from './latestOnlyScheduler';
import {
  axisViewScript,
  buildCrystalLoadScript,
  cellParametersScript,
  CRYSTAL_OVERVIEW_ZOOM,
  fitResetScript,
  initialAppearanceScript,
  labelsScript,
  projectedStructureZoom,
  representationScript,
  unitCellScript,
  zoomScript,
  type CrystalAxis,
  type CrystalRepresentation
} from './scripts';
import { extractStructuralStatus, type StructuralStatus } from './status';

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

declare global {
  interface Window {
    Jmol?: JmolApi;
    CifJSmolBoundary?: { complete: (token: number) => void };
  }
}

export interface ViewerRequest {
  entryId: number;
  expectedFileName: string;
  representation: CrystalRepresentation;
  unitCellVisible: boolean;
  labelsVisible: boolean;
}

export interface ViewerResult {
  fileName: string;
  status: StructuralStatus;
}

export interface ViewerEvents {
  requested: (fileName: string) => void;
  loading: (fileName: string) => void;
  ready: (result: ViewerResult) => void;
  error: (fileName: string, message: string) => void;
}

export function jsmolAssetUrls(base = document.baseURI): { script: string; j2s: string } {
  return {
    script: new URL('vendor/jsmol/JSmol.min.js', base).href,
    j2s: new URL('vendor/jsmol/j2s', base).href.replace(/\/$/, '')
  };
}

export function loadLocalJSmol(): Promise<JmolApi> {
  if (window.Jmol) return Promise.resolve(window.Jmol);
  return Promise.reject(new Error('The packaged JSmol runtime was not loaded before the application started.'));
}

function message(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'JSmol could not load this CIF.';
}

export class CrystalViewerRuntime {
  private jmol: JmolApi | null = null;
  private applet: unknown = null;
  private commandToken = 1_000_000;
  private cellParametersVisible = false;
  private resizeObserver: ResizeObserver | null = null;
  private resizeFrame: number | null = null;
  private observedWidth = 0;
  private observedHeight = 0;
  private callbacks = new Map<number, { resolve: () => void; reject: (error: Error) => void; timeout: number }>();
  private scheduler: LatestOnlyScheduler<ViewerRequest, ViewerResult>;

  constructor(
    private readonly host: HTMLElement,
    private readonly fetchSource: (entryId: number) => Promise<CifViewerSource>,
    events: ViewerEvents
  ) {
    window.CifJSmolBoundary = {
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
        onAccepted: (result) => events.ready(result),
        onError: (error, request) => events.error(request.value.expectedFileName, message(error))
      }
    );
  }

  async initialize(onRuntimeReady: () => void): Promise<void> {
    this.jmol = await loadLocalJSmol();
    this.jmol._tracker = null;
    this.jmol._serverUrl = '';
    const { j2s } = jsmolAssetUrls();
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error('The local JSmol runtime did not initialize.')), 90_000);
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
        script: 'set platformSpeed 8;set antialiasDisplay true;set autobond false;',
        readyFunction: () => {
          window.clearTimeout(timeout);
          this.observeHostSize();
          onRuntimeReady();
          resolve();
        }
      };
      const appletId = `cifCrystalViewer${++appletSequence}`;
      const html = this.jmol!.getAppletHtml(appletId, info);
      this.applet = this.jmol!._applets[appletId];
      if (!this.applet) {
        window.clearTimeout(timeout);
        reject(new Error('JSmol did not create its local HTML5 applet.'));
        return;
      }
      // getAppletHtml uses an inline image onerror handler to start a deferred
      // applet. Keep script-src strict by removing it and making the same call
      // here from this trusted module after the generated markup is attached.
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
    });
    this.resizeObserver.observe(this.host);
  }

  request(request: ViewerRequest): number {
    return this.scheduler.request(request);
  }

  private async load(request: ViewerRequest, token: number): Promise<ViewerResult> {
    if (!this.jmol || !this.applet) throw new Error('JSmol is not ready.');
    const source = await this.fetchSource(request.entryId);
    if (!this.scheduler.isLatest(token)) return { fileName: source.fileName, status: this.blankStatus() };
    await this.runScript(buildCrystalLoadScript(source.text, token), token);
    const status = extractStructuralStatus((name, parameter) =>
      this.jmol!.getPropertyAsArray(this.applet, name, parameter));
    if (!status.loaded) throw new Error(status.warning ?? 'JSmol did not parse any atoms from this CIF.');
    await this.runScript(initialAppearanceScript(
      token,
      request.representation,
      request.unitCellVisible,
      request.labelsVisible,
      CRYSTAL_OVERVIEW_ZOOM,
      this.cellParametersVisible
    ), token);
    const fitZoom = this.projectedFitZoom();
    await this.runScript(zoomScript(fitZoom, token), token);
    return { fileName: source.fileName, status };
  }

  private blankStatus(): StructuralStatus {
    return { loaded: false, runtimeVersion: null, atomCount: null, unitCell: null, spaceGroup: null, warning: null };
  }

  private runScript(script: string, token: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        this.callbacks.delete(token);
        reject(new Error('JSmol did not complete the load within 90 seconds.'));
      }, 90_000);
      this.callbacks.set(token, { resolve, reject, timeout });
      try {
        this.jmol!.script(this.applet, script);
      } catch (error) {
        window.clearTimeout(timeout);
        this.callbacks.delete(token);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  setRepresentation(value: CrystalRepresentation): void { this.command(representationScript(value)); }
  setUnitCell(visible: boolean): void { this.command(unitCellScript(visible)); }
  setLabels(visible: boolean): void { this.command(labelsScript(visible)); }
  setCellParametersVisible(visible: boolean): void {
    this.cellParametersVisible = visible;
    this.command(cellParametersScript(visible));
  }
  fitReset(): void { void this.refitView((token) => fitResetScript(CRYSTAL_OVERVIEW_ZOOM, token)); }
  viewAxis(axis: CrystalAxis): void {
    void this.refitView((token) => axisViewScript(axis, CRYSTAL_OVERVIEW_ZOOM, token));
  }

  private projectedFitZoom(): number {
    if (!this.jmol || !this.applet) return CRYSTAL_OVERVIEW_ZOOM;
    const atoms = this.jmol.getPropertyAsArray(this.applet, 'atomInfo', '(visible)');
    const orientation = this.jmol.getPropertyAsArray(this.applet, 'orientationInfo');
    return projectedStructureZoom(
      atoms,
      orientation,
      this.host.clientWidth,
      this.host.clientHeight
    );
  }

  private async refitView(orient: (token: number) => string): Promise<void> {
    if (!this.jmol || !this.applet) return;
    const token = this.commandToken++;
    try {
      await this.runScript(orient(token), token);
      const zoom = this.projectedFitZoom();
      this.command(zoomScript(zoom));
    } catch {
      // A newer structure selection or disposal can safely supersede this view command.
    }
  }

  private command(script: string): void {
    if (this.jmol && this.applet) this.jmol.script(this.applet, script);
  }

  dispose(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    if (this.resizeFrame !== null) window.cancelAnimationFrame(this.resizeFrame);
    this.resizeFrame = null;
    for (const callback of this.callbacks.values()) {
      window.clearTimeout(callback.timeout);
      callback.reject(new Error('Viewer disposed.'));
    }
    this.callbacks.clear();
    if (window.CifJSmolBoundary) delete window.CifJSmolBoundary;
    this.host.replaceChildren();
  }
}
