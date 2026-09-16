import Database from 'better-sqlite3';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { tmpdir, cpus, release } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { launchPackaged } from './packaged-app-driver.mjs';
const exe = resolve(process.argv[2] ?? 'release/win-unpacked/CIF Crystal Data.exe');
const root = await mkdtemp(join(tmpdir(), 'cif-reliability-'));
const profile = join(root, 'profile'); const corpus = join(root, 'input');
await mkdir(profile); await mkdir(corpus);
const fixture = await readFile('src/parser/__fixtures__/synthetic-test.cif', 'utf8');
await writeFile(join(corpus, 'sample.cif'), fixture + "\n_audit_author_name 'Synthetic depositor'\n");
process.env.CIF_TRACE_FILE = join(root, 'trace.jsonl');
const timings = []; let run;
const launch = async () => {
  const start = performance.now();
  const result = await launchPackaged({ exe, profile, corpus });
  timings.push({ kind: 'instrumented process start; caches uncontrolled', elapsedMs: performance.now() - start });
  return result;
};
async function verifyVisibleBibliography() {
  await run.ui("[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Quick search')).click()");
  await new Promise(resolve => setTimeout(resolve, 150));
  await run.ui("(() => { const input = document.querySelector('#quick-search-space-group-number'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '1'); input.dispatchEvent(new Event('input', { bubbles: true })); })()");
  await new Promise(resolve => setTimeout(resolve, 300));
  await run.ui("document.querySelector('.quick-search-dialog form').requestSubmit()");
  let visible = false;
  for (let i = 0; i < 200; i++) {
    visible = await run.ui("!!document.querySelector('[data-testid=publication-authors]') && document.querySelector('[aria-label=\"Data-block authors\"]')?.textContent.includes('Synthetic depositor')");
    if (visible) break;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.ok(visible, 'publication and data authors must be displayed separately');
  assert.ok(await run.ui("document.querySelector('[data-testid=compound-info-panel]').textContent.includes('Publication authors')"));
}
try {
  run = await launch();
  assert.equal(await run.ui('window.cifApi.getStartupRefresh()'), false);
  assert.equal((await run.ui('window.cifApi.importCifFolder()')).importedCount, 1);
  assert.equal((await run.ui('window.cifApi.refreshCifFolder()')).skippedCount, 1);
  await verifyVisibleBibliography();
  const request = { filter: { slot1: ['Na'], slot2: [], mode: 'AND' }, offset: 0, limit: 1 };
  const first = await run.ui(`window.cifApi.searchPage(${JSON.stringify(request)})`);
  assert.equal(first.total, 1); const id = first.rows[0].id;
  assert.equal((await run.ui(`window.cifApi.searchPage(${JSON.stringify({ ...request, offset: 1 })})`)).rows.length, 0);
  assert.equal((await run.ui(`window.cifApi.searchPage(${JSON.stringify({ ...request, sortColumn: 'reference', sortDirection: 'desc' })})`)).rows[0].id, id);
  assert.ok((await run.ui(`window.cifApi.getAtomSites(${id})`)).length);
  assert.ok((await run.ui(`window.cifApi.getPublAuthors(${id})`)).length);
  assert.equal((await run.ui(`window.cifApi.getDataAuthors(${id})`))[0].name, 'Synthetic depositor');
  assert.ok((await run.ui(`window.cifApi.getViewerSource(${id})`)).text.includes('data_synthetic_test'));
  assert.ok((await run.ui(`window.cifApi.getDiffractionInput(${id})`)).atomSites.length);
  assert.equal((await run.ui(`window.cifApi.exportCif(${id})`)).exported, true);
  const pxrd = join(profile, 'pattern.xy');
  await run.main(`__smoke.electron.dialog.showSaveDialog=async()=>({canceled:false,filePath:${JSON.stringify(pxrd)}});true`);
  assert.equal((await run.ui(`window.cifApi.exportPxrd(${id}, ${JSON.stringify('10 0\n20 100\n')})`)).exported, true);
  // The API accepts exported profile text; viewer/PXRD rendering has its separate real UI suite.
  await run.ui('window.cifApi.setStartupRefresh(true)');
  await run.stop(); run = null;
  // Downgrade only this stopped synthetic profile to model the bibliography upgrade.
  const legacy = new Database(join(profile, 'cif-local.db'));
  legacy.exec("DROP TABLE data_authors; PRAGMA user_version=9; UPDATE entries SET reference='', publ_title=''; DELETE FROM publ_authors;");
  legacy.close();
  run = await launch();
  assert.equal(await run.ui('window.cifApi.getStartupRefresh()'), true);
  assert.ok((await run.ui(`window.cifApi.getPublAuthors(${id})`)).length);
  assert.equal((await run.ui(`window.cifApi.getDataAuthors(${id})`))[0].name, 'Synthetic depositor');
  assert.equal((await run.ui(`window.cifApi.searchPage(${JSON.stringify(request)})`)).rows[0].reference, first.rows[0].reference);
  await verifyVisibleBibliography();
  // Wait until startup's worker releases its mutation lock.
  for (let i = 0; i < 200; i++) {
    if (await run.ui("[...document.querySelectorAll('button')].some(b=>b.textContent.includes('Refresh CIFs')&&!b.disabled)")) break;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  await run.ui('window.cifApi.setStartupRefresh(false)');
  await run.stop(); run = null;
  await rename(corpus, join(root, 'unavailable-input'));
  run = await launch();
  assert.equal(await run.ui('window.cifApi.getEntryCount()'), 1);
  assert.equal((await run.ui(`window.cifApi.getViewerSource(${id})`)).fileName, 'sample.cif');
  await assert.rejects(run.ui('window.cifApi.refreshCifFolder()'), /no longer available/);
  await run.stop(); run = null;
  const lines = (await readFile(process.env.CIF_TRACE_FILE, 'utf8')).trim().split('\n').map(JSON.parse);
  const events = [...new Set(lines.map(line => line.event))];
  for (const event of ['worker.started', 'worker.exited', 'import.discovery.complete', 'cif:searchPage.complete', 'cif:exportCif.complete', 'cif:exportPxrd.complete', 'cif:refreshCifFolder.error']) assert.ok(events.includes(event), event);
  assert.ok(!JSON.stringify(lines).includes(corpus), 'trace must not contain source paths');
  const report = { commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    dirty: execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim().length > 0,
    executable: exe, os: release(), cpu: cpus()[0]?.model, timings, events,
    limitations: ['Not cold-cache evidence; inspector pause and GPU-disabled harness affect timings.', 'Export API uses synthetic XY text; separate viewer suite validates simulation/rendering.', 'No real research corpus was imported.'] };
  await writeFile(join(root, 'report.json'), JSON.stringify(report, null, 2));
  console.log('Packaged reliability report:', join(root, 'report.json'));
} finally { if (run) await run.stop(); }
