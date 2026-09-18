import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import ts from 'typescript';
import { compareRegression, identifyFunctions, protectBaseline } from './regression-policy.mjs';
import { isProduction } from './scope.mjs';

const read = async file => JSON.parse(await readFile(file,'utf8'));
const hash = text => createHash('sha256').update(text.replaceAll('\r\n','\n')).digest('hex');
const git = (...args) => execFileSync('git',args,{encoding:'utf8',windowsHide:true}).trim();
const baselinePath = 'docs/baselines/regression-policy.json';
const contractFiles = ['scripts/quality/scope.mjs','scripts/quality/analyzers.mjs','vitest.config.ts',
  'package-lock.json','tsconfig.web.json','tsconfig.node.json'];

async function snapshot() {
  const report = await read('reports/quality/baseline.json');
  if (report.node.split('.')[0] !== 'v22' || process.versions.node.split('.')[0] !== '22') throw new Error('Regression measurements require Node 22');
  const inventory = git('ls-files','--cached','--others','--exclude-standard','-z').split('\0').filter(isProduction).sort();
  const recorded = report.inventory.filter(row => isProduction(row.file));
  if (JSON.stringify(inventory) !== JSON.stringify(recorded.map(row => row.file).sort())) throw new Error('Stale production inventory; rerun quality:baseline');
  const contents = new Map();
  for (const row of recorded) {
    const text = await readFile(row.file,'utf8'); contents.set(row.file,text);
    if (hash(text) !== row.sha256) throw new Error(`Stale source measurement: ${row.file}`);
  }
  const contract = {tools:report.tools, files:{}};
  const lock = await read('package-lock.json');
  for (const [name,version] of Object.entries(report.tools)) {
    if (lock.packages[`node_modules/${name}`]?.version !== version) throw new Error(`Stale analyzer version: ${name}`);
  }
  for (const file of contractFiles) contract.files[file]=hash(await readFile(file,'utf8'));
  if (JSON.stringify(contract.files) !== JSON.stringify(report.regressionContract)) throw new Error('Stale measurement configuration; rerun quality:baseline');
  const testFiles = git('ls-files','--cached','--others','--exclude-standard','-z').split('\0').filter(f => /^src\/.*\.test\.tsx?$/.test(f)).sort();
  const testHash = hash(JSON.stringify(await Promise.all(testFiles.map(async file => [file,hash(await readFile(file,'utf8'))]))));
  if (testHash !== report.regressionTests) throw new Error('Stale test measurement; rerun quality:baseline');
  const inputFiles = git('ls-files','--cached','--others','--exclude-standard','-z').split('\0')
    .filter(file => file.startsWith('src/') && !file.startsWith('src/renderer/public/vendor/')).sort();
  const inputHash = hash(JSON.stringify(await Promise.all(inputFiles.map(async file =>
    [file,createHash('sha256').update(await readFile(file)).digest('hex')]))));
  if (inputHash !== report.regressionInputs) throw new Error('Stale source/fixture input measurement; rerun quality:baseline');
  const declarationOnly=[];
  for (const file of inventory.filter(file => !report.coverage.files[file])) {
    const emitted=ts.transpileModule(contents.get(file),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,removeComments:true}}).outputText.replace(/export\s*\{\s*\}\s*;?/g,'').trim();
    if (emitted) throw new Error(`Missing executable coverage: ${file}`);
    declarationOnly.push(file);
  }
  const complexity={};
  for (const metric of ['cyclomatic','cognitive']) {
    complexity[metric]=inventory.flatMap(file => identifyFunctions(file,contents.get(file),report.complexity[metric].filter(row => row.file===file)));
  }
  return {schemaVersion:1,contract,production:inventory,declarationOnly,coverage:{total:report.coverage.total,files:report.coverage.files},complexity,
    provenance:{commit:report.commit,dirty:report.dirty,sourceSha256:report.sourceSha256,node:report.node,testsSha256:testHash,inputsSha256:inputHash}};
}

await mkdir(resolve('reports/quality'),{recursive:true});
await rm('reports/quality/regression.json',{force:true});
try {
  const current=await snapshot();
  if(process.argv.includes('--capture')) {
    const reason=process.argv[process.argv.indexOf('--capture')+1];
    if(!reason || reason.startsWith('--')) throw new Error('--capture requires an explicit review rationale');
    current.policy={cyclomatic:20,cognitive:20};
    current.exceptionsOnly=true;
    current.review={reason,trigger:'Any increase, rename/move, analyzer or scope change; revisit during #52/#53 simplification.'};
    for(const metric of ['cyclomatic','cognitive']) {
      current.complexity[metric]=current.complexity[metric].filter(row=>row.value>20);
      for(const row of current.complexity[metric]) {
        row.reason='Existing measured orchestration/validation logic; preserve behavior while incremental gates prevent further growth.';
        row.reviewTrigger=current.review.trigger;
      }
    }
    await writeFile(baselinePath,JSON.stringify(current,null,2)+'\n');
    console.log(`Candidate baseline written to ${baselinePath}; review its full diff before adoption.`);
  } else {
    const baseline=await read(baselinePath);
    const result=compareRegression(current,baseline);
    const baseIndex=process.argv.indexOf('--base');
    if(baseIndex!==-1) {
      const ref=process.argv[baseIndex+1];
      if(!ref || ref.startsWith('-')) throw new Error('--base requires a Git revision');
      const exists=execFileSync('git',['ls-tree',ref,'--',baselinePath],{encoding:'utf8',windowsHide:true}).trim();
      if(exists) {
        const previous=JSON.parse(git('show',`${ref}:${baselinePath}`));
        result.failures.push(...protectBaseline(baseline,previous).failures.map(s=>`Baseline update: ${s}`));
        result.failures.push(...compareRegression(current,previous).failures.map(s=>`Target-branch policy: ${s}`));
      } else console.log('Initial policy adoption: target branch has no regression baseline.');
    }
    await mkdir(resolve('reports/quality'),{recursive:true});
    await writeFile('reports/quality/regression.json',JSON.stringify(result,null,2)+'\n');
    console.log(result.accepted.join('\n'));
    if(result.failures.length) {
      console.error(result.failures.join('\n')); process.exitCode=1;
    } else console.log('Coverage and function-complexity regression gates passed. Accepted exceptions remain in regression.json.');
  }
} catch(error) {
  await writeFile('reports/quality/regression.json',JSON.stringify({failures:[error.message],accepted:[]},null,2)+'\n');
  console.error(error.message); process.exitCode=1;
}
