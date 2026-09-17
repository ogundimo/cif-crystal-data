import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, cp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir, cpus, release, totalmem } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:net';
import { createHash } from 'node:crypto';
import Database from 'better-sqlite3';
import { connect, pause, waitFor } from './cdp.mjs';
// Only use a prepared synthetic kit; clone every profile before running.
const [kitArg, exeArg] = process.argv.slice(2);
assert.ok(kitArg && exeArg, 'Usage: npm run benchmark:packaged -- <prepared-kit> <executable>');
assert.ok(/^v22\./.test(process.version) && Number(process.versions.node.split('.')[1]) >= 13, 'Use Node 22.13+');
assert.equal(process.platform, 'win32');
const kit=resolve(kitArg); const exe=resolve(exeArg);
const manifest=JSON.parse(await readFile(join(kit,'manifest.json'),'utf8'));
const executableHash=createHash('sha256').update(await readFile(exe)).digest('hex');
assert.equal(executableHash,manifest.exeSha256,'Executable must match the prepared kit; prepare a separate kit for another build.');
const supported=['fresh','populated-off','populated-on','unavailable','upgrade','larger'];
assert.equal(manifest.cases.length,6);
for(const name of supported) assert.ok(manifest.cases.some(c=>c.name===name && Number.isInteger(c.entries) && c.entries>=0));
const work=await mkdtemp(join(tmpdir(),'cif-packaged-visible-'));
const report={executable:exe,source:manifest.applicationCommit??manifest.commit,protocol:'instrumented-packaged-launch-to-search-v1',status:'running',samples:[],limitations:['OS caches uncontrolled; not cold-start acceptance.','Inspectors and tracing enabled; windows may require restore/focus.','Search includes diagnostic polling and 200 ms input-settle delay.','Synthetic profiles only.']};
report.recordedAt=new Date().toISOString();
report.executableHash=executableHash;
report.environment={os:release(),cpu:cpus()[0]?.model,memoryBytes:totalmem(),node:process.version};
const port=async()=>{const s=createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;};
try {
 for(const caseName of supported) for(let index=1;index<=3;index++) {
  const count=manifest.cases.find(c=>c.name===caseName).entries;
  const dir=join(work,`${caseName}-${index}`);const profile=join(dir,'profile');await mkdir(profile,{recursive:true});
  await cp(join(kit,'profiles',caseName+'-1'),profile,{recursive:true});
  if(count) {
   const database=new Database(join(profile,'cif-local.db'),{readonly:true,fileMustExist:true});
   try {
    assert.equal(database.pragma('user_version',{simple:true}),caseName==='upgrade'?9:10,'Prepared profile was already upgraded or has an incompatible schema.');
    assert.equal(database.prepare('SELECT COUNT(*) AS n FROM entries').get().n,count);
   } finally {database.close();}
  }
  const trace=join(dir,'trace.jsonl');const mainPort=await port();const rendererPort=await port();
  const start=Date.now();const logs=[];
  const child=spawn(exe,[`--inspect=127.0.0.1:${mainPort}`,`--remote-debugging-port=${rendererPort}`],{windowsHide:false,stdio:['ignore','pipe','pipe'],env:{...process.env,CIF_TRACE_FILE:trace,CIF_TEST_PROFILE:profile}});
  child.on('error',e=>logs.push(String(e)));for(const s of [child.stdout,child.stderr])s.on('data',d=>logs.push(String(d)));
  let main,renderer;
  try {
   main=await connect(mainPort);
   const rows=async()=>{try{return(await readFile(trace,'utf8')).trim().split('\n').map(JSON.parse);}catch{return[];}};
   await waitFor(async()=>(await rows()).some(e=>e.event==='main.loaded'),'main load');
   const electron=`process.getBuiltinModule('module').createRequire(process.execPath)('electron')`;
   await waitFor(()=>main.evaluate(`${electron}.BrowserWindow.getAllWindows().length>0`),'window');
   renderer=await connect(rendererPort);
   await waitFor(()=>renderer.evaluate("[...document.querySelectorAll('button')].some(b=>b.textContent.includes('Quick search')&&!b.disabled)"),'search control');
   let restored=false;
   if(!await renderer.evaluate("document.visibilityState==='visible'")) {restored=true;await main.evaluate(`${electron}.BrowserWindow.getAllWindows().forEach(w=>{if(w.isMinimized())w.restore();w.show();w.focus();});true`);}
   await waitFor(()=>renderer.evaluate("document.visibilityState==='visible' && performance.getEntriesByName('first-contentful-paint').length>0"),'visible paint');
   const paint=await renderer.evaluate("performance.timeOrigin+performance.getEntriesByName('first-contentful-paint')[0].startTime");
   // Starting a new search intentionally dismisses the prior API error.
   // Check unavailable-folder feedback before that user action clears it.
   if(caseName==='unavailable') await waitFor(()=>renderer.evaluate("document.body.textContent.includes('no longer available')"),'unavailable-folder feedback');
   await renderer.evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Quick search')).click()");
   await waitFor(()=>renderer.evaluate("!!document.querySelector('#quick-search-space-group-number')"),'dialog');
   await renderer.evaluate("(()=>{const e=document.querySelector('#quick-search-space-group-number');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'1');e.dispatchEvent(new Event('input',{bubbles:true}));})()");
   await pause(200);const searchStart=Date.now();await renderer.evaluate("document.querySelector('.quick-search-dialog form').requestSubmit()");
   const expected=count?`document.querySelectorAll('tr[data-entry-id]').length>0 && document.body.textContent.includes('${Math.min(500,count)} of ${count} search results loaded')`:"document.body.textContent.includes('No matching results')";
   await waitFor(()=>renderer.evaluate(`!document.querySelector('.quick-search-dialog') && (${expected}) && document.visibilityState==='visible'`),'expected visible results');
   await renderer.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
   const done=Date.now();const events=await rows();
   const metric=event=>events.find(e=>e.event===event)?.time-start;
   const sample={caseName,entries:count,index,restored,firstContentfulPaintMs:paint-start,controlsSignalMs:metric('renderer.controls-ready'),databaseReadyMs:metric('database.ready.complete'),launchToSearchMs:done-start,searchMs:done-searchStart};
   for(const key of ['firstContentfulPaintMs','controlsSignalMs','databaseReadyMs','launchToSearchMs','searchMs']) assert.ok(Number.isFinite(sample[key])&&sample[key]>=0,`Invalid timing: ${key}`);
   if(count){await waitFor(()=>renderer.evaluate("(()=>{try{return !!document.querySelector('[data-testid=jsmol-host] canvas')&&Object.values(window.Jmol._applets).some(a=>{try{return window.Jmol.getPropertyAsArray(a,'atomInfo','(visible)').length>0;}catch{return false;}});}catch{return false;}})()"),'first structure',60000);sample.searchSubmissionToStructureMs=Date.now()-searchStart;}
      if(caseName==='populated-on'||caseName==='unavailable') {
    await waitFor(()=>renderer.evaluate("[...document.querySelectorAll('button')].some(b=>b.textContent.includes('Refresh CIFs')&&!b.disabled)"),'refresh controls restored');
    sample.refreshControlsObservedRestoredMs=Date.now()-start;
   }
   report.samples.push(sample);console.log(JSON.stringify(sample));
   await main.evaluate(`${electron}.app.quit();true`).catch(()=>{});
  } finally {renderer?.close();main?.close();for(let i=0;i<50&&child.exitCode===null;i++)await pause(100);if(child.exitCode===null&&child.pid)execFileSync('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});await writeFile(join(dir,'process.log'),logs.join(''));await writeFile(join(work,'report.json'),JSON.stringify(report,null,2));}
 }
 report.status='passed';
}catch(error){report.status='failed';report.error=error.message;process.exitCode=1;console.error(error);}
finally{await writeFile(join(work,'report.json'),JSON.stringify(report,null,2));console.log('Report:',join(work,'report.json'));}

