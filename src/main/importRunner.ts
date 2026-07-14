/// <reference types="electron-vite/node" />

import createImportWorker from './importWorker?nodeWorker';
import type { ImportResult } from '../shared/types';
import type { ImportWorkerData, ImportWorkerMessage } from './importWorkerProtocol';

export function runImportWorker(rootDir: string, userDataPath: string): Promise<ImportResult> {
  const workerData: ImportWorkerData = { rootDir, userDataPath };
  const worker = createImportWorker({ workerData });

  return new Promise((resolve, reject) => {
    let settled = false;

    worker.once('message', (message: ImportWorkerMessage) => {
      settled = true;
      if (message.ok) resolve(message.result);
      else reject(new Error(message.error));
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
