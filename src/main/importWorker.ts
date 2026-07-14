import { parentPort, workerData } from 'node:worker_threads';
import { initDb } from './db';
import { importCifFolder } from './ingest';
import type { ImportWorkerData, ImportWorkerMessage } from './importWorkerProtocol';

const port = parentPort;
if (!port) throw new Error('Import worker must run in a worker thread');

const data = workerData as ImportWorkerData;
let database: ReturnType<typeof initDb> | null = null;

try {
  database = initDb(data.userDataPath);
  const message: ImportWorkerMessage = { ok: true, result: importCifFolder(data.rootDir) };
  port.postMessage(message);
} catch (error) {
  const message: ImportWorkerMessage = {
    ok: false,
    error: error instanceof Error ? error.message : String(error)
  };
  port.postMessage(message);
} finally {
  database?.close();
}
