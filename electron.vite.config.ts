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
        input: 'src/main/index.ts',
        output: {
          // Shared search data must not make database chunks import the Electron entry point.
          manualChunks: (id) => id.replaceAll('\\', '/').includes('/src/shared/') ? 'shared' : undefined
        }
      }
    }
  },
  preload: {
    build: {
      outDir: 'dist-electron/preload',
      rollupOptions: {
        input: 'src/preload/index.ts',
        output: {
          format: 'cjs',
          entryFileNames: '[name].cjs'
        }
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
