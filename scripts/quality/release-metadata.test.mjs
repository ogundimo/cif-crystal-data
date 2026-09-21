import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { sameMeasurementLock } from './release-metadata.mjs';

test('release versions do not change measurement inputs; dependencies and provenance still do', () => {
  const old = { version: '1.1.0', packages: { '': { version: '1.1.0' }, 'node_modules/tool': { version: '2.0.0', integrity: 'abc' } } };
  const previous = JSON.stringify(old);
  const hash = createHash('sha256').update(previous).digest('hex');
  const next = structuredClone(old);
  next.version = next.packages[''].version = '1.2.0';
  assert.equal(sameMeasurementLock(JSON.stringify(next), previous, hash), true);
  assert.equal(sameMeasurementLock(JSON.stringify(next), previous, 'untrusted'), false);
  next.packages['node_modules/tool'].integrity = 'changed';
  assert.equal(sameMeasurementLock(JSON.stringify(next), previous, hash), false);
  next.packages[''].version = 'inconsistent';
  assert.throws(() => sameMeasurementLock(JSON.stringify(next), previous, hash), /must agree/);
});
