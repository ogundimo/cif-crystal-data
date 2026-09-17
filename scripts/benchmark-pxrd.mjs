import { build } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { cpus, release } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

await build({ configFile:false, logLevel:'error', build:{ outDir:'reports/scientific/benchmark',
  lib:{ entry:'src/renderer/src/pxrd.ts', formats:['es'], fileName:()=> 'pxrd.mjs' }, minify:false } });
const { calculatePxrd } = await import(pathToFileURL(resolve('reports/scientific/benchmark/pxrd.mjs')).href);
const cases = [];
for (const [name, length, count] of [['ordinary',5.64,8],['demanding',24,256],['large-cell',60,2]]) {
  const entry = {cell_a_angstrom:length,cell_b_angstrom:length,cell_c_angstrom:length,
    cell_angle_alpha:90,cell_angle_beta:90,cell_angle_gamma:90,sg_number:1,radiation_type:'X-rays',radiation_wavelength_angstrom:1.5406};
  const sites = Array.from({length:count},(_,i)=>({type_symbol:i%2?'O':'C',site_label:`C${i}`,
    fract_x:(i*.137)%1,fract_y:(i*.237)%1,fract_z:(i*.317)%1,occupancy:1,b_iso_or_equiv:.5,u_iso_or_equiv:null}));
  const samples=[];
  for(let repeat=0;repeat<3;repeat++) {
    const start=performance.now();
    const tick=new Promise(r=>setTimeout(()=>r(performance.now()-start),0));
    const result=calculatePxrd(entry,sites,[]);
    const calculationMs=performance.now()-start;
    samples.push({calculationMs,eventLoopDelayMs:await tick,peaks:result.peaks.length,status:result.status});
  }
  cases.push({name,cellAngstrom:[length,length,length],atomCount:count,operations:1,samples});
}
const report={node:process.version,cpu:cpus()[0]?.model,os:release(),kind:'Synchronous Node calculation and event-loop delay; not renderer interaction',memory:process.memoryUsage(),cases};
await mkdir('reports/scientific',{recursive:true});
await writeFile('reports/scientific/synchronous-performance.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
