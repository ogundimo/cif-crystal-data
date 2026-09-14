import assert from 'node:assert/strict';
import test from 'node:test';
import { category, isProduction, combineCoverage, complexityFinding, physicalLines } from './scope.mjs';

test('scope includes untested entry points and separates tests, scripts, data and vendor code', () => {
  assert.equal(isProduction('src/preload/index.ts'), true);
  assert.equal(isProduction('src/main/importWorker.ts'), true);
  assert.equal(category('src/shared/periodicTableData.ts'), 'data-tables');
  for (const file of ['src/main/db.test.ts', 'src/renderer/src/uiTest.tsx', 'scripts/packaged-smoke.mjs',
    'src/renderer/public/vendor/jsmol/runtime.ts', 'dist/index.ts', 'src/shared/env.d.ts']) {
    assert.equal(isProduction(file), false, file);
  }
});

test('coverage aggregates counts rather than averaging file percentages', () => {
  const row = (total, covered) => Object.fromEntries(['lines', 'statements', 'functions', 'branches'].map(key => [key, { total, covered }]));
  assert.equal(combineCoverage([row(1, 1), row(99, 0)]).branches.pct, 1);
  assert.equal(combineCoverage([row(0, 0)]).lines.pct, null);
});

test('analyzer failures cannot masquerade as a zero-complexity baseline', () => {
  assert.throws(() => complexityFinding('broken.ts', { fatal: true, message: 'Parsing error', line: 1 }));
  assert.throws(() => complexityFinding('changed-tool.ts', { ruleId: 'complexity', message: 'Unknown diagnostic format' }));
  assert.equal(complexityFinding('sample.ts', { ruleId: 'complexity', line: 1, column: 1,
    message: "Function 'sample' has a complexity of 3. Maximum allowed is 0." }).value, 3);
  assert.equal(complexityFinding('sample.ts', { ruleId: 'sonarjs/cognitive-complexity', line: 1, column: 1,
    message: 'Refactor this function to reduce its Cognitive Complexity from 7 to the 0 allowed.' }).value, 7);
});

test('physical line counts are stable across Windows and Unix line endings', () => {
  assert.equal(physicalLines(''), 0);
  assert.equal(physicalLines('a\nb\n'), 2);
  assert.equal(physicalLines('a\r\nb\r\n'), 2);
});
