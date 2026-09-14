# Test-gap review (#14)

Reviewed on 2026-09-14 against `4c1a788019778ea822c8ff8f4dd57bda6ce42c72`
(main after PR #30). The working tree contains the tests, runners, CI step and
documentation described here. Production application code, dependency versions,
Electron process settings and numerical quality gates are unchanged.

The fresh pre-change Vitest run passed 176 tests in 20 files. Coverage and a review
of assertions showed that some well-covered modules still lacked failure-path tests,
while some low-unit-coverage modules already had real Electron smoke coverage.
This review prioritizes observable behavior over reaching the proposed percentages
in [quality-targets.md](quality-targets.md).

## Findings and added checks

| Area | Gap in existing evidence | Added regression coverage |
| --- | --- | --- |
| CIF parsing | Most fixture assertions exercised valid records; required-tag rejection and optional invalid values had gaps | Reject missing formula/cell/group fields and invalid space-group numbers before persistence; retain invalid optional angles/wavelengths as null; ensure CRLF text blocks cannot become fake tags or new data blocks |
| Search input | Several IPC field-shape and limit branches were untested | Reject non-object payloads, bad modes, optional element slots, group/period limits, non-finite ranges and overlong text; accept boundary values without mutating the request |
| Search/pagination | Existing unit tests checked emitted SQL and parameters, not actual result sets | Run the built database API on real SQLite under Electron; assert stable page ordering for tied formulas, end-of-results totals, fallback sort handling, literal LIKE metacharacters, quoted text, inclusive angstrom bounds, AND/OR/exclusion filters and element counts; compare restraint preview counts with search totals |
| Persistence/migrations | Existing worker suite covered migration, upsert, fingerprints, savepoints and partial failures; backup contents and stale sibling deletion were not asserted | Open the migration backup read-only and verify its original schema/data; shrink a multi-block source and verify obsolete entries, child rows and fingerprints disappear; exercise viewer/export source lookups and clear cascades through the built database API |
| Import failures | Unit tests lacked mixed parse failure, lost-file, cleanup and batch-boundary cases | Preserve source metadata and retryable fingerprints after partial parsing; clean stale entries only for fully successful files; continue when a discovered file vanishes; discover nested uppercase CIFs and flush the last file beyond a 250-file batch |
| Main-process contracts/export | No unit execution of the registered main handlers; filename tests missed reserved and empty names | Register the real handlers with mocked Electron/filesystem/database boundaries; verify selected-block export/viewing, canceled saves, source overwrite prevention, missing records/files/blocks, write failures, PXRD payload limits, entry-id/pagination validation, database initialization retry, and mutation-lock recovery after failure/cancel |
| Diffraction | Peak generation and Gaussian width were covered, but symmetry and invalid geometry branches were weak | Check cubic Bragg positions and body-centering extinctions analytically; compare explicit atoms with symmetry expansion at special positions; check legacy unit/default fallbacks, degenerate cells, bad operations, zero occupancy, equivalent U/B damping, profile range and finite ordered export samples |
| Viewer | The separate suite depended on an untracked sibling CIF folder and was absent from CI | Default to the repository-owned rock-salt fixture, retain live load/representation/supercell/polyhedra/layout/rapid-selection checks, and add failed-source UI state plus recovery on the next selection |

The database query checks live in `scripts/database-query-regressions.cjs` and are
called by the existing worker smoke runner. They import the production build's
`db-*.js` chunk, not a copy of its SQL, and fail if that entry cannot be found.
Schema/data setup occurs only in an isolated temporary database. Other unit tests
continue to run with Node without rebuilding the Electron SQLite binding for a
different ABI. Native integration results are not part of Vitest coverage.

`src/main/ipc.test.ts` invokes the actual callbacks registered with `ipcMain.handle`.
The boundary doubles allow assertions that a rejected or canceled request cannot
write data. They do not prove native dialog behavior or end-to-end IPC serialization.
The BrowserWindow assertion protects `contextIsolation: true`, `nodeIntegration:
false` and the preload entry without moving implementation across process boundaries.

## Coverage comparison

Both unit runs used Node 22.23.2, Vitest/V8 coverage 4.1.11 and the unchanged production
scope in `scripts/quality/scope.mjs`. Values below round covered/total counters to
two decimals, matching the baseline report's convention. Vitest's console may truncate
the last decimal instead. The original [baseline snapshot](quality-baseline.md) is
unchanged; these are follow-up measurements, not a replacement baseline.

| Unit metric | Before | After |
| --- | --- | --- |
| Tests / files | 176 / 20 | 252 / 21 |
| Lines | 973/2288 (42.53%) | 1105/2288 (48.30%) |
| Statements | 1081/2654 (40.73%) | 1247/2654 (46.99%) |
| Functions | 200/598 (33.44%) | 215/598 (35.95%) |
| Branches | 719/1982 (36.28%) | 870/1982 (43.90%) |

| Selected module | Line coverage before → after | Branch coverage before → after |
| --- | --- | --- |
| Main IPC entry | 0% → 69.41% | 0% → 50.63% |
| Ingestion | 90.77% → 96.92% | 62.96% → 88.89% |
| Main search-filter validation | 94.34% → 100% | 72.73% → 100% |
| Export filenames | 100% → 100% | 50% → 100% |
| Parser | 96.75% → 97.73% | 84.03% → 87.07% |
| PXRD calculation | 96.90% → 100% | 66.94% → 95.16% |

The database module's unit percentage is unchanged even though real-query assertions
were added under Electron. UI and viewer executions likewise do not increase these
unit counters. The proposed overall coverage milestones remain unmet and advisory.

## Viewer CI decision

Keep `test:viewer` separate from `test:all`, and run it as an explicit blocking step
in the existing Windows **Test and build** job. It uses the same installed Electron
and bundled JSmol, and a separate step identifies viewer failures clearly. A second
CI job would duplicate native dependency installation for a short suite; a separate
command remains useful when iterating on unit or worker behavior. The modest extra
build in `test:viewer` ensures its standalone command validates the production build.

CI now executes both `npm run test:all` and `npm run test:viewer`. The default viewer
fixture is `docs/samples/rocksalt-demo.cif`, an original synthetic MIT-licensed model,
not an experimental/database record. No external CIF corpus is required. Three canvas
captures are saved to `.dist/jsmol-verification` and retained as `viewer-<sha>` artifacts
for 30 days. Capture hashes are compared within one run to distinguish representation
modes, not against platform-dependent golden images. Console failures are in job logs.

For an optional manual corpus probe, set `CIF_VIEWER_TEST_CIF` to a readable CIF path
before running the viewer command, then remove the variable afterward. An alternate
fixture must support the suite's structural/representation/polyhedron assertions;
passing one structure is not validation of an entire corpus.

## Validation and reproduction

Use the project's Node 22 environment and installed Electron native dependencies:

```powershell
npm ci
npm run test:coverage
npm run test:ui
npm run test:worker
npm run test:viewer
npm run quality:unused
npm run quality:architecture
npm run quality:architecture:test
```

The coverage report is generated at `reports/quality/coverage/index.html`, with counters
in `coverage-summary.json` and line/branch locations in `lcov.info`. The independent
UI, worker and viewer suites report their behavioral assertions in console output.
Local validation passed on Node 22.23.2:

| Check | Result |
| --- | --- |
| Vitest with V8 coverage | 252 tests in 21 files passed; counters above |
| Electron UI suite | All viewport, selection, pagination recovery, layout and accessibility assertions passed |
| Production build and worker suite | Query regressions, migration backup contents, persistence, stale-block cleanup and failure-retry assertions passed |
| Viewer suite | Repository fixture, representations, supercells, polyhedra, resizing, rapid selection and failed-load recovery passed |
| TypeScript and Knip | Both TS projects and unused-code/dependency gate passed |
| Architecture | 40 production inputs, zero violations; all deliberate-regression probes passed |
| Unused-code regression probes | Clean fixture and deliberately injected findings behaved as expected |
| Documentation/patch checks | Relative file links resolve; `git diff --check` passed |

The first new viewer-error assertion expected an injected Error's custom text, but
the runtime used its generic fallback across the injected JavaScript context. The
final test deliberately rejects with a non-Error value and verifies the supported
fallback, selected filename, disabled controls and subsequent recovery. No production
behavior was changed to satisfy the test. Hosted CI for this change has not yet run.

## Remaining gaps and prerequisites

- Most renderer components, preload, worker events and migrations retain low unit
  coverage. Electron smoke tests cover selected paths, not every lifecycle transition,
  callback failure, worker crash/exit or listener cleanup. Add targeted cases alongside
  the #16–#18 refactors rather than treating a smoke pass as exhaustive coverage.
- Migration tests cover a synthetic v1 upgrade, existing-v8 behavior, a v6 source-path
  upgrade and preserved backups. Interrupted migration, corrupt/read-only databases,
  future-schema rejection and all historical schema variants remain to investigate.
- Directory discovery currently skips unreadable directories/stat failures. Tests cover
  a file disappearing after discovery; permission-denied discovery and symlink traversal
  policy need explicit behavior decisions before adding acceptance assertions.
- The parser tests use authored fixtures and targeted malformed input. Broad PCD/ICSD/
  CCDC corpus runs require separately supplied data and suitable rights. No broad corpus
  run or claim of complete CIF syntax support is made by this change.
- Diffraction assertions establish geometric/algorithmic invariants, not quantitative
  agreement with experimental intensities. Scattering-model accuracy, extreme skewed/
  large cells, reflection limits and external reference patterns need separate validation.
- The viewer needs Electron's graphical environment (hidden windows on Windows CI) and
  bundled JSmol assets. These tests do not prove packaged `file://` loading, installers,
  native save-dialog interaction, disk permissions or platform-independent rendering.
- The packaged real-data workflow was not run here. It requires a built executable and
  an explicit CIF folder; see [packaged workflow verification](../README.md#packaged-workflow-verification).
  Network publication resolution remains mocked in unit tests; live service availability
  is not part of these deterministic checks.

#14 supplies regression evidence for the next refactors; #19 still owns mutation
testing and #20 owns calibrated numerical gates. Passing this review does not mean
all test gaps are closed or that any new numerical threshold has been adopted.
