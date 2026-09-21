import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { relative } from 'node:path';
import { category } from './scope.mjs';
import { measureDuplication } from './analyzers.mjs';
import { cloneIdentity, compareDuplication, digest, protectDuplicationPolicy } from './duplication-policy.mjs';
import { sameMeasurementLock } from './release-metadata.mjs';

const baselinePath = 'docs/baselines/duplication-policy.json';
const git = (...args) => execFileSync('git', args, {encoding:'utf8', windowsHide:true}).trim();
const read = async path => JSON.parse(await readFile(path, 'utf8'));
async function compareWithReleaseMetadata(current, policy) {
  const file = 'package-lock.json';
  if (current.contract[file] !== policy.contract[file]) {
    const revision = policy.review?.sourceCommit;
    if (!/^[a-f0-9]{40}$/.test(revision ?? '')) throw new Error('Missing baseline lockfile provenance');
    const previousText = execFileSync('git', ['show', `${revision}:${file}`], { encoding: 'utf8', windowsHide: true });
    if (sameMeasurementLock(await readFile(file, 'utf8'), previousText, policy.contract[file])) {
      current = structuredClone(current);
      current.contract[file] = policy.contract[file];
    }
  }
  return compareDuplication(current, policy);
}
await mkdir('reports/quality', {recursive:true});
try {
  if (process.versions.node.split('.')[0] !== '22') throw new Error('Duplication measurements require Node 22');
  const contract = {};
  for (const path of ['scripts/quality/scope.mjs', 'scripts/quality/analyzers.mjs', 'scripts/quality/duplication-policy.mjs', 'package-lock.json']) {
    contract[path] = digest(await readFile(path, 'utf8'));
  }
  const files = git('ls-files', '--cached', '--others', '--exclude-standard', '-z').split('\0')
    .filter(file => category(file) === 'application').sort();
  if (!files.length) throw new Error('Empty duplication scope');
  const sources = new Map(await Promise.all(files.map(async file => [file, (await readFile(file, 'utf8')).replaceAll('\r\n','\n')])));
  const result = await measureDuplication(files);
  if (!result.statistic.total.sources) throw new Error('Duplication analyzer scanned no sources');
  const location = side => ({file:relative(process.cwd(), side.sourceId).replaceAll('\\','/'), start:side.start.line, end:side.end.line});
  const current = {contract, inputs:Object.fromEntries([...sources].map(([file, text]) => [file, digest(text)])),
    total:result.statistic.total, clones:result.clones.map(clone => cloneIdentity({format:clone.format,
      a:location(clone.duplicationA), b:location(clone.duplicationB)}, sources))};
  for (const [file, text] of sources) if (digest(await readFile(file, 'utf8')) !== digest(text)) throw new Error(`Input changed during duplication measurement: ${file}`);
  await writeFile('reports/quality/duplication-current.json', JSON.stringify(current, null, 2)+'\n');
  const policy = await read(baselinePath);
  const assessment = await compareWithReleaseMetadata(current, policy);
  const baseIndex = process.argv.indexOf('--base');
  if (baseIndex !== -1) {
    const ref = process.argv[baseIndex + 1];
    if (!ref || ref.startsWith('-')) throw new Error('--base requires a Git revision');
    if (git('ls-tree', ref, '--', baselinePath)) {
      const previous = JSON.parse(git('show', `${ref}:${baselinePath}`));
      assessment.failures.push(...protectDuplicationPolicy(policy, previous).failures,
        ...(await compareWithReleaseMetadata(current, previous)).failures.map(message => `Target-branch policy: ${message}`));
    } else console.log('Initial duplication-policy adoption; no target-branch allowance exists.');
  }
  await writeFile('reports/quality/duplication-regression.json', JSON.stringify(assessment, null, 2)+'\n');
  console.log(assessment.accepted.join('\n'));
  if (assessment.failures.length) throw new Error(assessment.failures.join('\n'));
  console.log(`Duplication gate passed (${current.clones.length} visible clone pairs).`);
} catch (error) {
  await writeFile('reports/quality/duplication-regression.json', JSON.stringify({failures:[error.message]}, null, 2)+'\n');
  console.error(error.message); process.exitCode = 1;
}
