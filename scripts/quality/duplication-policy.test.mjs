import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { cloneIdentity, compareDuplication, protectDuplicationPolicy, tokenFingerprint } from './duplication-policy.mjs';
import { measureDuplication } from './analyzers.mjs';
import { category } from './scope.mjs';

const source = Array.from({length:14}, (_, n) => `  result.field${n} = input.field${n} + ${n};`).join('\n');
const sources = new Map([['src/a.ts', source], ['src/b.ts', source]]);
const clone = cloneIdentity({format:'typescript', a:{file:'src/a.ts',start:1,end:14}, b:{file:'src/b.ts',start:1,end:14}}, sources);
const contract = {detector:'pinned'};
const policy = () => ({schemaVersion:1, contract, allowances:[{key:clone.key,count:1,
  reason:'Reviewed distinct contracts',reviewTrigger:'Any token/path change',issue:'https://github.com/ogundimo/cif-crystal-data/issues/56'}]});
const current = clones => ({contract, clones});

test('retained pair and removal pass; new, expanded and additional copies fail', () => {
  assert.deepEqual(compareDuplication(current([clone]), policy()).failures, []);
  assert.deepEqual(compareDuplication(current([]), policy()).failures, []);
  assert.match(compareDuplication(current([clone,clone]), policy()).failures[0], /src\/a.ts:1.*src\/b.ts:1/);
  const changed = new Map(sources); changed.set('src/b.ts', source.replace('field2', 'anotherField'));
  const expanded = cloneIdentity(clone, changed);
  assert.equal(compareDuplication(current([expanded]), policy()).failures.length, 1);
  const longer = new Map([...sources].map(([file,text]) => [file,text+'\nresult.extra = input.extra;']));
  const extended = cloneIdentity({...clone,a:{...clone.a,end:15},b:{...clone.b,end:15}}, longer);
  assert.equal(compareDuplication(current([extended]), policy()).failures.length, 1);
});

test('line drift and trivia preserve identity; path changes require review', () => {
  const shifted = new Map([...sources].map(([file,text]) => [file,'// comment\n'+text]));
  const movedLines = cloneIdentity({...clone,a:{...clone.a,start:2,end:15},b:{...clone.b,start:2,end:15}}, shifted);
  assert.equal(movedLines.key, clone.key);
  assert.equal(tokenFingerprint('const x = 1; // a'), tokenFingerprint(' const x=1;'));
  const renamed = new Map(sources); renamed.set('src/moved.ts', source);
  assert.notEqual(cloneIdentity({...clone,a:{...clone.a,file:'src/moved.ts'}}, renamed).key, clone.key);
});

test('invalid reports, contract changes and allowance resets cannot silently pass', () => {
  assert.throws(() => compareDuplication({contract}, policy()), /Missing/);
  assert.throws(() => compareDuplication({contract:{detector:'new'},clones:[]}, policy()), /contract changed/);
  const next = policy(); next.allowances[0].count = 2;
  assert.equal(protectDuplicationPolicy(next, policy()).failures.length, 1);
  next.allowances[0].key = 'a'.repeat(64);
  assert.equal(protectDuplicationPolicy(next, policy()).failures.length, 1);
  next.allowances = [];
  assert.deepEqual(protectDuplicationPolicy(next, policy()).failures, []);
  next.allowances = [{...policy().allowances[0],reason:''}];
  assert.throws(() => compareDuplication(current([]),next), /unreviewed/);
});

test('literal contents remain significant, including comment-like regex text and JSX whitespace', () => {
  assert.notEqual(tokenFingerprint('const x = /[//]first/;'), tokenFingerprint('const x = /[//]second/;'));
  assert.notEqual(tokenFingerprint('const x = `first  second`;'), tokenFingerprint('const x = `first second`;'));
  const first = 'const x = <p>first  second</p>;', second = 'const x = <p>first second</p>;';
  assert.notEqual(tokenFingerprint(first,0,first.length,true),tokenFingerprint(second,0,second.length,true));
  assert.throws(() => tokenFingerprint('const x = ('), /invalid TypeScript/);
});

test('pinned detector catches a real introduced clone while documented exclusions remain scoped', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cif-duplication-'));
  try {
    const paths = ['a.ts','b.ts'].map(file => join(directory,file));
    for (const path of paths) await writeFile(path, `export function map(input: any) {\nconst result: any = {};\n${source}\nreturn result;\n}`);
    const report = await measureDuplication(paths);
    assert.ok(report.clones.length > 0);
    const contents = new Map(paths.map(path => [relative(directory,path),`export function map(input: any) {\nconst result: any = {};\n${source}\nreturn result;\n}`]));
    const location = side => ({file:relative(directory,side.sourceId),start:side.start.line,end:side.end.line});
    const clones = report.clones.map(c => cloneIdentity({format:c.format,a:location(c.duplicationA),b:location(c.duplicationB)},contents));
    assert.ok(compareDuplication(current(clones), {...policy(),allowances:[]}).failures.length);
    assert.equal(category('src/shared/periodicTableData.ts'), 'data-tables');
    assert.equal(category('src/renderer/public/vendor/example.ts'), 'excluded');
    assert.equal(category('src/main/example.ts'), 'application');
  } finally {
    await rm(directory, {recursive:true,force:true});
  }
});
