import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { spawn, type ChildProcess } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { access, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { basename, dirname, extname, join } from 'node:path';
import { parseExperimentalPxrd } from '../renderer/src/experimentalPxrd';
import { validateRefinementSettings, type ExperimentalPattern, type RefinementResult } from '../shared/refinement';
import type { RefinementSource } from './refinementSource';
import { refinementPythonPath } from './refinementRuntime';

const sources = new Map<string, { data: ExperimentalPattern; path: string; mtime: number; size: number }>();
const jobs = new Map<number, { process: ChildProcess; cancel: () => void }>();
const checkpoints = new Map<string, { path: string; experimentalId: string }>();
const outputFolders = new Map<number, string>();

export function getExperimental(id: unknown): ExperimentalPattern {
  if (typeof id !== 'string' || !sources.has(id)) throw new Error('Please import the experimental file again.');
  return sources.get(id)!.data;
}

function enginePaths() {
  const runtime = app.isPackaged ? join(process.resourcesPath, 'rietx-runtime') : join(app.getAppPath(), '.tools', 'rietx-runtime');
  const script = app.isPackaged ? join(process.resourcesPath, 'engine', 'refinement.py') : join(app.getAppPath(), 'engine', 'refinement.py');
  return { python: refinementPythonPath(runtime), script };
}

export function registerRefinementHandlers(getCif: (entryId: number) => Promise<RefinementSource>): void {
  ipcMain.handle('cif:importExperimental', async event => {
    const parent = BrowserWindow.fromWebContents(event.sender);
    const options = { title: 'Import experimental PXRD', filters: [{ name: 'Two-column diffraction data', extensions: ['xy', 'txt', 'csv', 'dat'] }], properties: ['openFile'] as ['openFile'] };
    const selected = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options);
    if (selected.canceled || !selected.filePaths[0]) return null;
    const path = selected.filePaths[0];
    const info = await stat(path);
    if (!info.isFile() || info.size > 10_000_000) throw new Error('Choose a data file smaller than 10 MB.');
    const points = parseExperimentalPxrd(await readFile(path, 'utf8'));
    if (points.length > 200_000) throw new Error('Choose a pattern with at most 200,000 points.');
    const data = { id: randomUUID(), fileName: basename(path), folder: dirname(path), points };
    sources.set(data.id, { data, path, mtime: info.mtimeMs, size: info.size });
    return data;
  });
  ipcMain.handle('cif:importRefinementCheckpoint', async event => {
    const parent = BrowserWindow.fromWebContents(event.sender);
    const options = { title: 'Open rietx checkpoint', filters: [{ name: 'rietx checkpoint JSON', extensions: ['json'] }], properties: ['openFile'] as ['openFile'] };
    const selected = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options);
    if (selected.canceled || !selected.filePaths[0]) return null;
    const path = selected.filePaths[0]; const info = await stat(path);
    if (!info.isFile() || info.size > 60_000_000) throw new Error('Checkpoint must be smaller than 60 MB.');
    const saved = JSON.parse(await readFile(path, 'utf8'));
    if (saved.format !== 'cif-rietx-checkpoint-1' || !saved.state || typeof saved.cifText !== 'string') throw new Error('Not an app rietx checkpoint.');
    const settings = validateRefinementSettings(saved.settings);
    if (!Array.isArray(saved.points) || saved.points.length < 30 || saved.points.length > 200000 || saved.points.some((p: number[], i: number) => !Array.isArray(p) || p.length !== 2 || !p.every(Number.isFinite) || (i > 0 && p[0] <= saved.points[i-1][0]))) throw new Error('Checkpoint contains invalid experimental data.');
    const experimental: ExperimentalPattern = { id: randomUUID(), fileName: basename(String(saved.sourceName)), folder: dirname(path), points: saved.points.map((p: number[]) => ({ twoTheta: p[0], intensity: p[1] })) };
    sources.set(experimental.id, { data: experimental, path, mtime: info.mtimeMs, size: info.size });
    const id = randomUUID(); checkpoints.set(id, { path, experimentalId: experimental.id });
    return { id, settings, experimental, status: String(saved.status) };
  });
  ipcMain.handle('cif:getExperimental', (_event, id: unknown) => getExperimental(id));
  ipcMain.handle('cif:refinementEngineStatus', async () => {
    try { const paths = enginePaths(); await access(paths.python); await access(paths.script); return { available: true }; }
    catch { return { available: false, message: 'rietx runtime is missing. Run npm run setup:refinement before building the app.' }; }
  });
  ipcMain.handle('cif:cancelRefinement', event => { jobs.get(event.sender.id)?.cancel(); });
  ipcMain.handle('cif:openRefinementOutput', async event => {
    const folder = outputFolders.get(event.sender.id);
    if (folder) { const error = await shell.openPath(folder); if (error) throw new Error(error); }
  });
  ipcMain.handle('cif:runRefinement', async (event, input: unknown): Promise<RefinementResult> => {
    const owner = event.sender;
    if (jobs.has(owner.id)) throw new Error('A refinement is already running in this window.');
    const raw = input as { experimentalId?: unknown; entryId?: unknown; settings?: unknown; checkpointId?: unknown };
    if (!raw || typeof raw.experimentalId !== 'string' || !Number.isInteger(raw.entryId) || Number(raw.entryId) < 1) throw new Error('Select a CIF and experimental pattern.');
    const settings = validateRefinementSettings(raw.settings);
    const checkpoint = typeof raw.checkpointId === 'string' ? checkpoints.get(raw.checkpointId) : undefined;
    if (raw.checkpointId !== undefined && (!checkpoint || checkpoint.experimentalId !== raw.experimentalId)) throw new Error('Import the checkpoint for this experimental pattern again.');
    const request = { experimentalId: raw.experimentalId, settings };
    const cifSource = checkpoint ? { text: '', warnings: [] } : await getCif(Number(raw.entryId));
    getExperimental(request.experimentalId);
    const source = sources.get(request.experimentalId)!;
    const paths = enginePaths();
    await access(paths.python).catch(() => { throw new Error('rietx runtime is missing. Run npm run setup:refinement.'); });
    const current = await stat(source.path);
    if (current.mtimeMs !== source.mtime || current.size !== source.size) throw new Error('The experimental file changed. Import it again before fitting.');
    const points = source.data.points.filter(p => p.twoTheta >= settings.range[0] && p.twoTheta <= settings.range[1]);
    if (points.length < 30 || points.some((p, index) => index > 0 && p.twoTheta <= points[index - 1].twoTheta)) throw new Error('The fit needs at least 30 points with distinct angles.');
    if (jobs.has(owner.id) || owner.isDestroyed()) throw new Error('The refinement window is busy or closed.');
    const prefix = `${basename(source.data.fileName, extname(source.data.fileName)).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80)}_${settings.method}_${new Date().toISOString().replace(/[:.]/g, '-')}_${randomUUID().slice(0, 8)}`;
    const base = join(dirname(source.path), prefix);
    const requestPath = `${base}.request.json`;
    const outputFolder = dirname(source.path);
    // Lock before the first write to prevent concurrent double-click requests.
    let cancelled = false;
    let child: ChildProcess | undefined;
    let forceCancel: ReturnType<typeof setTimeout> | undefined;
    const job = { process: undefined as unknown as ChildProcess, cancel: () => { cancelled = true; if (child?.stdin?.writable && !child.stdin.destroyed) child.stdin.write('cancel\n'); if (!forceCancel) forceCancel = setTimeout(() => child?.kill(), 15000); } };
    jobs.set(owner.id, job);
    const cancelOnClose = () => job.cancel();
    owner.once('destroyed', cancelOnClose);
    outputFolders.set(owner.id, outputFolder);
    try {
      await writeFile(requestPath, JSON.stringify({ settings, cifText: cifSource.text, sourceWarnings: cifSource.warnings, resumePath: checkpoint?.path, sourceName: source.data.fileName, outputBase: base, points: source.data.points.map(p => [p.twoTheta, p.intensity]) }), { encoding: 'utf8', flag: 'wx' });
      if (cancelled) throw new Error('Refinement cancelled.');
      const log = createWriteStream(`${base}.log`, { flags: 'wx' });
      let tail = '';
      let partial = '';
      await new Promise<void>((resolve, reject) => {
        child = spawn(paths.python, ['-s', '-u', paths.script, requestPath], {
          cwd: outputFolder, windowsHide: true, shell: false,
          env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1', NUMBA_CACHE_DIR: join(outputFolder, '.rietx-cache'), PYTHONIOENCODING: 'utf-8', PYTHONNOUSERSITE: '1', OPENBLAS_NUM_THREADS: '1', OMP_NUM_THREADS: '1' }
        });
        job.process = child;
        child.stdin?.on('error', () => { /* Process may exit while a stop request is sent. */ });
        const timer = setTimeout(() => job.cancel(), 30 * 60_000);
        log.on('error', error => { child?.kill(); reject(error); });
        const capture = (data: Buffer) => {
          const text = data.toString('utf8'); log.write(text); tail = (tail + text).slice(-6000);
        };
        child.stdout?.on('data', (data: Buffer) => {
          partial += data.toString('utf8');
          const lines = partial.split('\n'); partial = lines.pop() ?? '';
          for (const line of lines) {
            if (line.startsWith('CIF_PROGRESS ')) {
              try {
                const progress = JSON.parse(line.slice(13));
                // Keep diagnostics, not thousands of transient plot coordinates.
                capture(Buffer.from(`CIF_PROGRESS ${JSON.stringify({ message: progress.message })}\n`));
                if (!owner.isDestroyed()) owner.send('cif:refinementProgress', progress);
              } catch { capture(Buffer.from(line + '\n')); }
            } else capture(Buffer.from(line + '\n'));
          }
        });
        child.stderr?.on('data', capture);
        child.once('error', error => { clearTimeout(timer); log.end(); reject(error); });
        child.once('close', code => {
          if (partial) capture(Buffer.from(partial));
          clearTimeout(timer); log.end();
          if (forceCancel) clearTimeout(forceCancel);
          if (code !== 0) reject(new Error(`rietx refinement failed. ${tail.slice(-1800)}\nLog: ${base}.log`));
          else resolve();
        });
      });
      const result = JSON.parse(await readFile(`${base}.result.json`, 'utf8')) as RefinementResult;
      if (!Array.isArray(result.profile)) throw new Error('rietx returned an invalid result; inspect the log.');
      const checkpointId = randomUUID();
      checkpoints.set(checkpointId, { path: `${base}.checkpoint.json`, experimentalId: request.experimentalId });
      return { ...result, checkpointId, outputFolder, files: (await readdir(outputFolder)).filter(name => name.startsWith(`${prefix}.`)).sort() };
    } finally {
      if (forceCancel) clearTimeout(forceCancel);
      jobs.delete(owner.id);
      if (!owner.isDestroyed()) owner.removeListener('destroyed', cancelOnClose);
    }
  });
  app.on('before-quit', () => { for (const job of jobs.values()) job.cancel(); });
}
