import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, copyFile, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { launchPackaged } from './packaged-app-driver.mjs';

const exe = resolve(process.argv[2]);
const reportPath = resolve(process.argv[3] ?? 'reports/release-validation/portable-launcher.json');
const root = await mkdtemp(join(tmpdir(), 'cif-portable-'));
const profile = join(root, 'profile'), corpus = join(root, 'input'), extraction = join(root, 'extraction');
const initialFolder = join(root, 'path with spaces'), movedFolder = join(root, 'relocated launcher');
for (const folder of [profile, corpus, extraction, initialFolder, movedFolder, dirname(reportPath)]) await mkdir(folder, { recursive: true });
const fixture = await readFile('src/parser/__fixtures__/synthetic-test.cif');
await writeFile(join(corpus, 'sample.cif'), fixture);
let launcher = join(initialFolder, basename(exe));
await copyFile(exe, launcher);
const report = { status: 'running', executable: exe, sha256: createHash('sha256').update(await readFile(exe)).digest('hex'),
  profile, extraction, launches: [], limitations: ['Inspector/GPU-disabled automation; native dialogs substituted.',
    'Isolated explicit userData and TEMP; not default-profile or cold-start evidence.'] };
let run;
try {
  for (const phase of ['initial', 'restart', 'relocated']) {
    if (phase === 'relocated') {
      const moved = join(movedFolder, basename(exe));
      await rename(launcher, moved); launcher = moved;
    }
    const start = performance.now();
    run = await launchPackaged({ exe: launcher, profile, corpus, tempDir: extraction, launchTimeoutMs: 180000 });
    const elapsedMs = performance.now() - start;
    assert.equal(await run.main('process.env.PORTABLE_EXECUTABLE_FILE'), launcher);
    if (phase === 'initial') {
      assert.equal(await run.ui('window.cifApi.getEntryCount()'), 0);
      assert.equal((await run.ui('window.cifApi.importCifFolder()')).importedCount, 1);
    }
    const result = await run.ui("window.cifApi.searchPage({filter:{slot1:[],slot2:[],mode:'AND'},offset:0,limit:10})");
    assert.equal(result.total, 1);
    const source = await run.ui(`window.cifApi.getViewerSource(${result.rows[0].id})`);
    assert.ok(source.text.includes('data_synthetic_test'));
    const destination = join(profile, `${phase}.cif`);
    await run.main(`__smoke.electron.dialog.showSaveDialog=async()=>({canceled:false,filePath:${JSON.stringify(destination)}});true`);
    assert.equal((await run.ui(`window.cifApi.exportCif(${result.rows[0].id})`)).exported, true);
    assert.equal(await readFile(destination, 'utf8'), source.text);
    assert.deepEqual(await run.main('__smoke.errors'), []);
    await run.stop(); run = null;
    report.launches.push({ phase, launcher, elapsedMs, entries: result.total, entryId: result.rows[0].id, exported: true });
    console.log(`Portable ${phase} passed (${Math.round(elapsedMs)} ms instrumented launch)`);
  }
  assert.ok(report.launches.every(item => item.entryId === report.launches[0].entryId));
  assert.deepEqual(await readFile(join(corpus, 'sample.cif')), fixture);
  report.status = 'passed';
} catch (error) {
  report.status = 'failed'; report.error = error.stack; process.exitCode = 1;
} finally {
  if (run) await run.stop();
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(`Portable acceptance ${report.status}: ${reportPath}`);
}
