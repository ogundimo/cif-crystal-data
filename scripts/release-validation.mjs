import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { createReadStream, openSync, closeSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { release } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const requiredChecks = [
  ['reliability', 'scripts/packaged-reliability-smoke.mjs'],
  ['preservation', 'scripts/packaged-preservation-smoke.mjs'],
  ['batch-export', 'scripts/packaged-batch-export-smoke.mjs']
];

async function fingerprint(file, base) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return { path: relative(base, file).replaceAll('\\', '/'), bytes: (await stat(file)).size, sha256: hash.digest('hex') };
}

async function payloadFiles(folder) {
  const files = [];
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const file = join(folder, entry.name);
    if (entry.isDirectory()) files.push(...await payloadFiles(file));
    else if (entry.isFile()) files.push(file);
    else throw new Error(`Unexpected non-file payload entry: ${file}`);
  }
  return files.sort();
}

async function identifyArtifacts(artifactDir, productName, version) {
  const executable = join(artifactDir, 'win-unpacked', `${productName}.exe`);
  // Missing payloads or either distribution format must fail before any tests run.
  for (const file of [executable, join(artifactDir, 'win-unpacked/resources/app.asar')]) {
    assert.ok((await stat(file)).isFile(), `Missing packaged file: ${file}`);
  }
  const distributions = [];
  for (const [kind, name] of [
    ['nsis-installer', `${productName} Setup ${version}.exe`],
    ['portable-launcher', `${productName} ${version}.exe`]
  ]) distributions.push({ kind, ...await fingerprint(join(artifactDir, name), artifactDir) });
  const payload = [];
  for (const file of await payloadFiles(join(artifactDir, 'win-unpacked'))) {
    payload.push(await fingerprint(file, artifactDir));
  }
  return { distributions, payload };
}

/** Run the built payload, never rebuild it between acceptance and publication. */
export async function validateRelease({ artifactDir, outputDir, checks = requiredChecks }) {
  artifactDir = resolve(artifactDir);
  await mkdir(outputDir, { recursive: true });
  const reportDir = await mkdtemp(join(resolve(outputDir), 'run-'));
  const reportPath = join(reportDir, 'validation.json');
  const report = { status: 'running', startedAt: new Date().toISOString(), artifactDir,
    node: process.version, platform: process.platform, osRelease: release(), architecture: process.arch, checks: [],
    scope: 'Instrumented win-unpacked payload; synthetic temporary profiles and substituted native dialogs.',
    manualAcceptance: { nsisInstaller: 'not-tested', portableLauncher: 'not-tested' } };
  const save = () => writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  await save();
  try {
    const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
    report.version = pkg.version;
    report.commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
    report.dirty = Boolean(execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim());
    report.artifacts = await identifyArtifacts(artifactDir, pkg.build.productName, pkg.version);
    await save();
    const executable = join(artifactDir, 'win-unpacked', `${pkg.build.productName}.exe`);
    for (const [name, script] of checks) {
      const result = { name, status: 'running', log: `${name}.log`, details: `${name}.json`, startedAt: new Date().toISOString() };
      report.checks.push(result);
      await save();
      console.log(`Packaged acceptance: ${name}`);
      const fd = openSync(join(reportDir, result.log), 'wx');
      try {
        const child = spawn(process.execPath, [resolve(root, script), executable, join(reportDir, result.details)], {
          cwd: root, stdio: ['ignore', fd, fd], windowsHide: true
        });
        const [code, signal] = await once(child, 'exit');
        result.exitCode = code;
        result.signal = signal;
        assert.equal(code, 0, `${name} failed; see ${join(reportDir, result.log)}`);
        JSON.parse(await readFile(join(reportDir, result.details), 'utf8'));
        result.status = 'passed';
      } catch (error) {
        result.status = 'failed';
        throw error;
      } finally {
        closeSync(fd);
        result.finishedAt = new Date().toISOString();
        await save();
      }
    }
    assert.deepEqual(await identifyArtifacts(artifactDir, pkg.build.productName, pkg.version), report.artifacts,
      'Release artifacts changed during acceptance');
    report.status = 'passed';
  } catch (error) {
    report.status = 'failed';
    report.error = error.message;
  }
  report.finishedAt = new Date().toISOString();
  await save();
  console.log(`Packaged acceptance ${report.status}: ${reportPath}`);
  return { report, reportPath };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { report } = await validateRelease({
    artifactDir: process.argv[2] ?? join(root, 'release'),
    outputDir: process.argv[3] ?? join(root, 'reports/release-validation')
  });
  if (report.status !== 'passed') {
    console.error(report.error);
    process.exitCode = 1;
  }
}
