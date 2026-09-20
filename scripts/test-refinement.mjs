import { spawnSync } from 'node:child_process';
import { refinementPython } from './refinement-runtime.mjs';
const check = spawnSync(refinementPython(), ['-s', 'engine/test_refinement.py'], { stdio: 'inherit', windowsHide: true });
if (check.status !== 0) process.exit(check.status ?? 1);
