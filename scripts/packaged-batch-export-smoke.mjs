import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { tmpdir, cpus, release } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { launchPackaged } from './packaged-app-driver.mjs';

const exe = resolve(process.argv[2] ?? 'release/win-unpacked/CIF Crystal Data.exe');
const root = await mkdtemp(join(tmpdir(), 'cif-batch-packaged-'));
const profile = join(root, 'profile'), corpus = join(root, 'input'), output = join(root, 'output');
for (const folder of [profile, corpus, output]) await mkdir(folder);
const fixture = await readFile('src/parser/__fixtures__/synthetic-test.cif', 'utf8');
for (let i = 0; i < 1204; i++) await writeFile(join(corpus, `sample-${i}.cif`), fixture);
await writeFile(join(corpus, 'multiblock.cif'), fixture + '\n' + fixture.replace('data_synthetic_test', 'data_second'));
const filter = { slot1: ['Na'], slot2: [], mode: 'AND' };
const report = { commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  dirty: Boolean(execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim()),
  os: release(), cpu: cpus()[0]?.model, inputFiles: 1205, inputBytes: Buffer.byteLength(fixture) * 1206 + 1,
  benchmarks: [], limitations: ['Synthetic small CIFs, local filesystem, warm/uncontrolled caches.',
    'Native pickers replaced with temporary destinations; inspector and GPU-disabled harness affect timing. Hidden-window timer throttling is disabled for heartbeat measurements.',
    'Peak RSS is process-wide sampling, not an allocation bound; no real research corpus or removable filesystem was tested.'] };
