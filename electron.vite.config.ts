import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const rendererOutDir = fileURLToPath(new URL('dist', import.meta.url));

export default defineConfig({
  main: {
    build: {
      outDir: 'dist-electron/main',
      rollupOptions: {
        external: ['better-sqlite3'],
        input: 'src/main/index.ts'
      }
    }
  },
  preload: {
    build: {
      outDir: 'dist-electron/preload',
      rollupOptions: {
        input: 'src/preload/index.ts'
      }
    }
  },
  renderer: {
    root: 'src/renderer',
    plugins: [react()],
    build: {
      outDir: rendererOutDir,
      rollupOptions: {
        input: 'src/renderer/index.html'
      }
    }
  }
});
