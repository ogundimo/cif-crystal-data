import type { ImportProgress, ImportResult } from '../shared/types';

export interface ImportWorkerData {
  rootDir: string;
  userDataPath: string;
}

export type ImportWorkerMessage =
  | { type: 'progress'; progress: ImportProgress }
  | { type: 'result'; result: ImportResult }
  | { type: 'error'; phase: 'database' | 'import'; error: string };
