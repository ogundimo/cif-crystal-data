// One scope for static analysis and coverage. Keep exclusions explicit and reviewable.
export const coverageInclude = ['src/**/*.{ts,tsx}'];
export const coverageExclude = [
  '**/*.test.ts', '**/*.test.tsx', '**/*.d.ts',
  'src/renderer/src/uiTest.tsx', 'src/**/__fixtures__/**',
  'src/renderer/public/vendor/**'
];

export function category(file) {
  if (/^(node_modules|dist|dist-electron|release|out|\.dist)\//.test(file) ||
      file.startsWith('src/renderer/public/vendor/')) return 'excluded';
  if (/\.test\.[cm]?[jt]sx?$/.test(file) || file === 'src/renderer/src/uiTest.tsx') return 'tests';
  if (file.startsWith('scripts/')) return 'scripts';
  if (file === 'src/shared/periodicTableData.ts' || file === 'src/renderer/src/periodicTable.ts') return 'data-tables';
  if (/^src\/.*\.(ts|tsx)$/.test(file) && !file.endsWith('.d.ts') && !file.includes('/__fixtures__/')) return 'application';
  return 'other';
}

export const isProduction = file => ['application', 'data-tables'].includes(category(file));
export const moduleName = file => file.startsWith('src/') ? file.split('/')[1] : category(file);

export function physicalLines(text) {
  if (!text) return 0;
  return text.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n').length;
}

export function combineCoverage(entries) {
  return Object.fromEntries(['lines', 'statements', 'functions', 'branches'].map(dimension => {
    const total = entries.reduce((sum, entry) => sum + entry[dimension].total, 0);
    const covered = entries.reduce((sum, entry) => sum + entry[dimension].covered, 0);
    return [dimension, { total, covered, pct: total ? Math.round(covered / total * 10000) / 100 : null }];
  }));
}

export function complexityFinding(file, message) {
  const pattern = message.ruleId === 'complexity'
    ? /has a complexity of (\d+)\./
    : message.ruleId === 'sonarjs/cognitive-complexity'
      ? /Cognitive Complexity from (\d+) to/
      : null;
  const match = pattern && message.message.match(pattern);
  if (message.fatal || !match) throw new Error(`Unexpected analyzer diagnostic in ${file}:${message.line}: ${message.message}`);
  return { file, line: message.line, column: message.column, value: Number(match[1]), message: message.message };
}
