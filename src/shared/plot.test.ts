import { describe,it,expect } from 'vitest';
import { simulatedPlotSnapshot,statisticsBox,exportPlotDesign,plotLayout,renderPlotCsv,plotCsvFilename,clampPlotX,zoomPlotX,automaticTickInterval,xTicks,defaultPlotDesign,fullPlotView,renderPlotSvg,validatePlotSnapshot,legendBox,type PlotSnapshot } from './plot';
const frame={profile:[[10,5,4,1,1],[20,30,29,2,1],[30,8,10,1,-2]],range:[10,30] as [number,number],rwp:2,ticks:{phase:[12,22]}};
const snapshot=():PlotSnapshot=>({frame,design:defaultPlotDesign(),view:fullPlotView(frame)});
describe('scientific plot export',()=>{
  it('zooms horizontally without changing either Y scale and clamps zoom and pan to original limits',()=>{
    const view=fullPlotView(frame);
    const zoom=zoomPlotX(view,frame.range,.5,.5);
    expect(zoom.x).toEqual([15,25]);expect(zoom.y).toEqual(view.y);expect(zoom.difference).toEqual(view.difference);
    for(const anchor of [0,.2,.5,1]){
      const out=zoomPlotX(zoom,frame.range,100,anchor);
      expect(out.x).toEqual(frame.range);expect(out.y).toEqual(view.y);expect(out.difference).toEqual(view.difference);
    }
    expect(clampPlotX([-100,-90],frame.range)).toEqual([10,20]);
    expect(clampPlotX([100,110],frame.range)).toEqual([20,30]);
  });
  it('aligns default ticks to tens and supports intermediate labels and adaptive zoom intervals',()=>{
    expect(xTicks([4,96]).map(t=>t.value)).toEqual([10,20,30,40,50,60,70,80,90]);
    expect(xTicks([10,30],10,1).map(t=>[t.value,t.major])).toEqual([[10,true],[15,false],[20,true],[25,false],[30,true]]);
    expect(automaticTickInterval([10,12])).toBeLessThan(10);
    expect(automaticTickInterval([0,200])).toBeGreaterThan(10);
    expect(xTicks([0,100],.000001)).toEqual([]);
  });
  it('rejects excessive raster sizes and invalid axis/style inputs at the IPC boundary',()=>{
    const p=snapshot();p.design.width=24;p.design.height=18;p.design.dpi=1200;
    expect(()=>validatePlotSnapshot(p)).toThrow(/megapixels/);
    p.design.format='svg';expect(validatePlotSnapshot(p)).toBe(p);
    p.view.x=[20,10];expect(()=>validatePlotSnapshot(p)).toThrow(/limits/);
    p.view.x=[10,30];p.design.curves.observed.color='url(https://example.com)';expect(()=>validatePlotSnapshot(p)).toThrow(/style/);
  });
  it('escapes labels, preserves vector primitives and removes only the selected legend entry',()=>{
    const p=snapshot();p.design.title='<script>alert("x")</script>';p.design.curves.background.legend=false;
    const svg=renderPlotSvg(p);expect(svg).not.toContain('<script>');expect(svg).toContain('&lt;script&gt;');expect(svg).toContain('data-curve="background"');expect(svg).not.toContain('>Background</text>');expect(svg).not.toContain('<image');
    p.design.curves.background.legend=true;expect(renderPlotSvg(p)).toContain('>Background</text>');
  });
  it('keeps the entire legend inside the canvas and supports scatter reflections',()=>{
    const p=snapshot();p.design.legend={x:1,y:1};p.design.curves.reflections.mode='scatter';
    const box=legendBox(p.design);expect(box.x+box.width).toBeLessThan(p.design.width*96);expect(box.y+box.height).toBeLessThan(p.design.height*96);
    expect(renderPlotSvg(p)).toMatch(/data-curve="reflections"[^>]*><circle/);
  });
});

