// Run the real gate against an isolated source tree, including unreachable probes.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { appendFile, cp, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const temporaryRoot = join(root, 'reports/architecture');
await mkdir(temporaryRoot, { recursive: true });
const fixture = await mkdtemp(join(temporaryRoot, 'probe-'));
assert.ok(fixture.startsWith(temporaryRoot + sep));
const write = async (file, contents) => {
  await mkdir(dirname(join(fixture, file)), { recursive: true });
  await writeFile(join(fixture, file), contents);
};
const scan = async expectedStatus => {
  const result = spawnSync(process.execPath, ['scripts/check-architecture.mjs'], {
    cwd: fixture, encoding: 'utf8', windowsHide: true, timeout: 120000
  });
  assert.ifError(result.error);
  assert.equal(result.status, expectedStatus, result.stdout + result.stderr);
  return JSON.parse(await readFile(join(fixture, 'reports/architecture/dependencies.json'), 'utf8'));
};
try {
  await cp(join(root, 'src'), join(fixture, 'src'), {
    recursive: true, filter: path => !path.replaceAll('\\', '/').includes('/public/vendor')
  });
  await cp(join(root, 'icons'), join(fixture, 'icons'), { recursive: true });
  for (const file of ['.dependency-cruiser.cjs', 'package.json', 'package-lock.json', 'tsconfig.web.json']) {
    await copyFile(join(root, file), join(fixture, file));
  }
  await write('scripts/check-architecture.mjs', await readFile(join(root, 'scripts/check-architecture.mjs')));
  const clean = await scan(0);
  assert.deepEqual(clean.summary.violations, []);
  const edge = (report, from, to) => report.modules.find(module => module.source === from)?.dependencies.find(dep => dep.resolved === to);
  assert.ok(edge(clean, 'src/main/importRunner.ts', 'src/main/importWorker.ts'), 'Worker query must resolve, not disappear');
  assert.ok(edge(clean, 'src/main/importWorker.ts', 'src/main/db.ts'), 'Worker implementation must be analyzed');
  assert.equal(edge(clean, 'src/preload/index.ts', 'src/shared/types.ts')?.preCompilationOnly, true);
  assert.ok(clean.modules.find(module => module.source === 'src/preload/index.ts')?.dependencies.some(dep => dep.module === 'electron'));
  assert.ok(!clean.modules.some(module => /\.test\.tsx?$|uiTest\.tsx$|\/vendor\//.test(module.source)));
  console.log('PASS: real preload, worker, shared contracts, and production inventory');

  const probes = [
    ['src/renderer/src/boundary-probe.ts', "import '../../main/db';\n", 'renderer-dependencies'],
    ['src/renderer/src/node-probe.ts', "import 'fs/promises'; import 'node:fs'; import 'better-sqlite3'; import 'electron';\n", 'no-node-in-portable-code'],
    ['src/shared/boundary-probe.ts', "export type { ImportWorkerData } from '../main/importWorkerProtocol';\n", 'shared-dependencies'],
    ['src/parser/boundary-probe.ts', "import 'electron'; import 'react';\n", 'no-platform-packages-in-portable-code'],
    ['src/preload/boundary-probe.ts', "import '../main/db'; import 'node:fs'; import 'better-sqlite3';\n", 'preload-dependencies'],
    ['src/main/boundary-probe.ts', "import '../preload/index';\n", 'main-dependencies'],
    ['src/parser/layer-probe.ts', "import '../renderer/src/App';\n", 'parser-dependencies'],
    ['src/shared/missing-probe.ts', "import './does-not-exist';\n", 'no-unresolved'],
    ['src/shared/test-probe.ts', "import './searchValidation.test';\n", 'no-production-test-imports'],
    ['src/renderer/src/dynamic-probe.ts', "void import('../../main/db');\n", 'renderer-dependencies'],
    ['src/shared/cycle-a.ts', "import './cycle-b'; export const a = 1;\n", 'no-cycles'],
    ['src/shared/cycle-b.ts', "import './cycle-a'; export const b = 1;\n", 'no-cycles'],
    ['src/shared/type-a.ts', "import type { B } from './type-b'; export interface A { b: B }\n", 'no-cycles'],
    ['src/shared/type-b.ts', "import type { A } from './type-a'; export interface B { a: A }\n", 'no-cycles']
  ];
  for (const [file, contents] of probes) await write(file, contents);
  const negative = await scan(1);
  for (const [file, , rule] of probes) {
    assert.ok(negative.summary.violations.some(v => v.rule.name === rule &&
      (v.from === file || v.cycle?.some(step => step.name === file))), `${file} must fail ${rule}`);
  }
  assert.equal(edge(negative, 'src/shared/boundary-probe.ts', 'src/main/importWorkerProtocol.ts')?.preCompilationOnly, true);
  for (const rule of ['no-ui-packages-outside-renderer', 'preload-only-electron-package']) {
    assert.ok(negative.summary.violations.some(v => v.rule.name === rule), rule);
  }
  console.log('PASS: forbidden layers/packages, Node builtins, unresolved imports, test imports, literal dynamic imports, runtime and type-only cycles');
  for (const [file] of probes) await rm(join(fixture, file));
  await appendFile(join(fixture, 'src/main/db.ts'), "\nimport 'electron';\n");
  await write('src/main/worker-entry-probe.ts', "import './importWorker';\n");
  const worker = await scan(1);
  for (const rule of ['worker-isolation', 'worker-entry-only-through-runner']) {
    assert.ok(worker.summary.violations.some(v => v.rule.name === rule), rule);
  }
  console.log('PASS: worker rejects transitive Electron imports and unauthorized entry imports');
} finally {
  // The checked, uniquely created directory is inside the ignored report directory.
  await rm(fixture, { recursive: true, force: true });
}
