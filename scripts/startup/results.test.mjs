import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compare, metrics, protocol, summarize } from './results.mjs';
const sample = value => Object.fromEntries(metrics.map(key => [key, value]));
test('preserves samples and outliers and calculates odd/even medians', () => {
  assert.deepEqual(summarize([sample(9), sample(1), sample(2)]).mainMs, { samples: [9, 1, 2], min: 1, median: 2, max: 9 });
  assert.equal(summarize([1, 2, 3, 40].map(sample)).mainMs.median, 2.5);
});
test('missing timings and insufficient samples cannot silently pass', () => {
  assert.throws(() => summarize([sample(1)]));
  assert.throws(() => summarize([sample(1), sample(2), { ...sample(3), mainMs: null }]));
});
test('comparison rejects different protocols and flags machine/tool changes', () => {
  const base = { protocol, status: 'passed', environment: { cpu: 'A' }, samples: [1, 2, 3].map(sample) };
  const current = { ...base, environment: { cpu: 'B' }, samples: [2, 4, 6].map(sample) };
  assert.equal(compare(current, base).metrics.mainMs.percent, 100);
  assert.deepEqual(compare(current, base).changedConditions, ['cpu']);
  assert.throws(() => compare(current, { ...base, protocol: 'different' }));
  assert.throws(() => compare(current, { ...base, status: 'failed' }));
  assert.equal(compare(current, { ...base, samples: [0, 0, 0].map(sample) }).metrics.mainMs.percent, null);
});

test('recorded baseline is complete and its summary matches all retained samples', () => {
  const baseline = JSON.parse(readFileSync(new URL('../../docs/baselines/startup-dev-v1.json', import.meta.url), 'utf8'));
  assert.equal(baseline.status, 'passed');
  assert.equal(baseline.source.dirty, false);
  assert.deepEqual(summarize(baseline.samples), baseline.summary);
  const comparison = compare(baseline, baseline);
  assert.deepEqual(comparison.changedConditions, []);
  assert.ok(Object.values(comparison.metrics).every(metric => metric.change === 0));
});
