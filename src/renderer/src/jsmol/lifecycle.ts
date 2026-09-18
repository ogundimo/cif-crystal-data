interface AppletPanel {
  viewer?: unknown;
  destroy?: () => void;
  paint?: () => void;
  update?: () => void;
  setScreenDimension?: () => void;
  setDisplay?: () => void;
}
export interface OwnedApplet {
  _id: string;
  _appletPanel?: AppletPanel;
  _canvas?: HTMLCanvasElement;
  _resize?: () => void;
  _is2D?: boolean;
}

/** JSmol queues both a resize timeout and an untracked animation-frame paint.
 * Its destroy nulls GenericApplet.viewer, but leaves the panel callable. A small
 * inert panel lets already-queued callbacks drain without touching that viewer.
 * Do not use Jmol._destroy here: its global _clearVars prevents later applets.
 */
export function releaseApplet(applet: OwnedApplet, api: {
  _applets: Record<string, unknown>;
  _unsetMouse?: (canvas: HTMLCanvasElement) => void;
}): void {
  applet._resize = () => {};
  applet._is2D = false;
  const timerKey = `__resizeTimeout_${applet._id}`;
  const timers = api as unknown as Record<string, unknown>;
  if (typeof timers[timerKey] === 'number') window.clearTimeout(timers[timerKey] as number);
  delete timers[timerKey];
  if (applet._canvas) api._unsetMouse?.(applet._canvas);
  const panel = applet._appletPanel;
  const noop = () => {};
  applet._appletPanel = { destroy: noop, paint: noop, update: noop, setScreenDimension: noop, setDisplay: noop };
  if (panel?.viewer !== null) panel?.destroy?.();
  for (const [key, value] of Object.entries(api._applets)) if (value === applet) delete api._applets[key];
  const globals = window as unknown as Record<string, unknown>;
  if (globals[applet._id] === applet) delete globals[applet._id];
}
