import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const electronPath = require('electron');
const root = dirname(dirname(fileURLToPath(import.meta.url)));

const server = await createServer({
  root: join(root, 'src/renderer'),
  configFile: false,
  plugins: [react()],
  logLevel: 'error',
  server: {
    host: '127.0.0.1',
    port: 0,
    strictPort: false
  }
});

try {
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === 'string') {
    throw new Error('Could not determine the UI test server port.');
  }

  const testUrl = `http://127.0.0.1:${address.port}/ui-test.html`;
  const runner = join(root, 'scripts/quick-search-ui-electron.cjs');
  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(electronPath, [runner], {
      cwd: root,
      env: { ...process.env, CIF_UI_TEST_URL: testUrl },
      stdio: 'inherit',
      windowsHide: true
    });
    child.once('error', reject);
    child.once('exit', (code) => resolve(code ?? 1));
  });

  if (exitCode !== 0) process.exitCode = exitCode;
} finally {
  await server.close();
}

