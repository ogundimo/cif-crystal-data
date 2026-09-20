const assert = require('node:assert/strict');
const {app, BrowserWindow, dialog, shell, screen} = require('electron');
const {readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync} = require('node:fs');
const {join, resolve} = require('node:path');
const {pathToFileURL} = require('node:url');
const {spawnSync} = require('node:child_process');
const root = resolve(__dirname, '..');
const defaultsOnly = process.argv.includes('--defaults-only');
let openedManual;
if (defaultsOnly) shell.openPath = async path => { openedManual = path; return ''; };
const folder = join(root,'.tools','refinement-ui-test');
mkdirSync(folder,{recursive:true});
app.setAppPath(root);
app.setPath('userData',join(folder,'user-data-'+Date.now()));
app.commandLine.appendSwitch('disable-gpu');
const fixturePath=join(folder,'fixture.json');
const generated=spawnSync(join(root,'.tools/rietx-runtime/python/python.exe'),['-s',join(root,'engine/test_refinement.py'),'--fixture',fixturePath],{windowsHide:true,encoding:'utf8'});
if(generated.status!==0)throw new Error(generated.stderr);
const fixture = JSON.parse(readFileSync(fixturePath,'utf8'));
const cifFolder=join(folder,'cifs');mkdirSync(cifFolder,{recursive:true});
writeFileSync(join(cifFolder,'nacl.cif'),fixture.cifText);
const pattern=join(folder,'experimental.xy');
const original=fixture.points.map(p=>p.join(' ')).join('\n');
writeFileSync(pattern,original);
let selection=cifFolder;
dialog.showOpenDialog=async()=>({canceled:false,filePaths:[selection]});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(win,expression,timeout=90000) {
  const start=Date.now();while(Date.now()-start<timeout){if(await win.webContents.executeJavaScript(expression))return;await pause(100);}throw new Error('Timeout: '+expression);
}
(async()=>{
  await import(pathToFileURL(join(root,'dist-electron/main/index.js')).href);
  await app.whenReady();
  while(!BrowserWindow.getAllWindows().length)await pause(100);
  const main=BrowserWindow.getAllWindows()[0];await wait(main,'Boolean(window.cifApi)');
  if (defaultsOnly) {
    await wait(main,'!!document.querySelector("#quick-search-space-group-number")');
    await main.webContents.executeJavaScript('document.querySelector("button[aria-label=Close]").click()');
    await main.webContents.executeJavaScript('Array.from(document.querySelectorAll("button")).find(b=>b.textContent.trim()==="▤ Manual").click()');
    await pause(200);
    assert.equal(openedManual, join(root, 'docs', 'CIF Crystal Data User Manual.pdf'));
    assert.equal(readFileSync(openedManual).subarray(0,5).toString(), '%PDF-');
  }
  await main.webContents.executeJavaScript('window.cifApi.importCifFolder()');
  const entries=await main.webContents.executeJavaScript('window.cifApi.getAllEntries()');
  assert.equal(entries.length,1);
  if(process.argv.includes('--missing-cif')) unlinkSync(join(cifFolder,'nacl.cif'));
  selection=pattern;
  const experimental=await main.webContents.executeJavaScript('window.cifApi.importExperimental()');
  for(const method of ['lebail','pawley','rietveld']) {
    await main.webContents.executeJavaScript(`window.cifApi.openRefinementWindow(${entries[0].id},${JSON.stringify(method)},${JSON.stringify(experimental.id)},1.5406)`);
    const win=BrowserWindow.getAllWindows().find(w=>w!==main);
    await wait(win,'!!document.querySelector("form")');
    if (defaultsOnly) {
      const area=screen.getDisplayMatching(win.getBounds()).workArea;
      const checkBounds=()=>{const b=win.getBounds();assert.ok(b.x>=area.x&&b.y>=area.y&&b.x+b.width<=area.x+area.width&&b.y+b.height<=area.y+area.height,method+' stays within work area');};
      checkBounds();win.setSize(area.width+500,area.height+500);await pause(100);checkBounds();
      const values = await win.webContents.executeJavaScript(`(() => {
        const geometry = Array.from(document.querySelectorAll('select')).find(s=>s.options[0].textContent==='Select geometry');
        const radius = Array.from(document.querySelectorAll('label')).find(l=>l.textContent.includes('Radius (mm)')).querySelector('input');
        return {geometry: geometry.value, radius: radius.value, editable: !geometry.disabled && !radius.disabled && !radius.readOnly};
      })()`);
      assert.deepEqual(values, {geometry:'bragg_brentano',radius:'250',editable:true});
      await wait(win,'!!document.querySelector("#refinement-plot svg")');
      const initialSvg=await win.webContents.executeJavaScript('document.querySelector("#refinement-plot svg").outerHTML');
      const yLabels=`Array.from(document.querySelectorAll('#refinement-plot svg text')).filter(t=>!t.closest('[data-x-tick]')).map(t=>[t.textContent,t.getAttribute('y')])`;
      const beforeY=await win.webContents.executeJavaScript(yLabels);
      const wheel=async delta=>{await win.webContents.executeJavaScript(`(()=>{const svg=document.querySelector('#refinement-plot svg'),r=svg.getBoundingClientRect();svg.dispatchEvent(new WheelEvent('wheel',{bubbles:true,cancelable:true,deltaY:${delta},clientX:r.x+r.width/2,clientY:r.y+r.height*.8}));})()`);await pause(40);};
      for(let i=0;i<6;i++)await wheel(-150);
      assert.notEqual(await win.webContents.executeJavaScript('document.querySelector("#refinement-plot svg").outerHTML'),initialSvg);
      assert.deepEqual(await win.webContents.executeJavaScript(yLabels),beforeY,'Wheel over residual keeps both Y scales fixed');
      for(let i=0;i<20;i++)await wheel(150);
      assert.equal(await win.webContents.executeJavaScript('document.querySelector("#refinement-plot svg").outerHTML'),initialSvg,'Zoom-out stops exactly at original limits');
      for (const [width,height] of [[1400,850],[1000,700],[700,500]]) {
        win.setSize(Math.min(width,area.width),Math.min(height,area.height));await pause(250);
        for (const tab of ['Structure','Measurement','Profile','Parameters','Results']) {
          await win.webContents.executeJavaScript(`document.getElementById('tab-${tab}').click()`);
          const layout=await win.webContents.executeJavaScript(`(()=>{const a=document.querySelector('.refinement-controls').getBoundingClientRect(),b=document.querySelector('.refinement-chart').getBoundingClientRect();return {overflow:document.documentElement.scrollHeight>innerHeight||document.documentElement.scrollWidth>innerWidth,equal:Math.abs(a.height-b.height)<2,bottom:b.bottom<=innerHeight,wording:/live refinement|resume refinement/i.test(document.body.innerText),plot:document.querySelector('#refinement-plot svg').getBoundingClientRect().height>100};})()`);
          assert.deepEqual(layout,{overflow:false,equal:true,bottom:true,wording:false,plot:true},method+' '+width+'x'+height+' '+tab);
        }
      }
      if(method==='lebail'&&!process.argv.includes('--no-screenshots')) {
        win.setSize(Math.min(1400,area.width),Math.min(850,area.height));await pause(250);
        await win.webContents.executeJavaScript("document.getElementById('tab-Structure').click()");await pause(100);
        writeFileSync(join(folder,'compact-layout.png'),(await win.webContents.capturePage()).toPNG());
      }
      console.log(method+' editable geometry and radius defaults passed');
      win.close();await pause(100);continue;
    }
    await wait(win,'Array.from(document.querySelectorAll("button")).some(b=>b.textContent==="Start refinement"&&!b.disabled)');
    await win.webContents.executeJavaScript(`window.framesSeen=0;window.cifApi.onRefinementProgress(p=>{if(p.snapshot)window.framesSeen++});const s=Array.from(document.querySelectorAll('select')).find(s=>s.options[0].textContent==='Select geometry');s.value='debye_scherrer';s.dispatchEvent(new Event('change',{bubbles:true}));`);
    await pause(100);
    await win.webContents.executeJavaScript('document.querySelector("form").requestSubmit()');
    await wait(win,'!!document.querySelector("[role=alert]")||Array.from(document.querySelectorAll("button")).some(b=>b.textContent==="Refine")');
    const error=await win.webContents.executeJavaScript('document.querySelector("[role=alert]")?.textContent');
    assert.ok(!error,error);
    if(process.argv.includes('--missing-cif')) assert.ok(await win.webContents.executeJavaScript('document.body.textContent.includes("The original CIF file is unavailable")'));
    assert.ok(await win.webContents.executeJavaScript('window.framesSeen>1'));
    const metrics=await win.webContents.executeJavaScript(`(()=>{const svg=document.querySelector('[data-progress-count]');return {count:Number(svg.dataset.progressCount),rp:svg.querySelector('[data-progress-series=rp] polyline').getAttribute('points'),rwp:svg.querySelector('[data-progress-series=rwp] polyline').getAttribute('points'),gof:document.querySelector('[data-progress-gof]').textContent};})()`);
    assert.ok(metrics.count>1,'Solver iterations received');assert.ok(metrics.rp.length>0&&metrics.rwp.length>0);assert.match(metrics.gof,/GoF: [0-9]/);
    assert.ok(await win.webContents.executeJavaScript("!!document.querySelector('[data-progress-final]')"));
    const progressRange=await win.webContents.executeJavaScript("document.querySelector('[data-progress-range]').dataset.progressRange");
    await win.webContents.executeJavaScript(`(()=>{const svg=document.querySelector('[data-progress-range]'),r=svg.getBoundingClientRect();svg.dispatchEvent(new WheelEvent('wheel',{bubbles:true,cancelable:true,deltaY:-200,clientX:r.x+r.width*.7,clientY:r.y+r.height/2}));})()`);await pause(100);
    assert.notEqual(await win.webContents.executeJavaScript("document.querySelector('[data-progress-range]').dataset.progressRange"),progressRange);
    await win.webContents.executeJavaScript("document.querySelector('[data-progress-range]').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))");await pause(100);
    assert.equal(await win.webContents.executeJavaScript("document.querySelector('[data-progress-range]').dataset.progressRange"),progressRange);


    assert.equal(await win.webContents.executeJavaScript('document.documentElement.scrollWidth>innerWidth'),false,'Horizontal overflow');
    if(method==='lebail') {
      const checkpoint=readdirSync(folder).filter(f=>f.endsWith('.checkpoint.json')&&f.includes('_lebail_')).sort().at(-1);
      selection=join(folder,checkpoint);
      await win.webContents.executeJavaScript('Array.from(document.querySelectorAll("button")).find(b=>b.textContent==="Load checkpoint").click()');
      await wait(win,'document.querySelector("[role=status]").textContent.startsWith("Checkpoint loaded")');
      await win.webContents.executeJavaScript('document.querySelector("form").requestSubmit()');
      await wait(win,'document.querySelector("[role=status]").textContent.includes("Checkpoint saved")');
      assert.ok(!(await win.webContents.executeJavaScript('document.querySelector("[role=alert]")?.textContent')));
    }
    if (!process.argv.includes('--no-screenshots')) writeFileSync(join(folder,method+'.png'),(await win.webContents.capturePage()).toPNG());
    console.log(method+' full-window import / live fitting / output passed');
    win.close();await pause(100);
  }
  assert.equal(readFileSync(pattern,'utf8'),original);
  console.log('Experimental source preserved. Screenshots: '+folder);
  app.exit(0);
})().catch(e=>{console.error(e);app.exit(1);});
