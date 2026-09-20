import { ApplicationError, jsmolAssetUrls, type JmolApi } from './runtimeLoader';
import { releaseApplet, type OwnedApplet } from './lifecycle';

interface DeferredJmolApplet {
  _cover: (doCover: boolean) => void;
}

let appletSequence = 0;

export interface AppletSessionConfig {
  jmol: JmolApi;
  /** The element the generated applet markup is written into and cleared from. */
  host: HTMLElement;
  /** Global callback name JSmol invokes when the user picks an atom. */
  pickCallback: string;
  /** Fires once JSmol reports the applet ready, unless the session was cancelled first. */
  onReady: () => void;
  timeoutMs?: number;
}

/**
 * Owns one JSmol applet: its creation, its readiness handshake, and its release.
 *
 * The readiness handshake has three outcomes, and disposal can arrive during any
 * of them:
 *  - ready first: `onReady` fires and `start()` resolves.
 *  - `cancel()` first: `start()` resolves without `onReady`, and JSmol's own ready
 *    callback still fires later and owns the release. `pending` reports that window.
 *  - neither within the timeout: `start()` rejects.
 */
export class AppletSession {
  private applet: unknown = null;
  private starting = false;
  private cancelled = false;
  private resolveStart: (() => void) | null = null;
  private released = false;

  constructor(private readonly config: AppletSessionConfig) {}

  /** The raw JSmol applet handle, or null before a successful `start()`. */
  get handle(): unknown {
    return this.applet;
  }

  /**
   * True while JSmol's ready callback is still in flight. During that window the
   * callback, not the caller, owns releasing the applet.
   */
  get pending(): boolean {
    return this.starting;
  }

  start(): Promise<void> {
    const { jmol, host, pickCallback, onReady, timeoutMs = 90_000 } = this.config;
    const { j2s } = jsmolAssetUrls();
    return new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        this.resolveStart = null;
        reject(new ApplicationError('The local JSmol runtime did not initialize.'));
      }, timeoutMs);
      this.resolveStart = () => { window.clearTimeout(timeout); resolve(); };
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
        pickCallback,
        readyFunction: () => {
          this.starting = false;
          window.clearTimeout(timeout);
          this.resolveStart = null;
          if (this.cancelled) { this.release(); resolve(); return; }
          onReady();
          resolve();
        }
      };
      const appletId = `cifCrystalViewer${++appletSequence}`;
      const html = jmol.getAppletHtml(appletId, info);
      this.applet = jmol._applets[appletId];
      if (!this.applet) {
        window.clearTimeout(timeout);
        this.resolveStart = null;
        reject(new ApplicationError('JSmol did not create its local HTML5 applet.'));
        return;
      }
      // getAppletHtml uses an inline image onerror handler to start a deferred
      // applet. Keep script-src strict by removing it and making the same call
      // here from this trusted module after the generated markup is attached.
      this.starting = true;
      host.innerHTML = html.replace(/\s+onerror=(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
      (this.applet as DeferredJmolApplet)._cover(false);
    });
  }

  /** Settle a pending `start()` without treating the applet as ready. */
  cancel(): void {
    this.cancelled = true;
    this.resolveStart?.();
    this.resolveStart = null;
  }

  private release(): void {
    if (this.released || !this.applet) return;
    this.released = true;
    releaseApplet(this.applet as OwnedApplet, this.config.jmol);
  }

  /**
   * Tear the session down. The applet is released here only when JSmol's ready
   * callback is not still in flight; during that window the callback owns it.
   */
  dispose(): void {
    this.cancel();
    if (!this.starting) this.release();
    this.config.host.replaceChildren();
  }
}
