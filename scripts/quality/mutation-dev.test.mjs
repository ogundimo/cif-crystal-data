import assert from 'node:assert/strict';
import test from 'node:test';
import { benchConfig, cacheFingerprint, compareOutcomes, countStatuses, devConfig, parseBenchArgs, parseDevArgs, parseLogPhases } from './mutation-dev.mjs';

const base={$schema:'./schema.json',mutate:['src/parser/cif/formula.ts','src/shared/searchValidation.ts','src/renderer/src/pxrd.ts'],
  checkers:['typescript'],typescriptChecker:{prioritizePerformanceOverAccuracy:false},concurrency:2,
  htmlReporter:{fileName:'reports/mutation/index.html'},jsonReporter:{fileName:'reports/mutation/mutation.json'}};
const cpus=8;

test('dev arguments: scoped files and line ranges are validated; unsupported options fail visibly',()=>{
  const parsed=parseDevArgs(['--file','src\\renderer\\src\\pxrd.ts:10-40','--file','./src/shared/searchValidation.ts','--fresh'],{cpus});
  assert.deepEqual(parsed.files,[{file:'src/renderer/src/pxrd.ts',start:10,end:40},{file:'src/shared/searchValidation.ts'}]);
  assert.equal(parsed.fresh,true);assert.equal(parsed.checker,'accurate');
  assert.throws(()=>parseDevArgs(['--incremental'],{cpus}),/Unsupported option: --incremental/);
  assert.throws(()=>parseDevArgs(['--file','src/main/index.ts'],{cpus}),/mutation pilot files/);
  assert.throws(()=>parseDevArgs(['--file','src/renderer/src/pxrd.ts:40-10'],{cpus}),/Invalid line range/);
  assert.throws(()=>parseDevArgs(['--file'],{cpus}),/requires a value/);
  assert.throws(()=>parseDevArgs(['--file','src/renderer/src/pxrd.ts','--file','src/renderer/src/pxrd.ts'],{cpus}),/Duplicate/);
  assert.throws(()=>parseDevArgs(['--concurrency','0'],{cpus}),/positive integer/);
  assert.throws(()=>parseDevArgs(['--concurrency','9'],{cpus}),/exceeds 8/);
  assert.equal(parseDevArgs(['--grouped-check'],{cpus}).checker,'grouped');
});

test('dev config isolates outputs, cache and sandbox from the authoritative run',()=>{
  const config=devConfig(base,parseDevArgs(['--file','src/renderer/src/pxrd.ts:5-9'],{cpus}),'reports/mutation-dev');
  assert.equal(config.$schema,undefined);
  assert.deepEqual(config.mutate,['src/renderer/src/pxrd.ts:5-9']);
  assert.equal(config.incremental,true);assert.equal(config.incrementalFile,'reports/mutation-dev/incremental-accurate.json');
  assert.equal(config.htmlReporter.fileName,'reports/mutation-dev/index.html');
  assert.equal(config.jsonReporter.fileName,'reports/mutation-dev/mutation.json');
  assert.equal(config.tempDirName,'.stryker-tmp-dev');
  assert.equal(config.typescriptChecker.prioritizePerformanceOverAccuracy,false);
  assert.deepEqual(devConfig(base,parseDevArgs([],{cpus}),'out').mutate,base.mutate);
  const grouped=devConfig(base,parseDevArgs(['--grouped-check','--concurrency','4'],{cpus}),'out');
  assert.equal(grouped.typescriptChecker.prioritizePerformanceOverAccuracy,true);
  assert.equal(grouped.incrementalFile,'out/incremental-grouped.json');assert.equal(grouped.concurrency,4);
  assert.equal(base.typescriptChecker.prioritizePerformanceOverAccuracy,false,'base config is not mutated');
});

