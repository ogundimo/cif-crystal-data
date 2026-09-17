const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync } = require('node:fs');
const { cpus, release } = require('node:os');
module.exports = async function(window,testUrl) {
  const ui = expression=>window.webContents.executeJavaScript(expression);
  const wait = async expression=> {
    for(let i=0;i<300;i++) { if(await ui(expression)) return; await new Promise(r=>setTimeout(r,50)); }
    throw new Error('PXRD UI timeout: '+expression+'\n'+await ui('document.body.innerText'));
  };
  await window.loadURL(testUrl+'?pxrd-regression');
  await wait("!!document.querySelector('[data-role=pxrd-profile]')");
  assert.match(await ui("document.querySelector('[data-testid=pxrd-diagnostics]').textContent"),/Neutral atoms/);
  // A late data response for a prior selection must never replace this one.
  await ui(`window.originalInput=window.cifApi.getDiffractionInput;
    window.cifApi.getDiffractionInput=id=>id===2?new Promise(resolve=>window.lateInput=resolve):window.originalInput(id);
    window.pxrdHarness.setEntry({...window.pxrdHarness.entry,id:2});`);
  await wait('!!window.lateInput');
  assert.equal(await ui("!!document.querySelector('[data-role=pxrd-profile]')"),false);
  await ui('window.pxrdHarness.setEntry({...window.pxrdHarness.entry,id:3});');
  await wait("!!document.querySelector('[data-role=pxrd-profile]')");
  const path=await ui("document.querySelector('[data-role=pxrd-profile]').getAttribute('d')");
  await ui('window.lateInput({atomSites:[],symmetryOperations:[]});');
  await new Promise(r=>setTimeout(r,100));
  assert.equal(await ui("document.querySelector('[data-role=pxrd-profile]').getAttribute('d')"),path);
  await ui("window.cifApi.getDiffractionInput=async()=>{throw new Error('unavailable')}; window.pxrdHarness.setEntry({...window.pxrdHarness.entry,id:4});");
  await wait("!!document.querySelector('[role=alert]')");
  assert.equal(await ui("!!document.querySelector('[data-role=pxrd-profile]')"),false);
  await ui("window.cifApi.getDiffractionInput=window.originalInput; [...document.querySelectorAll('button')].find(b=>b.textContent==='Retry').click();");
  await wait("!!document.querySelector('[data-role=pxrd-profile]')");
  // Actual worker failure produces the same recoverable UI.
  await ui("window.RealWorker=window.Worker; window.Worker=class {constructor(){throw new Error('injected')}}; window.pxrdHarness.setEntry({...window.pxrdHarness.entry,id:5});");
  await wait("!!document.querySelector('[role=alert]')");
  await ui("window.Worker=window.RealWorker; [...document.querySelectorAll('button')].find(b=>b.textContent==='Retry').click();");
  await wait("!!document.querySelector('[data-role=pxrd-profile]')");
  // Rapid wavelength edits: the final result and exported metadata must agree.
  await ui(`window.cifApi.exportPxrd=async(id,text)=>{window.exportedPattern={id,text};return {exported:true}};
    window.setWavelength=value=>{const input=document.querySelector('[data-testid=pxrd-wavelength-input]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,String(value));input.dispatchEvent(new Event('input',{bubbles:true}));};
    window.setWavelength(1);`);
  await ui('window.setWavelength(2);');
  await ui('window.setWavelength(1.2);');
  await wait("!!document.querySelector('[data-role=pxrd-profile]')");
  await ui("[...document.querySelectorAll('button')].find(b=>b.textContent==='Export .xy').click()");
  await wait('!!window.exportedPattern');
  const exported=await ui('window.exportedPattern');
  assert.equal(exported.id,5); assert.match(exported.text,/wavelength_A=1.2;/);
  await ui('window.pxrdHarness.setEntry({...window.pxrdHarness.entry,cell_a_angstrom:60});');
  await wait("document.querySelector('[data-calculation-status]')?.dataset.calculationStatus==='incomplete'");
  assert.match(await ui("document.querySelector('[data-testid=pxrd-diagnostics] summary').textContent"),/Incomplete pattern/);
  await ui('window.pxrdHarness.setEntry({...window.pxrdHarness.entry,radiation_wavelength_angstrom:null});');
  await wait("document.querySelector('[data-testid=pxrd-diagnostics]')?.textContent.includes('CIF wavelength missing')");
  // A completed export for an older selection must not label the current one.
  await ui("window.cifApi.exportPxrd=()=>new Promise(resolve=>window.finishOldExport=resolve); [...document.querySelectorAll('button')].find(b=>b.textContent==='Export .xy').click();");
  await wait('!!window.finishOldExport');
  await ui('window.pxrdHarness.setEntry({...window.pxrdHarness.entry,id:6,cell_a_angstrom:5.64,radiation_wavelength_angstrom:1.5406});');
  await wait("document.querySelector('[data-calculation-status]')?.dataset.calculationStatus==='complete'");
  await ui("window.finishOldExport({exported:true,fileName:'older-selection.xy'});");
  await new Promise(resolve=>setTimeout(resolve,50));
  assert.equal(await ui("document.querySelector('[data-testid=pxrd-toolbar]').textContent.includes('older-selection')"),false);

  const measurements=await ui(`(async()=> {
    const {calculatePxrd}=await import('/src/pxrd.ts');
    const {startPxrdTask}=await import('/src/pxrdTask.ts');
    const cases=[];
    for(const [name,length,count] of [['ordinary',5.64,8],['demanding',24,256],['large-cell',60,2]]) {
      const entry={...window.pxrdHarness.entry,cell_a_angstrom:length,cell_b_angstrom:length,cell_c_angstrom:length};
      const input={symmetryOperations:[],atomSites:Array.from({length:count},(_,i)=>({type_symbol:i%2?'O':'C',fract_x:(i*.137)%1,fract_y:(i*.237)%1,fract_z:(i*.317)%1,occupancy:1,b_iso_or_equiv:.5,u_iso_or_equiv:null}))};
      const samples=[];
      for(let repeat=0;repeat<3;repeat++) {
        let start=performance.now();
        const delayed=new Promise(resolve=>setTimeout(()=>resolve(performance.now()-start),0));
        const synchronous=calculatePxrd(entry,input.atomSites,[],1.5406);
        const synchronousMs=performance.now()-start;
        const synchronousDelayMs=await delayed;
        let previous=performance.now(),maximumDelay=0,ticks=0;
        const timer=setInterval(()=>{const now=performance.now();maximumDelay=Math.max(maximumDelay,now-previous-8);previous=now;ticks++;},8);
        start=performance.now();
        const response=await new Promise((resolve,reject)=>startPxrdTask({entry,input,wavelength:1.5406,fwhm:.1},resolve,reject));
        const elapsed=performance.now()-start;clearInterval(timer);
        if(JSON.stringify(synchronous)!==JSON.stringify(response.result)) throw new Error('Worker changed numerical result');
        samples.push({synchronousMs,synchronousDelayMs,workerElapsedMs:elapsed,workerCalculationMs:response.calculationMs,maximumTimerDelayMs:maximumDelay,ticks});
      }
      cases.push({name,cellAngstrom:length,atoms:count,symmetry:1,samples});
    }
    return {cases,memory:performance.memory?{usedJSHeapSize:performance.memory.usedJSHeapSize,totalJSHeapSize:performance.memory.totalJSHeapSize}:null};
  })()`);
  mkdirSync('reports/scientific',{recursive:true});
  writeFileSync('reports/scientific/renderer-performance.json',JSON.stringify({cpu:cpus()[0]?.model,os:release(),electron:process.versions.electron,
    context:'Electron renderer; hidden test window; GPU disabled; event-loop timers, not physical input latency',...measurements},null,2));
  for(const fixture of measurements.cases) for(const sample of fixture.samples) assert.ok(sample.maximumTimerDelayMs<100,`${fixture.name} renderer delay ${sample.maximumTimerDelayMs} ms`);
  console.log('✓ PXRD diagnostics, source/worker failure retry, stale data, wavelength/export and measured renderer responsiveness');
};
