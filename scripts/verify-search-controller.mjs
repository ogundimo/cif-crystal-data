import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const root = mkdtempSync(join(tmpdir(), 'cif-search-probes-'));
mkdirSync(join(root, 'src/renderer/src'), { recursive: true });
cpSync('src/shared', join(root, 'src/shared'), { recursive: true });
cpSync('src/renderer/src/searchController.test.ts', join(root, 'src/renderer/src/searchController.test.ts'));
const target = join(root, 'src/renderer/src/searchController.ts');
const source = readFileSync('src/renderer/src/searchController.ts', 'utf8');
writeFileSync(join(root, 'package.json'), '{"type":"module"}');
writeFileSync(join(root, 'vitest.config.mjs'), 'export default { test: { include: ["src/renderer/src/searchController.test.ts"] } };');
const vitest = resolve('node_modules/vitest/vitest.mjs');
// Copy only test module resolution, never change production files.
const config = resolve('node_modules/vitest');
mkdirSync(join(root, 'node_modules'), { recursive: true });
const { symlinkSync } = await import('node:fs');
symlinkSync(config, join(root, 'node_modules/vitest'), process.platform === 'win32' ? 'junction' : 'dir');
function run(label, text, shouldPass) {
  writeFileSync(target, text);
  const result = spawnSync(process.execPath, [vitest, 'run', '--config', join(root, 'vitest.config.mjs')], { cwd: root, encoding: 'utf8', windowsHide: true });
  if (result.error) throw result.error;
  if (shouldPass) assert.equal(result.status, 0, result.stdout + result.stderr);
  else { assert.notEqual(result.status, 0, label + ' was not detected'); assert.match(result.stdout + result.stderr, /AssertionError/, 'must fail a behavioral assertion'); }
  console.log('PASS:', label);
}
run('unaltered search controller', source, true);
run('stale response accepted', source.replace('if (id !== generation) return;', ''), false);
run('stale rejection displayed', source.replace('if (id === generation) error(action, reason);', 'error(action, reason);'), false);
run('paging starts from zero', source.replace('offset: append ? state.entries.length : 0', 'offset: 0'), false);
console.log('Isolated behavioral probes:', root);