test('cache fingerprint ignores what Stryker tracks and invalidates on everything it cannot see',()=>{
  const context={nodeVersion:'v22.13.0',platform:'win32',arch:'x64',tools:{vitest:'4.1.11'},configHashes:{'vitest.config.ts':'a'},checker:'accurate'};
  const inputs=[['src/renderer/src/pxrd.ts','1'],['src/renderer/src/pxrd.test.ts','2'],['src/shared/constants.ts','3'],['src/parser/__fixtures__/a.cif','4']];
  const reference=cacheFingerprint(context,inputs);
  const edit=(file,digest)=>inputs.map(([name,value])=>[name,name===file?digest:value]);
  assert.equal(cacheFingerprint(context,edit('src/renderer/src/pxrd.ts','x')),reference,'mutated file: tracked by Stryker');
  assert.equal(cacheFingerprint(context,edit('src/renderer/src/pxrd.test.ts','x')),reference,'test file: tracked by Stryker');
  assert.notEqual(cacheFingerprint(context,edit('src/shared/constants.ts','x')),reference,'imported production module');
  assert.notEqual(cacheFingerprint(context,edit('src/parser/__fixtures__/a.cif','x')),reference,'fixture');
  assert.notEqual(cacheFingerprint(context,[...inputs,['src/shared/new.ts','5']]),reference,'added module');
  for(const change of [{nodeVersion:'v22.14.0'},{platform:'linux'},{tools:{vitest:'4.2.0'}},{configHashes:{'vitest.config.ts':'b'}},{checker:'grouped'}]) {
    assert.notEqual(cacheFingerprint({...context,...change},inputs),reference,JSON.stringify(change));
  }
});

test('benchmark arguments and config: complete accurate scope, no incremental reuse, debug file log',()=>{
  assert.deepEqual(parseBenchArgs([],{cpus}).variants.map(v=>v.name),['c2-accurate','c4-accurate']);
  const parsed=parseBenchArgs(['--variant','2','--variant','2:grouped','--min-free-gb','4'],{cpus});
  assert.deepEqual(parsed.variants.map(v=>v.name),['c2-accurate','c2-grouped']);assert.equal(parsed.minFreeGb,4);
  assert.throws(()=>parseBenchArgs(['--variant','2','--variant','2:accurate'],{cpus}),/Duplicate/);
  assert.throws(()=>parseBenchArgs(['--variant','4:fast'],{cpus}),/--variant must be/);
  assert.throws(()=>parseBenchArgs(['--concurrency','4'],{cpus}),/Unsupported option/);
  const config=benchConfig({...base,incremental:true,incrementalFile:'x'},{concurrency:4,checker:'accurate'},'bench/c4');
  assert.deepEqual(config.mutate,base.mutate);assert.equal(config.concurrency,4);
  assert.equal(config.incremental,undefined);assert.equal(config.incrementalFile,undefined);
  assert.equal(config.fileLogLevel,'debug');assert.equal(config.tempDirName,'.stryker-tmp-bench');
  assert.equal(config.jsonReporter.fileName,'bench/c4/mutation.json');
});

test('log phases are measured from run start and survive midnight',()=>{
  const start=new Date(2026,8,22,23,59,50);
  const log=['23:59:55 (1) INFO Instrumenter Instrumented 3 source file(s) with 1118 mutant(s)',
    '00:01:00 (1) INFO DryRunExecutor Initial test run succeeded. Ran 447 tests',
    '00:30:00 (1) DEBUG ConcurrencyTokenProvider Checking done, creating 1 additional test runner process(es)',
    '01:00:00 (1) INFO MutationTestExecutor Done in 60 minutes'].join('\r\n');
  assert.deepEqual(parseLogPhases(log,start),{instrumented:5,initialRunDone:70,checkingDone:1810,mutationDone:3610});
});

test('outcome comparison uses mutant identity, not run-local ids or order',()=>{
  const mutant=(id,line,status,replacement='1')=>({id,status,mutatorName:'NumberLiteral',replacement,location:{start:{line,column:1},end:{line,column:2}}});
  const a={files:{'f.ts':{mutants:[mutant('0',1,'Killed'),mutant('1',2,'CompileError'),mutant('2',3,'Survived')]}}};
  const b={files:{'f.ts':{mutants:[mutant('9',3,'Survived'),mutant('8',2,'Killed'),mutant('7',4,'Killed')]}}};
  const diff=compareOutcomes(a,b);
  assert.equal(diff.identical,false);
  assert.deepEqual(diff.statusChanges,[{mutant:'f.ts|2|1|2|2|NumberLiteral|1',reference:'CompileError',candidate:'Killed'}]);
  assert.deepEqual(diff.onlyReference,['f.ts|1|1|1|2|NumberLiteral|1']);
  assert.deepEqual(diff.onlyCandidate,['f.ts|4|1|4|2|NumberLiteral|1']);
  assert.equal(compareOutcomes(a,structuredClone(a)).identical,true);
  assert.deepEqual(countStatuses(a),{Killed:1,CompileError:1,Survived:1});
});
