// Sequential complete-pilot benchmark of concurrency/checker variants on identical inputs.
// Results are measurements for a policy decision, not policy evidence themselves.
import { execFileSync, spawn } from 'node:child_process';
import { availableParallelism, freemem, totalmem } from 'node:os';
import { access, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { benchConfig, benchUsage, compareOutcomes, countStatuses, parseBenchArgs, parseLogPhases } from './mutation-dev.mjs';
import { changedInputs, collectInputs, configHashes, readJson, toolVersions } from './mutation-inputs.mjs';

const gib=bytes=>Math.round(bytes/2**30*100)/100;
const exists=file=>access(file).then(()=>true,()=>false);
const writeJson=(file,value)=>writeFile(file,JSON.stringify(value,null,2)+'\n');

function runStryker(configFile) {
  return new Promise((resolveRun,reject)=>{
    let minFree=freemem();
    const sampler=setInterval(()=>{ minFree=Math.min(minFree,freemem()); },2000);
    const child=spawn(process.execPath,[resolve('node_modules/@stryker-mutator/core/bin/stryker.js'),'run',configFile],{stdio:'inherit',windowsHide:true});
    child.on('error',error=>{ clearInterval(sampler);reject(error); });
    child.on('close',code=>{ clearInterval(sampler);resolveRun({exitCode:code,minFree}); });
  });
}

try {
  const options=parseBenchArgs(process.argv.slice(2),{cpus:availableParallelism()});
  if(options.help) { console.log(benchUsage); process.exit(0); }
  if(process.versions.node.split('.')[0]!=='22') throw new Error('Mutation tooling requires Node 22');
  // Stryker appends its debug file log to ./stryker.log; never mix it with an existing log.
  if(await exists('stryker.log')) throw new Error('stryker.log already exists in the repository root; move it before benchmarking');
  const freeAtStart=gib(freemem());
  if(freeAtStart<options.minFreeGb&&!options.allowBusy) {
    throw new Error(`Only ${freeAtStart} GiB free (minimum ${options.minFreeGb}). Close other heavy jobs, or pass --allow-busy to record a contended run.`);
  }
  const base=await readJson('stryker.config.json');
  if(base.incremental) throw new Error('Benchmarks require a non-incremental base configuration');
  const inputs=await collectInputs();
  const root=`reports/mutation-benchmark/${new Date().toISOString().replace(/[:.]/g,'-')}`;
  await mkdir(root,{recursive:true});
  const summary={authoritative:false,
    note:'Complete-pilot measurements on identical inputs. Adopting any variant still requires review of outcome differences.',
    commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',windowsHide:true}).trim(),
    dirtyTree:execFileSync('git',['status','--porcelain'],{encoding:'utf8',windowsHide:true}).trim().length>0,
    environment:{node:process.version,platform:process.platform,arch:process.arch,cpus:availableParallelism(),
      totalMemoryGiB:gib(totalmem()),freeMemoryAtStartGiB:freeAtStart,contended:freeAtStart<options.minFreeGb},
    tools:toolVersions(await readJson('package-lock.json')),configHashes:await configHashes(),variants:[]};

  for(const variant of options.variants) {
    const dir=`${root}/${variant.name}`;
    await mkdir(dir,{recursive:true});
    const configFile=`${dir}/stryker.config.json`;
    await writeJson(configFile,benchConfig(base,variant,dir));
    console.log(`\n=== ${variant.name}: concurrency ${variant.concurrency}, ${variant.checker} checking ===`);
    const freeBefore=gib(freemem()),startedAt=new Date();
    const {exitCode,minFree}=await runStryker(configFile);
    const finishedAt=new Date();
    if(await exists('stryker.log')) await rename('stryker.log',`${dir}/stryker.log`);
    const changed=await changedInputs(inputs);
    if(changed.length) throw new Error(`Inputs changed during benchmark (${changed[0]}); results are not comparable`);
    const result={...variant,exitCode,startedAt:startedAt.toISOString(),durationSeconds:(finishedAt-startedAt)/1000,
      freeMemoryBeforeGiB:freeBefore,minFreeMemoryGiB:gib(minFree)};
    if(exitCode===0) {
      result.phasesSeconds=parseLogPhases(await readFile(`${dir}/stryker.log`,'utf8'),startedAt);
      result.counts=countStatuses(await readJson(`${dir}/mutation.json`));
    }
    summary.variants.push(result);
    await writeJson(`${root}/summary.json`,summary);
    if(exitCode!==0) throw new Error(`${variant.name} failed with exit code ${exitCode}; later variants skipped`);
  }

  const [reference,...candidates]=summary.variants;
  const referenceReport=await readJson(`${root}/${reference.name}/mutation.json`);
  for(const candidate of candidates) {
    const comparison=compareOutcomes(referenceReport,await readJson(`${root}/${candidate.name}/mutation.json`));
    candidate.outcomeComparison={reference:reference.name,identical:comparison.identical,
      onlyReference:comparison.onlyReference.length,onlyCandidate:comparison.onlyCandidate.length,statusChanges:comparison.statusChanges.length};
    await writeJson(`${root}/${candidate.name}/outcome-diff.json`,comparison);
  }
  await writeJson(`${root}/summary.json`,summary);
  console.log('\nvariant | seconds | initial run | checking done | min free GiB | outcomes vs reference');
  for(const v of summary.variants) {
    const diff=v.outcomeComparison ? (v.outcomeComparison.identical ? 'identical' : `${v.outcomeComparison.statusChanges} status changes, ${v.outcomeComparison.onlyReference+v.outcomeComparison.onlyCandidate} identity differences`) : 'reference';
    console.log(`${v.name} | ${v.durationSeconds} | ${v.phasesSeconds?.initialRunDone??'-'} | ${v.phasesSeconds?.checkingDone??'-'} | ${v.minFreeMemoryGiB} | ${diff}`);
  }
  console.log(`\nSummary: ${root}/summary.json${summary.environment.contended ? ' (CONTENDED: started below the free-memory minimum)' : ''}`);
} catch(error) {
  console.error(error.message);process.exitCode=1;
}
