import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { refinementPython } from './refinement-runtime.mjs';
const root = '.tools/rietx-runtime';
const python = refinementPython(root);
if (!existsSync(python) || !existsSync(`${root}/LICENSE-rietx.txt`) || !existsSync(`${root}/rietx-version.txt`) || readFileSync(`${root}/rietx-version.txt`, 'utf8').trim() !== '41c5f64ed88070a7acbd1bab1c074478c88df9f3') throw new Error('Run npm run setup:refinement before packaging.');
const check = spawnSync(python, ['-s', 'engine/refinement.py', '--check'], { stdio: 'inherit', windowsHide: true });
if (check.status !== 0) process.exit(check.status ?? 1);
