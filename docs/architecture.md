# Architecture dependency policy (#24)

This policy builds on the [quality baseline](quality-baseline.md) and the
[#25 unused-code gate](code-quality.md#unused-code-regression-gate-25), merged in
PR #28. Numerical complexity and coverage use the [incremental regression policy](regression-protection.md). Architecture
violations are blocking after the zero-finding review below. No application
restructuring or changes to Electron runtime settings were needed.

## Allowed directions

All layers may import their own modules, subject to the cycle and entry rules.
Cross-layer directions apply to runtime imports, re-exports, and erased type imports.

| Source | Other first-party layers allowed | Platform constraints |
| --- | --- | --- |
| `src/main` | parser, shared | Owns Electron lifecycle, IPC handlers, database, filesystem, dialogs, publication lookup and exports. No React/UI packages. |
| `src/preload` | shared | Only external package allowed is Electron; no Node builtin imports or database/parser/main/renderer implementations. |
| `src/renderer` | shared | React/UI packages allowed; no Electron, `@electron/*`, SQLite, or Node builtin imports. |
| `src/parser` | shared | Portable CIF parsing; no Electron, SQLite, React/UI packages, or Node builtin imports. |
| `src/shared` | none | Portable contracts, validation and data; same platform restrictions as parser. |

The parser is currently consumed by main and the import worker. Renderer data is
provided through `window.cifApi`; renderer must not bypass IPC to import parser or
database implementations. Types needed across processes belong in `src/shared`.
Type-only imports do not execute at runtime, but still create architectural coupling;
they receive the same boundary and cycle checks. Both runtime and type-only cycles fail.
First-party JS/TS imported outside these five layers also fails, preventing an
out-of-tree helper from silently bypassing the policy. Referenced image/CSS assets
are permitted. Production imports of test modules or the UI test harness fail.

## Electron execution boundaries

`src/main/index.ts` creates the BrowserWindow with `contextIsolation: true` and
`nodeIntegration: false`, loads the compiled preload by filename, and loads renderer
HTML/a development URL. These are execution paths, not direct source imports.
`src/preload/index.ts` uses `contextBridge` to expose the typed `CifApi` and forwards
specific requests/events through `ipcRenderer`. Main registers the corresponding
`ipcMain` handlers. Neither process imports the other's implementation. Static import
analysis does not validate IPC channel names, payload validation or permissions.

`src/main/importRunner.ts` loads `./importWorker?nodeWorker` through electron-vite.
The generated factory starts a separate Node worker; `importWorker.ts` uses
`parentPort`/`workerData`, opens its own database connection and runs ingestion.
`importWorkerProtocol.ts` holds typed messages and imports shared contracts.
Only the runner may import the worker entry. The worker's entire reachable source
graph must stay free of Electron packages, main's application entry, preload and
renderer code. This catches an Electron import added indirectly to `db.ts`, not only
one added to the worker itself. Database and filesystem access in the worker are
intentional. The analyzer resolves the query to the worker source so it remains
analyzed; runtime worker creation still depends on electron-vite's plugin transform.

## Analyzer and local commands

Use Node **22.13 or newer on the Node 22 line** (CI uses Node 22). The analyzer also
supports Node 24; Node 25 is outside its supported engine range.

```powershell
npm ci
npm run quality:architecture
npm run quality:architecture:test
```

The lockfile pins **dependency-cruiser 18.3.0** and its dependencies.
`.dependency-cruiser.cjs` defines the rules. `scripts/check-architecture.mjs` supplies
every first-party production JS/TS file under `src`, including declarations and
unreachable files, rather than only modules reachable from the UI entry. It invokes
the installed CLI with JSON output and fails for any finding, analyzer failure or
missing report. Console diagnostics identify the rule, source and destination files,
runtime/mixed versus type-only edges, and cycle paths. The JSON graph includes the
original import specifier, resolved destination and dependency metadata; search the
source file for that specifier to locate the import (line numbers are not supplied).

`tsPreCompilationDeps: 'specify'` retains and labels erased dependencies. Resolution
reads `tsconfig.web.json` (including future `paths` mappings) with package export
conditions `types`, `import`, `require`, `node`, and `default`. Both existing TS configs
use Bundler resolution with no aliases, and `electron.vite.config.ts` defines no
additional aliases. The `types` condition resolves `electron-vite/node`, which is a
types-only package export; this is not an unresolved-import suppression. The pinned
analyzer strips import query suffixes and resolves the actual `?nodeWorker` target.
If build aliases or process-specific resolution diverge, update and probe the analyzer
configuration in the same change. Package resolution is a combined static view,
not a simulation of every browser/Node conditional export choice.

The generated `reports/architecture/dependencies.json` records the complete graph,
findings, Git HEAD, dirty flag, Node/analyzer versions, config/lockfile hashes and source
fingerprint. The fingerprint hashes sorted input paths and contents with CRLF
normalized to LF. Do not run the gate concurrently in one checkout. Reports are
ignored by Git and retained for 30 days by the existing **Test and build** CI job.
The CI gate and regression probes run immediately after installation, before the
existing application suite. No new required status or repository setting is needed.

## Initial reviewed baseline

Collected on 2026-09-14 with Node **22.23.2**, dependency-cruiser **18.3.0**, against
application source at **`8f8a43941374c698631903dcb45f902d8036bcbc`** (merged PR #28).
The working tree is dirty because this policy/tooling is being added; application
source is unchanged. Source fingerprint:
`1e5300c9109b21cefd59a7ce7e786ab2fa9f8f0239ab8e934f9623780c99e521`.

| Measurement | Initial result |
| --- | ---: |
| Production input files | 40 |
| Graph modules (including external/asset endpoints) | 53 |
| Dependency edges | 104 |
| Type-only edges | 29 |
| Forbidden dependency findings | 0 |
| Cycle findings (including type-only cycles) | 0 |
| Unresolved imports | 0 |

There is no nonzero allowance, ignored violation list, or automatically refreshed
baseline used to suppress findings. Existing layer imports, preload contracts, and
worker graph were reviewed before enabling the zero-violation gate. The initial
`electron-vite/node` resolution diagnostic was fixed using its declared export
condition, not ignored. Future exceptions must identify an exact edge/rule, explain
the execution path and rationale here, and add a probe that keeps nearby forbidden
edges detectable. Do not broaden entire folders to silence a finding.

## Scope exceptions and limitations

| Scope decision | Rationale |
| --- | --- |
| `*.test.*`, `*.spec.*`, `__tests__`, `__fixtures__` are not scan roots | Vitest tests may use Node filesystem APIs to read fixtures, including parser and JSmol asset tests. Production imports into these paths are still forbidden and reported. |
| `src/renderer/src/uiTest.tsx` is not a scan root | Dedicated test HTML entry imports the synthetic CIF fixture using `?raw`. This is test data, not a production renderer-to-parser exception. Production imports of this entry fail. |
| `src/renderer/public/vendor`, external packages | Bundled JSmol and dependencies are not traversed. Import endpoints remain visible for package rules. First-party `src/renderer/src/jsmol` adapters remain fully analyzed. |
| Scripts, root build configs, generated output, `third_party` | Not production scan roots. Build/runner entry discovery and unused dependencies remain covered by Knip; build and smoke tests validate the executable paths. |

Literal `import()` and `require()` dependencies can be analyzed. Computed import
strings, `eval`, injected script URLs, HTML entry loading, IPC strings and worker
factory behavior cannot be fully reconstructed. JSmol script/asset loading requires
its existing asset tests and viewer smoke checks. Ambient globals (including Node
globals made visible by TS declarations) and use of individual Electron API members
are not import edges. This is a maintainability gate, not proof of runtime isolation
or a security audit. Keep the existing Electron UI, worker, build and viewer checks.

The isolated verification command first asserts the real worker query, worker database
edge and preload contracts are present and clean. It then injects forbidden layer and
package imports, both Node builtin spellings, unresolved/test/literal dynamic imports,
runtime and type-only cycles, and indirect worker-to-Electron coupling. It checks
specific diagnostics and nonzero exit codes. Temporary copies live in the ignored
report directory and are removed afterward; application source is never modified.

Local validation for this change passed on Node 22.23.2: the architecture gate and
all regression probes, both TypeScript projects, Knip and its regression probes,
the six quality-helper tests, 176 Vitest tests, Electron UI checks, production build,
and import-worker smoke checks. npm 10.9.8's offline `npm ci --dry-run --ignore-scripts`
also accepted the lockfile. No existing locked package versions were changed, and
PR #28's optional native-package entries were preserved. Hosted CI has not yet run
for this change.
