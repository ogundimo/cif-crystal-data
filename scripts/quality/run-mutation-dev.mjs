// Local mutation feedback: scoped and incremental, with isolated outputs and cache.
// Never authoritative; use npm run test:mutation for policy evidence.
import { spawnSync } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { cacheFingerprint, countStatuses, devConfig, devUsage, incrementalFile, parseDevArgs, selectionPattern } from './mutation-dev.mjs';
import { changedInputs, collectInputs, configHashes, readJson, toolVersions } from './mutation-inputs.mjs';

const outDir='reports/mutation-dev';
const writeJson=(file,value)=>writeFile(file,JSON.stringify(value,null,2)+'\n');
const readOptionalJson=async file=>{
  try { return await readJson(file); } catch(error) { if(error.code==='ENOENT') return null; throw error; }
};

const execution={authoritative:false,
  note:'Local feedback only. Not comparable to the authoritative run or docs/baselines/mutation-policy.json.',
  startedAt:new Date().toISOString(),completed:false,exitCode:null};
try {
  const options=parseDevArgs(process.argv.slice(2),{cpus:availableParallelism()});
  if(options.help) { console.log(devUsage); process.exit(0); }
  if(process.versions.node.split('.')[0]!=='22') throw new Error('Mutation tooling requires Node 22');
  await mkdir(outDir,{recursive:true});
  for(const file of ['index.html','mutation.json','execution.json']) await rm(`${outDir}/${file}`,{force:true});

  const base=await readJson('stryker.config.json');
  const inputs=await collectInputs();
  const fingerprint=cacheFingerprint({nodeVersion:process.version,platform:process.platform,arch:process.arch,
    tools:toolVersions(await readJson('package-lock.json')),configHashes:await configHashes(),checker:options.checker},inputs);
  const cacheFile=incrementalFile(outDir,options.checker),metaFile=`${outDir}/cache-${options.checker}.json`;
  const meta=await readOptionalJson(metaFile);
  let invalidated=null;
  if(options.fresh) invalidated='--fresh requested';
  else if(!meta) invalidated='no cache metadata';
  else if(meta.fingerprint!==fingerprint) invalidated='dependencies, fixtures, configuration, toolchain or environment changed';
  if(invalidated) await rm(cacheFile,{force:true});
  const cacheExisted=!invalidated&&(await readOptionalJson(cacheFile))!==null;
  // Whatever incremental file this run writes corresponds to the current fingerprint.
  await writeJson(metaFile,{fingerprint,updatedAt:execution.startedAt});

  const config=devConfig(base,options,outDir);
  const configFile=`${outDir}/stryker.config.json`;
  await writeJson(configFile,config);
  Object.assign(execution,{checker:options.checker,
    experimental:options.checker==='grouped' ? 'Grouped TypeScript checking may misclassify compile errors.' : undefined,
    concurrency:config.concurrency,mutate:config.mutate,partialScope:options.files.length>0,
    cache:{file:cacheFile,reused:cacheExisted,invalidated,fingerprint}});
  await writeJson(`${outDir}/execution.json`,execution);
  console.log(`Local mutation feedback (${options.checker} checking, concurrency ${config.concurrency}): ${config.mutate.join(', ')}`);
  console.log(cacheExisted ? `Reusing incremental results from ${cacheFile}` : `No reusable cache (${invalidated??'first run'}); running the selected scope in full`);

  const run=spawnSync(process.execPath,[resolve('node_modules/@stryker-mutator/core/bin/stryker.js'),'run',configFile],{stdio:'inherit',windowsHide:true});
  execution.exitCode=run.status;execution.completed=run.status===0&&!run.error;
  execution.finishedAt=new Date().toISOString();
  execution.durationSeconds=(Date.parse(execution.finishedAt)-Date.parse(execution.startedAt))/1000;
  const changed=await changedInputs(inputs);
  if(changed.length) {
    await rm(cacheFile,{force:true});await rm(metaFile,{force:true});
    throw new Error(`Inputs changed during mutation execution (${changed[0]}); results and cache discarded`);
  }
  if(!execution.completed) throw new Error(`Mutation execution failed: ${run.error?.message??run.status}`);
  execution.counts=countStatuses(await readJson(`${outDir}/mutation.json`));
  await writeJson(`${outDir}/execution.json`,execution);
  console.log(`\nLocal feedback (NOT authoritative) in ${execution.durationSeconds}s: ${JSON.stringify(execution.counts)}`);
  console.log(`Report: ${outDir}/index.html${options.files.length ? ` (scope: ${options.files.map(selectionPattern).join(', ')})` : ''}`);
} catch(error) {
  execution.completed=false;execution.error=error.message;
  await mkdir(outDir,{recursive:true});
  await writeJson(`${outDir}/execution.json`,execution);
  console.error(error.message);process.exitCode=1;
}
