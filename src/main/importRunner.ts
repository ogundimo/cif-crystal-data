/// <reference types="electron-vite/node" />
import createImportWorker from './importWorker?nodeWorker';
import type { ImportProgress, ImportResult } from '../shared/types';
import type { ImportWorkerData, ImportWorkerMessage } from './importWorkerProtocol';
import { traceEvent } from './runtimeTrace';

export class ImportWorkerError extends Error {
  constructor(message: string, readonly phase: 'database' | 'import') {
    super(message);
    this.name = 'ImportWorkerError';
  }
}

export function runImportWorker(
  rootDir: string, userDataPath: string,
  onProgress?: (progress: ImportProgress) => void,
  signal?: AbortSignal
): Promise<ImportResult> {
  const cancellation = new SharedArrayBuffer(4);
  const flag = new Int32Array(cancellation);
  const cancel = () => Atomics.store(flag, 0, 1);
  if (signal?.aborted) cancel();
  const workerData: ImportWorkerData = { rootDir, userDataPath, cancellation };
  const worker = createImportWorker({ workerData });
  traceEvent('worker.started');
  return new Promise((resolve, reject) => {
    let result: ImportResult | undefined;
    let failure: Error | undefined;
    signal?.addEventListener('abort', cancel, { once: true });
    const onMessage = (message: ImportWorkerMessage) => {
      if (failure) return;
      if (message.type === 'progress') {
        try { onProgress?.(message.progress); }
        catch (error) { failure = error instanceof Error ? error : new Error(String(error)); cancel(); }
      } else if (message.type === 'result') result = message.result;
      else failure = new ImportWorkerError(message.error, message.phase);
    };
    const onError = (error: Error) => { failure = error; };
    const onExit = (code: number) => {
      signal?.removeEventListener('abort', cancel);
      worker.removeListener('message', onMessage);
      worker.removeListener('error', onError);
      worker.removeListener('exit', onExit);
      traceEvent(failure || code !== 0 ? 'worker.error' : 'worker.exited');
      // Release mutation locks only after the worker closes its database and exits.
      if (failure) reject(failure);
      else if (code !== 0) reject(new Error(`Import worker exited with code ${code}`));
      else if (!result) reject(new Error('Import worker exited without returning a result'));
      else resolve(result);
    };
    worker.on('message', onMessage);
    worker.once('error', onError);
    worker.once('exit', onExit);
  });
}
