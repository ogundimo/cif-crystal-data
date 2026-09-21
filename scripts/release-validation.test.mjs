import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { validateRelease } from './release-validation.mjs';

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'cif-release-gate-'));
  const artifactDir = join(dir, 'artifacts');
  await mkdir(join(artifactDir, 'win-unpacked/resources'), { recursive: true });
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const product = pkg.build.productName;
  const installer = join(artifactDir, `${product} Setup ${pkg.version}.exe`);
  for (const file of [installer, join(artifactDir, `${product} ${pkg.version}.exe`),
    join(artifactDir, 'win-unpacked', `${product}.exe`), join(artifactDir, 'win-unpacked/resources/app.asar')]) {
    await writeFile(file, 'synthetic artifact; not executable');
  }
  const pass = join(dir, 'pass.mjs'), fail = join(dir, 'fail.mjs');
  await writeFile(pass, "import {writeFileSync} from 'node:fs'; writeFileSync(process.argv[3], '{}'); console.log('synthetic check passed');");
  await writeFile(fail, "console.error('injected acceptance failure'); process.exitCode = 7;");
  return { artifactDir, outputDir: join(dir, 'reports'), installer, pass, fail, dir };
}

test('retains revision, full payload hashes, distinct distribution identities and passing logs', async () => {
  const f = await fixture();
  const { report, reportPath } = await validateRelease({ ...f, checks: [['first', f.pass], ['second', f.pass]] });
  assert.equal(report.status, 'passed');
  assert.match(report.commit, /^[a-f0-9]{40}$/);
  assert.equal(report.artifacts.payload.length, 2);
  assert.ok(report.artifacts.payload.every(file => /^[a-f0-9]{64}$/.test(file.sha256)));
  assert.deepEqual(report.artifacts.distributions.map(file => file.kind), ['nsis-installer', 'portable-launcher']);
  assert.equal(report.manualAcceptance.nsisInstaller, 'not-tested');
  assert.equal(JSON.parse(await readFile(reportPath, 'utf8')).status, 'passed');
});

test('a failed child stops subsequent checks and retains its exit status and diagnostics', async () => {
  const f = await fixture();
  const { report, reportPath } = await validateRelease({ ...f, checks: [['failure', f.fail], ['must-not-run', f.pass]] });
  assert.equal(report.status, 'failed');
  assert.equal(report.checks.length, 1);
  assert.equal(report.checks[0].exitCode, 7);
  assert.equal(report.checks[0].status, 'failed');
  assert.match(await readFile(join(dirname(reportPath), 'failure.log'), 'utf8'), /injected acceptance failure/);
});

test('a missing distribution fails before any runner starts', async () => {
  const f = await fixture();
  await unlink(f.installer);
  const { report } = await validateRelease({ ...f, checks: [['must-not-run', f.pass]] });
  assert.equal(report.status, 'failed');
  assert.equal(report.checks.length, 0);
  const cli = spawnSync(process.execPath, [fileURLToPath(new URL('./release-validation.mjs', import.meta.url)),
    f.artifactDir, f.outputDir], { encoding: 'utf8', windowsHide: true });
  assert.equal(cli.status, 1, cli.stdout + cli.stderr);
});

test('changing a distribution during acceptance prevents a passing result', async () => {
  const f = await fixture();
  const change = join(f.dir, 'change.mjs');
  await writeFile(change, `import {appendFileSync,writeFileSync} from 'node:fs'; appendFileSync(${JSON.stringify(f.installer)}, 'changed'); writeFileSync(process.argv[3], '{}');`);
  const { report } = await validateRelease({ ...f, checks: [['change', change]] });
  assert.equal(report.status, 'failed');
  assert.match(report.error, /artifacts changed/);
});

test('a zero exit without the required evidence is still a failure', async () => {
  const f = await fixture();
  const noReport = join(f.dir, 'no-report.mjs');
  await writeFile(noReport, "console.log('no evidence');");
  const { report } = await validateRelease({ ...f, checks: [['no-report', noReport]] });
  assert.equal(report.status, 'failed');
  assert.equal(report.checks[0].exitCode, 0);
  assert.equal(report.checks[0].status, 'failed');
});

test('publication follows acceptance and is not configured to ignore failure', async () => {
  const workflow = await readFile(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8');
  assert.ok(workflow.indexOf('npm run test:packaged') < workflow.indexOf('- name: Publish GitHub Release'));
  assert.match(workflow, /- name: Validate packaged workflows\r?\n\s+run: npm run test:packaged/);
  assert.doesNotMatch(workflow, /continue-on-error:/);
  const publish = workflow.slice(workflow.indexOf('- name: Publish GitHub Release'));
  assert.doesNotMatch(publish, /if:.*(?:always|failure)/);
  assert.match(workflow, /publish:\s+name:.*\r?\n\s+needs: validate\r?\n\s+if: github.event_name != 'pull_request'/);
  const validationJob = workflow.slice(workflow.indexOf('  validate:'), workflow.indexOf('  publish:'));
  assert.doesNotMatch(validationJob, /contents: write|attestations: write|id-token: write/);
});

test('installer experiments refuse execution outside a disposable hosted Windows runner', () => {
  const child = spawnSync(process.execPath, [fileURLToPath(new URL('./installer-distribution-smoke.mjs', import.meta.url))], {
    env: { ...process.env, GITHUB_ACTIONS: 'false' }, encoding: 'utf8', windowsHide: true
  });
  assert.notEqual(child.status, 0);
  assert.match(child.stderr, /requires a disposable GitHub-hosted Windows runner/);
});
