import { spawnSync, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { assessMutation } from './mutation-policy.mjs';
import { isProduction } from './scope.mjs';

const read=async file=>JSON.parse(await readFile(file,'utf8'));
const hash=text=>createHash('sha256').update(text.replaceAll('\r\n','\n')).digest('hex');
const output='reports/mutation';
const execution={startedAt:new Date().toISOString(),completed:false,exitCode:null};
await mkdir(output,{recursive:true});
// Delete named generated reports before launching, so even a failed dry run cannot
// leave last run's score looking current. Preserve execution/failure provenance.
for(const file of ['mutation.json','index.html','policy.json']) await rm(`${output}/${file}`,{force:true});
await writeFile(`${output}/execution.json`,JSON.stringify(execution,null,2)+'\n');
try {
  if(process.versions.node.split('.')[0]!=='22') throw new Error('Mutation policy requires Node 22');
  const config=await read('stryker.config.json');
  const scope=['src/parser/cif/formula.ts','src/shared/searchValidation.ts','src/renderer/src/pxrd.ts'];
  if(JSON.stringify(config.mutate)!==JSON.stringify(scope) || config.mutator?.excludedMutations?.length ||
    config.ignoreStatic || config.incremental || config.thresholds.break!==0) throw new Error('Mutation scope/operator policy changed; explicit review required');
  const lock=await read('package-lock.json');
  const tools=Object.fromEntries(['@stryker-mutator/core','@stryker-mutator/vitest-runner','@stryker-mutator/typescript-checker','vitest','typescript']
    .map(name=>[name,lock.packages[`node_modules/${name}`].version]));
  execution.contract={nodeMajor:22,tools,configHashes:{}};
  for(const file of ['stryker.config.json','vitest.config.ts','tsconfig.mutation.json','package-lock.json']) execution.contract.configHashes[file]=hash(await readFile(file,'utf8'));
  const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8',windowsHide:true}).split('\0').filter(Boolean).sort();
  const inputs=await Promise.all(files.filter(file=>isProduction(file)||/^src\/.*\.test\.tsx?$/.test(file))
    .map(async file=>[file,hash(await readFile(file,'utf8'))]));
  execution.contract.productionSha256=hash(JSON.stringify(inputs.filter(([file])=>isProduction(file))));
  execution.testInputs=Object.fromEntries(inputs.filter(([file])=>!isProduction(file)));
  execution.sourceHashes=Object.fromEntries(await Promise.all(scope.sort().map(async file=>[file,hash(await readFile(file,'utf8'))])));
  execution.commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',windowsHide:true}).trim();
  const run=spawnSync(process.execPath,[resolve('node_modules/@stryker-mutator/core/bin/stryker.js'),'run'],{stdio:'inherit',windowsHide:true});
  execution.exitCode=run.status;execution.completed=run.status===0 && !run.error;
  execution.finishedAt=new Date().toISOString();
  execution.durationSeconds=(Date.parse(execution.finishedAt)-Date.parse(execution.startedAt))/1000;
  await writeFile(`${output}/execution.json`,JSON.stringify(execution,null,2)+'\n');
  if(!execution.completed) throw new Error(`Mutation execution failed: ${run.error?.message??run.status}`);
  for(const [file,digest] of inputs) if(hash(await readFile(file,'utf8'))!==digest) throw new Error(`Inputs changed during mutation execution: ${file}`);
  let baseline;
  try { baseline=await read('docs/baselines/mutation-policy.json'); } catch(error) { if(error.code!=='ENOENT') throw error; }
  const assessment=assessMutation(await read(`${output}/mutation.json`),execution,baseline);
  await writeFile(`${output}/policy.json`,JSON.stringify(assessment,null,2)+'\n');
  console.log(JSON.stringify(assessment,null,2));
} catch(error) {
  execution.completed=false;execution.error=error.message;
  await writeFile(`${output}/execution.json`,JSON.stringify(execution,null,2)+'\n');
  console.error(error.message);process.exitCode=1;
}
