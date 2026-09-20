import React,{useEffect,useId,useMemo,useRef,useState} from 'react';
import type { RefinementMetric, RefinementResult } from '../../../shared/refinement';
import {clampPlotX} from '../../../shared/plot';

export function progressScale(values:number[]) {
  const high=Math.max(0,...values);
  const step=high<=5?1:high<=10?2:high<=15?3:Math.max(5,Math.ceil(high/5/5)*5);
  const max=Math.max(step,Math.ceil(high/step)*step);
  return {max,ticks:Array.from({length:Math.round(max/step)+1},(_,i)=>i*step)};
}
export function progressCycleTicks(range:[number,number]):number[] {
  const target=Math.max(1,(range[1]-range[0])/5);
  const magnitude=10**Math.floor(Math.log10(target));
  const step=[1,2,5,10].map(n=>n*magnitude).find(n=>n>=target)!;
  const ticks:number[]=[];
  for(let n=Math.ceil(range[0]/step)*step;n<=range[1];n+=step)ticks.push(n);
  return ticks;
}
export default function RefinementProgressPlot({metrics,busy=false,result}:{metrics:RefinementMetric[];busy?:boolean;result?:RefinementResult|null}) {
  const latest=metrics.at(-1),end=Math.max(1,latest?.iteration??1);
  const final=useMemo(()=>{
    if(!result||busy)return latest;
    let total=0,difference=0;for(const row of result.profile){total+=Math.abs(row[1]);difference+=Math.abs(row[1]-row[2]);}
    return {rp:total?100*difference/total:null,rwp:result.rwp,gof:result.gof};
  },[result,busy,latest]);
  const [range,setRange]=useState<[number,number]>();
  const root=useRef<SVGSVGElement>(null),drag=useRef<{x:number;range:[number,number]}>();
  const clip=useId();
  const left=43,right=217,top=49,bottom=203;
  const view=range?clampPlotX(range,[0,end]):[0,end] as [number,number];
  const current=useRef({view,end});current.current={view,end};
  useEffect(()=>{if(!metrics.length)setRange(undefined);},[metrics.length]);
  const point=(clientX:number,clientY:number)=>new DOMPoint(clientX,clientY).matrixTransform(root.current!.getScreenCTM()!.inverse());
  useEffect(()=>{
    const svg=root.current!;
    const wheel=(e:WheelEvent)=>{e.preventDefault();const {view,end}=current.current;const anchor=Math.max(0,Math.min(1,(point(e.clientX,e.clientY).x-left)/(right-left)));const factor=Math.exp(Math.max(-.35,Math.min(.35,e.deltaY*(e.deltaMode===1?.035:.002))));const span=Math.min(end,Math.max(Math.min(1,end),(view[1]-view[0])*factor));const at=view[0]+anchor*(view[1]-view[0]);setRange(clampPlotX([at-anchor*span,at+(1-anchor)*span],[0,end]));};
    svg.addEventListener('wheel',wheel,{passive:false});return()=>svg.removeEventListener('wheel',wheel);
  },[]);
  // Retain both endpoints around the visible interval, so zoomed curves remain continuous.
  const visible=metrics.filter((p,i)=>p.iteration>=view[0]&&p.iteration<=view[1]||p.iteration<view[0]&&(metrics[i+1]?.iteration??Infinity)>=view[0]||p.iteration>view[1]&&(metrics[i-1]?.iteration??-Infinity)<=view[1]);
  const scale=(key:'rp'|'rwp')=>progressScale(visible.flatMap(p=>p[key]===null?[]:[p[key]!]));
  const rp=scale('rp'),rwp=scale('rwp');
  const x=(n:number)=>left+(n-view[0])/(view[1]-view[0])*(right-left);
  const y=(n:number,max:number)=>bottom-n/max*(bottom-top);
  const series=(key:'rp'|'rwp',max:number,color:string)=>{
    const points=visible.filter(p=>p[key]!==null);
    return <g data-progress-series={key} clipPath={`url(#${clip})`}><polyline fill="none" stroke={color} strokeWidth="1.5" points={points.map(p=>`${x(p.iteration)},${y(p[key]!,max)}`).join(' ')}/>{points.length>0&&<circle cx={x(points.at(-1)!.iteration)} cy={y(points.at(-1)![key]!,max)} r="2.5" fill={color}/>}</g>;
  };
  return <aside className="refinement-progress" aria-label="Refinement progress chart">
    <header><b>Progress</b><button className="btn-w32 px-1" onClick={()=>setRange(undefined)}>Reset view</button></header>
    <svg ref={root} viewBox="0 0 260 265" style={{touchAction:'none',userSelect:'none'}} role="img" aria-label="Rp left axis and Rwp right axis versus iteration" data-progress-count={metrics.length} data-progress-range={view.join(',')}
      onDoubleClick={()=>setRange(undefined)}
      onPointerDown={e=>{if(e.button!==0)return;drag.current={x:point(e.clientX,e.clientY).x,range:[...view]};e.currentTarget.setPointerCapture(e.pointerId);}}
      onPointerMove={e=>{const start=drag.current;if(!start)return;const delta=-(point(e.clientX,e.clientY).x-start.x)/(right-left)*(start.range[1]-start.range[0]);setRange(clampPlotX([start.range[0]+delta,start.range[1]+delta],[0,end]));}}
      onPointerUp={e=>{drag.current=undefined;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}} onPointerCancel={()=>{drag.current=undefined;}}>
      <defs><clipPath id={clip}><rect x={left} y={top-3} width={right-left} height={bottom-top+6}/></clipPath></defs>
      <text x="130" y="18" textAnchor="middle" fontSize="15" data-progress-gof>GoF: {final?.gof?.toFixed(1)??'—'}</text>
      <text x={left} y="39" fill="#0067c0" fontSize="11">R<tspan baselineShift="sub" fontSize="75%">p</tspan> (%)</text><text x={right} y="39" textAnchor="end" fill="#c55a11" fontSize="11">R<tspan baselineShift="sub" fontSize="75%">wp</tspan> (%)</text>
      <path d={`M${left},${top}H${right}M${left},${bottom}H${right}`} fill="none" stroke="#a0adb8"/>
      {([{key:'rp',axis:left,color:'#0067c0',scale:rp},{key:'rwp',axis:right,color:'#c55a11',scale:rwp}]).map(a=><g key={a.key} fill={a.color} fontSize="10"><path data-progress-axis={a.key} d={`M${a.axis},${top}V${bottom}`} stroke={a.color} strokeWidth="1.5"/>{a.scale.ticks.map(t=><text key={t} x={a.axis+(a.key==='rp'?-5:5)} y={y(t,a.scale.max)+3} textAnchor={a.key==='rp'?'end':'start'}>{t}</text>)}</g>)}
      {progressCycleTicks(view).map(n=><g key={n} data-progress-x-tick={n}><line x1={x(n)} x2={x(n)} y1={bottom} y2={bottom+4} stroke="#a0adb8"/><text x={x(n)} y={bottom+15} textAnchor="middle" fontSize="10">{n}</text></g>)}
      {series('rp',rp.max,'#0067c0')}{series('rwp',rwp.max,'#c55a11')}
      {!metrics.length&&<text x="130" y="125" textAnchor="middle" fontSize="11" fill="#687787">Awaiting refinement</text>}
      <text x="130" y="235" textAnchor="middle" fontSize="11">Cycle</text>
      {!busy&&latest&&<g data-progress-final fontSize="11"><text x={left} y="255" fill="#0067c0">R<tspan baselineShift="sub" fontSize="75%">p</tspan> = {final?.rp?.toFixed(1)??'—'}%</text><text x={right} y="255" textAnchor="end" fill="#c55a11">R<tspan baselineShift="sub" fontSize="75%">wp</tspan> = {final?.rwp?.toFixed(1)??'—'}%</text></g>}
    </svg>
  </aside>;
}
