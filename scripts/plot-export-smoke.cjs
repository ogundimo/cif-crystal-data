const assert=require('node:assert/strict');
const {app,BrowserWindow,dialog,screen}=require('electron');
const {mkdirSync,writeFileSync,readFileSync,existsSync}=require('node:fs');
const {join,resolve}=require('node:path');
const {pathToFileURL}=require('node:url');
const root=resolve(__dirname,'..'),folder=join(root,'.tools','plot-export-test');mkdirSync(folder,{recursive:true});
app.setAppPath(root);app.setPath('userData',join(folder,'profile-'+Date.now()));app.commandLine.appendSwitch('disable-gpu');
let savePath,cancel=false,lastDefaultPath;dialog.showSaveDialog=async(...args)=>{
 const options=args.at(-1);lastDefaultPath=options.defaultPath;assert.deepEqual(options.filters.flatMap(f=>f.extensions).sort(),['csv','jpeg','jpg','pdf','png','svg','tif','tiff']);
 return {canceled:cancel,filePath:savePath};
};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function wait(win,expression){for(let i=0;i<200;i++){if(await win.webContents.executeJavaScript(expression))return;await pause(50);}throw Error('Timeout: '+expression);}
(async()=>{
 await import(pathToFileURL(join(root,'dist-electron/main/index.js')).href);await app.whenReady();while(!BrowserWindow.getAllWindows().length)await pause(50);
 const main=BrowserWindow.getAllWindows()[0];await wait(main,'Boolean(window.cifApi)');
 const style=(color,mode='line')=>({color,mode,width:1.5,size:2.7,legend:true,visible:true});
 const design={width:8,height:4,dpi:300,format:'png',fontSize:12,title:'Refined PXRD',xLabel:'2θ (degrees)',yLabel:'Intensity (input units)',legend:{x:.65,y:.07},curves:{observed:style('#1a1a1a','scatter'),calculated:style('#ff7f0e'),background:style('#b5793a'),difference:style('#737373'),reflections:style('#1a1a1a','ticks')}};
 const profile=Array.from({length:1001},(_,i)=>{const x=10+i*.07,y=30+300*Math.exp(-(((x-30)/.35)**2))+180*Math.exp(-(((x-55)/.6)**2)),obs=y+3*Math.sin(i);return[x,obs,y,30,obs-y];});
 const snapshot={chemicalFormula:"NaCl",refinementMethod:"lebail",design,frame:{profile,range:[10,80],ticks:{phase:[30,55]},rwp:1.2},view:{x:[10,80],y:[0,350],difference:[-5,5]}};
 await main.webContents.executeJavaScript(`window.cifApi.openPlotExport(${JSON.stringify(snapshot)})`);
 const win=BrowserWindow.getAllWindows().find(w=>w!==main);await wait(win,'!!document.querySelector("[data-legend]")');
 const evaluate=code=>win.webContents.executeJavaScript(code);
 const exportDefaults=await evaluate('window.cifApi.getPlotExport()');
 assert.equal(exportDefaults.design.width,5);assert.equal(exportDefaults.design.height,5);assert.equal(exportDefaults.design.dpi,600);assert.equal(exportDefaults.design.showYNumbers,false);assert.equal(exportDefaults.design.curves.background.visible,false);
 await evaluate(`Array.from(document.querySelectorAll('fieldset')).find(f=>f.querySelector('legend')?.textContent==='Background').querySelector('input[type=checkbox]').click()`);await pause(100);
 assert.ok(await evaluate("document.querySelector('[data-statistics]').textContent.includes('Rwp = 1.2%')"));
 const statsBefore=await evaluate("document.querySelector('[data-statistics]').getAttribute('transform')");
 await evaluate(`(()=>{const g=document.querySelector('[data-statistics]'),r=g.getBoundingClientRect(),root=g.closest('[data-testid]');g.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:1,clientX:r.x+10,clientY:r.y+10}));root.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerId:1,clientX:r.x-40,clientY:r.y+30}));root.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:1}));})()`);await pause(100);
 assert.notEqual(await evaluate("document.querySelector('[data-statistics]').getAttribute('transform')"),statsBefore);
 const initial=await evaluate('document.querySelector("svg").outerHTML');
 await evaluate(`document.querySelector('svg').dispatchEvent(new WheelEvent('wheel',{bubbles:true,cancelable:true,deltaY:-100,clientX:900,clientY:250}))`);await pause(100);
 assert.equal(await evaluate('document.querySelector("svg").outerHTML'),initial,'Export wheel cannot zoom');
 await evaluate(`(()=>{const svg=document.querySelector('svg'),root=svg.closest('[data-testid]');svg.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:1,clientX:900,clientY:250}));root.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerId:1,clientX:950,clientY:290}));root.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:1}));svg.dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));})()`);await pause(100);
 assert.equal(await evaluate('document.querySelector("svg").outerHTML'),initial,'Export plot cannot pan or double-click zoom');
 const area=screen.getDisplayMatching(win.getBounds()).workArea;
 const within=()=>{const b=win.getBounds();assert.ok(b.x>=area.x&&b.y>=area.y&&b.x+b.width<=area.x+area.width&&b.y+b.height<=area.y+area.height,JSON.stringify({b,area}));};
 within();win.setSize(area.width+500,area.height+500);await pause(100);within();
 win.setSize(Math.min(1000,area.width),Math.min(700,area.height));await pause(100);within();
 assert.equal(await evaluate('document.documentElement.scrollHeight>innerHeight||document.documentElement.scrollWidth>innerWidth'),false,'Editor fits resized window');
 assert.deepEqual(await evaluate(`Array.from(document.querySelectorAll('[data-x-tick] text')).map(t=>t.textContent)`),['10','20','30','40','50','60','70','80']);
 const inputValue=async(label,value)=>{await evaluate(`(()=>{const input=document.querySelector('[aria-label="${label}"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'${value}');input.dispatchEvent(new Event('input',{bubbles:true}));})()`);await pause(100);};
 await inputValue('Major interval (°)',20);await inputValue('Labels between majors',1);
 assert.deepEqual(await evaluate(`Array.from(document.querySelectorAll('[data-x-tick="major"] text')).map(t=>t.textContent)`),['20','40','60','80']);
 assert.deepEqual(await evaluate(`Array.from(document.querySelectorAll('[data-x-tick="intermediate"] text')).map(t=>t.textContent)`),['10','30','50','70']);
 for(const [width,height] of [[1400,850],[1000,700],[800,500]]) {
    win.setSize(Math.min(width,area.width),Math.min(height,area.height));await pause(200);
    for(const tab of ['Size & file','Axes','Fonts','Ticks','Curves','Legend','Statistics']) {
      await evaluate(`document.getElementById('export-tab-${tab}').click()`);await pause(50);
      const layout=await evaluate(`(()=>{const controls=document.querySelector('.export-settings-body');const save=Array.from(document.querySelectorAll('button')).find(b=>b.textContent.startsWith('Save plot'));return {page:document.documentElement.scrollHeight<=innerHeight&&document.documentElement.scrollWidth<=innerWidth,panel:controls.scrollHeight<=controls.clientHeight,save:save.getBoundingClientRect().bottom<=innerHeight};})()`);
      assert.deepEqual(layout,{page:true,panel:true,save:true},width+'x'+height+' '+tab);
    }
  }
  win.setSize(Math.min(1000,area.width),Math.min(700,area.height));await pause(200);
  await evaluate("document.getElementById('export-tab-Size & file').click()");
  const stage=await evaluate(`(()=>{const r=document.querySelector('.plot-export-stage').getBoundingClientRect();return [r.width,r.height]})()`);
 await inputValue('Width (inches)',4);await inputValue('Height (inches)',12);
 assert.deepEqual(await evaluate(`(()=>{const r=document.querySelector('.plot-export-stage').getBoundingClientRect();return [r.width,r.height]})()`),stage,'Aspect-ratio changes do not resize preview area');
 await inputValue('Width (inches)',8);await inputValue('Height (inches)',4);
 await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Full pattern').click()`);await pause(100);
 const oldLegend=await evaluate('document.querySelector("[data-legend]").getAttribute("transform")');
 await evaluate(`(()=>{const g=document.querySelector('[data-legend]'),r=g.getBoundingClientRect(),root=g.closest('[data-testid]');g.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:1,clientX:r.x+10,clientY:r.y+10}));root.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerId:1,clientX:r.x-70,clientY:r.y+50}));root.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:1}));})()`);await pause(100);
 assert.notEqual(await evaluate('document.querySelector("[data-legend]").getAttribute("transform")'),oldLegend,'Whole legend moves');
 await evaluate(`Array.from(document.querySelectorAll('details label')).find(l=>l.textContent.includes('Background')).querySelector('input').click()`);await pause(100);
 assert.equal(await evaluate(`document.querySelector('[data-legend]').textContent.includes('Background')`),false);
 assert.equal(await evaluate(`!!document.querySelector('[data-curve=background]')`),true);
 await evaluate(`Array.from(document.querySelectorAll('details label')).find(l=>l.textContent.includes('Background')).querySelector('input').click()`);await pause(100);
 assert.equal(await evaluate(`document.querySelector('[data-legend]').textContent.includes('Background')`),true);
 await evaluate(`(()=>{const s=document.querySelector('[aria-label="calculated style"]');s.value='scatter';s.dispatchEvent(new Event('change',{bubbles:true}));})()`);await pause(100);
 assert.equal(await evaluate(`!!document.querySelector('[data-curve=calculated] circle')`),true);
 writeFileSync(join(folder,'export-window.png'),(await win.webContents.capturePage()).toPNG());
 // Save the actual edited UI state, not only an IPC fixture.
 savePath=join(folder,'custom-ticks.svg');
 await evaluate(`(()=>{const select=document.querySelector('[aria-label="Export format"]');select.value='svg';select.dispatchEvent(new Event('change',{bubbles:true}));})()`);await pause(100);
 await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Save plot…').click()`);
 await wait(win,`document.querySelector('[role=status]')?.textContent.includes('custom-ticks.svg')`);
 const customized=readFileSync(savePath,'utf8');
 assert.equal((customized.match(/data-x-tick="major"/g)||[]).length,4);
 assert.equal((customized.match(/data-x-tick="intermediate"/g)||[]).length,4);
 assert.ok(customized.includes('width="8in" height="4in"'));
 for(const format of ['png','jpg','tiff','svg','pdf']){savePath=join(folder,'plot.'+format);const chosen={...design,format:'png'};const saved=await evaluate(`window.cifApi.savePlotExport(${JSON.stringify(chosen)},${JSON.stringify(snapshot.view)})`);assert.equal(saved,savePath);assert.ok(existsSync(savePath));const bytes=readFileSync(savePath);assert.ok(bytes.length>1000);const signature={png:[137,80,78,71],jpg:[255,216],tiff:[73,73,42,0],svg:[60,115,118,103],pdf:[37,80,68,70]}[format];assert.deepEqual([...bytes.subarray(0,signature.length)],signature);console.log(format+' selected from Save dialog while editor stays on PNG: passed');}
 savePath=join(folder,'NaCl_LeBail_Result.csv');
 await evaluate(`(()=>{const select=document.querySelector('[aria-label="Export format"]');select.value='csv';select.dispatchEvent(new Event('change',{bubbles:true}));})()`);await pause(100);
 await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.startsWith('Save plot')).click()`);
 await wait(win,`document.querySelector('[role=status]')?.textContent.includes('NaCl_LeBail_Result.csv')`);
 assert.ok(lastDefaultPath.endsWith('NaCl_LeBail_Result.csv'));
 const csv=readFileSync(savePath,'utf8').trimEnd().split('\r\n');assert.equal(csv.length,1002);
 assert.equal(csv[0],'2theta,Experimental,Calculated,Difference,Background,Bragg Refelctions');
 assert.deepEqual(csv[1].split(',').map(Number),[...profile[0].slice(0,3),profile[0][4],profile[0][3],30]);
 console.log('CSV data, exact column order and formula/method filename passed');
 cancel=true;assert.equal(await evaluate(`window.cifApi.savePlotExport(${JSON.stringify(design)},${JSON.stringify(snapshot.view)})`),null);
 await assert.rejects(evaluate(`window.cifApi.savePlotExport(${JSON.stringify({...design,dpi:1200,width:24,height:18})},${JSON.stringify(snapshot.view)})`),/megapixels/);
 console.log('Fixed export preview, screen bounds, tick controls, aspect-ratio changes, legend drag/hide/restore, styles and all exports passed.');app.exit(0);
})().catch(e=>{console.error(e);app.exit(1);});
