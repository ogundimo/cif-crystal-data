import { join } from 'node:path';

export function refinementPython(root = '.tools/rietx-runtime') {
  if (process.platform === 'win32') return join(root, 'python', 'python.exe');
  if (process.platform === 'darwin') return join(root, 'python', 'bin', 'python3');
  throw new Error(`Bundled refinement is not configured for ${process.platform}.`);
}
