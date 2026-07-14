import type { ImportResult } from '../shared/types';

export interface ImportWorkerData {
  rootDir: string;
  userDataPath: string;
}

export type ImportWorkerMessage =
  | { ok: true; result: ImportResult }
  | { ok: false; error: string };
