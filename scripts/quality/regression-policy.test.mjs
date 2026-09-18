import assert from 'node:assert/strict';
import test from 'node:test';
import { compareRegression, dimensions, identifyFunctions, protectBaseline } from './regression-policy.mjs';
import { createComplexityAnalyzer } from './analyzers.mjs';
import { complexityFinding, combineCoverage } from './scope.mjs';

const counters=(total=10,covered=5)=>Object.fromEntries(dimensions.map(d=>[d,{total,covered}]));
function snapshot() {
  return {schemaVersion:1,contract:{tools:{pinned:'1'}},production:['src/a.ts'],declarationOnly:[],
    coverage:{files:{'src/a.ts':counters()},total:counters()},
    complexity:{cyclomatic:[{key:'src/a.ts::work#1',file:'src/a.ts',line:1,column:1,value:2}],cognitive:[]},
    policy:{cyclomatic:20,cognitive:20},review:{reason:'fixture',trigger:'change'}};
}
const refresh=s=>{s.coverage.total=combineCoverage(Object.values(s.coverage.files));return s;};

test('baseline and improvements pass; coverage loss cannot be hidden by gains elsewhere',()=>{
  const base=snapshot(), next=snapshot();
  assert.deepEqual(compareRegression(next,base).failures,[]);
  next.coverage.files['src/a.ts'].lines.covered++;
  assert.deepEqual(compareRegression(refresh(next),base).failures,[]);
  next.coverage.files['src/a.ts'].branches.covered--;
  assert.match(compareRegression(refresh(next),base).failures.join('\n'),/src\/a.ts: branches/);
});
test('new untested files, missing reports, invalid counters and stale contracts fail closed',()=>{
  const base=snapshot(), next=snapshot();
  next.production.push('src/new.ts');next.coverage.files['src/new.ts']=counters(10,0);
  assert.match(compareRegression(refresh(next),base).failures.join('\n'),/new untested/);
  delete next.coverage.files['src/new.ts'];
  assert.throws(()=>compareRegression(refresh(next),base),/Missing coverage/);
  assert.throws(()=>compareRegression({},base),/Missing or invalid/);
  const invalid=snapshot();invalid.coverage.files['src/a.ts'].lines.covered=11;
  assert.throws(()=>compareRegression(invalid,base),/Invalid coverage/);
  const changed=snapshot();changed.contract.tools.pinned='2';
  assert.throws(()=>compareRegression(changed,base),/contract changed/);
});
test('zero denominators remain n/a; new executable dimensions need coverage',()=>{
  const base=snapshot();base.coverage.files['src/a.ts'].branches={total:0,covered:0};refresh(base);
  assert.deepEqual(compareRegression(base,base).failures,[]);
  const next=structuredClone(base);next.coverage.files['src/a.ts'].branches={total:2,covered:1};refresh(next);
  assert.match(compareRegression(next,base).failures.join('\n'),/newly executable/);
  next.coverage.files['src/a.ts'].branches.covered=2;refresh(next);
  assert.deepEqual(compareRegression(next,base).failures,[]);
});
test('narrow exceptions retain measured limits; rename/move and new functions get the default limit',()=>{
  const base=snapshot();base.complexity.cyclomatic[0]={...base.complexity.cyclomatic[0],value:24,reason:'legacy logic',reviewTrigger:'change'};
  assert.equal(compareRegression(base,base).accepted.length,1);
  const next=structuredClone(base);next.complexity.cyclomatic[0].value=25;
  assert.match(compareRegression(next,base).failures[0],/allowed=24/);
  next.complexity.cyclomatic[0].value=24;next.complexity.cyclomatic[0].key='src/a.ts::renamed#1';
  assert.match(compareRegression(next,base).failures[0],/allowed=20/);
  next.complexity.cyclomatic[0].key='src/moved.ts::work#1';
  assert.match(compareRegression(next,base).failures[0],/allowed=20/);
  next.complexity.cyclomatic[0].value=20;
  assert.deepEqual(compareRegression(next,base).failures,[]);
});
test('baseline rewrites cannot relax coverage, ceilings or existing function waivers',()=>{
  const base=snapshot(), next=snapshot();next.coverage.files['src/a.ts'].lines.covered=4;refresh(next);
  assert.ok(protectBaseline(next,base).failures.length);
  const ceiling=snapshot();ceiling.policy.cognitive=21;
  assert.match(protectBaseline(ceiling,base).failures.join('\n'),/ceiling increased/);
  const allowance=snapshot();allowance.complexity.cyclomatic[0].value=30;
  assert.match(protectBaseline(allowance,base).failures.join('\n'),/allowed=20/);
});
test('real analyzer detects injected branching and nesting in the correct stable function',async()=>{
  const analyzer=createComplexityAnalyzer();
  const file='src/fixture.ts';
  async function measure(text) {
    const [result]=await analyzer.lintText(text,{filePath:file});
    const value=snapshot();value.complexity={cyclomatic:[],cognitive:[]};
    for(const metric of ['cyclomatic','cognitive']) {
      const rule=metric==='cyclomatic'?'complexity':'sonarjs/cognitive-complexity';
      value.complexity[metric]=identifyFunctions(file,text,result.messages.filter(m=>m.ruleId===rule).map(m=>complexityFinding(file,m)));
    }
    return value;
  }
  const base=await measure('export function work(x:boolean,y:boolean) { if(x) return 1; return 0; }');
  base.policy={cyclomatic:2,cognitive:1};
  const next=await measure('\n\nexport function work(x:boolean,y:boolean) { if(x) { if(y) return 1; } return 0; }');
  assert.equal(next.complexity.cyclomatic[0].key,base.complexity.cyclomatic[0].key);
  const failures=compareRegression(next,base).failures.join('\n');
  assert.match(failures,/work#1 cyclomatic=3, allowed=2/);
  assert.match(failures,/work#1 cognitive=3, allowed=1/);
});
test('arrow properties, nested callbacks and implicit class initializers have distinct identities',async()=>{
  const file='src/fixture.ts';
  const source='class Example { state = {ready: false}; run = () => [1].map(x => x ? 1 : 0); } const api = { get: () => true };';
  const [result]=await createComplexityAnalyzer().lintText(source,{filePath:file});
  const rows=identifyFunctions(file,source,result.messages.filter(m=>m.ruleId==='complexity').map(m=>complexityFinding(file,m)));
  assert.equal(new Set(rows.map(row=>row.key)).size,rows.length);
  assert.ok(rows.some(row=>row.key.includes('state/<initializer>')));
  assert.ok(rows.some(row=>row.key.includes('run#1/<callback>#1')));
  assert.ok(rows.some(row=>row.key.includes('get#1')));
});
