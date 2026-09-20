// Exercise the packaged executable with an isolated profile and read-only CIF inputs.
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
const exe = resolve(process.argv[2] ?? 'release/win-unpacked/CIF Crystal Data.exe');
const corpus = resolve(process.argv[3] ?? '../ALL CIFS');
const profile = await mkdtemp(join(tmpdir(), 'cif-packaged-smoke-'));
const pause = ms => new Promise(r => setTimeout(r, ms));
async function launch() {
  const reservation = createServer();
  await new Promise(r=>reservation.listen(0, '127.0.0.1', r));
  const port = reservation.address().port;
  await new Promise(r=>reservation.close(r));
  const child = spawn(exe, [`--inspect-brk=127.0.0.1:${port}`, '--disable-gpu'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  child.stderr.on('data', b => { log += b; if(String(b).includes('CIF') || String(b).includes('Error')) console.error(String(b)); });
  child.stdout.on('data', b => { log += b; });
  let ws;
  const pending = new Map(); let sequence = 0; let paused;
  try {
    let url;
    for (let i = 0; i < 600 && !url; i++) {
      if (child.exitCode !== null) throw new Error(log);
      try { const targets=await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); url=targets[0]?.webSocketDebuggerUrl; } catch {}
      if (!url) await pause(100);
    }
    assert.ok(url, 'Packaged main-process inspector did not start: ' + log);
    ws = new WebSocket(url);
    ws.addEventListener('close', () => { for (const request of pending.values()) request.reject(new Error('Packaged inspector disconnected')); pending.clear(); });
    ws.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.method === 'Debugger.paused') { paused = message.params; console.log('Inspector paused:',message.params.reason); }
      const response = pending.get(message.id);
      if (response) { pending.delete(message.id); message.error ? response.reject(new Error(JSON.stringify(message.error))) : response.resolve(message.result); }
    });
    await new Promise((yes,no) => { ws.addEventListener('open',yes,{once:true}); ws.addEventListener('error',no,{once:true}); });
    const send = (method, params = {}) => new Promise((resolve,reject) => { const id = ++sequence; const timer=setTimeout(()=>{pending.delete(id);reject(new Error('Inspector request timed out: '+method));},90000);pending.set(id,{resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}}); ws.send(JSON.stringify({id,method,params})); });
    await send('Debugger.enable');
    await send('Runtime.runIfWaitingForDebugger');
    for (let i=0;i<100 && !paused;i++) await pause(50);
    assert.ok(paused, 'No startup breakpoint');
    const setup = await send('Debugger.evaluateOnCallFrame', { callFrameId: paused.callFrames[0].callFrameId, expression: `process.execArgv.splice(0); { const wt=process.getBuiltinModule('worker_threads'); const OriginalWorker=wt.Worker; wt.Worker=class extends OriginalWorker { constructor(file,options){super(file,{...options,execArgv:[]});} }; process.getBuiltinModule('module').syncBuiltinESMExports(); } global.__smoke = { electron: process.getBuiltinModule('module').createRequire(${JSON.stringify(exe)})('electron') }; __smoke.electron.app.setPath('userData', ${JSON.stringify(profile)}); __smoke.electron.app.on('browser-window-created', (_,w)=>w.hide()); __smoke.errors = []; __smoke.electron.dialog.showErrorBox=(title,message)=>{__smoke.errors.push({title,message});console.error(title,message);}; __smoke.electron.dialog.showOpenDialog = async()=>({canceled:false,filePaths:[${JSON.stringify(corpus)}]}); __smoke.electron.dialog.showSaveDialog = async (...args)=>({canceled:false,filePath:${JSON.stringify(join(profile,'exported.cif'))}}); true`, returnByValue:true });
    assert.ok(!setup.exceptionDetails, JSON.stringify(setup.exceptionDetails));
    await send('Debugger.resume');
    await send('Debugger.disable');
    console.log('Packaged process resumed');
    await pause(1000);
    const main = async expression => {
      const response = await send('Runtime.evaluate', { expression, awaitPromise:true, returnByValue:true });
      if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails));
      return response.result.value;
    };
    const ui = expression => main(`__smoke.electron.BrowserWindow.getAllWindows()[0].webContents.executeJavaScript(${JSON.stringify(expression)})`);
    for(let i=0;i<200;i++) {
      if(await main("__smoke.electron.BrowserWindow.getAllWindows().length > 0 && !__smoke.electron.BrowserWindow.getAllWindows()[0].webContents.isLoading()")) break;
      await pause(100);
    }
    assert.equal(await main("__smoke.electron.app.getPath('userData')"), profile);
    assert.equal(await main('__smoke.electron.app.isPackaged'), true);
    return { child, ws, main, ui, stop: async()=> { await main('setTimeout(()=>__smoke.electron.app.quit(), 20); true'); ws.close(); await new Promise(r=>{ if(child.exitCode !== null) return r(); const timeout=setTimeout(()=>{child.kill();r();},10000);child.once('exit',()=>{clearTimeout(timeout);r();}); }); } };
  } catch(error) { ws?.close(); child.kill(); throw error; }
}
let run;

