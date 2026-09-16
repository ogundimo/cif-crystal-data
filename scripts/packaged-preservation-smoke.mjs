import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { launchPackaged } from './packaged-app-driver.mjs';

const exe = resolve(process.argv[2] ?? 'release/win-unpacked/CIF Crystal Data.exe');
const root = await mkdtemp(join(tmpdir(), 'cif-packaged-preservation-'));
let profile = join(root, 'original-profile'); await mkdir(profile);
const corpus = join(root, 'original-input'); await mkdir(corpus);
await mkdir(join(corpus, 'a')); await mkdir(join(corpus, 'b'));
const fixture = await readFile(resolve('src/parser/__fixtures__/synthetic-test.cif'), 'utf8');
await writeFile(join(corpus, 'a', 'sample.cif'), fixture);
await writeFile(join(corpus, 'b', 'sample.cif'), fixture.replace('data_synthetic_test', 'data_second').replace("'Na1 Cl1'", "'Fe1 O1'"));
const backup = join(root, 'portable.cifbackup');
const launch = () => launchPackaged({ exe, profile, corpus });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let run;
try {
  run = await launch();
  const imported = await run.ui('window.cifApi.importCifFolder()');
  assert.equal(imported.importedCount, 2);
  const search = "window.cifApi.searchPage({filter:{slot1:[],slot2:[],mode:'AND'},offset:0,limit:500})";
  const entries = await run.ui(search); assert.equal(entries.total, 2);
  const source = await run.ui(`window.cifApi.getViewerSource(${entries.rows[0].id})`);
  await run.main(`__smoke.electron.dialog.showSaveDialog=async()=>({canceled:false,filePath:${JSON.stringify(backup)}});true`);
  assert.equal(await run.ui("window.cifApi.backupProfile({'cif-layout-v1:test':'42'})"), true);
  await rename(corpus, join(root, 'unavailable-original-input'));
  assert.equal((await run.ui(`window.cifApi.getViewerSource(${entries.rows[0].id})`)).text, source.text);
  await run.stop(); run = null;
  profile = join(root, 'fresh-profile'); await mkdir(profile);
  run = await launch();
  assert.equal(await run.ui('window.cifApi.getEntryCount()'), 0);
  await run.main(`__smoke.electron.dialog.showOpenDialog=async()=>({canceled:false,filePaths:[${JSON.stringify(backup)}]});__smoke.electron.dialog.showMessageBox=async()=>({response:1});true`);
  assert.equal(await run.ui('window.cifApi.restoreProfile()'), true);
  assert.equal((await run.ui('window.cifApi.getPreservedLayout()'))['cif-layout-v1:test'], '42');
  assert.equal(await run.ui('window.cifApi.getImportFolder()'), null);
  await run.stop(); run = null;
  run = await launch();
  const restored = await run.ui(search);
  assert.deepEqual(restored.rows.map(row => [row.id, row.formula]), entries.rows.map(row => [row.id, row.formula]));
  const viewed = await run.ui(`window.cifApi.getViewerSource(${entries.rows[0].id})`);
  assert.equal(viewed.text, source.text);
  assert.equal((await run.ui(`window.cifApi.exportCif(${entries.rows[0].id})`)).exported, true);
  assert.equal(await readFile(join(profile, 'exported.cif'), 'utf8'), source.text);
  await run.ui("[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Quick search')).click()");
  await pause(200);
  await run.ui("(() => { const input = document.querySelector('#quick-search-space-group-number'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '1'); input.dispatchEvent(new Event('input', { bubbles: true })); })()");
  await pause(300);
  await run.ui("document.querySelector('.quick-search-dialog form').requestSubmit()");
  for (let i = 0; i < 200; i++) {
    if (await run.ui("!!document.querySelector('[data-testid=compound-info-panel]')")) break;
    await pause(100);
  }
  assert.ok(await run.ui("!!document.querySelector('[data-testid=compound-info-panel]')"));
  assert.deepEqual(await run.main('__smoke.errors'), []);
  const report = { executable: exe, profile, backup, entries: restored.total, restoredIntoFreshProfile: true,
    restarted: true, originalFolderUnavailable: true, exportMatchesImportedVersion: true };
  await writeFile(join(root, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally { if (run) await run.stop(); }
