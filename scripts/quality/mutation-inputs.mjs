import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { isProduction } from './scope.mjs';

// Shared by the authoritative run, local feedback runs and benchmarks, so all three
// fingerprint the same inputs. Changing these lists changes the full-run contract.
export const mutationScope=['src/parser/cif/formula.ts','src/shared/searchValidation.ts','src/renderer/src/pxrd.ts'];
const contractTools=['@stryker-mutator/core','@stryker-mutator/vitest-runner','@stryker-mutator/typescript-checker','vitest','typescript'];
const contractConfigFiles=['stryker.config.json','vitest.config.ts','scripts/quality/scope.mjs',
  'tsconfig.mutation.json','tsconfig.web.json','tsconfig.node.json','package.json','package-lock.json'];

export const hash=text=>createHash('sha256').update(text.replaceAll('\r\n','\n')).digest('hex');
export const readJson=async file=>JSON.parse(await readFile(file,'utf8'));

export const productionInput=file=>isProduction(file)||(/^src\/.*\.json$/.test(file)&&!file.includes('/__fixtures__/')&&!file.includes('/public/vendor/'));
export const testInput=file=>/^src\/.*\.test\.tsx?$/.test(file)||file.startsWith('src/')&&file.includes('/__fixtures__/');

export function toolVersions(lock) {
  return Object.fromEntries(contractTools.map(name=>[name,lock.packages[`node_modules/${name}`].version]));
}

export async function configHashes() {
  const hashes={};
  for(const file of contractConfigFiles) hashes[file]=hash(await readFile(file,'utf8'));
  return hashes;
}

// Tracked and untracked (non-ignored) production, test and fixture files with content hashes.
export async function collectInputs() {
  const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8',windowsHide:true}).split('\0').filter(Boolean).sort();
  return Promise.all(files.filter(file=>productionInput(file)||testInput(file))
    .map(async file=>[file,hash(await readFile(file,'utf8'))]));
}

export async function changedInputs(inputs) {
  const changed=[];
  for(const [file,digest] of inputs) {
    let current;
    try { current=hash(await readFile(file,'utf8')); } catch(error) { if(error.code!=='ENOENT') throw error; }
    if(current!==digest) changed.push(file);
  }
  return changed;
}
