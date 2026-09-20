import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CifApi } from '../shared/types';

type Listener = (event: unknown, ...args: unknown[]) => void;
const doubles = vi.hoisted(() => ({
  exposed: new Map<string, unknown>(),
  invoke: vi.fn(), on: vi.fn(), removeListener: vi.fn()
}));
vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: (key: string, value: unknown) => doubles.exposed.set(key, value) },
  ipcRenderer: { invoke: doubles.invoke, on: doubles.on, removeListener: doubles.removeListener }
}));

// Every bridge method paired with the channel and argument list it must forward.
// Each entry is the contract for one renderer-to-main call; a renamed channel or a
// dropped argument fails here rather than silently doing nothing at runtime.
const passthroughs: Array<{ method: keyof CifApi; channel: string; args: unknown[] }> = [
  { method: 'sourceRecovery', channel: 'cif:sourceRecovery', args: [{ entryId: 7, action: 'inspect' }] },
  { method: 'countBatchExport', channel: 'cif:countBatchExport', args: [{ kind: 'all' }] },
  { method: 'batchExport', channel: 'cif:batchExport', args: [{ scope: { kind: 'all' }, expectedCount: 3 }] },
  { method: 'cancelBatchExport', channel: 'cif:cancelBatchExport', args: [] },
  { method: 'traceMilestone', channel: 'cif:traceMilestone', args: ['controls-ready'] },
  { method: 'cancelImport', channel: 'cif:cancelImport', args: [] },
  { method: 'getStartupRefresh', channel: 'cif:getStartupRefresh', args: [] },
  { method: 'setStartupRefresh', channel: 'cif:setStartupRefresh', args: [true] },
  { method: 'relinkSource', channel: 'cif:relinkSource', args: [12] },
  { method: 'backupProfile', channel: 'cif:backupProfile', args: [{ panel: 'left' }] },
  { method: 'getPreservedLayout', channel: 'cif:getPreservedLayout', args: [] },
  { method: 'restoreProfile', channel: 'cif:restoreProfile', args: [] },
  { method: 'getEntryCount', channel: 'cif:getEntryCount', args: [] },
  { method: 'getAtomSites', channel: 'cif:getAtomSites', args: [3] },
  { method: 'getDiffractionInput', channel: 'cif:getDiffractionInput', args: [4] },
  { method: 'getDataAuthors', channel: 'cif:getDataAuthors', args: [5] },
  { method: 'getPublAuthors', channel: 'cif:getPublAuthors', args: [6] },
  { method: 'getViewerSource', channel: 'cif:getViewerSource', args: [8] },
  { method: 'getImportFolder', channel: 'cif:getImportFolder', args: [] },
  { method: 'exportCif', channel: 'cif:exportCif', args: [9] },
  { method: 'exportPxrd', channel: 'cif:exportPxrd', args: [10, '2theta intensity'] },
  { method: 'resolvePublication', channel: 'cif:resolvePublication', args: [{ title: 'A study', authors: ['Ada'] }] },
  { method: 'openExternal', channel: 'cif:openExternal', args: ['https://example.org/entry'] },
  { method: 'searchPage', channel: 'cif:searchPage', args: [{ filter: { slot1: [], mode: 'AND' }, offset: 20, limit: 10 }] },
  { method: 'restraints', channel: 'cif:restraints', args: [{ slot1: ['Fe'], mode: 'OR' }] },
  { method: 'importCifFolder', channel: 'cif:importCifFolder', args: [] },
  { method: 'refreshCifFolder', channel: 'cif:refreshCifFolder', args: [] },
  { method: 'clearCifs', channel: 'cif:clearCifs', args: [] }
];

const subscriptions: Array<{ method: 'onBatchExportProgress' | 'onImportProgress'; channel: string; progress: unknown }> = [
  { method: 'onBatchExportProgress', channel: 'cif:batchExportProgress', progress: { total: 4, completed: 1, failed: 0, notAttempted: 3 } },
  { method: 'onImportProgress', channel: 'cif:importProgress', progress: { processed: 2, total: 5, importedCount: 2, skippedCount: 0, failureCount: 0 } }
];

