import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir, cpus, release, totalmem } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect, pause, waitFor } from './cdp.mjs';
import { compare, protocol, summarize } from './results.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const options = { samples: 3, output: null, baseline: null };
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i].replace(/^--/, ''); const value = process.argv[i + 1];
  if (!(key in options) || !value) throw new Error('Usage: benchmark:startup -- [--samples 3] [--output file.json] [--baseline file.json]');
  options[key] = key === 'samples' ? Number(value) : resolve(value);
}
assert.ok(Number.isInteger(options.samples) && options.samples >= 3 && options.samples <= 20, 'samples must be 3–20');
assert.equal(process.platform, 'win32', 'This startup protocol is Windows-specific.');
assert.ok(/^v22\./.test(process.version) && Number(process.versions.node.split('.')[1]) >= 13, 'Use Node 22.13+ on the Node 22 line.');
const baseline = options.baseline ? JSON.parse(await readFile(options.baseline, 'utf8')) : null;
if (baseline) {
  assert.equal(baseline.protocol, protocol, 'Incompatible baseline protocol');
  assert.equal(baseline.status, 'passed', 'Cannot compare against a failed/partial baseline');
  summarize(baseline.samples);
}
const work = await mkdtemp(join(tmpdir(), 'cif-startup-benchmark-'));
const output = options.output ?? join(work, 'report.json');
await mkdir(dirname(output), { recursive: true });
// Reserve the output before launching so an existing baseline cannot be overwritten.
await writeFile(output, JSON.stringify({ status: 'running', protocol }), { flag: 'wx' });
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
const hash = text => createHash('sha256').update(text).digest('hex');
const version = async name => JSON.parse(await readFile(join(root, 'node_modules', name, 'package.json'), 'utf8')).version;
const harnessFiles = ['benchmark.mjs', 'cdp.mjs', 'config.mjs', 'results.mjs'];
const report = {
  protocol, status: 'running', recordedAt: new Date().toISOString(),
  source: { commit: git('rev-parse', 'HEAD'), dirty: !!git('status', '--porcelain'), diffHash: hash(git('diff', 'HEAD')), lockfileHash: hash(await readFile(join(root, 'package-lock.json'))) },
  environment: {
    platform: process.platform, arch: process.arch, os: release(), cpu: cpus()[0]?.model,
    memoryBytes: totalmem(), node: process.version, electron: await version('electron'),
    vite: await version('vite'), electronVite: await version('electron-vite'),
    harnessHash: hash((await Promise.all(harnessFiles.map(name => readFile(new URL(name, import.meta.url), 'utf8')))).join('\n'))
  },
  conditions: { launcher: 'Node -> electron-vite dev (npm overhead excluded)', profile: 'new empty synthetic profile each sample', viteCache: 'new each sample', osCache: 'uncontrolled; not OS-cold', window: 'shown and focused; GPU enabled', tracing: 'IPC and inspector enabled; no CPU profiler', startupRefresh: false },
  samples: [], limitations: ['Run on an idle desktop with other app instances closed.', 'No populated profile, upgrade, first structure, or portable launcher coverage.', 'Timing comparisons are advisory, not a release gate.']
};

async function freePort() {
  const server = createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port; await new Promise(resolve => server.close(resolve)); return port;
}

