import { beforeEach, describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';

type Handler = (event: unknown, ...args: unknown[]) => unknown;
const doubles = vi.hoisted(() => ({
  handlers: new Map<string, Handler>(), windowOptions: vi.fn(),
  readFile: vi.fn(), stat: vi.fn(), writeFile: vi.fn(),
  save: vi.fn(), open: vi.fn(), confirm: vi.fn(), error: vi.fn(), worker: vi.fn(),
  db: { readStoredCif: vi.fn(), relinkSource: vi.fn(), backupProfile: vi.fn(), restoreProfile: vi.fn(), initDb: vi.fn(), getCifExportSource: vi.fn(), getCifViewerSourceRecord: vi.fn(),
    searchEntriesPage: vi.fn(), getImportFolder: vi.fn(), setImportFolder: vi.fn(), clearAllEntries: vi.fn() }
}));
vi.mock('electron', () => ({
  app: { whenReady: () => ({ then: (ready: () => void) => ready() }), on: vi.fn(), quit: vi.fn(),
    getPath: (name: string) => join(process.cwd(), 'test-profile', name), getVersion: () => 'test' },
  BrowserWindow: class {
    constructor(options: unknown) { doubles.windowOptions(options); }
    static fromWebContents() { return null; }
    static getAllWindows() { return []; }
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

const event = { sender: { isDestroyed: () => false, send: vi.fn() } };
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
  await import('./index');
});

describe('main-process IPC contracts', () => {
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
