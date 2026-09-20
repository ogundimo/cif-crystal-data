import { app,BrowserWindow,dialog,ipcMain,nativeImage } from 'electron';
import { screenWindowBounds,keepWindowOnScreen } from './windowBounds';
import { writeFile } from 'node:fs/promises';
import { join,extname } from 'node:path';
import { exportPlotDesign,renderPlotSvg,renderPlotCsv,plotCsvFilename,validatePlotSnapshot,type PlotSnapshot,type PlotFormat } from '../shared/plot';
import { encodeTiff,jpegWithDpi,pngWithDpi } from './plotImages';

export async function plotBytes(snapshot:PlotSnapshot):Promise<Buffer> {
  validatePlotSnapshot(snapshot);
  if(snapshot.design.format==='csv')return Buffer.from(renderPlotCsv(snapshot),'utf8');
  const {design}=snapshot,svg=renderPlotSvg(snapshot);
  if(design.format==='svg')return Buffer.from(svg);
  const hidden=new BrowserWindow({show:false,width:800,height:600,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
  hidden.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  try {
    await hidden.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src blob: data:; style-src \'unsafe-inline\'"><body style="margin:0"></body>'));
    if(design.format==='pdf'){
      const html=`<style>@page{size:${design.width}in ${design.height}in;margin:0}html,body{margin:0;width:${design.width}in;height:${design.height}in}svg{width:${design.width}in!important;height:${design.height}in!important}</style>${svg}`;
      await hidden.webContents.executeJavaScript(`document.body.innerHTML=${JSON.stringify(html)};document.fonts.ready.then(()=>true)`);
      return await hidden.webContents.printToPDF({printBackground:true,preferCSSPageSize:true,pageSize:{width:design.width,height:design.height},margins:{top:0,bottom:0,left:0,right:0}});
    }
    const width=Math.round(design.width*design.dpi),height=Math.round(design.height*design.dpi);
    const url=await hidden.webContents.executeJavaScript(`(async()=>{const svg=${JSON.stringify(svg)};const blob=new Blob([svg],{type:'image/svg+xml'});const url=URL.createObjectURL(blob);try{const image=new Image();image.src=url;await image.decode();const canvas=document.createElement('canvas');canvas.width=${width};canvas.height=${height};const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);return canvas.toDataURL('image/png');}finally{URL.revokeObjectURL(url);}})()`);
    const png=Buffer.from(String(url).split(',')[1],'base64');
    if(design.format==='png')return pngWithDpi(png,design.dpi);
    const image=nativeImage.createFromBuffer(png);
    if(design.format==='jpg')return jpegWithDpi(image.toJPEG(95),design.dpi);
    return encodeTiff(image.toBitmap(),width,height,design.dpi);
  } finally { hidden.destroy(); }
}

export function registerPlotExportHandlers(mainDir:string) {
  const snapshots=new Map<number,PlotSnapshot>(),saving=new Set<number>();
  ipcMain.handle('cif:openPlotExport',async(event,input:unknown)=>{
    const snapshot=validatePlotSnapshot(input),parent=BrowserWindow.fromWebContents(event.sender);
    const win=new BrowserWindow({title:'Export Plot',...screenWindowBounds(1450,950,800,500,parent),parent:parent??undefined,autoHideMenuBar:true,webPreferences:{preload:join(mainDir,'../preload/index.cjs'),contextIsolation:true,nodeIntegration:false}});
    keepWindowOnScreen(win,800,500);
    if(!snapshot.design.simulatedPattern)snapshot.design=exportPlotDesign(snapshot.design);
    const id=win.webContents.id;snapshots.set(id,snapshot);win.on('closed',()=>{snapshots.delete(id);saving.delete(id);});
    try {if(process.env.ELECTRON_RENDERER_URL){const url=new URL(process.env.ELECTRON_RENDERER_URL);url.searchParams.set('view','plot-export');await win.loadURL(url.toString());}else await win.loadFile(join(mainDir,'../../dist/index.html'),{query:{view:'plot-export'}});}catch(error){win.destroy();throw error;}
  });
  ipcMain.handle('cif:getPlotExport',event=>{const snapshot=snapshots.get(event.sender.id);if(!snapshot)throw new Error('Reopen Export Plot from the refinement window.');return snapshot;});
  ipcMain.handle('cif:savePlotExport',async(event,design:unknown,view:unknown)=>{
    const id=event.sender.id,saved=snapshots.get(id);if(!saved)throw new Error('No plot snapshot.');if(saving.has(id))throw new Error('An export is already in progress.');
    const snapshot=validatePlotSnapshot({...saved,design,view});saving.add(id);
    try {
      const format=snapshot.design.format,parent=BrowserWindow.fromWebContents(event.sender);
      const formats:PlotFormat[]=[format,...(['png','jpg','tiff','svg','pdf','csv'] as PlotFormat[]).filter(f=>f!==format)];
      const options={title:'Export refinement plot',defaultPath:join(app.getPath('documents'),format==='csv'?plotCsvFilename(snapshot):'Refinement plot.'+format),filters:formats.map(f=>({name:f==='csv'?'CSV data':f==='svg'||f==='pdf'?f.toUpperCase()+' (vector)':f.toUpperCase()+' image',extensions:f==='jpg'?['jpg','jpeg']:f==='tiff'?['tiff','tif']:[f]}))};
      const selected=parent?await dialog.showSaveDialog(parent,options):await dialog.showSaveDialog(options);
      if(selected.canceled||!selected.filePath)return null;
      const suffix=extname(selected.filePath).toLowerCase();
      const selectedFormat:PlotFormat|undefined=({'.png':'png','.jpg':'jpg','.jpeg':'jpg','.tiff':'tiff','.tif':'tiff','.svg':'svg','.pdf':'pdf','.csv':'csv'} as Record<string,PlotFormat>)[suffix];
      if(!selectedFormat)throw new Error('Choose a PNG, JPG, TIFF, SVG, PDF or CSV file extension.');
      const selectedSnapshot={...snapshot,design:{...snapshot.design,format:selectedFormat}};
      validatePlotSnapshot(selectedSnapshot);
      await writeFile(selected.filePath,await plotBytes(selectedSnapshot));return selected.filePath;
    } finally {saving.delete(id);}
  });
}