async function sample(number) {
  const folder = join(work, String(number)); const profile = join(folder, 'profile');
  await mkdir(profile, { recursive: true });
  const trace = join(folder, 'trace.jsonl'); const mainPort = await freePort(); const rendererPort = await freePort();
  const logs = []; const started = Date.now(); let spawnError;
  const child = spawn(process.execPath, [join(root, 'node_modules/electron-vite/bin/electron-vite.js'), 'dev', '--config', join(root, 'scripts/startup/config.mjs')], {
    cwd: root, windowsHide: false, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, DEBUG: '', ELECTRON_CLI_ARGS: '[]', V8_INSPECTOR_BRK_PORT: '', ELECTRON_ENTRY: '', ELECTRON_RENDERER_URL: '',
      CIF_TEST_PROFILE: profile, CIF_TRACE_FILE: trace, CIF_BENCHMARK_CACHE: join(folder, 'vite-cache'),
      V8_INSPECTOR_PORT: String(mainPort), REMOTE_DEBUGGING_PORT: String(rendererPort), PATH: dirname(process.execPath) + ';' + process.env.PATH }
  });
  child.on('error', error => { spawnError = error; });
  for (const stream of [child.stdout, child.stderr]) stream.on('data', data => logs.push({ ms: Date.now() - started, text: String(data) }));
  let main; let renderer;
  const events = async () => {
    if (spawnError) throw spawnError;
    if (child.exitCode !== null) throw new Error(`Development process exited: ${child.exitCode}`);
    try { return (await readFile(trace, 'utf8')).trim().split('\n').flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } }); }
    catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  };
  try {
    main = await connect(mainPort);
    await waitFor(async () => (await events()).some(row => row.event === 'main.loaded'), 'main initialization before diagnostic evaluation');
    const electron = `process.getBuiltinModule('module').createRequire(process.cwd() + '/package.json')('electron')`;
    await waitFor(() => main.evaluate(`${electron}.BrowserWindow.getAllWindows().length > 0`), 'application window');
    await main.evaluate(`${electron}.BrowserWindow.getAllWindows().forEach(w => { if (w.isMinimized()) w.restore(); w.show(); w.focus(); }); true`);
    renderer = await connect(rendererPort);
    const readyEvents = await waitFor(async () => { const rows = await events(); return rows.some(row => row.event === 'cif:getStartupRefresh.complete') ? rows : null; }, 'startup IPC milestones');
    assert.ok(!readyEvents.some(row => row.event === 'worker.started'), 'empty startup must not import');
    // Windows may initially suppress/minimize a child launched by a background shell.
    // Restore once more after loading; still require actual renderer visibility/paint.
    if (!await renderer.evaluate("document.visibilityState === 'visible'")) {
      await main.evaluate(`${electron}.BrowserWindow.getAllWindows().forEach(w => { if (w.isMinimized()) w.restore(); w.show(); w.focus(); }); true`);
    }
    await waitFor(() => renderer.evaluate("document.visibilityState === 'visible' && performance.getEntriesByName('first-contentful-paint').length > 0"), 'visible contentful paint');
    const initial = await renderer.evaluate(`({ origin: performance.timeOrigin, paint: performance.getEntriesByName('first-contentful-paint')[0].startTime, resources: performance.getEntriesByType('resource').map(r => ({ bytes: r.decodedBodySize })) })`);
    const quickSearchPaintMs = await renderer.evaluate(`new Promise((resolve,reject) => {
      const timer=setTimeout(()=>reject(new Error('Quick Search did not paint')),5000); const start=performance.now();
      const button=[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Quick search'));
      if(!button || button.disabled){clearTimeout(timer);reject(new Error('Quick Search unavailable'));return;}
      button.click(); requestAnimationFrame(()=>requestAnimationFrame(()=>{
        clearTimeout(timer); const dialog=document.querySelector('.quick-search-dialog');
        dialog && dialog.getBoundingClientRect().height > 0 && document.visibilityState==='visible' ? resolve(performance.now()-start) : reject(new Error('Quick Search not visible'));
      }));
    })`);
    await renderer.evaluate(`(()=>{ const input=document.querySelector('#quick-search-space-group-number'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'1'); input.dispatchEvent(new Event('input',{bubbles:true})); })()`);
    await pause(200);
    const searchStarted = Date.now();
    await renderer.evaluate("document.querySelector('.quick-search-dialog form').requestSubmit()");
    await waitFor(() => renderer.evaluate("!document.querySelector('.quick-search-dialog') && document.body.textContent.includes('No matching results')"), 'empty search result');
    const elapsed = event => { const found = readyEvents.find(row => row.event === event); assert.ok(found, `Missing ${event}`); return found.time - started; };
    return {
      mainMs: elapsed('main.loaded'), firstContentfulPaintMs: initial.origin + initial.paint - started,
      controlsReadyMs: elapsed('renderer.controls-ready'), databaseReadyMs: elapsed('database.ready.complete'),
      quickSearchPaintMs, emptySearchMs: Date.now() - searchStarted,
      resourceCount: initial.resources.length, decodedBytes: initial.resources.reduce((sum, resource) => sum + resource.bytes, 0)
    };
  } finally {
    await writeFile(join(folder, 'process-log.json'), JSON.stringify(logs, null, 2));
    if (main) { try { await main.evaluate(`setTimeout(() => process.getBuiltinModule('module').createRequire(process.cwd() + '/package.json')('electron').app.quit(), 50); true`); } catch {} }
    renderer?.close(); main?.close();
    for (let attempt = 0; attempt < 50 && child.exitCode === null; attempt++) await pause(100);
    if (child.pid && child.exitCode === null) execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
  }
}

try {
  for (let index = 1; index <= options.samples; index++) {
    const result = await sample(index); report.samples.push(result);
    console.log(`Sample ${index}: controls ${Math.round(result.controlsReadyMs)} ms; first paint ${Math.round(result.firstContentfulPaintMs)} ms; Quick Search ${Math.round(result.quickSearchPaintMs)} ms`);
    await writeFile(output, JSON.stringify(report, null, 2));
  }
  report.summary = summarize(report.samples); report.status = 'passed';
  if (baseline) report.comparison = compare(report, baseline);
  console.log(JSON.stringify(report.comparison ?? report.summary, null, 2));
} catch (error) {
  report.status = 'failed'; report.error = error.message; process.exitCode = 1;
  console.error(error);
} finally {
  await writeFile(output, JSON.stringify(report, null, 2));
  console.log(`Report: ${output}\nLocal raw traces/logs: ${work}`);
}
