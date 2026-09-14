import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const cli = resolve(dirname(fileURLToPath(import.meta.resolve('dependency-cruiser'))), '../../bin/dependency-cruiser.mjs');
// Never leave a previous successful graph looking like the result of a failed scan.
await rm('reports/architecture/dependencies.json', { force: true });
const excluded = /(^|\/)(__tests__|__fixtures__)\/|\.(test|spec)\.[cm]?[jt]sx?$|^src\/renderer\/src\/uiTest\.tsx$|^src\/renderer\/public\/vendor\//;
const files = (await readdir('src', { recursive: true, withFileTypes: true }))
  .filter(entry => entry.isFile())
  .map(entry => `${entry.parentPath}/${entry.name}`.replaceAll('\\', '/'))
  .filter(file => /\.[cm]?[jt]sx?$/.test(file) && !excluded.test(file)).sort();
if (!files.length) throw new Error('No architecture inputs found');
const result = spawnSync(process.execPath, [cli, ...files, '--config', '.dependency-cruiser.cjs', '--output-type', 'json'], {
  encoding: 'utf8', windowsHide: true, timeout: 120000, maxBuffer: 16 * 1024 * 1024
});
if (result.error || result.signal || ![0, 1].includes(result.status)) {
  throw result.error ?? new Error(result.stderr || `Analyzer exited ${result.status}/${result.signal}`);
}
if (!result.stdout.trim()) throw new Error(result.stderr || 'Analyzer returned no report');
const report = JSON.parse(result.stdout);
if (!Array.isArray(report.summary?.violations) || !report.modules?.length) throw new Error('Invalid architecture report');
for (const file of files) {
  if (!report.modules.some(module => module.source === file)) throw new Error(`Missing architecture input: ${file}`);
}
const fingerprint = createHash('sha256');
for (const file of files) fingerprint.update(file).update('\0').update((await readFile(file, 'utf8')).replaceAll('\r\n', '\n')).update('\0');
const git = args => execFileSync('git', args, { encoding: 'utf8', windowsHide: true }).trim();
const provenance = {
  commit: git(['rev-parse', 'HEAD']),
  dirty: Boolean(git(['status', '--porcelain', '--untracked-files=normal'])),
  node: process.version,
  analyzer: JSON.parse(await readFile(resolve(dirname(cli), '../package.json'), 'utf8')).version,
  sourceFingerprint: fingerprint.digest('hex'),
  inputFiles: files.length,
  configSha256: createHash('sha256').update(await readFile('.dependency-cruiser.cjs')).digest('hex'),
  lockfileSha256: createHash('sha256').update(await readFile('package-lock.json')).digest('hex')
};
await mkdir('reports/architecture', { recursive: true });
await writeFile('reports/architecture/dependencies.json', JSON.stringify({ provenance, ...report }, null, 2) + '\n');
for (const violation of report.summary.violations) {
  const edge = report.modules.find(module => module.source === violation.from)?.dependencies.find(dep => dep.resolved === violation.to);
  const kind = edge ? (edge.preCompilationOnly ? 'type-only' : 'runtime/mixed') : 'path; see edge metadata';
  console.error(`${violation.rule.name}: ${violation.from} -> ${violation.to} [${kind}]`);
  if (violation.cycle) console.error(`  cycle: ${JSON.stringify(violation.cycle)}`);
  if (violation.via) console.error(`  via: ${JSON.stringify(violation.via)}`);
}
console.log(`Architecture: ${files.length} inputs; ${report.summary.violations.length} violations. Report: reports/architecture/dependencies.json`);
process.exitCode = report.summary.violations.length || result.status ? 1 : 0;
