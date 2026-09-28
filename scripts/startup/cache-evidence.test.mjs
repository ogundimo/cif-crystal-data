import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { summarizeCacheSnapshot, validateCacheReset } from './cache-evidence.mjs';

function snapshot({target=true,list=2,image=false,architecture='amd64'}={}) {
  const data=Buffer.alloc(216);data.writeUInt32LE(1,0);data.writeUInt32LE(1,4);data.writeBigUInt64LE(1n,8);
  data[192]=(list<<4)|1;data.writeBigUInt64LE(12n,200);data.writeBigUInt64LE(target?(image?0xfffffffffffff001n:0xfffffffffffff000n):0x2000n,208);
  const counts=Buffer.alloc(64);counts.writeBigUInt64LE(1n,list*8);
  return `<root Application="RamMap" Version="1.0" Architecture="${architecture}"><FileList><File Key="-4096" Path="C:\\Kit &amp; Test\\App\\sample.exe"/></FileList><ListCounts>${counts.toString('hex')}</ListCounts><PfnDatabase>${data.toString('hex')}</PfnDatabase></root>`;
}
const roots=['c:/kit & test/app'];
test('recognizes signed keys, image flag, XML entities and Windows path normalization',()=>{
  const result=summarizeCacheSnapshot(snapshot({image:true}),roots);
  assert.equal(result.totalTargetPages,1);assert.equal(result.groups[0].pagesByList[2],1);
  assert.equal(summarizeCacheSnapshot(snapshot(),['c:/kit & test/app-other']).totalTargetPages,0);
});
test('requires positive before evidence and zero remaining target pages',()=>{
  assert.equal(validateCacheReset(snapshot(),snapshot({target:false}),roots).status,'target-files-absent-at-snapshot');
  assert.equal(validateCacheReset(snapshot({target:false}),snapshot({target:false}),roots).status,'not-validated');
  for(const list of [2,3,4,6,7]) assert.equal(validateCacheReset(snapshot(),snapshot({list}),roots).status,'not-validated');
});
test('rejects unsupported and corrupted snapshots instead of claiming cold caches',()=>{
  assert.throws(()=>summarizeCacheSnapshot(snapshot({architecture:'arm64'}),roots),/Unsupported/);
  assert.throws(()=>summarizeCacheSnapshot(snapshot().replace(/..(?=<\/PfnDatabase>)/,''),roots),/layout|truncated/);
  assert.throws(()=>summarizeCacheSnapshot(snapshot().replace('<ListCounts>0000000000000000','<ListCounts>0100000000000000'),roots),/disagree/);
  assert.throws(()=>summarizeCacheSnapshot(snapshot().replace('Architecture="amd64"','Architecture="amd64"><!DOCTYPE root'),roots));
});
test('recorded matrix retains all cases and does not report failed cold conditions as passing',()=>{
  const baseline=JSON.parse(readFileSync(new URL('../../docs/baselines/packaged-cache-reset-2026-09-17.json',import.meta.url),'utf8'));
  assert.equal(baseline.samples.length,18);
  for(const name of ['fresh','populated-off','populated-on','unavailable','upgrade','larger']) {
    assert.deepEqual(baseline.samples.filter(s=>s.caseName===name).map(s=>s.index),[1,2,3]);
  }
  for(const s of baseline.samples) {
    assert.ok(s.launchToSearchMs>0&&Number.isFinite(s.launchToSearchMs));
    const valid=s.cacheValidation.before.totalTargetPages>0&&s.cacheValidation.after.totalTargetPages===0;
    assert.equal(s.cacheValidation.status,valid?'target-files-absent-at-snapshot':'not-validated');
  }
  const failures=baseline.samples.filter(s=>s.cacheValidation.status==='not-validated').length;
  assert.equal(baseline.cacheValidationFailures,failures);assert.equal(failures,17);
  assert.equal(baseline.status,'failed-cache-validation');
});