const methodNames = [...passthroughs.map(entry => entry.method), ...subscriptions.map(entry => entry.method)];

let api: CifApi;

beforeEach(async () => {
  vi.resetAllMocks();
  vi.resetModules();
  doubles.exposed.clear();
  await import('./index');
  api = doubles.exposed.get('cifApi') as CifApi;
});

describe('preload bridge exposure', () => {
  it('exposes the api under the cifApi key exactly once', () => {
    expect([...doubles.exposed.keys()]).toEqual(['cifApi']);
    expect(api).toBeTypeOf('object');
  });

  it('exposes every declared method and nothing else', () => {
    expect(Object.keys(api).sort()).toEqual([...methodNames].sort());
    for (const name of methodNames) expect(api[name]).toBeTypeOf('function');
  });
});

describe('preload invoke passthroughs', () => {
  it.each(passthroughs)('$method forwards to $channel with its arguments', async ({ method, channel, args }) => {
    doubles.invoke.mockResolvedValue('result');
    const call = api[method] as (...rest: unknown[]) => Promise<unknown>;
    await expect(call(...args)).resolves.toBe('result');
    expect(doubles.invoke).toHaveBeenCalledTimes(1);
    expect(doubles.invoke).toHaveBeenCalledWith(channel, ...args);
  });

  it('rejects when the main process handler rejects', async () => {
    doubles.invoke.mockRejectedValue(new Error('handler failed'));
    await expect(api.getEntryCount()).rejects.toThrow('handler failed');
  });
});

describe('preload progress subscriptions', () => {
  it.each(subscriptions)('$method registers on $channel and strips the event argument', ({ method, channel, progress }) => {
    const listener = vi.fn();
    (api[method] as (fn: (value: unknown) => void) => () => void)(listener);

    expect(doubles.on).toHaveBeenCalledTimes(1);
    expect(doubles.on).toHaveBeenCalledWith(channel, expect.any(Function));
    const handler = doubles.on.mock.calls[0][1] as Listener;

    handler({ sender: 'ignored' }, progress);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(progress);
  });

  it.each(subscriptions)('$method unsubscribes the same handler it registered', ({ method, channel }) => {
    const unsubscribe = (api[method] as (fn: (value: unknown) => void) => () => void)(vi.fn());
    const handler = doubles.on.mock.calls[0][1] as Listener;

    expect(doubles.removeListener).not.toHaveBeenCalled();
    unsubscribe();
    expect(doubles.removeListener).toHaveBeenCalledTimes(1);
    expect(doubles.removeListener).toHaveBeenCalledWith(channel, handler);
  });

  it('gives each subscription its own handler so one unsubscribe leaves the other registered', () => {
    const first = vi.fn();
    const second = vi.fn();
    const unsubscribeFirst = api.onImportProgress(first);
    api.onImportProgress(second);

    const [firstHandler, secondHandler] = doubles.on.mock.calls.map(call => call[1] as Listener);
    expect(firstHandler).not.toBe(secondHandler);

    unsubscribeFirst();
    expect(doubles.removeListener).toHaveBeenCalledTimes(1);
    expect(doubles.removeListener).toHaveBeenCalledWith('cif:importProgress', firstHandler);
  });
});

describe('preload and main channel agreement', () => {
  // The bridge is only useful if main registers the channels it invokes. Reading the
  // registrations from source keeps this check free of main-process bootstrapping.
  const mainSources = ['src/main/index.ts', 'src/main/sourceRecoveryIpc.ts'];
  const registered = new Set(
    mainSources
      .flatMap(file => readFileSync(join(process.cwd(), file), 'utf8').match(/handle\('(cif:[^']+)'/g) ?? [])
      .map(match => match.slice("handle('".length, -1))
  );

  it('registers a main-process handler for every invoked channel', () => {
    expect(registered.size).toBeGreaterThan(0);
    expect([...registered].sort()).toEqual(passthroughs.map(entry => entry.channel).sort());
  });
});
