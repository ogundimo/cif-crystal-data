import FitPlot from './RefinementPlot';
import RefinementProgressPlot from './RefinementProgressPlot';
import React, { useEffect, useState } from 'react';
import { METHOD_LABELS, XRAY_WAVELENGTHS, validateRefinementSettings, type RefinementSettings, type RefinementMethod, type ExperimentalPattern, type RefinementResult, type RefinementFrame, type RefinementMetric } from '../../../shared/refinement';

const cellKeys = ['a', 'b', 'c', 'alpha', 'beta', 'gamma'] as const;
const inputClass = 'h-8 w-full rounded border border-[#aeb8c2] bg-white px-2 text-sm disabled:bg-gray-100';
const tabs = ['Structure', 'Measurement', 'Profile', 'Parameters', 'Results'] as const;

export default function RefinementWindow() {
  const [source] = useState(()=>new URLSearchParams(location.search));
  const initial = (): RefinementSettings => ({method:(source.get('method')??'lebail') as RefinementMethod,spaceGroup:source.get('spaceGroup')??'',cell:cellKeys.map(k=>Number(source.get(k))||0) as RefinementSettings['cell'],wavelength:Number(source.get('wavelength'))||1.5406,range:[5,80],geometry:'bragg_brentano',radius:250,polarization:.5,zero:0,profile:{u:0,v:0,w:.01,x:.001,y:0},shape:'tchz_pv',backgroundTerms:3,maxIterations:100,maxPasses:8,extractionCycles:10,refineCell:true,refineProfile:true,refineZero:false,refineCoordinates:false,refineBiso:false,refineOccupancy:false,parameterEdits:{}});
  const [settings,setSettings] = useState(initial);
  const [experimental,setExperimental] = useState<ExperimentalPattern|null>(null);
  const [checkpoint,setCheckpoint] = useState<string>();
  const [result,setResult] = useState<RefinementResult|null>(null);
  const [metrics,setMetrics] = useState<RefinementMetric[]>([]);
  const [live,setLive] = useState<RefinementFrame>();
  const [busy,setBusy] = useState(false);
  const [importing,setImporting] = useState(false);
  const [error,setError] = useState('');
  const [message,setMessage] = useState('');
  const [engine,setEngine] = useState<{available:boolean;message?:string}>();
  const [tab,setTab] = useState<typeof tabs[number]>('Structure');
  const [dirty,setDirty] = useState(false);
  const set = <K extends keyof RefinementSettings>(k:K,v:RefinementSettings[K]) => {setSettings(s=>({...s,[k]:v}));setDirty(true);};
  function accept(pattern:ExperimentalPattern) {setMetrics([]);setExperimental(pattern);setSettings(s=>({...s,range:[Math.max(.001,pattern.points[0].twoTheta),Math.min(174.999,pattern.points.at(-1)!.twoTheta)]}));setResult(null);setLive(undefined);setCheckpoint(undefined);}
  useEffect(()=>{
    let active=true;
    window.cifApi.refinementEngineStatus().then(v=>{if(active)setEngine(v);}).catch(e=>setError(String(e)));
    const id=source.get('experimentalId');
    if(id)window.cifApi.getExperimental(id).then(p=>{if(active)accept(p);}).catch(e=>setError(String(e)));
    const dispose=window.cifApi.onRefinementProgress(p=>{setMessage(p.message);if(p.metric)setMetrics(rows=>[...rows,p.metric!]);if(p.snapshot)setLive(p.snapshot);});
    return ()=>{active=false;dispose();};
  },[source]);
  useEffect(()=>{document.title=METHOD_LABELS[settings.method]+' Refinement — CIF Crystal Data';},[settings.method]);
  async function importFile(checkpointFile=false) {
    setImporting(true);setError('');
    try {if(checkpointFile){const value=await window.cifApi.importRefinementCheckpoint();if(value){setMetrics([]);setExperimental(value.experimental);setSettings(value.settings);setCheckpoint(value.id);setResult(null);setLive(undefined);setDirty(false);setMessage('Checkpoint loaded. Resume directly or edit parameters first.');}}else{const value=await window.cifApi.importExperimental();if(value)accept(value);}}
    catch(e){setError(String(e));}finally{setImporting(false);}
  }
  async function fit(resume:boolean) {
    setError('');
    try {
      const checked=validateRefinementSettings(settings);
      if(!experimental)throw new Error('Experimental pattern is required.');
      setBusy(true);setLive(undefined);setMetrics([]);setMessage('Starting rietx. First use may compile numerical kernels…');
      const value=await window.cifApi.runRefinement({entryId:Number(source.get('entryId')),experimentalId:experimental.id,settings:checked,...(resume?{checkpointId:checkpoint}:{})});
      setResult(value);setLive(value);setSettings(value.settings);setCheckpoint(value.checkpointId);setDirty(false);
      setMessage(`${value.status}. Checkpoint saved; resume with the fitted state and any edited parameters.`);
    }catch(e){setError(String(e));setMessage('Run stopped. A saved checkpoint can be reopened using Load checkpoint.');}finally{setBusy(false);}
  }
  const numberField=(label:string,value:number|null,change:(v:number|null)=>void,required=true)=><label className="block space-y-1 text-xs"><span>{label}{required?' *':''}</span><input className={inputClass} type="number" step="any" required={required} value={value===null||Number.isNaN(value)?'':Number(value.toPrecision(10))} onChange={e=>change(e.target.value===''?null:e.target.valueAsNumber)}/></label>;
  const fallback:RefinementFrame|undefined=experimental?{range:[experimental.points[0].twoTheta,experimental.points.at(-1)!.twoTheta],profile:experimental.points.filter((_,i)=>i%Math.max(1,Math.ceil(experimental.points.length/2200))===0).map(p=>[p.twoTheta,p.intensity,0,0,0]),rwp:null,ticks:{}}:undefined;
  const frame=(busy?live??result:result)??live??fallback;
  return <main className="refinement-workspace bg-mica text-sm text-[#33475b]">
    <div className="refinement-upper"><section className="refinement-controls" aria-label="Refinement controls">
      <header className="refinement-heading"><h1 className="font-semibold">{METHOD_LABELS[settings.method]} Refinement</h1><span className="text-xs text-text-dim">{source.get('formula')} · rietx</span></header>
      <div className="refinement-import"><button className="btn-w32 px-2" disabled={busy||importing} onClick={()=>void importFile()}>Import experimental</button><button className="btn-w32 px-2" disabled={busy||importing} onClick={()=>void importFile(true)}>Load checkpoint</button><span className="truncate text-xs" title={experimental?.folder}>{experimental?.fileName??'Import an experimental pattern to begin'}</span></div>
      <form noValidate className="refinement-form" onSubmit={e=>{e.preventDefault();void fit(Boolean(checkpoint));}}>
        <div role="tablist" aria-label="Refinement settings" className="refinement-tabs">{tabs.map(name=><button type="button" role="tab" id={'tab-'+name} aria-controls={'panel-'+name} aria-selected={tab===name} key={name} onClick={()=>setTab(name)}>{name}{name==='Results'&&!!result?.warnings.length&&<span className="refinement-warning-count">{result.warnings.length}</span>}</button>)}<span className="ml-auto text-xs text-text-dim">* Required</span></div>
        <div className="refinement-tab-content">
          <fieldset disabled={busy||importing}>
            <div role="tabpanel" id="panel-Structure" aria-labelledby="tab-Structure" hidden={tab!=='Structure'}><div className="space-y-2"><label className="block space-y-1 text-xs"><span>Space group (Hermann–Mauguin symbol) *</span><input required className={inputClass} value={settings.spaceGroup} onChange={e=>set('spaceGroup',e.target.value)}/></label><div className="grid grid-cols-6 gap-2">{cellKeys.map((k,i)=><React.Fragment key={k}>{numberField(k+(i<3?' (Å)':' (°)'),settings.cell[i],v=>{const next=[...settings.cell] as RefinementSettings['cell'];next[i]=v??NaN;set('cell',next);})}</React.Fragment>)}</div><p className="text-xs text-text-dim">Cell must match space-group symmetry. Rietveld uses atom positions, occupancies and displacement parameters from the CIF.</p><button type="button" className="btn-w32 px-3 py-1" onClick={()=>{const s=initial();setSettings(v=>({...v,cell:s.cell,spaceGroup:s.spaceGroup}));setDirty(true);}}>Reset cell to selected CIF</button></div></div>
            <div role="tabpanel" id="panel-Measurement" aria-labelledby="tab-Measurement" hidden={tab!=='Measurement'}><div className="space-y-2"><div className="grid grid-cols-3 gap-2"><label className="block space-y-1 text-xs"><span>Wavelength *</span><select className={inputClass} value={settings.wavelength} onChange={e=>set('wavelength',Number(e.target.value))}>{XRAY_WAVELENGTHS.map(o=><option key={o.symbol} value={o.wavelength}>{o.symbol} ({o.wavelength.toFixed(4)} Å)</option>)}</select></label><label className="block space-y-1 text-xs"><span>Geometry *</span><select required className={inputClass} value={settings.geometry} onChange={e=>set('geometry',e.target.value as RefinementSettings['geometry'])}><option value="">Select geometry</option><option value="bragg_brentano">Bragg–Brentano (flat plate)</option><option value="debye_scherrer">Debye–Scherrer (capillary)</option></select></label>{numberField('Radius (mm)',settings.radius,v=>set('radius',v),settings.geometry==='bragg_brentano')}{numberField('Polarization (0–1)',settings.polarization,v=>set('polarization',v??NaN))}{numberField('Minimum 2θ (°)',settings.range[0],v=>set('range',[v??NaN,settings.range[1]]))}{numberField('Maximum 2θ (°)',settings.range[1],v=>set('range',[settings.range[0],v??NaN]))}</div><p className="text-xs text-text-dim">Polarization defaults to 0.5; verify for your optics. One emission line is modeled.</p></div></div>
            <div role="tabpanel" id="panel-Profile" aria-labelledby="tab-Profile" hidden={tab!=='Profile'}><div><div className="grid grid-cols-4 gap-2 lg:grid-cols-6">{(['u','v','w','x','y'] as const).map(k=><React.Fragment key={k}>{numberField('Profile '+k.toUpperCase(),settings.profile[k],v=>set('profile',{...settings.profile,[k]:v??NaN}))}</React.Fragment>)}{numberField('Zero shift (°)',settings.zero,v=>set('zero',v??NaN))}{numberField('Background terms',settings.backgroundTerms,v=>set('backgroundTerms',v??NaN))}{numberField('Max iterations / stage',settings.maxIterations,v=>set('maxIterations',v??NaN))}{settings.method==='lebail'&&numberField('Maximum Le Bail passes',settings.maxPasses,v=>set('maxPasses',v??NaN))}{settings.method!=='rietveld'&&numberField('Intensity extraction cycles',settings.extractionCycles,v=>set('extractionCycles',v??NaN))}<label className="block space-y-1 text-xs"><span>Peak shape *</span><select className={inputClass} value={settings.shape} onChange={e=>set('shape',e.target.value as RefinementSettings['shape'])}><option value="tchz_pv">TCH pseudo-Voigt</option><option value="voigt">Voigt</option></select></label></div><p className="mt-2 text-xs text-text-dim">Gaussian width² = U tan²θ + V tanθ + W; Lorentzian width = X / cosθ + Y tanθ. Starting values are estimates; use instrument calibration when available.</p></div></div>
            <div role="tabpanel" id="panel-Parameters" aria-labelledby="tab-Parameters" hidden={tab!=='Parameters'}>{result?<div><p className="my-2 text-xs">Symmetry constraints still apply. Leave unchanged to keep checkpoint values.</p><div className="grid grid-cols-3 gap-2">{result.parameters.filter(p=>p.editable&&!p.path.includes('.cell.')&&!p.path.startsWith('instrument.profile.')&&p.path!=='instrument.zero_shift').map(p=><div key={p.path} className="min-w-0">{numberField(p.path,settings.parameterEdits[p.path]??p.value,v=>set('parameterEdits',{...settings.parameterEdits,[p.path]:v??NaN}))}</div>)}</div></div>:<p className="text-xs text-text-dim">Optional parameter overrides are available after a completed refinement.</p>}</div>
          </fieldset>
          <div role="tabpanel" id="panel-Results" aria-labelledby="tab-Results" hidden={tab!=='Results'}>{result?<div className="refinement-results"><section className="refinement-result-card"><h2 className="mb-1 font-semibold">Refined lattice parameters</h2><div className="grid grid-cols-3 gap-2 text-xs">{Object.entries(result.cell).map(([k,v])=><div key={k}>{k}: <b>{v.toFixed(6)}</b><br/>± {result.cellEsd[k]?.toPrecision(3)??'unavailable'}</div>)}</div></section><section className="refinement-result-card"><button className="btn-w32 mb-2 px-3 py-1" onClick={()=>void window.cifApi.openRefinementOutput().catch(e=>setError(String(e)))}>Open output folder</button><p className="break-all text-xs">{result.outputFolder}</p><ul className="mt-3  space-y-1 overflow-auto break-all text-xs">{result.files.map(f=><li key={f}>{f}</li>)}</ul></section><ul className=" space-y-2 overflow-auto text-xs text-amber-900">{result.warnings.map((w,i)=><li key={i}>{w}</li>)}</ul></div>:<p className="text-xs text-text-dim">Refined lattice parameters, output files and diagnostics will appear here.</p>}</div>
        </div>
        <fieldset disabled={busy||importing} className="refinement-flags"><div className="flex flex-wrap gap-3 text-xs">{([['refineCell','Lattice'],['refineProfile','Peak widths'],['refineZero','Zero shift'],...(settings.method==='rietveld'?[['refineCoordinates','Atomic coordinates'],['refineBiso','Displacement parameters'],['refineOccupancy','Occupancies']]:[])] as [keyof RefinementSettings,string][]).map(([k,label])=><label key={k}><input type="checkbox" checked={Boolean(settings[k])} onChange={e=>set(k,e.target.checked)}/> Refine {label.toLowerCase()}</label>)}</div></fieldset>
        <div className="refinement-actions"><button className="btn-w32 btn-primary px-4" disabled={busy||importing||!experimental||!engine?.available}>{busy?'Refining…':checkpoint?'Refine':'Start refinement'}</button>{checkpoint&&!busy&&<button type="button" className="btn-w32 px-2" disabled={importing} onClick={()=>void fit(false)}>Start new from CIF</button>}{busy&&<button type="button" className="btn-w32 px-2" onClick={()=>void window.cifApi.cancelRefinement().catch(e=>setError(String(e)))}>Stop and save</button>}<span role={error?'alert':'status'} className={error?'text-xs text-red-800':'text-xs'} title={error||message||engine?.message}>{error||message||engine?.message||'Ready'}</span></div>
      </form>
    </section>
    <RefinementProgressPlot metrics={metrics} busy={busy} result={result}/></div>
    <section className="refinement-chart" aria-label="Refinement pattern">
      <div className="refinement-metrics"><b>R<sub>wp</sub>: {frame?.rwp?.toFixed(1)??'—'}%</b><span>{busy?'Refining':result?.status??'Observed pattern'}</span>{result&&!busy&&<span>GoF: {result.gof?.toFixed(1)??'—'}</span>}{dirty&&result&&<span>Inputs edited · previous fit displayed</span>}</div>
      {frame?<FitPlot frame={{...frame,gof:busy?metrics.at(-1)?.gof:result?.gof,rp:busy?metrics.at(-1)?.rp:undefined}} chemicalFormula={source.get('formula')??undefined} refinementMethod={settings.method}/>:<div className="refinement-empty">Import an experimental pattern to view the plot.</div>}
    </section>
  </main>;
}
