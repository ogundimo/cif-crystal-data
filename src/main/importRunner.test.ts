import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
const fake = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('./importWorker?nodeWorker', () => ({ default: fake.create }));
import { runImportWorker } from './importRunner';
const result = { importedCount: 1, skippedCount: 0, failures: [], total: 1, cancelled: true };
beforeEach(() => { fake.create.mockReset(); });
describe('worker lifecycle cleanup', () => {
  it('cancels after a progress callback throws, waits for exit, and permits a clean retry', async () => {
    const worker = new EventEmitter(); fake.create.mockReturnValueOnce(worker);
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    const callback = vi.fn(() => { throw new Error('progress listener failed'); });
    const pending = runImportWorker('input','profile',callback,controller.signal);
    worker.emit('message',{type:'progress',progress:{}});
    expect(Atomics.load(new Int32Array(fake.create.mock.calls[0][0].workerData.cancellation),0)).toBe(1);
    worker.emit('message',{type:'result',result});
    worker.emit('message',{type:'progress',progress:{}});
    expect(callback).toHaveBeenCalledTimes(1);
    worker.emit('exit',0);
    await expect(pending).rejects.toThrow('progress listener failed');
    expect(remove).toHaveBeenCalled(); expect(worker.eventNames()).toEqual([]);
    const retry = new EventEmitter(); fake.create.mockReturnValueOnce(retry);
    const next = runImportWorker('input','profile');
    retry.emit('message',{type:'result',result}); retry.emit('exit',0);
    expect(await next).toEqual(result); expect(retry.eventNames()).toEqual([]);
  });

  it('propagates worker construction failure and permits another launch', () => {
    fake.create.mockImplementationOnce(() => { throw new Error('startup failure'); });
    expect(() => runImportWorker('input','profile')).toThrow('startup failure');
    expect(fake.create).toHaveBeenCalledTimes(1);
  });
  it('cancels through shared memory, retains result, and waits for exit before resolving', async () => {
    const worker = new EventEmitter(); fake.create.mockReturnValue(worker);
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    let settled = false;
    const pending = runImportWorker('input', 'profile', undefined, controller.signal).then(value => { settled = true; return value; });
    controller.abort();
    expect(Atomics.load(new Int32Array(fake.create.mock.calls[0][0].workerData.cancellation), 0)).toBe(1);
    worker.emit('message', { type: 'result', result }); await Promise.resolve();
    expect(settled).toBe(false);
    worker.emit('exit', 0); expect(await pending).toEqual(result);
    expect(remove).toHaveBeenCalled(); expect(worker.eventNames()).toEqual([]);
  });
  it('reports worker/database failures and missing results and cleans listeners', async () => {
    for (const mode of ['database', 'error', 'missing']) {
      const worker = new EventEmitter(); fake.create.mockReturnValue(worker);
      const pending = runImportWorker('input', 'profile');
      if (mode === 'database') worker.emit('message', { type: 'error', phase: 'database', error: 'unavailable' });
      if (mode === 'error') worker.emit('error', new Error('crashed'));
      worker.emit('exit', mode === 'error' ? 1 : 0);
      await expect(pending).rejects.toThrow(); expect(worker.eventNames()).toEqual([]);
    }
  });
});
