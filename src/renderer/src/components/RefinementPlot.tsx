import React, { useEffect, useMemo, useRef, useState } from 'react';

import type { RefinementFrame } from '../../../shared/refinement';

import { CURVES, CURVE_LABELS, curveLabel, clampPlotX, zoomPlotX, automaticTickInterval, defaultPlotDesign, fullPlotView, legendBox, statisticsBox, plotLayout, renderPlotSvg, type PlotDesign, type PlotView } from '../../../shared/plot';



export function InteractivePlot({frame,design,setDesign,view,setView,legendOnly=false}:{frame:RefinementFrame;design:PlotDesign;setDesign:(d:PlotDesign)=>void;view:PlotView;setView:(v:PlotView)=>void;legendOnly?:boolean}) {

  const root=useRef<HTMLDivElement>(null);

  const current=useRef({design,view,setView,frame});current.current={design,view,setView,frame};

  const drag=useRef<{kind:'legend'|'statistics'|'pan';x:number;y:number;legend:{x:number;y:number};view:PlotView}>();

  const svg=useMemo(()=>renderPlotSvg({frame,design,view},true),[frame,design,view]);

  const position=(event:{clientX:number;clientY:number})=>{

    const element=root.current!.querySelector('svg')!;

    const point=new DOMPoint(event.clientX,event.clientY).matrixTransform(element.getScreenCTM()!.inverse());

    return {x:point.x,y:point.y};

  };

  useEffect(()=>{

    if(legendOnly)return;

    const element=root.current!;

    const wheel=(event:WheelEvent)=>{

      event.preventDefault();

      const {design,view,setView,frame}=current.current,l=plotLayout(design),point=position(event);

      const factor=Math.exp(Math.max(-.35,Math.min(.35,event.deltaY*(event.deltaMode===1?.035:.002))));

      const fx=Math.max(0,Math.min(1,(point.x-l.left)/(l.right-l.left)));

      setView(zoomPlotX(view,frame.range,factor,fx));

    };

    element.addEventListener('wheel',wheel,{passive:false});return()=>element.removeEventListener('wheel',wheel);

  },[legendOnly]);

  return <div ref={root} className="select-none bg-white" data-testid="interactive-fit-plot"

    onDoubleClick={()=>{if(!legendOnly)setView({...view,x:[...frame.range]});}}

    onPointerDown={event=>{if(event.button!==0)return;const isLegend=Boolean((event.target as Element).closest('[data-legend]'));const isStatistics=Boolean((event.target as Element).closest('[data-statistics]'));if(legendOnly&&!isLegend&&!isStatistics)return;const point=position(event),legend=isStatistics?statisticsBox(design):legendBox(design);drag.current={kind:isStatistics?'statistics':isLegend?'legend':'pan',...point,legend:{x:legend.x,y:legend.y},view};event.currentTarget.setPointerCapture(event.pointerId);}}

    onPointerMove={event=>{const start=drag.current;if(!start)return;const point=position(event),l=plotLayout(design),dx=point.x-start.x,dy=point.y-start.y;

      if(start.kind==='legend'||start.kind==='statistics')setDesign({...design,[start.kind==='statistics'?'statisticsPosition':'legend']:{x:Math.max(0,Math.min(1,(start.legend.x+dx)/l.width)),y:Math.max(0,Math.min(1,(start.legend.y+dy)/l.height))}});

      else {const v=start.view,delta=-dx/(l.right-l.left)*(v.x[1]-v.x[0]);setView({...v,x:clampPlotX([v.x[0]+delta,v.x[1]+delta],frame.range)});}}}

    onPointerUp={event=>{drag.current=undefined;if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);}}

    onPointerCancel={()=>{drag.current=undefined;}} dangerouslySetInnerHTML={{__html:svg}}/>;

}



export function LegendControls({design,setDesign,expanded=false}:{design:PlotDesign;setDesign:(v:PlotDesign)=>void;expanded?:boolean}) {

  return <details open={expanded||undefined} className="text-xs"><summary className="cursor-pointer">Legend entries</summary><div className="my-2 flex flex-wrap gap-4">{CURVES.filter(k=>!design.simulatedPattern||k==='calculated'||k==='observed'&&design.curves.observed.visible).map(k=><label key={k}><input type="checkbox" checked={design.curves[k].legend} onChange={e=>setDesign({...design,curves:{...design.curves,[k]:{...design.curves[k],legend:e.target.checked}}})}/> {curveLabel(design,k)}</label>)}</div><button type="button" className="btn-w32 px-2" onClick={()=>setDesign({...design,legend:defaultPlotDesign().legend})}>Reset legend position</button></details>;

}



export default function FitPlot({frame,chemicalFormula,refinementMethod}:{frame:RefinementFrame;chemicalFormula?:string;refinementMethod?:string}) {

  const [design,setDesign]=useState(defaultPlotDesign);

  const stage=useRef<HTMLDivElement>(null);

  const [size,setSize]=useState({width:1100,height:460});

  useEffect(()=>{const observer=new ResizeObserver(([entry])=>setSize({width:entry.contentRect.width,height:entry.contentRect.height}));if(stage.current)observer.observe(stage.current);return()=>observer.disconnect();},[]);

  const [zoom,setZoom]=useState<PlotView>();

  const [error,setError]=useState('');

  const [opening,setOpening]=useState(false);

  useEffect(()=>setZoom(undefined),[frame.range[0],frame.range[1]]);

  const view=zoom??fullPlotView(frame);

  const atFullRange=view.x[0]===frame.range[0]&&view.x[1]===frame.range[1];

  const displayDesign={...design,width:Math.max(400,size.width)/96,height:Math.max(210,size.height)/96,fontSize:size.height<300?10:12,xInterval:atFullRange?10:automaticTickInterval(view.x)};

  return <section id="refinement-plot" className="refinement-fit-plot" aria-label="Refinement plot">

    <div className="refinement-plot-toolbar"><div className="text-xs">Scroll to zoom horizontally / Drag to pan / Drag legend to move</div><div className="flex gap-2"><button className="btn-w32 px-3" onClick={()=>setZoom(undefined)}>Reset view</button><button className="btn-w32 px-3" disabled={opening} onClick={async()=>{setOpening(true);setError('');try{await window.cifApi.openPlotExport({frame,design,view,chemicalFormula,refinementMethod});}catch(e){setError(String(e));}finally{setOpening(false);}}}>Export Plot</button></div></div>

    <div ref={stage} className="refinement-plot-stage"><InteractivePlot frame={frame} design={displayDesign} setDesign={next=>setDesign({...next,width:design.width,height:design.height,fontSize:design.fontSize,xInterval:10})} view={view} setView={setZoom}/></div>

    <div className="refinement-legend-options"><LegendControls design={design} setDesign={setDesign}/></div>{error&&<p role="alert" className="text-red-700">{error}</p>}

  </section>;

}

