import type { DiffractionInput, EntryRow } from '../../shared/types';
import type { createPxrdProfile, PxrdResult } from './pxrd';

export interface PxrdRequest {
  entry: EntryRow;
  input: DiffractionInput;
  wavelength: number;
  fwhm: number;
}
export interface PxrdResponse {
  result: PxrdResult;
  profile: ReturnType<typeof createPxrdProfile>;
  calculationMs: number;
}

/** Each job owns its worker. Supersession terminates computation and callbacks. */
export function startPxrdTask(request: PxrdRequest, complete: (response: PxrdResponse) => void, fail: (message: string) => void): () => void {
  let active = true;
  let worker: Worker | undefined;
  const stop = () => {
    active = false;
    if (worker) {
      worker.onmessage = null; worker.onerror = null; worker.onmessageerror = null;
      worker.terminate();
    }
  };
  const error = () => { if (active) { stop(); fail('Could not calculate diffraction. Retry or select another structure.'); } };
  try {
    worker = new Worker(new URL('./pxrdWorker.ts', import.meta.url), { type:'module' });
    worker.onmessage = (event: MessageEvent<PxrdResponse | { error: string }>) => {
      if (!active) return;
      if ('error' in event.data) { error(); return; }
      stop(); complete(event.data);
    };
    worker.onerror = error;
    worker.onmessageerror = error;
    worker.postMessage(request);
  } catch { error(); }
  return stop;
}
