// Exercise the real configuration in an isolated copy; never inject findings into the checkout.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, writeFile, appendFile, symlink, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const knip = resolve(dirname(require.resolve('knip')), '../bin/knip.js');
const tsc = require.resolve('typescript/bin/tsc');
const fixture = await mkdtemp(join(tmpdir(), 'cif-unused-checks-'));
const run = (script, args) => {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: fixture, encoding: 'utf8', windowsHide: true, timeout: 120000
  });
  if (result.error || result.signal) throw result.error ?? new Error(`Analyzer terminated: ${result.signal}`);
  return result;
};
const scan = () => {
  const result = run(knip, ['--reporter', 'json']);
  assert.ok([0, 1].includes(result.status), result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.ok(Array.isArray(report.issues), 'Knip must return its expected report format');
  return { ...result, issues: report.issues };
};

try {
  const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { cwd: root, encoding: 'utf8', windowsHide: true }).split('\0').filter(Boolean);
  for (const file of new Set(files)) {
    if (file.startsWith('src/renderer/public/vendor/')) continue;
    const destination = join(fixture, file);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(join(root, file), destination);
  }
  // Reuse installed packages; no installation, network access, or mutation of dependencies.
  await symlink(join(root, 'node_modules'), join(fixture, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  const clean = scan();
  assert.equal(clean.status, 0, clean.stdout + clean.stderr);
  assert.deepEqual(clean.issues, [], 'Real entry points and test-only consumers must pass');
  console.log('✓ Current configuration and legitimate dynamic entry points pass in isolation');

  await writeFile(join(fixture, 'src/shared/unused-check-fixture.ts'), 'export const unreachableFixture = 1;\n');
  await appendFile(join(fixture, 'src/shared/searchValidation.ts'), '\nexport const unusedExportFixture = 1;\n');
  const manifest = JSON.parse(await readFile(join(fixture, 'package.json'), 'utf8'));
  manifest.dependencies['unused-production-fixture'] = '1.0.0';
  manifest.devDependencies['unused-development-fixture'] = '1.0.0';
  await writeFile(join(fixture, 'package.json'), JSON.stringify(manifest, null, 2));
  const negative = scan();
  assert.equal(negative.status, 1, 'Unused findings must fail the command');
  const has = (type, name) => negative.issues.some(issue => issue[type]?.some(item => item.name === name));
  assert.ok(negative.issues.some(issue => issue.file.replaceAll('\\', '/').endsWith('src/shared/unused-check-fixture.ts')),
    'Unreachable first-party file must be detected');
  assert.ok(has('exports', 'unusedExportFixture'), negative.stdout);
  assert.ok(has('dependencies', 'unused-production-fixture'), negative.stdout);
  assert.ok(has('devDependencies', 'unused-development-fixture'), negative.stdout);
  console.log('✓ Unreachable file, unused export, and unused production/development dependencies fail Knip');

  // Confirm both real TypeScript configs enforce locals and parameters.
  for (const [config, directory] of [['tsconfig.node.json', 'src/main'], ['tsconfig.web.json', 'src/renderer/src']]) {
    const source = join(fixture, directory, 'unused-typescript-fixture.ts');
    await writeFile(source, 'export function fixture(unusedArgument: string) { const unusedLocal = 1; return 0; }\n');
    const result = run(tsc, ['--noEmit', '-p', config]);
    assert.notEqual(result.status, 0);
    for (const name of ['unusedArgument', 'unusedLocal']) {
      assert.ok(result.stdout.includes(`'${name}' is declared but its value is never read`), result.stdout + result.stderr);
    }
    await rm(source);
    console.log(`✓ ${config} rejects unused locals and parameters`);
  }
} finally {
  // Remove only the task-created temporary tree; fs.rm does not traverse its dependency symlink.
  await rm(fixture, { recursive: true, force: true });
}
