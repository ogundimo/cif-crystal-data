/// <reference types="electron-vite/node" />

import createImportWorker from './importWorker?nodeWorker';
import type { ImportProgress, ImportResult } from '../shared/types';
import type { ImportWorkerData, ImportWorkerMessage } from './importWorkerProtocol';

export class ImportWorkerError extends Error {
  constructor(
    message: string,
    readonly phase: 'database' | 'import'
  ) {
    super(message);
    this.name = 'ImportWorkerError';
  }
}

export function runImportWorker(
  rootDir: string,
  userDataPath: string,
  onProgress?: (progress: ImportProgress) => void
): Promise<ImportResult> {
  const workerData: ImportWorkerData = { rootDir, userDataPath };
  const worker = createImportWorker({ workerData });

  return new Promise((resolve, reject) => {
    let settled = false;

    worker.on('message', (message: ImportWorkerMessage) => {
      if (settled) return;
      if (message.type === 'progress') {
        try {
          onProgress?.(message.progress);
        } catch (error) {
          settled = true;
          void worker.terminate();
          reject(error);
        }
        return;
      }
      settled = true;
      if (message.type === 'result') resolve(message.result);
      else reject(new ImportWorkerError(message.error, message.phase));
    });
    worker.once('error', (error) => {
      settled = true;
      reject(error);
    });
    worker.once('exit', (code) => {
      if (!settled && code !== 0) reject(new Error(`Import worker exited with code ${code}`));
      else if (!settled) reject(new Error('Import worker exited without returning a result'));
    });
  });
}