it('exports original values in CSV column order with independent reflection angles',()=>{
 const p=snapshot();p.view.x=[15,20];p.design.curves.observed.visible=false;
 expect(renderPlotCsv(p).split('\r\n')).toEqual(['2theta,Experimental,Calculated,Difference,Background,Bragg Refelctions','10,5,4,1,1,12','20,30,29,1,2,22','30,8,10,-2,1,','']);
 p.frame={...frame,ticks:{phase:[12,22,25,28]}};
 expect(renderPlotCsv(p)).toContain(',,,,,28\r\n');
 for(const [method,label] of [['lebail','LeBail'],['pawley','Pawley'],['rietveld','Rietveld']])expect(plotCsvFilename({...p,chemicalFormula:'Na Cl',refinementMethod:method})).toBe(`NaCl_${label}_Result.csv`);
 expect(plotCsvFilename({...p,chemicalFormula:'A/B:C',refinementMethod:'pawley'})).toBe('A_B_C_Pawley_Result.csv');
 p.design={...p.design,format:'csv',width:24,height:18,dpi:1200};expect(()=>validatePlotSnapshot(p)).not.toThrow();
});

it('toggles Y numbers and encloses all panels without changing data',()=>{
 const p=snapshot();expect(p.design.yLabel).toBe('Intensity (arb. units)');
 expect(renderPlotSvg(p)).toContain('data-y-number="intensity"');
 p.design.showYNumbers=false;p.design.enclosePlot=true;
 const svg=renderPlotSvg(p);expect(svg).not.toContain('data-y-number');expect(svg).toContain('data-plot-border="true"');expect(svg).toContain('Intensity (arb. units)');expect(svg).toContain('data-curve="difference"');
 p.design.showYNumbers=true;p.design.enclosePlot=false;
 expect(renderPlotSvg(p)).toContain('data-y-number="difference"');expect(renderPlotSvg(p)).not.toContain('data-plot-border');
});

it('renders independent typography and unlabelled minor ticks',()=>{
 const p=snapshot();p.design={...p.design,axisFont:'Cambria',axisFontSize:20,tickFont:'Calibri',tickFontSize:10,legendFont:'Verdana',legendFontSize:16,xMinorTicks:2,yMinorTicks:1};
 const svg=renderPlotSvg(p);
 expect(svg).toContain('data-axis-font="true" font-family="Cambria" font-size="20"');
 expect(svg).toContain('data-tick-font="true" font-family="Calibri" font-size="10"');
 expect(svg).toContain('data-legend="true" font-family="Verdana" font-size="16"');
 expect((svg.match(/data-minor-tick="x"/g)||[]).length).toBe(4);
 expect((svg.match(/data-minor-tick="y"/g)||[]).length).toBe(6);
 expect(()=>validatePlotSnapshot(p)).not.toThrow();
 p.design.xMinorTicks=1.5;expect(()=>validatePlotSnapshot(p)).toThrow(/minor ticks/);
});

it('compacts the left margin and removes all Y ticks when numbers are hidden',()=>{
 const p=snapshot();p.design.yMinorTicks=2;
 const original=plotLayout(p.design).left;
 p.design.showYNumbers=false;
 expect(plotLayout(p.design).left).toBeLessThan(original);
 const svg=renderPlotSvg(p);
 expect(svg).not.toContain('data-y-number');expect(svg).not.toContain('data-minor-tick="y"');
 const left=plotLayout(p.design).left;
 expect(svg).not.toContain(`x1="${left-4}"`);
 expect(svg).toContain('Intensity (arb. units)');expect(svg).toContain('Difference');
 p.design.showYNumbers=true;
 expect(plotLayout(p.design).left).toBe(original);
 expect(renderPlotSvg(p)).toContain('data-minor-tick="y"');expect(renderPlotSvg(p)).toContain('data-y-number');
});

