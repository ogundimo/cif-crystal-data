import { appendFileSync } from 'node:fs';
import { threadId } from 'node:worker_threads';

// Deliberately accept no arbitrary payload: traces must not contain source paths,
// CIF contents, search terms, publication metadata, or exception messages.
export function traceEvent(event: string, elapsedMs?: number): void {
  const destination = process.env.CIF_TRACE_FILE;
  if (!destination) return;
  try {
    appendFileSync(destination, JSON.stringify({
      event, pid: process.pid, threadId, time: Date.now(),
      processMs: Math.round(process.uptime() * 1000),
      ...(elapsedMs === undefined ? {} : { elapsedMs })
    }) + '\n');
  } catch { /* Diagnostics must never break application operations. */ }
}

export async function traceOperation<T>(event: string, operation: () => T | Promise<T>): Promise<T> {
  const start = performance.now();
  traceEvent(`${event}.start`);
  try {
    const result = await operation();
    traceEvent(`${event}.complete`, performance.now() - start);
    return result;
  } catch (error) {
    traceEvent(`${event}.error`, performance.now() - start);
    throw error;
  }
}
