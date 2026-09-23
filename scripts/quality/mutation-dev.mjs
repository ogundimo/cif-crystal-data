// Pure helpers for local mutation feedback and benchmarking. Neither mode is authoritative:
// the complete accurate run in run-mutation.mjs remains the only policy evidence.
import { hash, mutationScope, testInput } from './mutation-inputs.mjs';

const checkerModes=['accurate','grouped'];
const positiveInteger=(value,flag)=>{
  if(!/^[1-9]\d*$/.test(value??'')) throw new Error(`${flag} requires a positive integer (received: ${value??'nothing'})`);
  return Number(value);
};
const takeValue=(argv,index,flag)=>{
  const value=argv[index+1];
  if(value===undefined||value.startsWith('--')) throw new Error(`${flag} requires a value`);
  return value;
};

export const devUsage=`Usage: npm run test:mutation:dev -- [options]
  --file <path>[:<start>-<end>]  Mutate one pilot file, optionally a line range (repeatable).
                                 Default: the whole pilot scope.
  --fresh                        Discard the local incremental cache before running.
  --concurrency <n>              Override stryker.config.json concurrency.
  --grouped-check                EXPERIMENTAL: group TypeScript checks (may misclassify compile errors).
  --help                         Show this message.
Results go to reports/mutation-dev/ and are never comparable to the authoritative run.`;

