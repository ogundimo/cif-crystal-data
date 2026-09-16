// Exercise the packaged executable with an isolated profile and read-only CIF inputs.
import assert from 'node:assert/strict';
import { launchPackaged } from './packaged-app-driver.mjs';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
const exe = resolve(process.argv[2] ?? 'release/win-unpacked/CIF Crystal Data.exe');
const corpus = resolve(process.argv[3] ?? '../ALL CIFS');
const profile = await mkdtemp(join(tmpdir(), 'cif-packaged-smoke-'));
const pause = ms => new Promise(r => setTimeout(r, ms));
const launch = () => launchPackaged({ exe, profile, corpus });
let run;
try {
  run = await launch();
  console.log('Checking empty isolated database');
  assert.equal(await run.ui('window.cifApi.getEntryCount()'),0);
  console.log('Importing corpus');
  const imported = await run.ui('window.cifApi.importCifFolder()');
  assert.ok(imported.importedCount > 0, JSON.stringify(imported));
  console.log('Import completed', JSON.stringify(imported));
  const count = await run.ui('window.cifApi.getEntryCount()');
  const result = await run.ui("window.cifApi.searchPage({filter:{slot1:[],slot2:[],mode:'AND'},offset:0,limit:500})");
  assert.equal(result.total,count);
  const entry = result.rows.find(e=>e.sg_number>0) ?? result.rows[0];
  const source = await run.ui(`window.cifApi.getViewerSource(${entry.id})`);
  assert.ok(source.text.includes('data_'));
  const atoms = await run.ui(`window.cifApi.getAtomSites(${entry.id})`);
  assert.ok(Array.isArray(atoms));
  const exported = await run.ui(`window.cifApi.exportCif(${entry.id})`);
  assert.equal(exported.exported,true);
  assert.equal(await readFile(join(profile,'exported.cif'),'utf8'),source.text);
  // Use real UI search to exercise connected detail, viewer and diffraction panels.
  await run.ui("(() => { [...document.querySelectorAll('button')].find(b=>b.textContent.includes('Quick search')).click(); })()");
  await pause(200);
  await run.ui(`(() => {const e=document.querySelector('#quick-search-space-group-number');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(String(entry.sg_number))});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await pause(300);
  await run.ui("document.querySelector('.quick-search-dialog form').requestSubmit()");
  for(let i=0;i<600;i++) { if(await run.ui("!!document.querySelector('[data-testid=compound-info-panel]') && !!document.querySelector('[data-role=pxrd-profile]') && !!document.querySelector('[aria-label=\"Crystal structure viewer\"] canvas')")) break; await pause(100); }
  assert.ok(await run.ui("!!document.querySelector('[data-testid=compound-info-panel]') && !!document.querySelector('[data-role=pxrd-profile]')"), 'Real-data details/PXRD did not render');
  try {
  const image = await run.main("__smoke.electron.BrowserWindow.getAllWindows()[0].webContents.capturePage().then(image=>image.toPNG().toString('base64'))");
  await writeFile(join(profile,'workspace.png'), Buffer.from(image,'base64'));
  } catch (error) { console.log('Hidden-window capture unavailable:',error.message); }
  await run.stop(); run=null;
  run=await launch();
  assert.equal(await run.ui('window.cifApi.getEntryCount()'),count);
  const report={executable:exe,corpus,profile,entries:count,import:imported,exportMatchesSource:true,reopened:true};
  await writeFile(join(profile,'report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
} finally { if(run) await run.stop(); }