let run;
try {
  run = await launchPackaged({ exe, profile, corpus });
  await run.main('__smoke.electron.BrowserWindow.getAllWindows()[0].webContents.setBackgroundThrottling(false); true');
  const imported = await run.ui('window.cifApi.importCifFolder()');
  assert.equal(imported.importedCount, 1206);
  await rename(corpus, join(root, 'originals-unavailable'));
  const first = await run.ui(`window.cifApi.searchPage(${JSON.stringify({ filter, offset: 0, limit: 500 })})`);
  assert.equal(first.total, 1206); assert.equal(first.rows.length, 500);
  const ids = first.rows.slice(0, 2).map(row => row.id);
  const expected = await Promise.all(ids.map(id => run.ui(`window.cifApi.getViewerSource(${id})`)));
  const scope = { kind: 'matching', filter };
  assert.equal(await run.ui(`window.cifApi.countBatchExport(${JSON.stringify(scope)})`), 1206);
  await run.main(`__smoke.electron.dialog.showOpenDialog=async()=>({canceled:false,filePaths:[${JSON.stringify(output)}]}); true`);
  for (const request of [
    { scope: { kind: 'selected', ids }, expectedCount: 2 },
    { scope, expectedCount: 1206 },
  ]) {
    await run.main(`__smoke.metrics={peakRss:process.memoryUsage().rss,maxGapMs:0,ticks:0,last:performance.now()}; __smoke.timer=setInterval(()=>{const now=performance.now();__smoke.metrics.maxGapMs=Math.max(__smoke.metrics.maxGapMs,now-__smoke.metrics.last);__smoke.metrics.last=now;__smoke.metrics.ticks++;__smoke.metrics.peakRss=Math.max(__smoke.metrics.peakRss,process.memoryUsage().rss);},10); true`);
    await run.ui(`window.batchMetrics={maxGapMs:0,ticks:0,last:performance.now()}; window.batchTimer=setInterval(()=>{const now=performance.now();window.batchMetrics.maxGapMs=Math.max(window.batchMetrics.maxGapMs,now-window.batchMetrics.last);window.batchMetrics.last=now;window.batchMetrics.ticks++;},10); true`);
    const start = performance.now();
    const result = await run.ui(`window.cifApi.batchExport(${JSON.stringify(request)})`);
    const elapsedMs = performance.now() - start;
    const main = await run.main('clearInterval(__smoke.timer);__smoke.metrics');
    const renderer = await run.ui('clearInterval(window.batchTimer);window.batchMetrics');
    assert.equal(result.completed, request.expectedCount); assert.equal(result.failed, 0); assert.equal(result.error, undefined);
    const folder = join(output, result.folderName);
    const names = await readdir(folder);
    assert.equal(names.length, request.expectedCount);
    assert.ok(names.every(name => name.endsWith('.cif')));
    assert.match(result.folderName, /^cif_batch_/);
    if (request.scope.kind === 'selected') {
      for (let i = 0; i < ids.length; i++) {
        const name = i === 0 ? 'Cl1Na1_1.cif' : `Cl1Na1_1_entry-${ids[i]}.cif`;
        assert.ok(names.includes(name));
        assert.equal(await readFile(join(folder, name), 'utf8'), expected[i].text);
      }
      report.selectedFolder = folder;
    }
    report.benchmarks.push({ scope: request.scope.kind, count: result.total, elapsedMs, main, renderer });
  }
  // Real IPC cancellation, followed by a valid retry and picker cancellation.
  await run.ui(`window.batchUnsubscribe=window.cifApi.onBatchExportProgress(p=>{if(p.completed>=25)void window.cifApi.cancelBatchExport();}); true`);
  const cancelled = await run.ui(`window.cifApi.batchExport(${JSON.stringify({ scope, expectedCount: 1206 })})`);
  await run.ui('window.batchUnsubscribe();true');
  assert.equal(cancelled.cancelled, true); assert.ok(cancelled.completed >= 25 && cancelled.notAttempted > 0);
  assert.equal(cancelled.completed + cancelled.failed + cancelled.notAttempted, 1206);
  const before = (await readdir(output)).length;
  await run.main('__smoke.electron.dialog.showOpenDialog=async()=>({canceled:true,filePaths:[]}); true');
  assert.equal(await run.ui(`window.cifApi.batchExport(${JSON.stringify({ scope, expectedCount: 1206 })})`), null);
  assert.equal((await readdir(output)).length, before);
  // Reopen exported blocks through the actual import worker in the packaged app.
  await run.main(`__smoke.electron.dialog.showOpenDialog=async()=>({canceled:false,filePaths:[${JSON.stringify(report.selectedFolder)}]}); true`);
  assert.equal((await run.ui('window.cifApi.importCifFolder()')).importedCount, 2);
  const reopened = await run.ui(`window.cifApi.searchPage(${JSON.stringify({ filter, offset: 1206, limit: 10 })})`);
  assert.equal(reopened.rows.length, 2);
  for (let i = 0; i < 2; i++) assert.equal((await run.ui(`window.cifApi.getViewerSource(${reopened.rows[i].id})`)).text, expected[i].text);
  // Preserve the single-entry workflow too.
  assert.equal((await run.ui(`window.cifApi.exportCif(${ids[0]})`)).exported, true);
  // Exercise the real packaged dialog and retain a rendered result for visual review.
  await run.ui("[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Quick search')).click()");
  await new Promise(resolve => setTimeout(resolve, 200));
  await run.ui("(() => { const input=document.querySelector('#quick-search-space-group-number');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'1');input.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await new Promise(resolve => setTimeout(resolve, 300));
  await run.ui("document.querySelector('.quick-search-dialog form').requestSubmit()");
  for (let i=0;i<100;i++) {
    if(await run.ui("!!document.querySelector('tr[data-entry-id]')")) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  await run.ui("document.querySelector('tr[data-entry-id]').click()");
  await new Promise(resolve => setTimeout(resolve, 100));
  await run.ui("[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Export…')).click()");
  await run.ui("document.querySelectorAll('input[name=batch-scope]')[1].click()");
  for (let i=0;i<200;i++) {
    if(await run.ui("[...document.querySelectorAll('dialog button')].some(b=>b.textContent.includes('Choose folder and export 1')&&!b.disabled)")) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(await run.ui("[...document.querySelectorAll('dialog button')].some(b=>b.textContent.includes('Choose folder and export 1')&&!b.disabled)"), 'packaged count preview must be ready before starting');
  await run.main(`__smoke.electron.dialog.showOpenDialog=async()=>({canceled:false,filePaths:[${JSON.stringify(output)}]}); true`);
  await run.ui("[...document.querySelectorAll('dialog button')].find(b=>b.textContent.includes('Choose folder')).click()");
  for (let i=0;i<100;i++) {
    if(await run.ui("document.querySelector('dialog')?.textContent.includes('Export completed')")) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(await run.ui("document.querySelector('dialog').textContent.includes('1 completed; 0 failed; 0 not attempted')"), await run.ui("document.querySelector('dialog').textContent"));
  report.screenshot = join(process.argv[3] ? dirname(process.argv[3]) : root, 'batch-export.png');
  await run.main(`(async()=>{const image=await __smoke.electron.BrowserWindow.getAllWindows()[0].webContents.capturePage();process.getBuiltinModule('fs').writeFileSync(${JSON.stringify(report.screenshot)},image.toPNG());return true;})()`);
  report.cancelled = cancelled;
  report.reopened = 2;
  const reportPath = process.argv[3] ?? join(root, 'report.json');
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log('Packaged batch export report:', reportPath);
  console.log(JSON.stringify(report.benchmarks, null, 2));
} finally { if (run) await run.stop(); }
