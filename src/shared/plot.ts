import type { RefinementFrame } from './refinement';

export const CURVES = ['observed', 'calculated', 'background', 'difference', 'reflections'] as const;
export type CurveKey = typeof CURVES[number];
export type PlotFormat = 'png' | 'jpg' | 'tiff' | 'svg' | 'pdf' | 'csv';
export interface CurveStyle { color: string; mode: 'line' | 'scatter' | 'ticks'; width: number; size: number; legend: boolean; visible: boolean; }
export const PLOT_FONTS = ['Arial','Aptos','Calibri','Cambria','Segoe UI','Tahoma','Verdana','Georgia','Times New Roman'] as const;
export interface PlotDesign {
  simulatedPattern?: boolean;
  showStatistics?: boolean; statisticsFont?: string; statisticsFontSize?: number; statisticsPosition?: {x:number;y:number};
  axisFont?: string; axisFontSize?: number; tickFont?: string; tickFontSize?: number; legendFont?: string; legendFontSize?: number; xMinorTicks?: number; yMinorTicks?: number;
  width: number; height: number; dpi: number; format: PlotFormat; fontSize: number;
  title: string; xLabel: string; yLabel: string;
  compactDifference?: boolean; hideDifferenceLabel?: boolean;
  showYNumbers?: boolean; enclosePlot?: boolean;
  xInterval?: number; xIntermediateLabels?: number;
  legend: { x: number; y: number };
  curves: Record<CurveKey, CurveStyle>;
}
export interface PlotView { x: [number, number]; y: [number, number]; difference: [number, number]; }
export function clampPlotX(range:[number,number],bounds:[number,number]):[number,number] {
  const span=Math.min(range[1]-range[0],bounds[1]-bounds[0]);
  if(span>=bounds[1]-bounds[0])return [...bounds];
  const low=Math.max(bounds[0],Math.min(range[0],bounds[1]-span));
  return [low,Math.min(bounds[1],low+span)];
}
export function zoomPlotX(view:PlotView,bounds:[number,number],factor:number,anchor:number):PlotView {
  const span=Math.min(bounds[1]-bounds[0],Math.max(Math.min(1e-7,bounds[1]-bounds[0]),(view.x[1]-view.x[0])*factor));
  const at=view.x[0]+anchor*(view.x[1]-view.x[0]);
  return {...view,x:clampPlotX([at-anchor*span,at+(1-anchor)*span],bounds)};
}
export interface PlotSnapshot { frame: RefinementFrame; design: PlotDesign; view: PlotView; chemicalFormula?: string; refinementMethod?: string; }
export const CURVE_LABELS: Record<CurveKey,string> = { observed:'Observed', calculated:'Calculated', background:'Background', difference:'Difference', reflections:'Reflections' };
export function defaultPlotDesign(): PlotDesign {
  const style = (color:string, mode:CurveStyle['mode']='line'):CurveStyle => ({color,mode,width:1.5,size:2.7,legend:true,visible:true});
  return {width:11.46,height:4.8,dpi:300,format:'png',fontSize:12,xInterval:10,xIntermediateLabels:0,title:'',xLabel:'2θ (degrees)',yLabel:'Intensity (arb. units)',showYNumbers:true,enclosePlot:false,legend:{x:.73,y:.06},curves:{
    observed:{...style('#1a1a1a','scatter'),width:.5},calculated:style('#ff7f0e'),background:style('#b5793a'),difference:style('#737373'),reflections:{...style('#1a1a1a','ticks'),width:1}
  }};
}
export function fullPlotView(frame:RefinementFrame):PlotView {
  let lo=0,hi=1,residual=1;
  for(const r of frame.profile){lo=Math.min(lo,r[1],r[2],r[3]);hi=Math.max(hi,r[1],r[2],r[3]);residual=Math.max(residual,Math.abs(r[4]));}
  return {x:[...frame.range],y:[lo,hi*1.03],difference:[-residual*1.05,residual*1.05]};
}
export function plotLayout(design:PlotDesign) {
  const width=design.width*96,height=design.height*96;
  if(design.simulatedPattern)return {width,height,left:85,right:width-25,top:design.title?40:22,bottom:height-50,ticks:height-50,diffTop:height-50,diffBottom:height-50};
  const released=design.compactDifference?Math.max(0,(height-50-height*.71)/2):0;
  return {width,height,left:design.showYNumbers===false?Math.max(36,24+(design.axisFontSize??design.fontSize)):85,right:width-25,top:design.title?40:22,bottom:height*.60+released,ticks:height*.65+released,diffTop:height*.71+released,diffBottom:height-50};
}
export function validatePlotSnapshot(input:unknown):PlotSnapshot {
  const p=input as PlotSnapshot;
  const finite=(v:unknown,min:number,max:number)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
  if(!p?.frame||!p.design||!p.view)throw new Error('Missing plot data.');
  if(!Array.isArray(p.frame.profile)||p.frame.profile.length<2||p.frame.profile.length>200000||p.frame.profile.some(r=>!Array.isArray(r)||r.length!==5||r.some(v=>!finite(v,-1e30,1e30))))throw new Error('Invalid plot profile.');
  for(const range of [p.frame.range,p.view.x,p.view.y,p.view.difference])if(!Array.isArray(range)||range.length!==2||!range.every(v=>finite(v,-1e30,1e30))||range[0]>=range[1])throw new Error('Plot axis limits must increase.');
  if(!p.frame.ticks||Object.values(p.frame.ticks).some(t=>!Array.isArray(t)||t.length>200000||t.some(v=>!finite(v,-1e10,1e10))))throw new Error('Invalid reflection positions.');
  if([p.chemicalFormula,p.refinementMethod].some(v=>v!==undefined&&(typeof v!=='string'||v.length>500)))throw new Error('Invalid plot naming metadata.');
  for(const value of [p.frame.rp,p.frame.gof])if(value!==undefined&&value!==null&&!finite(value,0,1e30))throw new Error('Invalid fit statistics.');
  if(p.frame.experimentalProfile!==undefined&&(!Array.isArray(p.frame.experimentalProfile)||p.frame.experimentalProfile.length>200000||p.frame.experimentalProfile.some(r=>!Array.isArray(r)||r.length!==2||r.some(v=>!finite(v,-1e30,1e30)))))throw new Error('Invalid experimental overlay.');
  const d=p.design;
  if(d.statisticsPosition&&(!finite(d.statisticsPosition.x,0,1)||!finite(d.statisticsPosition.y,0,1)))throw new Error('Invalid statistics position.');
  for(const font of [d.axisFont,d.tickFont,d.legendFont,d.statisticsFont])if(font!==undefined&&!PLOT_FONTS.includes(font as typeof PLOT_FONTS[number]))throw new Error('Choose a listed plot font.');
  for(const size of [d.axisFontSize,d.tickFontSize,d.legendFontSize,d.statisticsFontSize])if(size!==undefined&&!finite(size,8,32))throw new Error('Font sizes must be 8–32.');
  for(const count of [d.xMinorTicks,d.yMinorTicks])if(count!==undefined&&(!Number.isInteger(count)||!finite(count,0,9)))throw new Error('Use 0–9 minor ticks.');
  if([d.showYNumbers,d.enclosePlot,d.compactDifference,d.hideDifferenceLabel,d.showStatistics,d.simulatedPattern].some(v=>v!==undefined&&typeof v!=='boolean'))throw new Error('Invalid plot axis options.');
  if(!finite(d.xInterval??10,.000001,1000000)||!Number.isInteger(d.xIntermediateLabels??0)||!finite(d.xIntermediateLabels??0,0,20))throw new Error('Use a positive X tick interval and 0–20 intermediate labels.');
  if((p.view.x[1]-p.view.x[0])/(d.xInterval??10)*((d.xIntermediateLabels??0)+1)>500)throw new Error('Too many X tick labels. Increase the interval or reduce intermediate labels.');
  if(!finite(d.width,4,24)||!finite(d.height,3,18)||!finite(d.dpi,72,1200)||!Number.isInteger(d.dpi)||!finite(d.fontSize,8,24)||!['png','jpg','tiff','svg','pdf','csv'].includes(d.format))throw new Error('Use width 4–24 in, height 3–18 in, resolution 72–1200 dpi and font size 8–24.');
  if(!['svg','pdf','csv'].includes(d.format)&&Math.round(d.width*d.dpi)*Math.round(d.height*d.dpi)>40000000)throw new Error('Raster export is limited to 40 megapixels. Reduce dimensions or dpi.');
  if([d.title,d.xLabel,d.yLabel].some(s=>typeof s!=='string'||s.length>120))throw new Error('Plot labels must be at most 120 characters.');
  if(!d.legend||!finite(d.legend.x,0,1)||!finite(d.legend.y,0,1))throw new Error('Invalid legend position.');
  for(const key of CURVES){const s=d.curves?.[key];if(!s||!/^#[0-9a-f]{6}$/i.test(s.color)||!['line','scatter','ticks'].includes(s.mode)||!finite(s.width,.1,8)||!finite(s.size,1,20)||typeof s.legend!=='boolean'||typeof s.visible!=='boolean')throw new Error('Invalid curve style.');}
  return p;
}
const escape=(v:string)=>v.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
const f=(v:number)=>Number(v.toFixed(3));
export function automaticTickInterval(range:[number,number]):number {
  const target=(range[1]-range[0])/8,base=10**Math.floor(Math.log10(target));
  return [1,2,5,10].map(v=>v*base).find(v=>v>=target)??base*10;
}
export function xTicks(range:[number,number],interval=10,intermediate=0) {
  const step=interval/(intermediate+1),ticks:{value:number;major:boolean;label:string}[]=[];
  if(!Number.isFinite(step)||step<=0||!Number.isInteger(intermediate)||intermediate<0||intermediate>20)return ticks;
  const first=Math.ceil(range[0]/step-1e-9),last=Math.floor(range[1]/step+1e-9);
  if(last-first>500)return ticks;
  const decimals=Math.min(8,Math.max(0,Math.ceil(-Math.log10(step))+1));
  for(let i=first;i<=last;i++){const value=i*step; ticks.push({value,major:i%(intermediate+1)===0,label:Number(value.toFixed(decimals)).toString()});}
  return ticks;
}
export function legendBox(design:PlotDesign) {
  const l=plotLayout(design), font=design.legendFontSize??design.fontSize;
  const keys=CURVES.filter(k=>design.curves[k].legend&&design.curves[k].visible);
  const width=Math.min(l.width-10,Math.max(80,...keys.map(k=>curveLabel(design,k).length*font*.57+44)));
  const height=keys.length*(font+7)+12;
  return {x:Math.min(design.legend.x*l.width,l.width-width-5),y:Math.min(design.legend.y*l.height,l.height-height-5),width,height,keys};
}
export function renderPlotSvg({frame,design,view}:PlotSnapshot, preview=false):string {
  const l=plotLayout(design),font=design.fontSize;
  const x=(v:number)=>l.left+(v-view.x[0])/(view.x[1]-view.x[0])*(l.right-l.left);
  const scale=(v:number,r:[number,number],top:number,bottom:number)=>bottom-(v-r[0])/(r[1]-r[0])*(bottom-top);
  const y=(v:number)=>scale(v,view.y,l.top,l.bottom),dy=(v:number)=>scale(v,view.difference,l.diffTop,l.diffBottom);
  const text=(tx:number,ty:number,value:string,anchor='middle',extra='')=>`<text x="${f(tx)}" y="${f(ty)}" text-anchor="${anchor}" ${extra}>${escape(value)}</text>`;
  const line=(x1:number,y1:number,x2:number,y2:number,color='#333',width=1)=>`<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="${color}" stroke-width="${width}"/>`;
  const symbol=(s:CurveStyle,xx:number,yy:number)=>`<circle cx="${f(xx)}" cy="${f(yy)}" r="${s.size/2}" fill="${s.color}" stroke="${s.color}" stroke-width="${s.width}"/>`;
  let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${design.width}in" height="${design.height}in" viewBox="0 0 ${l.width} ${l.height}" role="img" aria-label="Refinement profile" style="display:block;${preview?'width:100%;height:auto;':''}touch-action:none"><rect width="100%" height="100%" fill="white"/><g font-family="Arial, sans-serif" font-size="${font}" fill="#111">`;
  svg+=`<defs><clipPath id="profile-clip"><rect x="${l.left}" y="${l.top}" width="${l.right-l.left}" height="${l.bottom-l.top}"/></clipPath><clipPath id="difference-clip"><rect x="${l.left}" y="${l.diffTop}" width="${l.right-l.left}" height="${l.diffBottom-l.diffTop}"/></clipPath><clipPath id="tick-clip"><rect x="${l.left}" y="${l.ticks-7}" width="${l.right-l.left}" height="16"/></clipPath></defs>`;
  // Keep the adjoining sample on each side so clipped line segments reach the viewport edge.
  const first=Math.max(0,frame.profile.findIndex(r=>r[0]>=view.x[0])-1);
  let end=frame.profile.findIndex(r=>r[0]>view.x[1]);if(end<0)end=frame.profile.length;
  let rows=frame.profile.slice(first,end+1);
  if(preview&&rows.length>10000){const step=Math.ceil(rows.length/5000),reduced:number[][]=[];for(let i=0;i<rows.length;i+=step){const block=rows.slice(i,i+step);const keep=new Set([0,block.length-1]);for(let c=1;c<5;c++){let low=0,high=0;block.forEach((r,j)=>{if(r[c]<block[low][c])low=j;if(r[c]>block[high][c])high=j;});keep.add(low);keep.add(high);}for(const j of [...keep].sort((a,b)=>a-b))reduced.push(block[j]);}rows=reduced;}
  for(const [index,key] of CURVES.entries()){
    const s=design.curves[key];if(!s.visible||design.simulatedPattern&&!['observed','calculated'].includes(key))continue;
    const pts=design.simulatedPattern&&key==='observed'?(frame.experimentalProfile??[]).map(r=>[x(r[0]),y(r[1])]):key==='reflections'?Object.values(frame.ticks).flat().filter(v=>v>=view.x[0]&&v<=view.x[1]).map(v=>[x(v),l.ticks]):rows.map(r=>[x(r[0]),key==='difference'?dy(r[4]):y(r[index+1])]);
    svg+=`<g data-curve="${key}" clip-path="url(#${key==='reflections'?'tick':key==='difference'?'difference':'profile'}-clip)">`;
    if(s.mode==='scatter')svg+=pts.map(p=>symbol(s,p[0],p[1])).join('');
    else if(s.mode==='ticks')svg+=pts.map(p=>line(p[0],p[1]-4,p[0],p[1]+5,s.color,s.width)).join('');
    else svg+=`<path d="${pts.map((p,i)=>`${i?'L':'M'}${f(p[0])},${f(p[1])}`).join(' ')}" fill="none" stroke="${s.color}" stroke-width="${s.width}"/>`;
    svg+='</g>';
  }
  if(design.enclosePlot)svg+=`<rect data-plot-border="true" x="${l.left}" y="${l.top}" width="${l.right-l.left}" height="${l.diffBottom-l.top}" fill="none" stroke="#111" stroke-width="1.2"/>`;
  else svg+=line(l.left,l.top,l.left,l.bottom)+line(l.left,l.diffTop,l.left,l.diffBottom)+line(l.left,l.diffBottom,l.right,l.diffBottom);
  svg+=`<g data-tick-font="true" font-family="${escape(design.tickFont??'Arial')}" font-size="${design.tickFontSize??font}">`;
  if(design.showYNumbers!==false)for(let i=0;i<=4;i++){const v=view.y[0]+i*(view.y[1]-view.y[0])/4;svg+=line(l.left-4,y(v),l.left,y(v))+text(l.left-8,y(v)+4,v.toPrecision(3),'end','data-y-number="intensity"');}
  if(!design.simulatedPattern&&design.showYNumbers!==false)for(let i=0;i<=2;i++){const v=view.difference[0]+i*(view.difference[1]-view.difference[0])/2;svg+=line(l.left-4,dy(v),l.left,dy(v))+text(l.left-8,dy(v)+4,v.toPrecision(2),'end','data-y-number="difference"');}
  for(const tick of xTicks(view.x,design.xInterval??10,design.xIntermediateLabels??0)){svg+=`<g data-x-tick="${tick.major?'major':'intermediate'}">`+line(x(tick.value),l.diffBottom,x(tick.value),l.diffBottom+(tick.major?6:3))+text(x(tick.value),l.diffBottom+22,tick.label)+'</g>';}
  const minors=design.xMinorTicks??0, spacing=(design.xInterval??10)/((design.xIntermediateLabels??0)+1);
  if(minors>0){const step=spacing/(minors+1);const first=Math.ceil(view.x[0]/step),last=Math.floor(view.x[1]/step);if(last-first<5000)for(let i=first;i<=last;i++)if(i%(minors+1)!==0)svg+=`<g data-minor-tick="x">${line(x(i*step),l.diffBottom,x(i*step),l.diffBottom+3)}</g>`;}
  if(design.showYNumbers!==false)for(const [start,end,divisions] of (design.simulatedPattern?[[l.top,l.bottom,4]]:[[l.top,l.bottom,4],[l.diffTop,l.diffBottom,2]]))for(let i=0;i<divisions;i++)for(let j=1;j<=(design.yMinorTicks??0);j++){const yy=start+(i+j/((design.yMinorTicks??0)+1))*(end-start)/divisions;svg+=`<g data-minor-tick="y">${line(l.left-2,yy,l.left,yy)}</g>`;}
  svg+='</g>';
  svg+=`<g data-axis-font="true" font-family="${escape(design.axisFont??'Arial')}" font-size="${design.axisFontSize??font}">`;
  svg+=text((l.left+l.right)/2,l.height-7,design.xLabel)+text(19,(l.top+l.bottom)/2,design.yLabel,'middle',`transform="rotate(-90 19 ${(l.top+l.bottom)/2})"`)+(design.hideDifferenceLabel||design.simulatedPattern?'':text(19,(l.diffTop+l.diffBottom)/2,'Difference','middle',`transform="rotate(-90 19 ${(l.diffTop+l.diffBottom)/2})"`));
  svg+='</g>';
  if(design.title)svg+=text(l.width/2,20,design.title);
  const legend=legendBox(design),legendFont=design.legendFontSize??font;
  if(legend.keys.length){svg+=`<g data-legend="true" font-family="${escape(design.legendFont??'Arial')}" font-size="${legendFont}" aria-label="Drag legend" style="cursor:move" transform="translate(${f(legend.x)} ${f(legend.y)})"><rect width="${legend.width}" height="${legend.height}" fill="none" pointer-events="all"/>`;legend.keys.forEach((key,i)=>{const s=design.curves[key],yy=legendFont+5+i*(legendFont+7);svg+=s.mode==='scatter'?symbol(s,15,yy-4):s.mode==='ticks'?line(15,yy-9,15,yy+1,s.color,s.width):line(5,yy-4,27,yy-4,s.color,s.width);svg+=text(34,yy,curveLabel(design,key),'start');});svg+='</g>';}
  if(design.showStatistics&&!design.simulatedPattern){
    const box=statisticsBox(design),size=design.statisticsFontSize??12;
    let total=0,delta=0;for(const row of frame.profile){total+=Math.abs(row[1]);delta+=Math.abs(row[1]-row[2]);}
    const rp=frame.rp??(total?100*delta/total:null);
    const labels=[`Rp = ${rp?.toFixed(1)??'—'}%`,`Rwp = ${frame.rwp?.toFixed(1)??'—'}%`,`GoF = ${frame.gof?.toFixed(1)??'—'}`];
    svg+=`<g data-statistics="true" style="cursor:move" font-family="${escape(design.statisticsFont??'Arial')}" font-size="${size}" transform="translate(${f(box.x)} ${f(box.y)})"><rect width="${box.width}" height="${box.height}" fill="none" pointer-events="all"/>`;
    labels.forEach((label,i)=>{svg+=text(5,size+5+i*(size+7),label,'start').replace(/^(.+?>)R(wp|p) = /,'$1R<tspan baseline-shift="sub" font-size="75%">$2</tspan> = ');});svg+='</g>';
  }
  return svg+'</g></svg>';
}

/** Reflection angles are an independent list, not snapped to sampled 2theta points. */
export function renderPlotCsv({frame,design}:PlotSnapshot):string {
  if(design.simulatedPattern){
    const observed=(frame.experimentalProfile??[]).filter(r=>r[0]>=frame.range[0]&&r[0]<=frame.range[1]);
    return ['Simulated 2theta,Simulated intensity,Experimental 2theta,Experimental intensity',...Array.from({length:Math.max(frame.profile.length,observed.length)},(_,i)=>[frame.profile[i]?.[0]??'',frame.profile[i]?.[2]??'',observed[i]?.[0]??'',observed[i]?.[1]??''].join(','))].join('\r\n')+'\r\n';
  }
  const reflections=Object.values(frame.ticks).flat().sort((a,b)=>a-b);
  const rows=['2theta,Experimental,Calculated,Difference,Background,Bragg Refelctions'];
  for(let i=0;i<Math.max(frame.profile.length,reflections.length);i++) {
    const p=frame.profile[i];
    rows.push([...(p?[p[0],p[1],p[2],p[4],p[3]]:['','','','','']),reflections[i]??''].join(','));
  }
  return rows.join('\r\n')+'\r\n';
}
export function plotCsvFilename(snapshot:PlotSnapshot):string {
  const safe=(value:string)=>value.replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/\s+/g,'').replace(/[. ]+$/g,'').slice(0,120);
  const method=({lebail:'LeBail',pawley:'Pawley',rietveld:'Rietveld'} as Record<string,string>)[snapshot.refinementMethod??'']??snapshot.refinementMethod??'Refinement';
  return `${safe(snapshot.chemicalFormula??'')||'UnknownFormula'}_${safe(method)||'Refinement'}_Result.csv`;
}

export function exportPlotDesign(design:PlotDesign):PlotDesign {
 return {...design,width:5,height:5,dpi:600,format:'png',fontSize:12,title:'',xLabel:'2θ (degrees)',yLabel:'Intensity (arb. units)',showYNumbers:false,enclosePlot:true,compactDifference:true,hideDifferenceLabel:true,axisFont:'Arial',axisFontSize:16,tickFont:'Arial',tickFontSize:14,legendFont:'Arial',legendFontSize:14,xInterval:10,xIntermediateLabels:0,xMinorTicks:1,yMinorTicks:0,showStatistics:true,statisticsFont:'Arial',statisticsFontSize:12,statisticsPosition:undefined,curves:{...design.curves,background:{...design.curves.background,color:'#b5793a',mode:'line',width:1.5,visible:false}},};
}
export function statisticsBox(design:PlotDesign) {
 const l=plotLayout(design),size=design.statisticsFontSize??12,width=Math.min(l.width-10,size*10+10),height=3*(size+7)+10;
 const legend=legendBox(design);
 const position=design.statisticsPosition??{x:legend.x/l.width,y:(legend.y+legend.height+6)/l.height};
 return {x:Math.max(0,Math.min(position.x*l.width,l.width-width-5)),y:Math.max(0,Math.min(position.y*l.height,l.height-height-5)),width,height};
}

export function curveLabel(design:PlotDesign,key:CurveKey):string {
 return design.simulatedPattern?(key==='observed'?'Experimental':key==='calculated'?'Simulated':CURVE_LABELS[key]):CURVE_LABELS[key];
}
export function simulatedPlotSnapshot(profile:{twoTheta:number;intensity:number}[],experimental:{twoTheta:number;intensity:number}[]|undefined,formula:string):PlotSnapshot {
 const design=exportPlotDesign(defaultPlotDesign());
 Object.assign(design,{simulatedPattern:true,showStatistics:false,showYNumbers:true,enclosePlot:false,yLabel:'Relative intensity (%)'});
 for(const key of CURVES)design.curves[key].visible=key==='calculated'?profile.length>0:key==='observed'&&!!experimental?.length;
 Object.assign(design.curves.calculated,{color:'#0000ff',mode:'line',width:1});
 Object.assign(design.curves.observed,{color:'#dc2626',mode:'line',width:1.2});
 const points=profile.length?profile:[{twoTheta:5,intensity:0},{twoTheta:80,intensity:0}];
 return {chemicalFormula:formula,refinementMethod:'Simulated',design,frame:{profile:points.map(p=>[p.twoTheta,0,p.intensity,0,0]),experimentalProfile:experimental?.map(p=>[p.twoTheta,p.intensity]),range:[5,80],rwp:null,ticks:{}},view:{x:[5,80],y:[0,100],difference:[-1,1]}};
}
