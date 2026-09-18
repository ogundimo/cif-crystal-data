# Unused-code review — issue #12

Historical evidence: the dated cleanup and automation reviews below. Current
commands and enforcement are in [Code-quality measurements](code-quality.md#unused-code-regression-gate-25).

Review date: 2026-09-10. Scope: first-party tracked source, scripts, configuration,
documentation, and icon assets. Tracking: https://github.com/ogundimo/cif-crystal-data-public/issues/12.

## Decisions and evidence

| Candidate | Decision | Evidence |
| --- | --- | --- |
| `icons/not-equal-sign.svg`, `icons/not-equal.png`, `icons/xmark-sharp-solid-full.svg` | Remove | No references in tracked first-party code, configuration, or documentation. The exclusion control uses the native `≠` character, and the close control imports `close ICON.png`. No retained-design-asset role was documented. Git history retains the removed files. |
| `icons/close ICON.png` | Keep | Imported by `QuickSearchDialog.tsx` and emitted by the renderer build. |
| `getAtomSiteAnisotropic()` | Remove | Its only caller was a mock-based database unit test. No renderer, IPC handler, worker, or script called it. Current `DiffractionInput` supplies atom sites and symmetry operations. |
| `AtomSiteAnisotropicRow` | Remove | Its only consumer was the removed accessor. This TypeScript interface does not define database storage. |
| Anisotropic parser, schema, migration, writer, and worker tests | Keep | CIF parsing and import still preserve anisotropic tensors. The worker smoke test checks persistence, update, migration, and cascade deletion using the actual SQLite table. |
| 28 exports listed below | Make module-private | Reference review found consumers only inside the defining module. Keep each implementation/type and remove only its export modifier. |
| Exports used by other modules or meaningful tests | Keep | These remain part of active application or test boundaries. |
| Import worker and UI test entry points | Keep | The worker is loaded through `importWorker?nodeWorker`; HTML/test runners load the renderer test entry point. Ordinary import-only scans must account for these paths. |
| Bundled JSmol runtime | Keep | It is a separately maintained, pinned third-party runtime with dynamic class loading; asset integrity tests cover it. |

## Declarations made module-private

| Module | Declarations |
| --- | --- |
| `src/main/db.ts` | `EntryWriteFailure`, `getDb`, `CifExportSource`, `CifViewerSourceRecord`, `countForFilter` |
| `src/main/migrations.ts` | `CURRENT_SCHEMA_VERSION`, `MigrationResult` |
| `src/parser/cifParser.ts` | `ElementCount`, `ParsedAtomSite`, `ParsedSymmetryOperation`, `ParsedAtomSiteAnisotropic`, `ParsedPublAuthor`, `CifDataBlock` |
| `src/renderer/src/jsmol/latestOnlyScheduler.ts` | `ScheduledRequest` |
| `src/renderer/src/jsmol/runtime.ts` | `ViewerEvents`, `loadLocalJSmol` |
| `src/renderer/src/jsmol/scripts.ts` | `CRYSTAL_LOAD_PRECISION`, `PROJECTED_VIEW_FILL`, `ProjectedViewFit` |
| `src/renderer/src/periodicTable.ts` | `ElementDef` |
| `src/renderer/src/pxrd.ts` | `PxrdProfilePoint` |
| `src/renderer/src/virtualRows.ts` | `VirtualRowWindow` |
| `src/shared/periodicTableData.ts` | `GROUP_TO_ELEMENTS`, `PERIOD_TO_ELEMENTS` |
| `src/shared/searchValidation.ts` | `SearchValidationErrors` |
| `src/shared/types.ts` | `ClearCifsResult`, `ExportCifResult`, `ExportPxrdResult` |

## Earlier cleanup included with this work

The checkout already contained the reviewed removal of nine unused React imports,
`JSMOL_VERSION`, `zoomScript()`, `isPeriodicGap()` and its comment, `ElementGroup`,
and the unused `getAllEntries`/`search` IPC routes across all layers. These changes
were local and had not yet landed on the repository's main branch. They are part
of the same cleanup delivery; current search uses `searchPage`.

## Verification and limits

Passed both TypeScript projects with `--noEmit --noUnusedLocals --noUnusedParameters`,
`npm run test:all` (176 unit tests in 20 files, UI checks, production build, and
import-worker smoke checks), and `node scripts/run-jsmol-viewer-test.mjs` after
the build. The live viewer checks covered representations, labels/cells, axis
controls, supercells, polyhedra, resizing, and rapid selection changes.
The existing symmetry-order unit test retains its useful assertion; only its
removed-accessor assertion was deleted. The anisotropic parser and real SQLite
worker tests remain intact.

This is a bounded static review with regression checks, not proof of zero dead
code. No exhaustive CSS analysis, external/manual consumer inventory, or runtime
tracing was performed. Runtime tracing is tracked separately in issue #15.
Full external CIF corpus and packaged real-data smoke verification require
explicit test inputs and are not claimed by this review. Quantitative coverage,
complexity, duplication, and mutation baselines belong to their separate issues.

## Automated follow-up — issue #25

Review date: 2026-09-14. Starting application revision:
`1add04a` (main after the #13 baseline work). Analyzer: Knip 6.35.1 in normal full-project
mode, with the source scope and entry points in `knip.json` and both TypeScript unused checks
enabled. Reproduce with `npm run quality:unused`; configuration and interpretation are in
[Code-quality measurements](code-quality.md#unused-code-regression-gate-25).

| Initial finding | Decision and evidence |
| --- | --- |
| `scripts/database-scale-benchmark.cjs` reported as unused | Keep; `benchmark:database` invokes it through Electron and the scheduled performance workflow runs that command. Declare it as an explicit entry. |
| `scripts/import-worker-smoke-electron.cjs` reported as unused | Keep; `test:worker` invokes it through Electron, and `test:all` runs that command in CI. Declare it as an explicit entry. |
| Redundant main/preload/renderer entries | Rely on the electron-vite plugin's discovery from the checked-in build configuration rather than duplicate declarations. |
| Ignore patterns for already out-of-scope generated folders | Remove redundant ignore patterns; the positive project scope excludes those folders. Keep the vendor subtree explicitly excluded within `src`. |
| CSS project-scope hint | Include first-party CSS so its imports are followed; no claim of selector-level dead-code analysis. |

After this configuration review: **zero unused-file, unused-export/type, unused-dependency,
unlisted/unresolved-import, or duplicate-export findings**, with no finding suppressions.
Both TypeScript projects pass their permanent unused-local/parameter checks. No additional
application code, assets, stored data, or test-only APIs were removed for this automation.

`quality:unused:test` verifies that the real configuration passes on an isolated copy and
fails for injected unused files, reachable-module exports, production/development dependencies,
and unused locals/parameters in both TypeScript projects. These probes are removed with the
temporary fixture. They check the detector, not exhaustive runtime reachability. If the source,
entry declarations, or analyzer version changes, rerun and review rather than assuming this
baseline still applies.
