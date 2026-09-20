// Capture before JSmol installs its Java-compatible global Error constructor.
// Every module that raises errors after JSmol has loaded must use this one.
export const ApplicationError = globalThis.Error;

export interface JmolApi {
  _tracker?: unknown;
  _serverUrl?: string;
  _applets: Record<string, unknown>;
  getAppletHtml: (id: string, info: Record<string, unknown>) => string;
  script: (applet: unknown, script: string) => void;
  getPropertyAsArray: (applet: unknown, name: string, parameter?: string) => unknown;
  repaint: (applet: unknown, resize: boolean) => void;
}

declare global {
  interface Window {
    Jmol?: JmolApi;
  }
}

export function jsmolAssetUrls(base = document.baseURI): { script: string; j2s: string } {
  return {
    script: new URL('vendor/jsmol/JSmol.min.js', base).href,
    j2s: new URL('vendor/jsmol/j2s', base).href.replace(/\/$/, '')
  };
}

/**
 * The vendored JSmol distribution is a single global script, so every viewer in the
 * window shares one load. Concurrent callers share the in-flight promise; a failed
 * load clears it so a later viewer can retry rather than inheriting the failure.
 */
let runtimeLoading: Promise<JmolApi> | null = null;

export function loadLocalJSmol(): Promise<JmolApi> {
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
