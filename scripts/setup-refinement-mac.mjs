// Run on the target Mac architecture. Copy a complete relocatable interpreter,
// not a venv whose base interpreter points outside the application bundle.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.platform !== 'darwin' || !['arm64', 'x64'].includes(process.arch)) {
  throw new Error('Run macOS runtime setup on an Apple Silicon or Intel Mac with native Node.js.');
}
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
const runtime = resolve('.tools/rietx-runtime');
const staging = resolve('.tools/mac-python-download');
const commit = '41c5f64ed88070a7acbd1bab1c074478c88df9f3';
const pythonVersion = '3.12.11';
const marker = join(runtime, 'platform.json');
const expected = { platform: 'darwin', arch: process.arch, pythonVersion };
if (existsSync(runtime)) {
  if (!existsSync(marker) || JSON.stringify(JSON.parse(readFileSync(marker, 'utf8'))) !== JSON.stringify(expected)) {
    throw new Error('Use a clean checkout: .tools/rietx-runtime contains a different or incomplete runtime.');
  }
}
const env = { ...process.env, UV_PYTHON_INSTALL_DIR: staging };
function run(command, args, capture = false) {
  const result = spawnSync(command, args, { env, encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (${result.status}): ${result.stderr ?? ''}`);
  return result.stdout?.trim();
}
if (!existsSync(marker)) {
  run('uv', ['python', 'install', pythonVersion]);
  const downloaded = realpathSync(run('uv', ['python', 'find', '--managed-python', pythonVersion], true));
  const pythonRoot = dirname(dirname(downloaded));
  mkdirSync(runtime, { recursive: true });
  cpSync(pythonRoot, join(runtime, 'python'), { recursive: true, verbatimSymlinks: true });
}
const python = join(runtime, 'python', 'bin', 'python3');
// Isolated mode prevents a user's PYTHONPATH or user-site packages from
// satisfying this validation instead of the bundled runtime.
const architecture = run(python, ['-I', '-c', 'import platform; print(platform.machine())'], true);
if (architecture !== (process.arch === 'arm64' ? 'arm64' : 'x86_64')) throw new Error('Python architecture does not match Node.js.');
const install = ['pip', 'install', '--python', python, '--break-system-packages', '--link-mode', 'copy'];
if (process.arch === 'x64') {
  // Current Numba/LLVM wheels no longer support Intel macOS. rietx explicitly
  // supports a NumPy execution tier when Numba is absent; keep the same engine
  // and model, and test every method on this architecture before packaging.
  const requirements = readFileSync('engine/requirements.txt', 'utf8')
    .split(/\r?\n/).filter(line => !/^(numba|llvmlite)==/.test(line)).join('\n');
  const requirementsPath = join(runtime, 'requirements-mac-x64.txt');
  writeFileSync(requirementsPath, requirements);
  run('uv', [...install, '-r', requirementsPath]);
  run('uv', [...install, '--no-deps', `https://github.com/yue-here/rietx/archive/${commit}.zip`]);
  writeFileSync(join(runtime, 'execution-tier.txt'), 'NumPy fallback on Intel macOS; Numba is not bundled.\n');
} else {
  run('uv', [...install, '-r', 'engine/requirements.txt', `https://github.com/yue-here/rietx/archive/${commit}.zip`]);
}
for (const name of ['LICENSE', 'LICENSE-3RD-PARTY.md', 'ATTRIBUTION.md']) {
  const response = await fetch(`https://raw.githubusercontent.com/yue-here/rietx/${commit}/${name}`);
  if (!response.ok) throw new Error(`Could not fetch ${name}: HTTP ${response.status}`);
  writeFileSync(join(runtime, name === 'LICENSE' ? 'LICENSE-rietx.txt' : name), await response.text());
}
writeFileSync(join(runtime, 'rietx-version.txt'), commit + '\n');
run(python, ['-I', 'engine/refinement.py', '--check']);
writeFileSync(marker, JSON.stringify(expected));
console.log(`macOS ${process.arch} refinement runtime ready at ${runtime}`);
