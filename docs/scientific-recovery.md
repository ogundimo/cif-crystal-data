# Scientific calculation and desktop recovery (#41)

This work combines deterministic failure injection with real Electron and
packaged workflows. All databases and inputs are isolated temporary profiles
containing authored synthetic fixtures. No research originals or normal
application database are used.

## Failure contracts and evidence

| Path | Required behavior | Regression evidence |
| --- | --- | --- |
| Corrupt profile | Actionable initialization error, unchanged bytes, closed failed connection, recoverable separate profile | Production database chunk tests in `preservation-regressions.cjs`; corrupt file retained and a new isolated database opens after moving the test fixture |
| Future schema | Reject before journal/settings changes; preserve bytes | Future version 999 fixture compared byte-for-byte after failure |
| Read-only database | Fail without a leaked handle; retry after restoring write access | SQLite `query_only` injection in production initialization; all candidate connections closed, subsequent writable initialization succeeds |
| Interrupted migration | Snapshot and old IDs/data remain; restart retries | Existing child-process interruption and rollback checks, rerun with the production bundle |
| Interrupted restore / failed write | Previous records/dependents remain; retry succeeds | Existing restore interruption, manifest/hash/schema rejection and injected disk-full regressions |
| Import worker crash | No success without a result/clean exit; database remains integral; retry succeeds | Real worker terminated during ingestion, SQLite integrity/foreign keys checked, complete retry; runner unit tests cover error/early-exit cleanup |
| Throwing progress callback | Signal cancellation, wait for worker exit, reject, detach listeners | Runner callback-failure test verifies shared cancellation flag, listener cleanup and a successful next operation |
| Worker construction failure | Propagate failure without a false result | Runner unit test; main IPC failure tests verify mutation-lock release |
| Missing source/data | Keep managed bytes available; clear failed selection output and recover | Preservation tests, JSmol failed-load/next-selection suite, PXRD unavailable-input and Retry UI checks |
| Stale PXRD work | Terminate superseded workers and reject late callbacks/results | Job lifecycle unit tests, rapid wavelength UI changes, delayed prior-entry input and metadata export assertions |

Initialization now closes connections after failures at every initialization
stage, including pragmas and settings writes. Future schemas are checked before
enabling WAL. Recovery guidance preserves the entire stopped profile, including
WAL/SHM files and snapshots, and distinguishes newer-schema compatibility from
corruption recovery. It no longer recommends renaming only the main database file.

Read-only injection is an actual SQLite engine restriction, not a Windows ACL
test. Abrupt worker termination tests rollback/retry; it is not a simulation of
hardware failure, filesystem loss or every possible crash instruction. Snapshot
validation and byte identity do not establish scientific model accuracy.

## Responsiveness contract

The milestone uses a 100 ms renderer interaction-delay budget for the documented
synthetic workloads. The application shows loading immediately and disables
export while calculating. A worker error or failed data load offers Retry.
Selection, wavelength and FWHM changes terminate the prior worker; render-time
identity checks also prevent a prior result appearing before effect cleanup.
Export captures the current completed result and does not report an old export's
completion as belonging to a newly selected structure.

`npm run benchmark:pxrd` measures synchronous calculation and Node event-loop
delay. The real Electron UI suite additionally compares synchronous execution
against the browser worker, checks identical numerical results, samples an 8 ms
renderer timer and retains `reports/scientific/renderer-performance.json`.
The suite applies the 100 ms budget to the maximum observed timer delay in each
sample. This is a responsiveness proxy, not physical keyboard-to-display latency.

Workloads are fixed, shareable P1 synthetic cells with deterministic C/O sites:

| Case | Cell | Sites | Purpose |
| --- | --- | ---: | --- |
| Ordinary | 5.64 Å cubic | 8 | Routine calculation and worker startup overhead |
| Demanding | 24 Å cubic | 256 | Atom/reflection work and responsiveness during calculation |
| Large cell | 60 Å cubic | 2 | Reflection cap diagnostics and bounded output |

