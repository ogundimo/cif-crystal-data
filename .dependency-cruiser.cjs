// Reviewed policy and exceptions: docs/architecture.md.
const tests = '(^|/)(__tests__|__fixtures__)/|\\.(test|spec)\\.[cm]?[jt]sx?$';
const layer = (name, allowed) => ({
  name: `${name}-dependencies`,
  severity: 'error',
  comment: `Keep ${name} dependencies within ${allowed.join(', ')}; move cross-process contracts to shared.`,
  from: { path: `^src/${name}/` },
  to: { path: '^src/', pathNot: `^src/(${allowed.join('|')})/` }
});

module.exports = {
  forbidden: [
    layer('main', ['main', 'parser', 'shared']),
    layer('preload', ['preload', 'shared']),
    layer('renderer', ['renderer', 'shared']),
    layer('parser', ['parser', 'shared']),
    layer('shared', ['shared']),
    {
      name: 'worker-isolation', severity: 'error',
      comment: 'The import worker must not transitively load Electron or UI/process entry points.',
      from: { path: '^src/main/importWorker\\.ts$' },
      to: { reachable: true, path: '(^|/)(electron|@electron/[^/]+)(/|$)|^src/(preload/|renderer/|main/index\\.ts$)' }
    },
    {
      name: 'worker-entry-only-through-runner', severity: 'error',
      from: { pathNot: '^src/main/importRunner\\.ts$' },
      to: { path: '^src/main/importWorker\\.ts$' }
    },
    {
      name: 'no-cycles', severity: 'error',
      comment: 'Break the dependency cycle, including type-only coupling.',
      from: {}, to: { circular: true }
    },
    {
      name: 'no-unresolved', severity: 'error',
      comment: 'Fix the import or configure its actual build resolution; do not ignore it.',
      from: {}, to: { couldNotResolve: true }
    },
    {
      name: 'no-production-test-imports', severity: 'error',
      from: {}, to: { path: `${tests}|^src/renderer/src/uiTest\\.tsx$` }
    },
    {
      name: 'no-node-in-portable-code', severity: 'error',
      from: { path: '^src/(renderer|parser|shared|preload)/' },
      to: { dependencyTypes: ['core'] }
    },
    {
      name: 'no-platform-packages-in-portable-code', severity: 'error',
      from: { path: '^src/(renderer|parser|shared)/' },
      to: { path: '(^|/)(electron|@electron/[^/]+|better-sqlite3)(/|$)' }
    },
    {
      name: 'no-ui-packages-outside-renderer', severity: 'error',
      from: { path: '^src/(main|preload|parser|shared)/' },
      to: { path: '(^|/)(react|react-dom|@tanstack/[^/]+)(/|$)' }
    },
    {
      name: 'preload-only-electron-package', severity: 'error',
      from: { path: '^src/preload/' },
      to: { dependencyTypes: ['npm', 'npm-dev', 'npm-optional', 'npm-peer'], pathNot: '(^|/)node_modules/electron/' }
    },
    {
      name: 'no-source-outside-layers', severity: 'error',
      from: {},
      to: { path: '\\.[cm]?[jt]sx?$', pathNot: '^src/(main|preload|renderer|parser|shared)/|(^|/)node_modules/' }
    }
  ],
  options: {
    // Include erased type edges and label them separately in JSON output.
    tsPreCompilationDeps: 'specify',
    tsConfig: { fileName: 'tsconfig.web.json' },
    doNotFollow: { path: `node_modules|${tests}|^src/renderer/src/uiTest\\.tsx$|^src/renderer/public/vendor/` },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['types', 'import', 'require', 'node', 'default']
    }
  }
};
