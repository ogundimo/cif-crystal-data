import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Stats } from 'node:fs';
const fs = vi.hoisted(() => ({ readdir: vi.fn(), lstat: vi.fn() }));
vi.mock('node:fs', async original => ({ ...await original<typeof import('node:fs')>(), readdirSync: fs.readdir, lstatSync: fs.lstat }));
import { importCifFolder } from './ingest';
const directory = { isSymbolicLink: () => false, isDirectory: () => true } as Stats;
beforeEach(() => { fs.readdir.mockReset(); fs.lstat.mockReset(); });
describe('actionable discovery failures', () => {
  it('reports permission and stat failures separately from ingestion failures', () => {
    fs.lstat.mockImplementation(path => { if (String(path).endsWith('gone.cif')) throw new Error('ENOENT: file disappeared'); return directory; });
    fs.readdir.mockImplementation(path => { if (String(path).endsWith('restricted')) throw new Error('EACCES: access denied'); return ['restricted', 'gone.cif']; });
    const writer = { writeBatch: vi.fn(() => []) };
    const result = importCifFolder('root', writer);
    expect(result.failures).toEqual([
      { phase: 'discovery', filename: expect.stringContaining('restricted'), reason: 'EACCES: access denied' },
      { phase: 'discovery', filename: expect.stringContaining('gone.cif'), reason: 'ENOENT: file disappeared' }
    ]);
    expect(writer.writeBatch).not.toHaveBeenCalled();
    expect(result).toMatchObject({ total: 0, processed: 0, discoveryComplete: true, cancelled: false });
  });
  it('reports a completed empty directory without inventing work', () => {
    fs.lstat.mockReturnValue(directory); fs.readdir.mockReturnValue([]);
    expect(importCifFolder('empty', { writeBatch: () => [] })).toEqual({
      total: 0, processed: 0, importedCount: 0, skippedCount: 0, failures: [],
      discoveryComplete: true, cancelled: false, unattempted: 0, skippedLinks: 0
    });
  });
});