it('halves export residual height and reallocates space without resizing the figure',()=>{
 for(const height of [3,4.8,10,18]){
  const design={...defaultPlotDesign(),height};const before=plotLayout(design),after=plotLayout({...design,compactDifference:true});
  expect(after.diffBottom-after.diffTop).toBeCloseTo((before.diffBottom-before.diffTop)/2);
  expect(after.width).toBe(before.width);expect(after.height).toBe(before.height);
  expect(after.bottom-before.bottom).toBeCloseTo(after.diffTop-before.diffTop);
  expect(after.diffTop-after.ticks).toBeCloseTo(before.diffTop-before.ticks);
 }
});

it('applies screenshot export defaults and renders a separate statistics group',()=>{
 const p=snapshot();p.design=exportPlotDesign(p.design);p.frame={...frame,gof:1.25};
 expect(p.design).toMatchObject({width:5,height:5,dpi:600,axisFontSize:16,tickFontSize:14,legendFontSize:14,showYNumbers:false,enclosePlot:true,xMinorTicks:1});
 expect(p.design.curves.background.visible).toBe(false);
 p.design.showStatistics=true;p.design.statisticsFont='Cambria';p.design.statisticsFontSize=18;
 const svg=renderPlotSvg(p);expect(svg).toContain('data-statistics="true"');expect(svg).toContain('GoF = 1.3');expect(svg).toContain('R<tspan baseline-shift="sub" font-size="75%">wp</tspan> = 2.0%');expect(svg).toContain('R<tspan baseline-shift="sub" font-size="75%">p</tspan> = 9.3%');
});

it('uses transparent draggable groups and omits the export residual axis title',()=>{
 const p=snapshot();p.design=exportPlotDesign(p.design);p.design.showStatistics=true;
 expect(p.design.statisticsFontSize).toBe(12);
 const svg=renderPlotSvg(p);
 expect(svg).not.toContain('fill-opacity="0.9"');
 expect((svg.match(/fill="none" pointer-events="all"/g)||[]).length).toBe(2);
 expect(svg).not.toContain(`rotate(-90 19 ${(plotLayout(p.design).diffTop+plotLayout(p.design).diffBottom)/2})`);
 expect(svg).toContain('>Difference</text>');
});

it('shows statistics below the legend by default and permits a custom position',()=>{
 const design=exportPlotDesign(defaultPlotDesign()),legend=legendBox(design),stats=statisticsBox(design);
 expect(design.showStatistics).toBe(true);expect(stats.x).toBeCloseTo(legend.x);expect(stats.y).toBeCloseTo(legend.y+legend.height+6);
 expect(statisticsBox({...design,statisticsPosition:{x:0,y:0}}).y).toBe(0);
});

it('exports simulated and experimental profiles on their original separate sampling grids',()=>{
 const p=simulatedPlotSnapshot([{twoTheta:5,intensity:0},{twoTheta:20,intensity:100},{twoTheta:80,intensity:0}],[{twoTheta:4,intensity:2},{twoTheta:19.9,intensity:77},{twoTheta:81,intensity:5}],'NaCl');
 expect(p.frame.experimentalProfile?.[1]).toEqual([19.9,77]);expect(p.view.y).toEqual([0,100]);
 const svg=renderPlotSvg(p);expect(svg).toContain('>Simulated</text>');expect(svg).toContain('>Experimental</text>');expect(svg).toContain('#0000ff');expect(svg).toContain('#dc2626');expect(svg).not.toContain('data-curve="difference"');expect(svg).not.toContain('data-statistics');expect(svg).not.toContain('data-y-number="difference"');
 expect(plotLayout(p.design).bottom).toBe(plotLayout(p.design).diffBottom);
 expect(renderPlotCsv(p)).toContain('5,0,19.9,77');expect(()=>validatePlotSnapshot(p)).not.toThrow();
 const solo=simulatedPlotSnapshot([{twoTheta:5,intensity:0},{twoTheta:80,intensity:100}],undefined,'NaCl');expect(renderPlotSvg(solo)).not.toContain('data-curve="observed"');
});
