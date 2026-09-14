import { defineConfig } from 'vitest/config';
import { coverageInclude, coverageExclude } from './scripts/quality/scope.mjs';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: coverageInclude,
      exclude: coverageExclude,
      reportsDirectory: 'reports/quality/coverage',
      reporter: ['text', 'json-summary', 'html', 'lcov'],
      reportOnFailure: true
    }
  }
});
