import { afterEach, expect, it, vi } from 'vitest';
import { releaseApplet } from './lifecycle';

afterEach(() => vi.unstubAllGlobals());
it('cancels the native resize timeout and leaves queued repaint calls safe without destroying another applet', () => {
  const clearTimeout = vi.fn(); vi.stubGlobal('window', {clearTimeout});
  const destroy = vi.fn(); const canvas = {} as HTMLCanvasElement;
  const applet = {_id:'first',_appletPanel:{destroy},_canvas:canvas,_resize:vi.fn(),_is2D:true};
  const other = {};
  const api = {_applets:{first:applet,alias:applet,other} as Record<string,unknown>,_unsetMouse:vi.fn(),__resizeTimeout_first:42};
  releaseApplet(applet, api);
  expect(clearTimeout).toHaveBeenCalledWith(42);
  expect(destroy).toHaveBeenCalledTimes(1);
  expect(api._unsetMouse).toHaveBeenCalledWith(canvas);
  expect(api._applets).toEqual({other});
  expect(applet._is2D).toBe(false);
  expect(() => applet._resize()).not.toThrow();
  expect(() => releaseApplet(applet, api)).not.toThrow();
  expect(destroy).toHaveBeenCalledTimes(1);
});
