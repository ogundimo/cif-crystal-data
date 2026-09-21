import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { access, cp, mkdir, mkdtemp, readFile, readdir, realpath, rename, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { launchPackaged } from './packaged-app-driver.mjs';

// Native installation changes registry/shortcuts: never run on a research account.
assert.ok(process.platform === 'win32' && process.env.GITHUB_ACTIONS === 'true' &&
  process.env.RUNNER_ENVIRONMENT === 'github-hosted' && process.env.RUNNER_TEMP,
  'Installer acceptance requires a disposable GitHub-hosted Windows runner.');
const [candidate, upgrade, previous] = process.argv.slice(2, 5).map(file => resolve(file));
assert.ok(candidate && upgrade && previous, 'Provide candidate, newer-version fixture and previous installers.');
const output = resolve('reports/release-validation/installer-distribution.json');
await mkdir(dirname(output), { recursive: true });
const root = await mkdtemp(join(process.env.RUNNER_TEMP, 'cif-install-'));
const installDir = join(root, 'app'), profile = join(root, 'exports'), corpus = join(root, 'input');
for (const folder of [profile, corpus]) await mkdir(folder);
const fixture = await readFile('src/parser/__fixtures__/synthetic-test.cif');
await writeFile(join(corpus, 'sample.cif'), fixture);
const installedExe = join(installDir, 'CIF Crystal Data.exe');
const report = { status: 'running', root, checks: [], artifacts: [], limitations: [
  'Disposable hosted Windows image; silent NSIS installation and substituted app file dialogs.',
  'Upgrade uses current application code with a test-only newer version, not a published release candidate.',
  'No interactive installer, SmartScreen, physical-input or cold-start claims.'
] };
const save = () => writeFile(output, JSON.stringify(report, null, 2));
const hash = async file => createHash('sha256').update(await readFile(file)).digest('hex');
const exists = async file => { try { await access(file); return true; } catch { return false; } };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let run, userData, shortcuts;

async function execute(file, args) {
  const child = spawn(file, args, { windowsHide: true, stdio: 'inherit' });
  const [code] = await once(child, 'exit');
  assert.equal(code, 0, `${file} failed with ${code}`);
}

async function install(file) {
  await execute(file, ['/S', `/D=${installDir}`]);
  assert.ok(await exists(installedExe), 'Installer must create the application executable');
}

async function verify(phase, { fresh = false, expectedId, refresh = false } = {}) {
  run = await launchPackaged({ exe: installedExe, profile, corpus, useDefaultProfile: true });
  const actualProfile = await run.main("__smoke.electron.app.getPath('userData')");
  if (userData) assert.equal(actualProfile, userData, 'Profile location must survive reinstall/upgrade');
  userData = await realpath(actualProfile);
  const relativeProfile = relative(await realpath(process.env.APPDATA), userData);
  assert.ok(relativeProfile && !relativeProfile.startsWith('..') && !isAbsolute(relativeProfile), 'Use only the disposable account APPDATA profile');
  const version = await run.main('__smoke.electron.app.getVersion()');
  const countBefore = await run.ui('window.cifApi.getEntryCount()');
  assert.equal(countBefore, fresh ? 0 : 1);
  if (fresh) assert.equal((await run.ui('window.cifApi.importCifFolder()')).importedCount, 1);
  const search = "window.cifApi.searchPage({filter:{slot1:[],slot2:[],mode:'AND'},offset:0,limit:10})";
  let result = await run.ui(search);
  assert.equal(result.total, 1);
  const id = result.rows[0].id;
  if (expectedId !== undefined) assert.equal(id, expectedId, 'Upgrade must preserve the original entry identity');
  // Older releases may require explicit reimport to establish managed bytes.
  // Assert identity before refreshing; do not misreport this as automatic recovery.
  if (refresh) {
    await run.ui('window.cifApi.refreshCifFolder()');
    result = await run.ui(search);
    assert.equal(result.total, 1); assert.equal(result.rows[0].id, id);
  }
  const source = await run.ui(`window.cifApi.getViewerSource(${id})`);
  assert.ok(source.text.includes('data_synthetic_test'));
  const destination = join(profile, `${phase}.cif`);
  await run.main(`__smoke.electron.dialog.showSaveDialog=async()=>({canceled:false,filePath:${JSON.stringify(destination)}});true`);
  assert.equal((await run.ui(`window.cifApi.exportCif(${id})`)).exported, true);
  assert.equal(await readFile(destination, 'utf8'), source.text);
  assert.deepEqual(await run.main('__smoke.errors'), []);
  shortcuts = [join(await run.main("__smoke.electron.app.getPath('desktop')"), 'CIF Crystal Data.lnk'),
    join(process.env.APPDATA, 'Microsoft/Windows/Start Menu/Programs/CIF Crystal Data.lnk')];
  for (const file of shortcuts) assert.ok(await exists(file), `Installed shortcut missing: ${file}`);
  await run.stop(); run = null;
  report.checks.push({ phase, version, id, profile: userData, refreshedAfterUpgrade: refresh, exported: true });
  await save();
  return { id, version };
}

async function uninstall(phase) {
  const database = join(userData, 'cif-local.db');
  const before = await hash(database);
  const names = (await readdir(installDir)).filter(name => /^Uninstall.*\.exe$/i.test(name));
  assert.equal(names.length, 1);
  await execute(join(installDir, names[0]), ['/S']);
  for (let i = 0; i < 600 && await exists(installDir); i++) await pause(100);
  assert.equal(await exists(installDir), false, 'Uninstaller must remove the installed application directory');
  for (const file of shortcuts) assert.equal(await exists(file), false, `Shortcut survived uninstall: ${file}`);
  assert.equal(await hash(database), before, 'Uninstall must preserve the stopped user database bytes');
  assert.deepEqual(await readFile(join(corpus, 'sample.cif')), fixture);
  report.checks.push({ phase, profilePreserved: true, originalUnchanged: true, installationRemoved: true });
  await save();
}

try {
  for (const [kind, file] of [['candidate', candidate], ['upgrade-fixture', upgrade], ['previous-1.1.0', previous]]) {
    report.artifacts.push({ kind, file, sha256: await hash(file) });
  }
  await install(candidate);
  const first = await verify('clean-install', { fresh: true });
  await verify('restart', { expectedId: first.id });
  await uninstall('uninstall');
  await install(candidate);
  await verify('reinstall', { expectedId: first.id });
  await uninstall('uninstall-after-reinstall');
  // Move only the stopped synthetic profile created above; retain it as evidence.
  // RUNNER_TEMP and APPDATA may be on different drives; keep this move beside
  // the owned synthetic profile instead of relying on cross-volume rename.
  const archivedProfile = resolve(dirname(userData), `${basename(root)}-clean-install-profile`);
  assert.equal(dirname(archivedProfile), dirname(userData));
  report.archivedProfile = archivedProfile;
  await rename(userData, archivedProfile);
  await install(previous);
  const old = await verify('previous-release', { fresh: true });
  assert.equal(old.version, '1.1.0');
  await cp(userData, join(root, 'pre-upgrade-profile'), { recursive: true });
  await install(upgrade);
  const upgraded = await verify('version-upgrade', { expectedId: old.id, refresh: true });
  assert.equal(upgraded.version, process.env.UPGRADE_PROBE_VERSION);
  assert.notEqual(upgraded.version, old.version, 'A same-version reinstall is not upgrade evidence');
  await verify('restart-after-upgrade', { expectedId: old.id });
  await uninstall('uninstall-after-upgrade');
  report.status = 'passed';
} catch (error) {
  report.status = 'failed'; report.error = error.stack; process.exitCode = 1;
} finally {
  if (run) await run.stop();
  await save();
  console.log(`Installer acceptance ${report.status}: ${output}`);
}