function parseFileSelection(value) {
  const match=/^(.+?)(?::(\d+)-(\d+))?$/.exec(value.replaceAll('\\','/').replace(/^\.\//,''));
  const file=match[1];
  if(!mutationScope.includes(file)) throw new Error(`--file must be one of the mutation pilot files: ${mutationScope.join(', ')} (received: ${file})`);
  if(match[2]===undefined) return {file};
  const start=Number(match[2]),end=Number(match[3]);
  if(start<1||end<start) throw new Error(`Invalid line range for ${file}: ${match[2]}-${match[3]}`);
  return {file,start,end};
}

export function parseDevArgs(argv,{cpus}) {
  const options={files:[],fresh:false,concurrency:null,checker:'accurate',help:false};
  for(let index=0;index<argv.length;index++) {
    const flag=argv[index];
    if(flag==='--help') options.help=true;
    else if(flag==='--fresh') options.fresh=true;
    else if(flag==='--grouped-check') options.checker='grouped';
    else if(flag==='--file') options.files.push(parseFileSelection(takeValue(argv,index++,flag)));
    else if(flag==='--concurrency') {
      options.concurrency=positiveInteger(takeValue(argv,index++,flag),flag);
      if(options.concurrency>cpus) throw new Error(`--concurrency ${options.concurrency} exceeds ${cpus} logical CPUs`);
    } else throw new Error(`Unsupported option: ${flag}\n${devUsage}`);
  }
  const selections=options.files.map(selectionPattern);
  if(new Set(selections).size!==selections.length) throw new Error('Duplicate --file selection');
  return options;
}

export const selectionPattern=({file,start,end})=>start===undefined ? file : `${file}:${start}-${end}`;

// Derive a run-specific Stryker config from the executable one. Relative paths resolve
// from the repository root, so the generated file may live under reports/.
function derivedConfig(base,{outDir,concurrency,checker,tempDirName}) {
  if(!checkerModes.includes(checker)) throw new Error(`Unknown checker mode: ${checker}`);
  const {$schema,...config}=structuredClone(base);
  config.htmlReporter={fileName:`${outDir}/index.html`};
  config.jsonReporter={fileName:`${outDir}/mutation.json`};
  config.tempDirName=tempDirName;
  config.typescriptChecker={...config.typescriptChecker,prioritizePerformanceOverAccuracy:checker==='grouped'};
  if(concurrency) config.concurrency=concurrency;
  return config;
}

export function devConfig(base,options,outDir) {
  return {...derivedConfig(base,{outDir,concurrency:options.concurrency,checker:options.checker,tempDirName:'.stryker-tmp-dev'}),
    mutate:options.files.length ? options.files.map(selectionPattern) : [...base.mutate],
    incremental:true,incrementalFile:incrementalFile(outDir,options.checker)};
}

export const incrementalFile=(outDir,checker)=>`${outDir}/incremental-${checker}.json`;

// Stryker's incremental mode tracks mutated files and test files. It cannot see other
// production modules, fixtures, dependencies, configuration, toolchain or environment,
// so any change to those discards the cache.
export function cacheFingerprint({nodeVersion,platform,arch,tools,configHashes,checker},inputs) {
  const untracked=inputs.filter(([file])=>!mutationScope.includes(file)&&!(testInput(file)&&/\.test\.tsx?$/.test(file)));
  return hash(JSON.stringify({schema:1,nodeVersion,platform,arch,tools,configHashes,checker,inputs:untracked}));
}

export function parseBenchArgs(argv,{cpus}) {
  const options={variants:[],minFreeGb:3,allowBusy:false,help:false};
  for(let index=0;index<argv.length;index++) {
    const flag=argv[index];
    if(flag==='--help') options.help=true;
    else if(flag==='--allow-busy') options.allowBusy=true;
    else if(flag==='--min-free-gb') {
      const value=Number(takeValue(argv,index++,flag));
      if(!Number.isFinite(value)||value<0) throw new Error('--min-free-gb requires a non-negative number');
      options.minFreeGb=value;
    } else if(flag==='--variant') {
      const [count,checker='accurate',...rest]=takeValue(argv,index++,flag).split(':');
      if(rest.length||!checkerModes.includes(checker)) throw new Error('--variant must be <concurrency>[:accurate|grouped]');
      const concurrency=positiveInteger(count,flag);
      if(concurrency>cpus) throw new Error(`--variant concurrency ${concurrency} exceeds ${cpus} logical CPUs`);
      options.variants.push({name:`c${concurrency}-${checker}`,concurrency,checker});
    } else throw new Error(`Unsupported option: ${flag}\n${benchUsage}`);
  }
  if(!options.variants.length) options.variants=[{name:'c2-accurate',concurrency:2,checker:'accurate'},{name:'c4-accurate',concurrency:4,checker:'accurate'}];
  if(new Set(options.variants.map(v=>v.name)).size!==options.variants.length) throw new Error('Duplicate --variant');
  return options;
}

export const benchUsage=`Usage: npm run benchmark:mutation -- [options]
  --variant <n>[:accurate|grouped]  Concurrency and checker mode (repeatable).
                                    Default: 2:accurate and 4:accurate.
  --min-free-gb <gb>                Refuse to start below this free memory (default 3).
  --allow-busy                      Start anyway; results are labelled contended.
  --help                            Show this message.
Runs the complete pilot sequentially per variant into reports/mutation-benchmark/.`;

export function benchConfig(base,variant,outDir) {
  const config=derivedConfig(base,{outDir,concurrency:variant.concurrency,checker:variant.checker,tempDirName:'.stryker-tmp-bench'});
  delete config.incremental;delete config.incrementalFile;
  config.fileLogLevel='debug';
  return config;
}

// Stryker log lines start "HH:MM:SS (pid) LEVEL Category message" in local time.
const phaseMarkers={
  instrumented:/ INFO Instrumenter Instrumented /,
  initialRunDone:/ INFO DryRunExecutor Initial test run succeeded/,
  checkingDone:/ DEBUG ConcurrencyTokenProvider Checking done/,
  mutationDone:/ INFO MutationTestExecutor Done in /
};
export function parseLogPhases(text,startedAt) {
  const start=new Date(startedAt);
  const phases={};
  let dayOffset=0,previous=start.getHours()*3600+start.getMinutes()*60+start.getSeconds();
  for(const line of text.split(/\r?\n/)) {
    const time=/^(\d{2}):(\d{2}):(\d{2}) \(\d+\) /.exec(line);
    if(!time) continue;
    const secondsOfDay=Number(time[1])*3600+Number(time[2])*60+Number(time[3]);
    if(secondsOfDay<previous) dayOffset++;
    previous=secondsOfDay;
    for(const [phase,pattern] of Object.entries(phaseMarkers)) {
      if(phases[phase]===undefined&&pattern.test(line)) {
        const at=new Date(start);at.setHours(0,0,0,0);
        at.setSeconds((dayOffset*86400)+secondsOfDay);
        phases[phase]=Math.round((at-start)/1000);
      }
    }
  }
  return phases;
}

const mutantKey=(file,mutant)=>[file,mutant.location.start.line,mutant.location.start.column,
  mutant.location.end.line,mutant.location.end.column,mutant.mutatorName,mutant.replacement].join('|');
function outcomes(report) {
  const map=new Map();
  for(const [file,data] of Object.entries(report.files)) for(const mutant of data.mutants) {
    const key=mutantKey(file,mutant);
    let unique=key;
    for(let n=2;map.has(unique);n++) unique=`${key}#${n}`;
    map.set(unique,mutant.status);
  }
  return map;
}

export function countStatuses(report) {
  const counts={};
  for(const status of outcomes(report).values()) counts[status]=(counts[status]??0)+1;
  return counts;
}

// Compare per-mutant outcomes by identity, not by Stryker's run-local numeric id.
export function compareOutcomes(reference,candidate) {
  const a=outcomes(reference),b=outcomes(candidate);
  const onlyReference=[...a.keys()].filter(key=>!b.has(key)).sort();
  const onlyCandidate=[...b.keys()].filter(key=>!a.has(key)).sort();
  const statusChanges=[...a].filter(([key,status])=>b.has(key)&&b.get(key)!==status)
    .map(([key,status])=>({mutant:key,reference:status,candidate:b.get(key)})).sort((x,y)=>x.mutant.localeCompare(y.mutant));
  return {identical:!onlyReference.length&&!onlyCandidate.length&&!statusChanges.length,onlyReference,onlyCandidate,statusChanges};
}
