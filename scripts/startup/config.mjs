import base from '../../electron.vite.config.ts';

if (!process.env.CIF_BENCHMARK_CACHE) throw new Error('Run through benchmark:startup.');
export default {
  ...base,
  renderer: { ...base.renderer, cacheDir: process.env.CIF_BENCHMARK_CACHE }
};
