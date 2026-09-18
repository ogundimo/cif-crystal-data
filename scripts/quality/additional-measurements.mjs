// Evaluation helpers only. These do not compute production metric scores.
import assert from 'node:assert/strict';

export function unavailable(status, reason) {
  if (!['missing', 'ambiguous', 'unsupported'].includes(status)) throw new Error('Invalid unavailable status');
  return { status, score: null, reason };
}

export function fixtureCrap(complexity, covered, total) {
  if (!Number.isInteger(complexity) || complexity < 1 || !Number.isInteger(total) || total < 1 ||
      !Number.isInteger(covered) || covered < 0 || covered > total) throw new Error('Invalid fixture counters');
  return complexity ** 2 * (1 - covered / total) ** 3 + complexity;
}

export function checkCoverageEvidence(fixtures, findings, coverage, lcov) {
  const lines = Object.fromEntries([...lcov.matchAll(/^DA:(\d+),(\d+)/gm)].map(match => [match[1], Number(match[2])]));
  const fn = Object.entries(coverage.fnMap);
  const oracles = fixtures.coverageOracles.map(oracle => {
    const matches = findings.filter(row => row.line === oracle.line);
    assert.equal(matches.length, 1, `Unique classic complexity: ${oracle.name}`);
    assert.equal(matches[0].value, oracle.complexity);
    for (const line of oracle.ownedLines) assert.ok(Object.hasOwn(lines, line), `Missing line ${line}`);
    assert.deepEqual(oracle.ownedLines.filter(line => lines[line] > 0), oracle.coveredLines);
    assert.ok(Math.abs(fixtureCrap(oracle.complexity, oracle.coveredLines.length, oracle.ownedLines.length) - oracle.score) < 1e-12);
    return { ...oracle, attribution: 'hand-assigned fixture oracle; not an automatic join' };
  });
  // LCOV cannot distinguish the two bodies at the same line; its generated names
  // are not stable identities shared with ESLint. JSON is retained as a diagnostic.
  const adjacent = fn.filter(([, item]) => item.line === 22);
  assert.equal(adjacent.length, 2);
  assert.deepEqual(adjacent.map(([id]) => coverage.f[id]), [1, 0]);
  assert.equal(lines[22], 1);
  const view = fn.find(([, item]) => item.line === 24);
  assert.ok(view);
  assert.equal(coverage.f[view[0]], 0);
  assert.equal(lines[24], 1);
  const empty = fn.find(([, item]) => item.name === 'empty');
  assert.ok(empty);
  assert.equal(coverage.f[empty[0]], 0);
  assert.equal(Object.hasOwn(lines, 25), false, 'Empty body has no executable-line denominator');
  const anonymous = fn.find(([, item]) => item.line === 23);
  assert.ok(anonymous);
  assert.equal(coverage.f[anonymous[0]], 1);
  assert.equal(findings.find(row => row.line === 23)?.value, 2);
  assert.equal(fn.find(([, item]) => item.name === 'child')?.[1].line, 16);
  const partialFunction = fn.find(([, item]) => item.name === 'partial')[1];
  const partialFinding = findings.find(row => row.line === 5);
  assert.notEqual(partialFinding.endLine, partialFunction.loc.end.line, 'Diagnostic is a header, not a body range');
  return {
    status: 'deferred', score: null, oracles,
    diagnostics: [
      unavailable('missing', 'Existing JSON summary has no function-owned line counters; ESLint findings have no body ranges.'),
      unavailable('ambiguous', 'Line 22 contains two arrows with different function hits but one LCOV line hit.'),
      unavailable('unsupported', 'Line 24 is covered by binding initialization while the JSX arrow body never executes.'),
      unavailable('unsupported', 'Empty function has no executable-line denominator; implicit class scopes and general source-map joins remain unvalidated.')
    ]
  };
}

export function evaluateHalstead(fixtures, analyzer) {
  return fixtures.map(fixture => {
    let result;
    try { result = analyzer(fixture.source); }
    catch (error) {
      return { id: fixture.id, status: fixture.parseError ? 'expected-parse-error' : 'analysis-error',
        score: null, reason: error.message };
    }
    if (fixture.parseError) throw new Error(`Malformed fixture accepted: ${fixture.id}`);
    const observed = result.methods.map(method => ({ name: method.name, lineStart: method.lineStart,
      lineEnd: method.lineEnd, errors: method.errors, halstead: method.halstead }));
    const matches = observed.length === fixture.methods.length && observed.every((method, index) => {
      const expected = fixture.methods[index], h = method.halstead;
      const equalSet = (a, b) => JSON.stringify([...new Set(a)].sort()) === JSON.stringify([...new Set(b)].sort());
      return h.operators.total === expected.operators.length && h.operands.total === expected.operands.length &&
        h.operators.distinct === new Set(expected.operators).size && h.operands.distinct === new Set(expected.operands).size &&
        equalSet(h.operators.identifiers, expected.operators) && equalSet(h.operands.identifiers, expected.operands) &&
        Math.abs(h.difficulty - expected.difficulty) < 0.001 && !method.errors.length;
    });
    return { id: fixture.id, status: matches ? 'fixture-match' : 'unsupported',
      score: null, expected: fixture.methods, observed };
  });
}