Each has three retained samples, not enough to claim population percentiles.
The Node pre-change scheduling benchmark observed about 674–693 ms synchronous
work for the demanding case on an i7-1165G7 / Windows 10.0.26200. Renderer results
are retained separately because browser and Node timings are not interchangeable.
Worker execution improves responsiveness, not necessarily total calculation time;
startup/serialization has overhead. Memory observations record renderer heap and
Node process memory at a point in time, not peak whole-app/worker memory.

The measurement environment uses Electron 44.1.0, disabled GPU and a hidden window
for the PXRD phase. Other validation may contend for CPU. The subsequent keyboard
and layout tests show the window without taking focus: Chromium on Windows can
suppress animation frames for a never-shown window, which previously stalled that
harness. These settings do not establish foreground rendering, battery-mode or
genuine OS-cold startup budgets. Startup work remains in #40 / #72 / PR #74.

## Repeatable validation

Use Node 22.13+ on the Node 22 line and `npm ci`.

```powershell
npm test
npm run test:ui
npm run test:worker
npm run test:viewer
npm run quality:architecture
npm run quality:architecture:test
npm run quality:unused
npm run quality:unused:test
npm run test:startup-benchmark
npm run package -- --publish never
npm run test:packaged-reliability
npm run test:packaged-preservation
```

The packaged reliability runner exercises import/refresh, search paging/sorting,
details, actual JSmol model readiness, real worker-generated PXRD, header-enabled
XY export, upgrade/reindex, restart/persistence and an unavailable original folder.
The preservation runner covers fresh-profile restore and exact managed-CIF export
after originals disappear. Native dialogs are replaced with explicit temporary
paths/confirmation responses; this does not test native picker interactions or
installer installation. It runs the packaged `win-unpacked` executable, not the
portable extraction launcher, and is not cold-start performance evidence.

The [scientific contract](scientific-validity.md) and
[mutation decisions](pxrd-mutation-review.md) describe scientific coverage separately.

## Recorded validation, 2026-09-17

- Locked installation completed with Node 22.23.2; 407 unit tests passed.
- Full Electron UI suite, JSmol viewer suite and native SQLite/import-worker
  recovery suite passed. Architecture reported 67 inputs and zero violations;
  unused-code checks and both deliberate-regression probe suites passed.
- Four startup-comparison tests passed. Production build and local NSIS/portable
  packaging completed with `--publish never`; no native rebuild was enabled.
- Packaged reliability and fresh-profile preservation workflows passed, including
  actual JSmol atoms/cell parameters, worker-generated profiles and scientific
  export before and after the bibliography upgrade.
- [Renderer samples](baselines/pxrd-renderer-v1.json),
  [synchronous Node samples](baselines/pxrd-synchronous-v1.json) and
  [reference comparison](baselines/pxrd-reference-validation.json) retain measurements.
  The [sanitized packaged report](baselines/scientific-packaged-validation.json)
  records archive/executable hashes and the tested export/recovery outcomes.

The final retained renderer run measured 2,268–2,499 ms synchronous demanding-case
work and at most 10.5 ms timer delay across all worker cases. Concurrent validation
explains why absolute calculation times vary between runs; all samples remain in
the retained report. No percentile or whole-app peak-memory claim is made.

The initial packaged readiness assertion incorrectly looked for expanded-only
status text in the compact viewer. It was corrected to inspect actual JSmol atom
and cell data; no application change was needed for that failure. The first UI
run stalled in the existing hidden-window frame checks; making those frame-based
checks visible resolved it, and the full suite passed twice afterward.

Unrun: native save/open-dialog interaction, installer installation, OS-cold startup,
real Windows ACL failure injection, physical-input latency and experimental or
licensed external-corpus validation. None is implied by the synthetic passes.
