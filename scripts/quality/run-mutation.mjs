import { spawnSync, execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { assessMutation } from './mutation-policy.mjs';
import { changedInputs, collectInputs, configHashes, hash, mutationScope, productionInput, readJson as read, toolVersions } from './mutation-inputs.mjs';

// The authoritative run takes no options; scoped/incremental feedback belongs to test:mutation:dev.
// Reject before touching reports, so a mistyped command cannot discard the last run.
if(process.argv.length>2) {
  console.error(`test:mutation accepts no arguments (received: ${process.argv.slice(2).join(' ')}); use npm run test:mutation:dev for local feedback`);
  process.exit(1);
}
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
  const scope=[...mutationScope];
  if(JSON.stringify(config.mutate)!==JSON.stringify(scope) || config.mutator?.excludedMutations?.length ||
    config.ignoreStatic || config.incremental || config.thresholds.break!==0) throw new Error('Mutation scope/operator policy changed; explicit review required');
  execution.contract={nodeMajor:22,tools:toolVersions(await read('package-lock.json')),configHashes:await configHashes()};
  const inputs=await collectInputs();
  execution.contract.productionSha256=hash(JSON.stringify(inputs.filter(([file])=>productionInput(file))));
  execution.testInputs=Object.fromEntries(inputs.filter(([file])=>!productionInput(file)));
  execution.sourceHashes=Object.fromEntries(await Promise.all(scope.sort().map(async file=>[file,hash(await readFile(file,'utf8'))])));
  execution.commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',windowsHide:true}).trim();
  await writeFile(`${output}/execution.json`,JSON.stringify(execution,null,2)+'\n');
  const run=spawnSync(process.execPath,[resolve('node_modules/@stryker-mutator/core/bin/stryker.js'),'run'],{stdio:'inherit',windowsHide:true});
  execution.exitCode=run.status;execution.completed=run.status===0 && !run.error;
  execution.finishedAt=new Date().toISOString();
  execution.durationSeconds=(Date.parse(execution.finishedAt)-Date.parse(execution.startedAt))/1000;
  await writeFile(`${output}/execution.json`,JSON.stringify(execution,null,2)+'\n');
  if(!execution.completed) throw new Error(`Mutation execution failed: ${run.error?.message??run.status}`);
  const changed=await changedInputs(inputs);
  if(changed.length) throw new Error(`Inputs changed during mutation execution: ${changed[0]}`);
  for(const [file,digest] of Object.entries(execution.contract.configHashes)) {
    if(hash(await readFile(file,'utf8'))!==digest) throw new Error(`Configuration changed during mutation execution: ${file}`);
  }
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
