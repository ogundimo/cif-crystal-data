import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createComplexityAnalyzer, measureDuplication } from './analyzers.mjs';
import { complexityFinding } from './scope.mjs';

test('pinned analyzers report independently nested functions and detect invalid TypeScript', async () => {
  const analyzer = createComplexityAnalyzer();
  const [result] = await analyzer.lintText(`
    export function outer(x: boolean) {
      function inner(y: boolean) { if (y) return 1; return 0; }
      if (x) return inner(x);
      return 0;
    }`, { filePath: 'src/quality-analyzer-fixture.ts' });
  const values = result.messages.filter(message => message.ruleId === 'complexity')
    .map(message => complexityFinding('fixture.ts', message).value);
  assert.deepEqual(values, [2, 2], 'Nested branching must not inflate the enclosing function');
  assert.ok(result.messages.some(message => message.ruleId === 'sonarjs/cognitive-complexity'));
  const [invalid] = await analyzer.lintText('export function broken( {', { filePath: 'src/invalid-fixture.ts' });
  assert.ok(invalid.messages.some(message => message.fatal));
});

test('duplication settings detect a known clone without imposing a percentage gate', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cif-quality-fixture-'));
  try {
    const source = `export function calculate(values: number[]) {
      let result = 0;
      for (const value of values) {
        if (value > 100) result += value * 3;
        else if (value > 50) result += value * 2;
        else result += value;
      }
      const average = result / Math.max(values.length, 1);
      return { result, average, count: values.length };
    }`;
    const files = [join(directory, 'a.ts'), join(directory, 'b.ts')];
    for (const file of files) await writeFile(file, source);
    const result = await measureDuplication(files);
    assert.ok(result.clones.length > 0, JSON.stringify(result.statistic));
    assert.equal(result.statistic.total.sources, 2);
    assert.ok(result.statistic.total.percentage > 0);
  } finally {
    // Only the exact task-created directory is removed.
    await rm(directory, { recursive: true, force: true });
  }
});
