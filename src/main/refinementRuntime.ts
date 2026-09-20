import { join } from 'node:path';

export function refinementPythonPath(runtime: string, platform: NodeJS.Platform = process.platform): string {
  if (platform === 'win32') return join(runtime, 'python', 'python.exe');
  if (platform === 'darwin') return join(runtime, 'python', 'bin', 'python3');
  throw new Error(`The bundled refinement engine does not support ${platform}.`);
}
