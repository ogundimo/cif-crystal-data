import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
export async function launchPackaged({ exe, profile, corpus }) {
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
