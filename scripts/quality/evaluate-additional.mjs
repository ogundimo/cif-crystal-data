import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createComplexityAnalyzer } from './analyzers.mjs';
import { complexityFinding } from './scope.mjs';
import { checkCoverageEvidence, evaluateHalstead } from './additional-measurements.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
process.chdir(root);
const output = resolve(root, 'reports/additional-measurements');
const candidateRoot = resolve(root, 'reports/measurement-candidate');
const hash = text => createHash('sha256').update(text.replaceAll('\r\n', '\n')).digest('hex');
const read = file => readFile(resolve(root, file), 'utf8');
const writeJson = (file, value) => writeFile(file, JSON.stringify(value, null, 2) + '\n');
const fixturePath = 'scripts/quality/additional-fixtures.json';
const fixtures = JSON.parse(await read(fixturePath));
// Only fixed generated report paths are removed. A failed rerun cannot leave a
// previous complete report that appears current. Candidate dependencies are kept.
await mkdir(output, { recursive: true });
await rm(resolve(output, 'evidence.json'), { force: true });
await rm(resolve(output, 'failure.json'), { force: true });
try {
  const candidateLock = JSON.parse(await readFile(resolve(candidateRoot, 'package-lock.json'), 'utf8'));
  const locked = JSON.parse(await read('docs/evidence/additional-measurements/candidate-lock.json'));
  assert.deepEqual(candidateLock, locked, 'Install the archived candidate lock; see docs/additional-measurements.md');
  const candidateRequire = createRequire(resolve(candidateRoot, 'package.json'));
  const candidateName = 'typhonjs-escomplex';
  const candidate = candidateRequire(candidateName);
  assert.equal(candidateRequire(`${candidateName}/package.json`).version, '0.1.0');
  const parserOptions = { sourceType: 'module', plugins: ['typescript', 'jsx'] };
  const analyze = source => candidate.analyzeModule(source, {}, parserOptions);
  const halstead = evaluateHalstead(fixtures.halstead, analyze);
  assert.deepEqual(evaluateHalstead(fixtures.halstead, analyze), halstead, 'Deterministic candidate output');
  for (const id of ['addition', 'typed-addition', 'repeated-operand', 'assertion', 'nested', 'member-access', 'nullish']) {
    assert.equal(halstead.find(row => row.id === id).status, 'fixture-match', id);
  }
  for (const id of ['optional-access', 'jsx-empty', 'jsx-expression']) {
    assert.equal(halstead.find(row => row.id === id).status, 'unsupported', id);
  }
  assert.equal(halstead.find(row => row.id === 'malformed').status, 'expected-parse-error');
  await writeFile(resolve(output, 'subject.tsx'), fixtures.coverageSource);
  await writeFile(resolve(output, 'subject.test.ts'), fixtures.coverageTest);
  const config = { test: { include: ['reports/additional-measurements/subject.test.ts'], coverage: {
    provider: 'v8', include: ['reports/additional-measurements/subject.tsx'],
    reporter: ['json', 'lcovonly'], reportsDirectory: 'reports/additional-measurements/coverage'
  } } };
  await writeFile(resolve(output, 'vitest.config.mjs'), `export default ${JSON.stringify(config)};\n`);
  const eslint = createComplexityAnalyzer();
  const collect = async () => {
    // lintText uses a production-shaped virtual filename so the exact existing
    // analyzer config applies without adding fixture files to production scope.
    const [lint] = await eslint.lintText(fixtures.coverageSource, { filePath: 'src/measurement-fixture.tsx' });
    for (const message of lint.messages) complexityFinding('subject.tsx', message);
    const findings = lint.messages.filter(message => message.ruleId === 'complexity').map(message => ({
      ...complexityFinding('subject.tsx', message), endLine: message.endLine, endColumn: message.endColumn
    }));
    execFileSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', '--config',
      'reports/additional-measurements/vitest.config.mjs', '--coverage'], { cwd: root, stdio: 'inherit', windowsHide: true });
    const raw = JSON.parse(await readFile(resolve(output, 'coverage/coverage-final.json'), 'utf8'));
    assert.equal(Object.keys(raw).length, 1);
    const { fnMap, f, statementMap, s } = Object.values(raw)[0];
    const coverage = { fnMap, f, statementMap, s };
    const lcov = (await readFile(resolve(output, 'coverage/lcov.info'), 'utf8')).replaceAll('\\', '/').replaceAll('\r\n', '\n');
    const crap = checkCoverageEvidence(fixtures, findings, coverage, lcov);
    return { findings, coverage, lcov, crap };
  };
  const first = await collect();
  assert.deepEqual(await collect(), first, 'Deterministic V8 mapping, complexity and diagnostics');
  const mainLock = JSON.parse(await read('package-lock.json'));
  const toolNames = ['eslint', '@typescript-eslint/parser', 'eslint-plugin-sonarjs', 'vitest', '@vitest/coverage-v8', 'typescript'];
  const mainRequire = createRequire(import.meta.url);
  const toolVersions = Object.fromEntries(toolNames.map(name => {
    const version = mainRequire(`${name}/package.json`).version;
    assert.equal(version, mainLock.packages[`node_modules/${name}`].version, `Installed version: ${name}`);
    return [name, version];
  }));
  const inputFiles = [fixturePath, 'scripts/quality/additional-measurements.mjs', 'scripts/quality/evaluate-additional.mjs',
    'scripts/quality/analyzers.mjs', 'scripts/quality/scope.mjs', 'vitest.config.ts', 'package-lock.json',
    'docs/evidence/additional-measurements/candidate-lock.json'];
  const evidence = { schemaVersion: 1,
    provenance: { commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true }).trim(),
      dirty: Boolean(execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8', windowsHide: true }).trim()),
      node: process.version, platform: process.platform,
      tools: toolVersions,
      inputSha256: Object.fromEntries(await Promise.all(inputFiles.map(async file => [file, hash(await read(file))]))),
      candidatePackages: Object.fromEntries(Object.entries(locked.packages).filter(([name]) => name).map(([name, pkg]) => [name, pkg.version])),
      parserOptions, coverageConfig: config },
    decision: { crap: 'deferred', halsteadDifficulty: 'deferred', productionScores: null,
      reason: 'Existing coverage join loses ownership; Halstead candidate silently omits supported-language operations.' },
    ...first, halstead };
  await writeJson(resolve(output, 'evidence.json'), evidence);
  console.log('Evaluation verified: retain both deferrals. Evidence: reports/additional-measurements/evidence.json');
} catch (error) {
  await writeJson(resolve(output, 'failure.json'), { status: 'evaluation-failed', score: null, reason: String(error.stack ?? error) });
  throw error;
}
