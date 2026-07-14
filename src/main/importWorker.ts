import { parentPort, workerData } from 'node:worker_threads';
import { initDb } from './db';
import { importCifFolder } from './ingest';
import type { ImportWorkerData, ImportWorkerMessage } from './importWorkerProtocol';

const port = parentPort;
if (!port) throw new Error('Import worker must run in a worker thread');

const data = workerData as ImportWorkerData;
let database: ReturnType<typeof initDb> | null = null;

try {
  try {
    database = initDb(data.userDataPath);
  } catch (error) {
    const message: ImportWorkerMessage = {
      type: 'error',
      phase: 'database',
      error: error instanceof Error ? error.message : String(error)
    };
    port.postMessage(message);
  }

  if (database) {
    try {
      const result = importCifFolder(data.rootDir, undefined, (progress) => {
        const progressMessage: ImportWorkerMessage = { type: 'progress', progress };
        port.postMessage(progressMessage);
      });
      const message: ImportWorkerMessage = { type: 'result', result };
      port.postMessage(message);
    } catch (error) {
      const message: ImportWorkerMessage = {
        type: 'error',
        phase: 'import',
        error: error instanceof Error ? error.message : String(error)
      };
      port.postMessage(message);
    }
  }
} finally {
  database?.close();
}
