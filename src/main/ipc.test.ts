import { beforeEach, describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';

type Handler = (event: unknown, ...args: unknown[]) => unknown;
const doubles = vi.hoisted(() => ({
  handlers: new Map<string, Handler>(), windowOptions: vi.fn(),
  readFile: vi.fn(), stat: vi.fn(), writeFile: vi.fn(),
  save: vi.fn(), open: vi.fn(), confirm: vi.fn(), error: vi.fn(), worker: vi.fn(),
  db: { countBatchExport: vi.fn(), runBatchExport: vi.fn(), getStartupRefresh: vi.fn(), setStartupRefresh: vi.fn(), getDataAuthors: vi.fn(), readStoredCif: vi.fn(), relinkSource: vi.fn(), backupProfile: vi.fn(), restoreProfile: vi.fn(), initDb: vi.fn(), getCifExportSource: vi.fn(), getCifViewerSourceRecord: vi.fn(),
    inspectSourceRecovery: vi.fn(), previewSourceRecovery: vi.fn(), prepareSourceRemoval: vi.fn(), confirmSourceRecovery: vi.fn(),
    searchEntriesPage: vi.fn(), getImportFolder: vi.fn(), setImportFolder: vi.fn(), clearAllEntries: vi.fn() }
}));
vi.mock('electron', () => ({
  app: { whenReady: () => ({ then: (ready: () => void) => ready() }), on: vi.fn(), quit: vi.fn(),
    getPath: (name: string) => join(process.cwd(), 'test-profile', name), getVersion: () => 'test' },
  BrowserWindow: class {
    constructor(options: unknown) { doubles.windowOptions(options); }
    static fromWebContents() { return null; }
    static getAllWindows() { return []; }
    once() {}
    webContents = { once: vi.fn() };
    loadURL() {}
    loadFile() {}
  },
  ipcMain: { handle: (name: string, handler: Handler) => doubles.handlers.set(name, handler) },
  dialog: { showSaveDialog: doubles.save, showOpenDialog: doubles.open,
    showMessageBox: doubles.confirm, showErrorBox: doubles.error },
  shell: { openExternal: vi.fn() }
}));
vi.mock('node:fs/promises', () => ({ readFile: doubles.readFile, stat: doubles.stat, writeFile: doubles.writeFile }));
vi.mock('./db', () => doubles.db);
vi.mock('./importRunner', () => ({
  runImportWorker: doubles.worker,
  ImportWorkerError: class extends Error { phase = 'import'; }
}));

const event = { sender: { once: vi.fn(), removeListener: vi.fn(), isDestroyed: () => false, send: vi.fn() } };
const sourcePath = join(process.cwd(), 'input', 'combined.cif');
const destination = join(process.cwd(), 'export', 'selected.cif');
const first = "data_first\n_chemical_formula_sum 'Na Cl'\n";
const second = "data_second\n_chemical_formula_sum 'Fe O'\n";
const source = { formula: 'Fe1O1', sg_number: 1, source_path: sourcePath, data_block_index: 1 };
const filter = { slot1: [], slot2: [], mode: 'AND' };
async function invoke(channel: string, ...args: unknown[]) {
  const handler = doubles.handlers.get(channel);
  if (!handler) throw new Error(`Handler not registered: ${channel}`);
  return handler(event, ...args);
}

beforeEach(async () => {
  vi.resetAllMocks();
  vi.resetModules();
  doubles.handlers.clear();
  doubles.stat.mockResolvedValue({ isFile: () => true, isDirectory: () => true });
  doubles.readFile.mockResolvedValue(first + second);
  doubles.db.readStoredCif.mockReturnValue(second);
  doubles.save.mockResolvedValue({ canceled: false, filePath: destination });
  doubles.db.getCifExportSource.mockReturnValue(source);
  doubles.db.getCifViewerSourceRecord.mockReturnValue({ ...source, source_filename: 'combined.cif#2-second' });
  doubles.db.getImportFolder.mockReturnValue(join(process.cwd(), 'input'));
  doubles.db.searchEntriesPage.mockReturnValue({ rows: [], total: 0 });
  doubles.db.clearAllEntries.mockReturnValue(3);
  doubles.db.countBatchExport.mockReturnValue(2);
  await import('./index');
});

describe('main-process IPC contracts', () => {
  it('validates recovery input, handles picker cancellation and dispatches explicit confirmations', async () => {
    for (const request of [null, {}, { entryId: -1, action: 'inspect' }, { entryId: 1, action: 'unknown' },
      { entryId: 1, action: 'confirm', token: 4, choice: 0 }, { entryId: 1, action: 'confirm', token: 'x', choice: -1 }]) {
      await expect(invoke('cif:sourceRecovery', request)).rejects.toThrow('Invalid recovery');
    }
    doubles.open.mockResolvedValue({ canceled: true, filePaths: [] });
    await expect(invoke('cif:sourceRecovery', { entryId: 1, action: 'choose-cif' })).resolves.toMatchObject({ cancelled: true });
    expect(doubles.db.previewSourceRecovery).not.toHaveBeenCalled();
    doubles.open.mockResolvedValue({ canceled: false, filePaths: [sourcePath] });
    await invoke('cif:sourceRecovery', { entryId: 1, action: 'choose-backup' });
    expect(doubles.db.previewSourceRecovery).toHaveBeenCalledWith(1, sourcePath, true);
    await invoke('cif:sourceRecovery', { entryId: 1, action: 'inspect' });
    expect(doubles.db.inspectSourceRecovery).toHaveBeenCalledWith(1);
    await invoke('cif:sourceRecovery', { entryId: 1, action: 'prepare-remove' });
    expect(doubles.db.prepareSourceRemoval).toHaveBeenCalledWith(1);
    await invoke('cif:sourceRecovery', { entryId: 1, action: 'confirm', token: 'reviewed', choice: 0 });
    expect(doubles.db.confirmSourceRecovery).toHaveBeenCalledWith(1, 'reviewed', 0);
  });

  it('excludes other data operations while recovery holds a picker and releases after errors', async () => {
    let cancel!: (value: unknown) => void;
    doubles.open.mockImplementation(() => new Promise(resolve => { cancel = resolve; }));
    const pending = invoke('cif:sourceRecovery', { entryId: 1, action: 'choose-cif' });
    await vi.waitFor(() => expect(doubles.open).toHaveBeenCalled());
    await expect(invoke('cif:clearCifs')).rejects.toThrow('already in progress');
    await expect(invoke('cif:sourceRecovery', { entryId: 1, action: 'prepare-remove' })).rejects.toThrow('already in progress');
    cancel({ canceled: true, filePaths: [] }); await pending;
    doubles.db.inspectSourceRecovery.mockImplementationOnce(() => { throw new Error('synthetic failure'); });
    await expect(invoke('cif:sourceRecovery', { entryId: 1, action: 'inspect' })).rejects.toThrow('synthetic failure');
    await invoke('cif:sourceRecovery', { entryId: 1, action: 'inspect' });
  });

  it('validates batch scopes before opening dialogs and writes nothing after picker cancellation', async () => {
    await expect(invoke('cif:batchExport', { scope: { kind: 'selected', ids: [0] }, expectedCount: 2 })).rejects.toThrow('Invalid');
    expect(doubles.open).not.toHaveBeenCalled();
    doubles.open.mockResolvedValue({ canceled: true, filePaths: [] });
    const request = { scope: { kind: 'selected', ids: [1, 2] }, expectedCount: 2 };
    await expect(invoke('cif:batchExport', request)).resolves.toBeNull();
    expect(doubles.db.runBatchExport).not.toHaveBeenCalled();
    doubles.db.countBatchExport.mockReturnValue(3);
    await expect(invoke('cif:batchExport', request)).rejects.toThrow('count changed');
    await expect(invoke('cif:cancelBatchExport')).resolves.toBe(false);
  });

  it('excludes mutations throughout batch export, forwards cancellation, and releases the lock after failure', async () => {
    doubles.open.mockResolvedValue({ canceled: false, filePaths: [destination] });
    let reject!: (reason: Error) => void;
    let signal!: AbortSignal;
    doubles.db.runBatchExport.mockImplementation((_request, _destination, abort) => {
      signal = abort; return new Promise((_resolve, no) => { reject = no; });
    });
    const operation = invoke('cif:batchExport', { scope: { kind: 'matching', filter }, expectedCount: 2 });
    await vi.waitFor(() => expect(doubles.db.runBatchExport).toHaveBeenCalled());
    for (const channel of ['cif:importCifFolder', 'cif:refreshCifFolder', 'cif:clearCifs', 'cif:restoreProfile', 'cif:backupProfile']) {
      await expect(invoke(channel)).rejects.toThrow('already in progress');
    }
    await expect(invoke('cif:cancelBatchExport')).resolves.toBe(true);
    expect(signal.aborted).toBe(true);
    reject(new Error('write failure'));
    await expect(operation).rejects.toThrow('write failure');
    doubles.open.mockResolvedValue({ canceled: true, filePaths: [] });
    await expect(invoke('cif:importCifFolder')).resolves.toBeNull();
  });
  it('cancels relink and restore without changing the profile', async () => {
    doubles.open.mockResolvedValue({ canceled: true, filePaths: [] });
    await expect(invoke('cif:relinkSource', 1)).resolves.toBe(false);
    await expect(invoke('cif:restoreProfile')).resolves.toBe(false);
    expect(doubles.db.relinkSource).not.toHaveBeenCalled();
    expect(doubles.db.restoreProfile).not.toHaveBeenCalled();
  });

  it('requires restore confirmation and releases the operation lock on rejection', async () => {
    doubles.open.mockResolvedValue({ canceled: false, filePaths: ['backup.cifbackup'] });
    doubles.confirm.mockResolvedValueOnce({ response: 0 });
    await expect(invoke('cif:restoreProfile')).resolves.toBe(false);
    doubles.confirm.mockResolvedValue({ response: 1 });
    doubles.db.restoreProfile.mockImplementationOnce(() => { throw new Error('checksum mismatch'); });
    await expect(invoke('cif:restoreProfile')).rejects.toThrow('checksum mismatch');
    await expect(invoke('cif:restoreProfile')).resolves.toBe(true);
    expect(doubles.db.restoreProfile).toHaveBeenCalledTimes(2);
  });

  it('prevents a concurrent import while a backup dialog is pending and supports cancellation', async () => {
    let cancel!: (result: { canceled: boolean }) => void;
    doubles.save.mockImplementationOnce(() => new Promise(resolve => { cancel = resolve; }));
    const backup = invoke('cif:backupProfile');
    await expect(invoke('cif:importCifFolder')).rejects.toThrow('already in progress');
    cancel({ canceled: true });
    await expect(backup).resolves.toBe(false);
    expect(doubles.db.backupProfile).not.toHaveBeenCalled();
    doubles.open.mockResolvedValue({ canceled: true, filePaths: [] });
    await expect(invoke('cif:importCifFolder')).resolves.toBeNull();
  });

  it('passes only bounded layout preferences into the backup', async () => {
    await expect(invoke('cif:backupProfile', { unrelated: 'value' })).rejects.toThrow('Invalid layout');
    const layout = { 'cif-layout-v1:columns': '{}' };
    await expect(invoke('cif:backupProfile', layout)).resolves.toBe(true);
    expect(doubles.db.backupProfile).toHaveBeenCalledWith(destination, undefined, layout);
  });

  it('creates an isolated renderer with a preload boundary', () => {
    expect(doubles.windowOptions).toHaveBeenCalledWith(expect.objectContaining({
      webPreferences: expect.objectContaining({ contextIsolation: true, nodeIntegration: false,
        preload: expect.stringMatching(/index\.cjs$/) })
    }));
  });

  it('exports only the selected block and returns the destination filename', async () => {
    await expect(invoke('cif:exportCif', 2)).resolves.toEqual({ exported: true, fileName: 'selected.cif' });
    expect(doubles.writeFile).toHaveBeenCalledExactlyOnceWith(destination, second, { encoding: 'utf8', flag: 'wx' });
    expect(doubles.save).toHaveBeenCalledWith(expect.objectContaining({ defaultPath: expect.stringMatching(/Fe1O1_1\.cif$/) }));
  });

  it('provides the same selected block to the viewer', async () => {
    await expect(invoke('cif:getViewerSource', 2)).resolves.toEqual({ fileName: 'combined.cif#2-second', text: second });
  });

  it('does not write when export is canceled or would overwrite the imported source', async () => {
    doubles.save.mockResolvedValueOnce({ canceled: true });
    await expect(invoke('cif:exportCif', 2)).resolves.toEqual({ exported: false });
    doubles.save.mockResolvedValueOnce({ canceled: false, filePath: sourcePath });
    await expect(invoke('cif:exportCif', 2)).rejects.toThrow('source file is not overwritten');
    expect(doubles.writeFile).not.toHaveBeenCalled();
  });

  it('reports a stored block integrity error before opening an export dialog', async () => {
    doubles.db.readStoredCif.mockImplementationOnce(() => { throw new Error('Stored CIF block integrity check failed'); });
    await expect(invoke('cif:exportCif', 2)).rejects.toThrow('integrity check failed');
    expect(doubles.writeFile).not.toHaveBeenCalled();
  });

  it('rejects missing source records and unverified legacy sources before opening an export dialog', async () => {
    doubles.db.getCifExportSource.mockReturnValueOnce(null);
    await expect(invoke('cif:exportCif', 2)).rejects.toThrow('no longer in the database');
    doubles.db.readStoredCif.mockImplementationOnce(() => { throw new Error('Reimport the original CIF folder'); });
    await expect(invoke('cif:exportCif', 2)).rejects.toThrow('Reimport');
    expect(doubles.save).not.toHaveBeenCalled();
    expect(doubles.writeFile).not.toHaveBeenCalled();
  });

  it('propagates disk write failures instead of reporting success', async () => {
    doubles.writeFile.mockRejectedValueOnce(new Error('disk full'));
    await expect(invoke('cif:exportCif', 2)).rejects.toThrow('disk full');
  });

  it('validates PXRD payloads and writes the supplied profile unchanged', async () => {
    for (const invalid of ['', null, 'x'.repeat(10_000_001)]) {
      await expect(invoke('cif:exportPxrd', 2, invalid)).rejects.toThrow('Invalid PXRD export contents');
    }
    expect(doubles.save).not.toHaveBeenCalled();
    const xy = '2theta\tintensity\n22.2000\t100.000000\n';
    await expect(invoke('cif:exportPxrd', 2, xy)).resolves.toMatchObject({ exported: true });
    expect(doubles.writeFile).toHaveBeenCalledExactlyOnceWith(destination, xy, { encoding: 'utf8', flag: 'wx' });
  });

  it.each(['cif:exportCif', 'cif:exportPxrd', 'cif:getViewerSource', 'cif:getDiffractionInput'])('rejects invalid entry ids for %s', async channel => {
    for (const id of [0, -1, 1.5, '1', NaN]) await expect(invoke(channel, id)).rejects.toThrow('Invalid entry id');
    expect(doubles.db.initDb).not.toHaveBeenCalled();
    expect(doubles.writeFile).not.toHaveBeenCalled();
  });

  it.each([
    [{ offset: -1 }, 'offset'], [{ limit: 0 }, 'limit'], [{ limit: 1001 }, 'limit'],
    [{ sortColumn: 'id; DROP TABLE entries' }, 'sort column'], [{ sortDirection: 'sideways' }, 'sort direction']
  ])('rejects malformed pagination before querying SQLite: %j', async (fields, message) => {
    await expect(invoke('cif:searchPage', { filter, offset: 0, limit: 20, ...fields })).rejects.toThrow(`Invalid search ${message}`);
    expect(doubles.db.searchEntriesPage).not.toHaveBeenCalled();
  });

  it('passes a valid filtered page request to the database', async () => {
    const request = { filter, offset: 20, limit: 20, sortColumn: 'formula', sortDirection: 'desc' };
    await expect(invoke('cif:searchPage', request)).resolves.toEqual({ rows: [], total: 0 });
    expect(doubles.db.searchEntriesPage).toHaveBeenCalledExactlyOnceWith(request);
  });

  it('retries initialization after a database error', async () => {
    doubles.db.initDb.mockImplementationOnce(() => { throw new Error('database is locked'); });
    const request = { filter, offset: 0, limit: 20 };
    await expect(invoke('cif:searchPage', request)).rejects.toThrow();
    await expect(invoke('cif:searchPage', request)).resolves.toEqual({ rows: [], total: 0 });
    expect(doubles.db.initDb).toHaveBeenCalledTimes(2);
    expect(doubles.error).toHaveBeenCalledTimes(1);
  });

  it('blocks concurrent mutations and releases the lock after worker failure', async () => {
    let rejectWorker!: (error: Error) => void;
    doubles.worker.mockReturnValueOnce(new Promise((_resolve, reject) => { rejectWorker = reject; }));
    const refresh = invoke('cif:refreshCifFolder');
    const rejectedRefresh = expect(refresh).rejects.toThrow('worker failed');
    await vi.waitFor(() => expect(doubles.worker).toHaveBeenCalledTimes(1));
    await expect(invoke('cif:clearCifs')).rejects.toThrow('operation is already in progress');
    expect(doubles.confirm).not.toHaveBeenCalled();
    rejectWorker(new Error('worker failed'));
    await rejectedRefresh;
    doubles.confirm.mockResolvedValueOnce({ response: 1 });
    await expect(invoke('cif:clearCifs')).resolves.toEqual({ cleared: true, deletedCount: 3 });
  });

  it('preserves data on canceled clear and permits the next confirmed clear', async () => {
    doubles.confirm.mockResolvedValueOnce({ response: 0 });
    await expect(invoke('cif:clearCifs')).resolves.toEqual({ cleared: false, deletedCount: 0 });
    expect(doubles.db.clearAllEntries).not.toHaveBeenCalled();
    doubles.confirm.mockResolvedValueOnce({ response: 1 });
    await expect(invoke('cif:clearCifs')).resolves.toEqual({ cleared: true, deletedCount: 3 });
  });
});

it('validates startup preference and author role requests at the IPC boundary', async () => {
  await expect(invoke('cif:setStartupRefresh', 'true')).rejects.toThrow('Invalid startup');
  await invoke('cif:setStartupRefresh', true);
  expect(doubles.db.setStartupRefresh).toHaveBeenCalledWith(true);
  await expect(invoke('cif:getDataAuthors', -1)).rejects.toThrow('Invalid entry');
  doubles.db.getDataAuthors.mockReturnValue([{ name: 'Depositor' }]);
  await expect(invoke('cif:getDataAuthors', 1)).resolves.toEqual([{ name: 'Depositor' }]);
});

it('keeps mutations excluded during cancellation and permits a new import after worker settlement', async () => {
  doubles.open.mockResolvedValue({ canceled: false, filePaths: ['synthetic-input'] });
  let finish!: (value: unknown) => void;
  doubles.worker.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const pending = invoke('cif:importCifFolder');
  await vi.waitFor(() => expect(doubles.worker).toHaveBeenCalledOnce());
  await expect(invoke('cif:cancelImport')).resolves.toBe(true);
  expect(doubles.worker.mock.calls[0][3].aborted).toBe(true);
  await expect(invoke('cif:clearCifs')).rejects.toThrow('already in progress');
  finish({ importedCount: 1, skippedCount: 0, failures: [], total: 2, cancelled: true });
  await pending;
  await expect(invoke('cif:cancelImport')).resolves.toBe(false);
  doubles.worker.mockResolvedValueOnce({ importedCount: 1, skippedCount: 1, failures: [], total: 2 });
  await expect(invoke('cif:importCifFolder')).resolves.toMatchObject({ importedCount: 1, skippedCount: 1 });
});
