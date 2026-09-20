import { ApplicationError, type JmolApi } from './runtimeLoader';

declare global {
  interface Window {
    CifJSmolBoundary?: { complete: (token: number) => void; pick: (_applet: unknown, _info: unknown, index: number) => void };
  }
}

/**
 * Completion tokens are unique per dispatched script rather than per caller, so a
 * superseded script whose callback arrives late cannot settle a newer script.
 */
let completionSequence = 0;

interface PendingCommand {
  resolve: () => void;
  reject: (error: Error) => void;
  timeout: number;
}

/**
 * The window-global boundary JSmol scripts call back into, plus the completion
 * protocol built on it.
 *
 * JSmol's `script` call is fire-and-forget, so scripts that must be awaited embed
 * a `CifJSmolBoundary.complete(<token>)` javascript callback. This bridge owns the
 * boundary object, rewrites those tokens to globally unique ones at dispatch, and
 * resolves the matching promise when the callback arrives.
 *
 * The runtime and the applet are read through accessors on every dispatch: the
 * bridge is constructed with the viewer, but the applet only exists once the
 * session's readiness handshake completes, and it is discarded on teardown.
 */
export class CommandBridge {
  private disposed = false;
  private commandToken = 1_000_000;
  private readonly pending = new Map<number, PendingCommand>();
  private readonly boundary: NonNullable<Window['CifJSmolBoundary']>;

  constructor(
    onPick: (index: number) => void,
    private readonly getJmol: () => JmolApi | null,
    private readonly getApplet: () => unknown
  ) {
    this.boundary = window.CifJSmolBoundary = {
      pick: (_applet, _info, index) => { onPick(Number(index)); },
      complete: (token) => {
        const callback = this.pending.get(Number(token));
        if (!callback) return;
        window.clearTimeout(callback.timeout);
        this.pending.delete(Number(token));
        callback.resolve();
      }
    };
  }

  /** Allocate a token for a caller that embeds its own completion callback. */
  nextToken(): number {
    return this.commandToken++;
  }

  /** Dispatch a script and resolve once its completion callback arrives. */
  run(script: string, token: number, timeoutMs = 90_000): Promise<void> {
    if (this.disposed) return Promise.reject(new ApplicationError('Viewer disposed.'));
    const uniqueToken = ++completionSequence;
    // The bundled Java compatibility layer replaces String.replaceAll with
    // regex semantics. split/join preserves this literal callback token.
    script = script.split(`CifJSmolBoundary.complete(${token})`).join(`CifJSmolBoundary.complete(${uniqueToken})`);
    token = uniqueToken;
    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        this.pending.delete(token);
        reject(new ApplicationError('JSmol did not complete the load within 90 seconds.'));
      }, timeoutMs);
      this.pending.set(token, { resolve, reject, timeout });
      try {
        this.getJmol()!.script(this.getApplet(), script);
      } catch (error) {
        window.clearTimeout(timeout);
        this.pending.delete(token);
        reject(error instanceof Error ? error : new ApplicationError(String(error)));
      }
    });
  }

  /** Dispatch a script that reports no completion and is not awaited. */
  send(script: string): void {
    const jmol = this.getJmol();
    const applet = this.getApplet();
    if (!this.disposed && jmol && applet) jmol.script(applet, script);
  }

  dispose(): void {
    this.disposed = true;
    for (const callback of this.pending.values()) {
      window.clearTimeout(callback.timeout);
      callback.reject(new ApplicationError('Viewer disposed.'));
    }
    this.pending.clear();
    if (window.CifJSmolBoundary === this.boundary) delete window.CifJSmolBoundary;
  }
}
