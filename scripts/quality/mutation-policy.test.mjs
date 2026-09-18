import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { assessMutation } from './mutation-policy.mjs';

const source='export const value=1;';
const report=states=>({files:{'src/file.ts':{source,mutants:states.map((status,i)=>({id:String(i),status,location:{start:{line:1,column:1},end:{line:1,column:2}},mutatorName:'NumberLiteral',replacement:String(i)}))}}});
const execution={completed:true,exitCode:0,startedAt:'2026-09-18T00:00:00Z',contract:{version:1},sourceHashes:{'src/file.ts':createHash('sha256').update(source).digest('hex')}};
test('normal completed run is advisory; survivors, uncovered, invalids and timeouts stay separate',()=>{
  const result=assessMutation(report(['Killed','Survived','NoCoverage','Timeout','CompileError','RuntimeError']),execution);
  assert.equal(result.policy,'advisory');assert.equal(result.score,50);
  assert.equal(result.counts.Survived,1);assert.equal(result.counts.NoCoverage,1);
  assert.equal(result.counts.CompileError,1);assert.equal(result.counts.Timeout,1);
});
test('failed initial tests, missing/stale reports, pending and ignored mutations cannot pass',()=>{
  assert.throws(()=>assessMutation(report(['Killed']),{...execution,completed:false,exitCode:1}),/failed/);
  assert.throws(()=>assessMutation(null,execution),/Missing/);
  assert.throws(()=>assessMutation(report(['Pending']),execution),/invalid mutant/);
  assert.throws(()=>assessMutation(report(['Ignored']),execution),/Ignored/);
  assert.throws(()=>assessMutation(report(['Killed']),{...execution,sourceHashes:{}}),/Stale/);
  assert.throws(()=>assessMutation(report(['Killed']),execution,{counts:{}}),/Invalid mutation comparison baseline/);
});
test('comparable outcomes show regressions without failing scores; configuration changes invalidate comparison',()=>{
  const baseline=assessMutation(report(['Killed','Killed']),execution);
  const regression=assessMutation(report(['Killed','Survived']),execution,baseline);
  assert.equal(regression.comparison,'comparable');assert.equal(regression.changes.Survived,1);
  const changed=assessMutation(report(['Killed','Survived']),{...execution,contract:{version:2}},baseline);
  assert.match(changed.comparison,/not comparable/);assert.equal(changed.changes,null);
  assert.throws(()=>assessMutation(report(['Killed','Killed']),execution,{...baseline,counts:{...baseline.counts,Killed:3}}),/Invalid baseline population/);
});