try {
  run = await launch();
  console.log('Checking empty isolated database');
  assert.equal(await run.ui('window.cifApi.getEntryCount()'),0);
  assert.ok(await run.ui('!!document.querySelector("#quick-search-space-group-number")'), 'Quick search opens on startup');
  await run.ui('document.querySelector("button[aria-label=Close]").click()');
  await run.main("__smoke.electron.shell.openPath=async path=>{__smoke.manualPath=path;return '';};true");
  await run.ui('window.cifApi.openManual()');
  const manualPath = await run.main('__smoke.manualPath');
  const resourcesPath = await run.main('process.resourcesPath');
  assert.equal(manualPath, join(resourcesPath, 'docs', 'CIF Crystal Data User Manual.pdf'));
  assert.deepEqual(await readFile(manualPath), await readFile(resolve('docs/CIF Crystal Data User Manual.pdf')));
  console.log('Packaged startup search and bundled PDF opening passed');
  if (process.argv.includes('--plot-export')) {
    const style=(color,mode='line')=>({color,mode,width:1.5,size:2.7,legend:true,visible:true});
    const snapshot={frame:{profile:[[10,5,4,1,1],[20,30,29,2,1],[30,8,10,1,-2]],range:[10,30],ticks:{phase:[20]},rwp:1},view:{x:[10,30],y:[0,35],difference:[-3,3]},design:{width:8,height:4,dpi:300,format:'png',fontSize:12,title:'',xLabel:'2θ (degrees)',yLabel:'Intensity',legend:{x:.7,y:.05},curves:{observed:style('#1a1a1a','scatter'),calculated:style('#ff7f0e'),background:style('#b5793a'),difference:style('#737373'),reflections:style('#1a1a1a','ticks')}}};
    await run.ui(`window.cifApi.openPlotExport(${JSON.stringify(snapshot)})`);
    const exportUi=expression=>run.main(`__smoke.electron.BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('view=plot-export')).webContents.executeJavaScript(${JSON.stringify(expression)})`);
    for(let i=0;i<100;i++){if(await exportUi('!!document.querySelector("[data-legend]")'))break;await pause(50);}
    assert.ok(await exportUi('!!document.querySelector("[data-legend]")'));
    const destination=join(profile,'packaged-plot.png');
    await run.main(`__smoke.electron.dialog.showSaveDialog=async()=>({canceled:false,filePath:${JSON.stringify(destination)}});true`);
    assert.equal(await exportUi(`window.cifApi.savePlotExport(${JSON.stringify(snapshot.design)},${JSON.stringify(snapshot.view)})`),destination);
    const image=await readFile(destination);assert.equal(image.readUInt32BE(16),2400);assert.equal(image.readUInt32BE(20),1200);
    await run.main("__smoke.electron.BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('view=plot-export')).close();true");
    await run.main(`__smoke.electron.dialog.showSaveDialog=async()=>({canceled:false,filePath:${JSON.stringify(join(profile,'exported.cif'))}});true`);
    console.log('Packaged export window and 300 dpi PNG passed');
  }
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
  if (process.argv.includes('--refinement')) {
    // Run with the NaCl corpus generated by refinement-smoke-electron.cjs.
    const fixture=JSON.parse(await readFile('.tools/refinement-ui-test/fixture.json','utf8'));
    const pattern=join(profile,'experimental.xy');
    const contents=fixture.points.map(p=>p.join(' ')).join('\n');
    await writeFile(pattern,contents);
    await run.main(`__smoke.electron.dialog.showOpenDialog=async()=>({canceled:false,filePaths:[${JSON.stringify(pattern)}]});true`);
    const experimental=await run.ui('window.cifApi.importExperimental()');
    for(const method of ['lebail','pawley','rietveld']) {
      const settings={method,spaceGroup:'F m -3 m',cell:[5.645,5.645,5.645,90,90,90],wavelength:1.5406,range:[10,79.96],geometry:'debye_scherrer',radius:null,polarization:.5,zero:0,profile:{u:0,v:0,w:.01,x:.01,y:0},shape:'tchz_pv',backgroundTerms:3,maxIterations:100,maxPasses:8,extractionCycles:10,refineCell:true,refineProfile:true,refineZero:false,refineCoordinates:false,refineBiso:false,refineOccupancy:false,parameterEdits:{}};
      const request={entryId:entry.id,experimentalId:experimental.id,settings};
      const fit=await run.ui(`window.cifApi.runRefinement(${JSON.stringify(request)})`);
      assert.ok(fit.rwp<.1,`Packaged ${method}: Rwp ${fit.rwp}`);
      assert.equal(fit.outputFolder,profile);
      assert.ok(fit.files.some(f=>f.endsWith('.checkpoint.json')));
      console.log('Packaged '+method+' passed: Rwp '+fit.rwp);
    }
    assert.equal(await readFile(pattern,'utf8'),contents);
  }
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
