import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { fixtureCrap, unavailable, checkCoverageEvidence, evaluateHalstead } from './additional-measurements.mjs';

const fixtures = JSON.parse(readFileSync(new URL('./additional-fixtures.json', import.meta.url), 'utf8'));
const evidence = JSON.parse(readFileSync(new URL('../../docs/evidence/additional-measurements/results.json', import.meta.url), 'utf8'));

test('CRAP fixture arithmetic uses same-function line fractions, never function hit rates', () => {
  assert.equal(fixtureCrap(2, 0, 2), 6);
  assert.equal(fixtureCrap(2, 1, 2), 2.5);
  assert.equal(fixtureCrap(2, 2, 2), 2);
  assert.throws(() => fixtureCrap(2, 0, 0));
  assert.throws(() => fixtureCrap(2, 3, 2));
  assert.throws(() => fixtureCrap(2, -1, 2));
  assert.throws(() => fixtureCrap(NaN, 1, 2));
});

test('missing, ambiguous and unsupported attribution cannot become zero scores', () => {
  for (const status of ['missing', 'ambiguous', 'unsupported']) assert.equal(unavailable(status, 'fixture').score, null);
  assert.throws(() => unavailable('ok', 'fixture'));
  assert.equal(evidence.decision.productionScores, null);
  assert.equal(evidence.crap.score, null);
  assert.ok(evidence.halstead.every(row => row.score === null));
});

test('retained real coverage verifies zero, partial, full, nested, adjacent and JSX evidence', () => {
  assert.deepEqual(checkCoverageEvidence(fixtures, evidence.findings, evidence.coverage, evidence.lcov), evidence.crap);
  assert.throws(() => checkCoverageEvidence(fixtures, [], evidence.coverage, evidence.lcov));
  assert.throws(() => checkCoverageEvidence(fixtures, [...evidence.findings, evidence.findings[0]], evidence.coverage, evidence.lcov));
  assert.throws(() => checkCoverageEvidence(fixtures, evidence.findings, evidence.coverage, ''));
  const wrongNeighbor = structuredClone(evidence.coverage);
  const rightId = Object.entries(wrongNeighbor.fnMap).filter(([, row]) => row.line === 22)[1][0];
  wrongNeighbor.f[rightId] = 1;
  assert.throws(() => checkCoverageEvidence(fixtures, evidence.findings, wrongNeighbor, evidence.lcov));
});

test('Halstead fixture counts independently produce their stated difficulty', () => {
  for (const fixture of fixtures.halstead) {
    for (const method of fixture.methods ?? []) {
      const expected = new Set(method.operators).size / 2 * method.operands.length / new Set(method.operands).size;
      assert.equal(expected, method.difficulty, fixture.id);
    }
  }
});

test('Halstead analysis errors and empty reports are unavailable, not clean zero', () => {
  assert.equal(evaluateHalstead([fixtures.halstead[0]], () => { throw new Error('failure'); })[0].status, 'analysis-error');
  assert.equal(evaluateHalstead([fixtures.halstead[0]], () => ({ methods: [] }))[0].status, 'unsupported');
  assert.throws(() => evaluateHalstead([fixtures.halstead.at(-1)], () => ({ methods: [] })));
  for (const id of ['optional-access', 'jsx-empty', 'jsx-expression']) {
    assert.equal(evidence.halstead.find(row => row.id === id).status, 'unsupported');
  }
  const jsx = evidence.halstead.find(row => row.id === 'jsx-empty');
  assert.equal(jsx.observed[0].halstead.difficulty, 0);
  assert.deepEqual(jsx.observed[0].errors, []);
});

test('retained fixture evidence identifies the checked-in inputs', () => {
  // The broader provenance is historical: dependencies and analyzer configuration
  // can change later. Fixture/helper changes must deliberately regenerate evidence.
  for (const file of ['scripts/quality/additional-fixtures.json', 'scripts/quality/additional-measurements.mjs',
    'scripts/quality/evaluate-additional.mjs', 'docs/evidence/additional-measurements/candidate-lock.json']) {
    const source = readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8').replaceAll('\r\n', '\n');
    assert.equal(createHash('sha256').update(source).digest('hex'), evidence.provenance.inputSha256[file], file);
  }
});
