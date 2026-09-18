import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { resolve, join, relative } from 'node:path';
import { compareRegression } from './regression-policy.mjs';
import { combineCoverage } from './scope.mjs';

test('actual V8 coverage loses an exercised branch and the policy rejects that file',async()=>{
  const parent=resolve('.dist');await mkdir(parent,{recursive:true});
  const directory=await mkdtemp(join(parent,'coverage-policy-'));
  const source=join(directory,'example.ts'),tests=join(directory,'example.test.ts');
  const config=join(directory,'vitest.config.mjs'),output=join(directory,'coverage');
  const portable=file=>file.replaceAll('\\','/');
  try {
    await writeFile(source,'export function choose(flag: boolean) { if (flag) return 1; return 2; }\n');
    await writeFile(config,`export default ${JSON.stringify({test:{globals:true,environment:'node',include:[portable(tests)],coverage:{provider:'v8',include:[portable(source)],reporter:['json-summary'],reportsDirectory:portable(output)}}})};\n`);
    async function measure(body) {
      await writeFile(tests,`import {choose} from './example'; test('contract',()=>{${body}});\n`);
      const run=spawnSync(process.execPath,[resolve('node_modules/vitest/vitest.mjs'),'run','--coverage','--config',config],{encoding:'utf8',windowsHide:true});
      assert.equal(run.status,0,run.stdout+'\n'+run.stderr);
      const report=JSON.parse(await readFile(join(output,'coverage-summary.json'),'utf8'));
      const row=Object.entries(report).find(([file])=>file!=='total')?.[1];assert.ok(row);
      return {schemaVersion:1,contract:{probe:1},production:['src/example.ts'],declarationOnly:[],
        coverage:{files:{'src/example.ts':row},total:combineCoverage([row])},
        complexity:{cyclomatic:[{key:'src/example.ts::choose#1',file:'src/example.ts',line:1,column:1,value:2}],cognitive:[]},
        policy:{cyclomatic:20,cognitive:20},review:{reason:'probe',trigger:'change'}};
    }
    const baseline=await measure('expect(choose(true)).toBe(1); expect(choose(false)).toBe(2);');
    const regressed=await measure('expect(choose(true)).toBe(1);');
    assert.match(compareRegression(regressed,baseline).failures.join('\n'),/src\/example.ts: branches/);
    assert.deepEqual(compareRegression(baseline,regressed).failures,[]);
  } finally {
    // Only the exact mkdtemp child of the verified workspace output is removed.
    const child=relative(parent,directory);
    assert.ok(child.startsWith('coverage-policy-')&&!child.includes('..'));
    await rm(directory,{recursive:true,force:true});
  }
});
