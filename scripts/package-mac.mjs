import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

if (process.platform !== 'darwin') throw new Error('Mac installers must be built on macOS. Use the Build macOS installers workflow.');
const marker = JSON.parse(readFileSync('.tools/rietx-runtime/platform.json', 'utf8'));
if (marker.platform !== 'darwin' || marker.arch !== process.arch) throw new Error('Run npm run setup:refinement:mac for this Mac architecture first.');
function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
run(process.execPath, ['scripts/check-refinement-runtime.mjs']);
run('npm', ['run', 'build']);
const require = createRequire(import.meta.url);
run(process.execPath, [require.resolve('electron-builder/cli.js'), '--config', 'electron-builder.mac.cjs',
  '--mac', `--${process.arch}`, '--publish', 'never']);
