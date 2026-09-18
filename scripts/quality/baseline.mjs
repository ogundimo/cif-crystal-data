import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, appendFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createComplexityAnalyzer, measureDuplication, duplicationSettings } from './analyzers.mjs';
import { category, isProduction, moduleName, physicalLines, combineCoverage, complexityFinding } from './scope.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
process.chdir(root);
const output = resolve(root, 'reports/quality');
const require = createRequire(import.meta.url);
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
const portable = path => path.replaceAll('\\', '/');
const relativePath = path => portable(relative(root, path));
const json = (name, value) => writeFile(resolve(output, name), JSON.stringify(value, null, 2) + '\n');
const percent = metric => metric.pct === null ? 'n/a' : `${metric.pct}%`;
const escape = value => String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');

// Remove only this fixed generated directory so a failed run cannot reuse old reports.
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
try {
  const files = git('ls-files', '--cached', '--others', '--exclude-standard', '-z').split('\0').filter(Boolean).sort();
  const inventory = [];
  for (const file of files.filter(file => /\.[cm]?[jt]sx?$/.test(file) && category(file) !== 'excluded')) {
    const text = (await readFile(file, 'utf8')).replaceAll('\r\n', '\n');
    inventory.push({ file, category: category(file), module: moduleName(file), lines: physicalLines(text),
      sha256: createHash('sha256').update(text).digest('hex') });
  }
  const production = inventory.filter(row => isProduction(row.file));
  if (!production.length) throw new Error('No production source files found');
  const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
  const tools = Object.fromEntries(['vitest', '@vitest/coverage-v8', 'eslint', '@typescript-eslint/parser', 'eslint-plugin-sonarjs', 'jscpd']
    .map(name => [name, lock.packages[`node_modules/${name}`].version]));
  const metadata = { schemaVersion: 1, commit: git('rev-parse', 'HEAD'), dirty: Boolean(git('status', '--porcelain')),
    node: process.version, platform: process.platform, tools,
    sourceSha256: createHash('sha256').update(JSON.stringify(production)).digest('hex'),
    lockSha256: createHash('sha256').update(await readFile('package-lock.json')).digest('hex') };
  const normalizedHash = text => createHash('sha256').update(text.replaceAll('\r\n', '\n')).digest('hex');
  metadata.regressionContract = Object.fromEntries(await Promise.all(
    ['scripts/quality/scope.mjs', 'scripts/quality/analyzers.mjs', 'vitest.config.ts']
      .map(async file => [file, normalizedHash(await readFile(file, 'utf8'))])));
  metadata.regressionTests = normalizedHash(JSON.stringify(await Promise.all(
    files.filter(file => /^src\/.*\.test\.tsx?$/.test(file)).map(async file => [file, normalizedHash(await readFile(file, 'utf8'))]))));
  await json('inventory.json', inventory);
  await json('metadata.json', metadata);

  console.log('Collecting unit-test coverage (Electron workflow execution is separate).');
  const coverageRun = spawnSync(process.execPath, [resolve(dirname(require.resolve('vitest/package.json')), 'vitest.mjs'), 'run', '--coverage'],
    { cwd: root, stdio: 'inherit', windowsHide: true });
  if (coverageRun.error || coverageRun.status !== 0) throw new Error(`Coverage/test run failed: ${coverageRun.error?.message ?? coverageRun.status}`);
  const rawCoverage = JSON.parse(await readFile(resolve(output, 'coverage/coverage-summary.json'), 'utf8'));
  const coverage = Object.fromEntries(Object.entries(rawCoverage).filter(([file]) => file !== 'total')
    .map(([file, data]) => [relativePath(file), data]));
  // Declaration-only modules have no executable counters and may be omitted by V8.
  // An omitted executable file is a failure, never silently counted as fully covered.
  for (const { file } of production) {
    if (coverage[file]) continue;
    const ts = await import('typescript');
    const compiled = ts.transpileModule(await readFile(file, 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX, removeComments: true }
    }).outputText.replace(/export\s*\{\s*\}\s*;?/g, '').trim();
    if (compiled) throw new Error(`Executable production file missing from coverage: ${file}`);
  }
  const modules = Object.fromEntries([...new Set(production.map(row => row.module))].sort().map(name => [name,
    combineCoverage(production.filter(row => row.module === name && coverage[row.file]).map(row => coverage[row.file]))]));
  const totals = combineCoverage(Object.values(coverage));
  await json('coverage/coverage-summary.json', { total: totals, ...coverage });

  console.log('Measuring function complexity. Zero reporting thresholds are not quality gates.');
  const eslint = createComplexityAnalyzer();
  const cyclomatic = [], cognitive = [];
  for (const result of await eslint.lintFiles(production.map(row => row.file))) {
    for (const message of result.messages) {
      const finding = complexityFinding(relativePath(result.filePath), message);
      (message.ruleId === 'complexity' ? cyclomatic : cognitive).push(finding);
    }
  }
  const ranking = (a, b) => b.value - a.value || a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column;
  cyclomatic.sort(ranking); cognitive.sort(ranking);
  if (!cyclomatic.length) throw new Error('Complexity analyzer returned no functions');
  await json('complexity.json', { cyclomatic, cognitive });

  console.log('Measuring token duplication in application logic (data tables reported separately).');
  const duplicationInputs = production.filter(row => row.category === 'application').map(row => row.file);
  const duplicates = await measureDuplication(duplicationInputs);
  const clones = duplicates.clones.map(clone => ({ format: clone.format,
    a: { file: relativePath(clone.duplicationA.sourceId), start: clone.duplicationA.start.line, end: clone.duplicationA.end.line },
    b: { file: relativePath(clone.duplicationB.sourceId), start: clone.duplicationB.start.line, end: clone.duplicationB.end.line } }));
  if (!duplicates.statistic.total.sources) throw new Error('Duplication analyzer scanned no source files');
  const duplication = { settings: duplicationSettings, inputs: duplicationInputs,
    total: duplicates.statistic.total, clones };
  await json('duplication.json', duplication);

  const deferred = {
    halsteadDifficulty: 'Deferred: no validated TypeScript/TSX operator-and-operand analyzer has been selected. Not inferred from file length.',
    crap: 'Deferred: no validated function-range join between ESLint complexity and V8 source coverage yet. Proposed formula: C^2 * (1 - cov)^3 + C, where C is per-function classic cyclomatic complexity and cov is the fraction of executable lines covered within that same function. Nested-function attribution must be defined before calculation. Global coverage must not be substituted.'
  };
  await json('baseline.json', { ...metadata, coverage: { total: totals, modules, files: coverage },
    inventory, complexity: { cyclomatic, cognitive }, duplication, deferred });
  const summary = [
    '# Code-quality baseline', '', `Commit: \`${metadata.commit}\` · working tree: **${metadata.dirty ? 'modified (see source hashes)' : 'clean'}**`,
    `Node ${metadata.node} on ${metadata.platform}. Source fingerprint: \`${metadata.sourceSha256}\`.`, '',
    '**Advisory measurements; no score thresholds enforced.** Coverage is from Vitest unit tests only; separate Electron UI/worker/viewer runs are not included.', '',
    '## Coverage', '', '| Module | Lines | Statements | Functions | Branches |', '| --- | ---: | ---: | ---: | ---: |',
    ...Object.entries({ ...modules, total: totals }).map(([name, data]) => `| ${name} | ${percent(data.lines)} | ${percent(data.statements)} | ${percent(data.functions)} | ${percent(data.branches)} |`), '',
    'Untested executable production files are included. Declaration-only modules have no executable denominator.', '',
    '## Source inventory', '', '| Category | Files | Physical lines |', '| --- | ---: | ---: |',
    ...[...new Set(inventory.map(row => row.category))].sort().map(name => {
      const rows = inventory.filter(row => row.category === name);
      return `| ${name} | ${rows.length} | ${rows.reduce((sum, row) => sum + row.lines, 0)} |`;
    }), '', 'Physical lines include blanks and comments. Tests, scripts, and data tables are not mixed with application logic in this inventory.', '',
    ...[['Cyclomatic complexity', cyclomatic], ['Cognitive complexity', cognitive]].flatMap(([title, rows]) => [
      `## ${title}: top 10`, '', '| Location | Score | Analyzer description |', '| --- | ---: | --- |',
      ...rows.slice(0, 10).map(row => `| ${row.file}:${row.line}:${row.column} | ${row.value} | ${escape(row.message)} |`), ''
    ]),
    'Cognitive output lists positive scores only. Reporting thresholds of zero collect findings; they are not accepted limits.', '',
    '## Largest production files', '', '| File | Physical lines |', '| --- | ---: |',
    ...[...production].sort((a, b) => b.lines - a.lines).slice(0, 10).map(row => `| ${row.file} | ${row.lines} |`), '',
    '## Duplication', '', `${duplication.total.clones} clone pairs; ${duplication.total.duplicatedLines} duplicated lines reported by jscpd (${duplication.total.percentage}%).`,
    `Weak token mode, minimum 70 tokens and 5 lines. ${duplicationInputs.length} input files; ${duplication.total.sources} tokenized sources and ${duplication.total.lines} detector lines (TSX can produce multiple token streams). Data tables, tests, and scripts excluded. This is a detector estimate, not a percentage of physical source lines or logic that should be removed.`, '',
    '| First location | Second location |', '| --- | --- |',
    ...clones.slice(0, 10).map(clone => `| ${clone.a.file}:${clone.a.start}–${clone.a.end} | ${clone.b.file}:${clone.b.start}–${clone.b.end} |`), '',
    '## Deferred metrics', '', `- Halstead difficulty: ${deferred.halsteadDifficulty}`, `- CRAP: ${deferred.crap}`, '',
    '## Analyzer versions', '', ...Object.entries(tools).map(([name, version]) => `- ${name}: ${version}`), '',
    'Full results: baseline.json, complexity.json, duplication.json, inventory.json, coverage/index.html, and coverage/lcov.info in the quality artifact.', ''
  ].join('\n');
  await writeFile(resolve(output, 'summary.md'), summary);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, summary);
  console.log(summary);
} catch (error) {
  const failure = `# Code-quality baseline failed\n\nNo complete baseline was produced.\n\n${String(error.stack ?? error)}\n`;
  await writeFile(resolve(output, 'failure.md'), failure);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, failure);
  console.error(error);
  process.exitCode = 1;
}
