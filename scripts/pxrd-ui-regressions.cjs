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
  assert.equal(await ui("document.querySelector('[data-testid=pxrd-wavelength-input]').value"),'1.5406');
  assert.deepEqual(await ui("[...document.querySelector('[data-testid=pxrd-wavelength-input]').options].map(o=>o.textContent)"),['Cu (1.5406 Å)','Mo (0.7107 Å)','Co (1.7902 Å)','Ag (0.5609 Å)']);
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
    window.setWavelength=value=>{const input=document.querySelector('[data-testid=pxrd-wavelength-input]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(input,String(value));input.dispatchEvent(new Event('change',{bubbles:true}));};
    window.setWavelength(0.7107);`);
  await ui('window.setWavelength(1.7902);');
  await ui('window.setWavelength(0.5609);');
  await wait("!!document.querySelector('[data-role=pxrd-profile]')");
  await ui("[...document.querySelectorAll('button')].find(b=>b.textContent==='Export .xy').click()");
  await wait('!!window.exportedPattern');
  const exported=await ui('window.exportedPattern');
  assert.equal(exported.id,5); assert.match(exported.text,/wavelength_A=0.5609;/);
  const importXY = async (text, name) => {
    await ui(`(()=>{const input=document.querySelector('input[type=file]');const files=new DataTransfer();files.items.add(new File([${JSON.stringify(text)}],${JSON.stringify(name)},{type:'text/plain'}));input.files=files.files;input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  };
  await importXY('# synthetic\n0 1\n5 5\n40 10\n80 2\n90 1','personal.xy');
  await wait("!!document.querySelector('[data-role=pxrd-imported-profile]')");
  // Error feedback can resize the plot. Compare the trace's relative geometry,
  // not pixel coordinates, to verify preservation across that layout change.
  const overlayGeometry = async () => ui(`(()=>{
    const points=[...document.querySelector('[data-role=pxrd-imported-profile]').getAttribute('d').matchAll(/[ML](-?[\\d.]+),(-?[\\d.]+)/g)].map(match=>[Number(match[1]),Number(match[2])]);
    const minimum=[0,1].map(axis=>Math.min(...points.map(point=>point[axis])));
    const range=[0,1].map(axis=>Math.max(...points.map(point=>point[axis]))-minimum[axis]);
    return points.map(point=>point.map((value,axis)=>Math.round((value-minimum[axis])/range[axis]*1000)/1000));
  })()`);
  const overlay = await overlayGeometry();
  window.showInactive();
  await new Promise(resolve=>setTimeout(resolve,300));
  mkdirSync('reports/viewer',{recursive:true});
  writeFileSync('reports/viewer/comparison.png',(await window.webContents.capturePage()).toPNG());
  window.hide();
  assert.equal(await ui("document.querySelector('[data-role=pxrd-imported-profile]').getAttribute('stroke')"),'#d00000');
  // Cancel (no files) and an invalid replacement preserve the loaded pattern.
  await ui("document.querySelector('input[type=file]').dispatchEvent(new Event('change',{bubbles:true}));");
  await importXY('5 -1\n6 2','invalid.xy');
  await wait("document.querySelector('[role=alert]')?.textContent.includes('negative')");
  assert.deepEqual(await overlayGeometry(),overlay);
  assert.equal(await ui("document.body.textContent.includes('personal.xy')"),true);
  for (const wavelength of [1.5406,0.7107,1.7902,0.5609]) {
    await ui(`window.exportedPattern=null;window.setWavelength(${wavelength});`);
    await wait("!!document.querySelector('[data-role=pxrd-profile]')");
    assert.deepEqual(await overlayGeometry(),overlay);
    await ui("[...document.querySelectorAll('button')].find(b=>b.textContent==='Export .xy').click()");
    await wait('!!window.exportedPattern');
    assert.ok((await ui('window.exportedPattern.text')).includes('wavelength_A='+wavelength+';'));
  }
  // The app's own exported header format is accepted unchanged as an overlay.
  await importXY(exported.text,'export-roundtrip.xy');
  await wait("document.body.textContent.includes('export-roundtrip.xy')");
  await importXY('100 1\n110 2','outside.xy');
  await wait("document.body.textContent.includes('no overlap')");
  await ui('window.pxrdHarness.setEntry({...window.pxrdHarness.entry,id:50,radiation_wavelength_angstrom:5});');
  await wait("!!document.querySelector('[data-role=pxrd-profile]')");
  assert.equal(await ui("document.querySelector('[data-testid=pxrd-wavelength-input]').value"),'0.5609');
  assert.equal(await ui("document.body.textContent.includes('outside.xy')"),true);
  await ui('window.pxrdHarness.setMounted(false);');
  await wait("!document.querySelector('[data-testid=pxrd-pattern]')");
  await ui('window.pxrdHarness.setMounted(true);');
  await wait("!!document.querySelector('[data-role=pxrd-imported-profile]')");
  assert.equal(await ui("document.querySelector('[data-testid=pxrd-wavelength-input]').value"),'0.5609');
  assert.equal(await ui("document.body.textContent.includes('outside.xy')"),true);
  window.setContentSize(650,650); await new Promise(resolve=>setTimeout(resolve,100));
  assert.equal(await ui("!!document.querySelector('[data-role=pxrd-imported-profile]')"),true);
  window.setContentSize(1200,800);
  await ui("[...document.querySelectorAll('button')].find(b=>b.textContent==='Clear imported pattern').click()");
  assert.equal(await ui("!!document.querySelector('[data-role=pxrd-imported-profile]')"),false);
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
  // A refreshed record can preserve its ID while replacing its atomic data.
  await ui('window.cifApi.getDiffractionInput=async()=>({atomSites:[],symmetryOperations:[]}); window.pxrdHarness.setEntry({...window.pxrdHarness.entry});');
  await wait("document.querySelector('[data-calculation-status]')?.dataset.calculationStatus==='unsupported'");
  assert.equal(await ui("!!document.querySelector('[data-role=pxrd-profile]')"),false);
  await ui('window.cifApi.getDiffractionInput=window.originalInput; window.pxrdHarness.setEntry({...window.pxrdHarness.entry});');
  await wait("document.querySelector('[data-calculation-status]')?.dataset.calculationStatus==='complete'");

  // Keep the established responsiveness fixtures at their specified Cu wavelength.
  // The preceding comparison checks deliberately leave the session on Ag.
  await ui('window.setWavelength(1.5406);');
  await wait("!!document.querySelector('[data-role=pxrd-profile]')");
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
  // Also include the real React panel's result commit, not only worker transport.
  const panelSamples=await ui(`(async()=> {
    const samples=[];
    for(const [name,length,count,id] of [['ordinary',5.64,8,101],['demanding',24,256,102],['large-cell',60,2,103]]) {
      window.cifApi.getDiffractionInput=async()=>({symmetryOperations:[],atomSites:Array.from({length:count},(_,i)=>({type_symbol:i%2?'O':'C',fract_x:(i*.137)%1,fract_y:(i*.237)%1,fract_z:(i*.317)%1,occupancy:1,b_iso_or_equiv:.5,u_iso_or_equiv:null}))});
      const start=performance.now();let previous=start,maximumDelay=0,ticks=0;
      const timer=setInterval(()=>{const now=performance.now();maximumDelay=Math.max(maximumDelay,now-previous-8);previous=now;ticks++;},8);
      window.pxrdHarness.setEntry({...window.pxrdHarness.entry,id,cell_a_angstrom:length,cell_b_angstrom:length,cell_c_angstrom:length});
      try {
        while(window.pxrdHarness.entry.id!==id || !document.querySelector('[data-role=pxrd-profile]')) {
          if(performance.now()-start>15000) throw new Error('Panel calculation timed out');
          await new Promise(resolve=>setTimeout(resolve,10));
        }
        await new Promise(resolve=>setTimeout(resolve,100));
        samples.push({name,atoms:count,cellAngstrom:length,elapsedThroughCommitMs:performance.now()-start-100,maximumTimerDelayMs:maximumDelay,ticks});
      } finally { clearInterval(timer); }
    }
    return samples;
  })()`);
  measurements.panelSamples=panelSamples;
  mkdirSync('reports/scientific',{recursive:true});
  writeFileSync('reports/scientific/renderer-performance.json',JSON.stringify({cpu:cpus()[0]?.model,os:release(),electron:process.versions.electron,
    context:'Electron renderer; hidden test window; GPU disabled; event-loop timers, not physical input latency',...measurements},null,2));
  for(const fixture of measurements.cases) for(const sample of fixture.samples) assert.ok(sample.maximumTimerDelayMs<100,`${fixture.name} renderer delay ${sample.maximumTimerDelayMs} ms`);
  for(const sample of panelSamples) assert.ok(sample.maximumTimerDelayMs<100,`${sample.name} panel commit delay ${sample.maximumTimerDelayMs} ms`);
  console.log('✓ PXRD diagnostics, source/worker failure retry, stale data, wavelength/export and measured renderer responsiveness');
};
