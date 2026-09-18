# Startup baseline and regression comparisons

Current guidance: repeatable development-startup comparison and interpretation.
The original reference samples below are historical evidence, not packaged cold-start acceptance.

The machine-readable baseline is [startup-dev-v1.json](baselines/startup-dev-v1.json).
It records a specific development-startup protocol, not a universal speed target.
Keep this original record; future bug fixes and features should compare against it
without silently replacing it.

## Relationship to the agreed startup definition

The [startup definition](cold-start-protocol.md#agreed-startup-definition-2026-09-17)
defines completion as a visibly ready interface and a successful test search measured
from launch invocation. Development startup is tracked separately in #72 and is
non-blocking for PR #63 and the import/search milestone; packaged acceptance stays
under #40.

Version 1's `controlsReadyMs` is an intermediate React signal, not full startup time.
Its search metrics measure individual interactions; it does not record the agreed
end-to-end launch-to-search metric, and its origin excludes outer npm overhead.
Do not relabel existing samples or add separate medians to estimate that metric.
Preserve both v1 baseline files unchanged. A future runner implementing the full
definition must version its protocol and establish a new, separately named baseline,
recording existing versus fresh Vite cache and any visibility intervention. No such
runner change or new measurement is implied by this documentation update.

Recorded on 2026-09-16 at clean revision `f4e6304` using benchmark protocol v1:

| Metric | Minimum | Median | Maximum |
| --- | ---: | ---: | ---: |
| React controls readiness | 6.519 s | 10.167 s | 10.339 s |
| First contentful paint | 3.167 s | 10.607 s | 10.645 s |
| Quick Search paint probe | 92.7 ms | 104.9 ms | 113.3 ms |
| Empty search observation | 13 ms | 15 ms | 17 ms |
| Initial resources | 34 | 34 | 34 |

These are the first completed clean-revision reference samples, not selected fastest
samples. Paint can be delayed by Windows suppression and the harness restore step;
it must not be interpreted as natural foreground launch timing independent of that
intervention. The earlier investigation's timings used a different harness and launch
point and are not the benchmark v1 reference.

Runner-development attempts were retained locally but excluded as reference runs:
`cif-startup-benchmark-DxXkCd` overlapped a quality check; `cif-startup-benchmark-sSZSsH`
failed visibility validation; `cif-startup-benchmark-EYZ878` exposed an inspector
evaluation race before Electron initialized. Those failures led to the restore and
initialization guards. The completed reference traces/logs are retained under
`cif-startup-benchmark-7UHadi` in the Windows temporary directory. Only the sanitized
summary is stored in this repository.

The [unchanged-application repeat](baselines/startup-dev-v1-repeat.json) verifies the
documented comparison command. Its controls-readiness samples were 6.066 / 9.602 /
6.538 seconds (median 6.538 seconds); Quick Search paint median was 192.3 ms. The
app and benchmark code were unchanged, and resource counts/bytes were identical.
These sizeable timing differences are observed environmental/measurement variability,
not evidence of another optimization. That is why timings are advisory and repeat
runs are required before attributing a regression to a feature or fix. The repeat's
dirty flag reflects the baseline/docs/test additions pending at measurement time.

## Repeat the measurement

Use Node 22.13+ on the Node 22 line and the locked dependencies (`npm ci`). Close
other app/dev-server instances, finish builds/tests, connect to the same power state,
and let the desktop become idle. Do not type into or close the benchmark windows.
The runner opens and focuses three windows in sequence, then closes its own processes.
Do not run other checks alongside it. Record changes to antivirus, storage, power
mode or other environmental conditions separately when interpreting results.

```powershell
npm run benchmark:startup -- --baseline docs/baselines/startup-dev-v1.json
```

Default: three samples. For a longer comparison:

```powershell
npm run benchmark:startup -- --samples 5 --baseline docs/baselines/startup-dev-v1.json --output .dist/startup-comparison.json
```

The output destination must not already exist. Without `--output`, a unique temporary
directory holds the report, per-sample IPC traces and process logs. The final console
message gives those paths. Raw logs can contain local filesystem paths; inspect and
sanitize them before publishing. The summary JSON contains no profile/source paths.

The run fails on missing readiness events, unavailable/hidden UI, absent contentful
paint, unsuccessful Quick Search opening or empty search, invalid samples, incompatible
protocol, or an application/diagnostic failure. Partial samples and the error remain
in the report. Never promote a failed report to a baseline.

## What is held constant

- Windows development launch through the repository's `electron-vite dev` command.
  The timer begins at the Node child launch, excluding the outer npm command overhead.
- A new **empty synthetic profile** and **fresh Vite dependency cache** for every sample.
  The normal profile, research CIFs and normal Vite cache are not used.
- The normal renderer configuration, plus a benchmark-only Vite cache directory.
- GPU remains enabled. A local main-process inspector shows/focuses the window;
  if Windows suppresses the initial child window, it restores it again after loading.
  the renderer diagnostic endpoint reads timings and drives Quick Search. Opt-in
  IPC tracing is enabled. CPU profiling is disabled.
- Filesystem/OS caches are uncontrolled. These are not reboot-cold measurements.

Run from a graphical desktop; do not replace missing visibility/paint with zero or
claim a hidden/headless result is equivalent. The test is not part of ordinary hosted
CI timing gates. CI tests the statistics/comparison logic; the existing Electron UI
suite protects early feedback, deferred loading and failure recovery.

## Metrics and interpretation

| Metric | Meaning |
| --- | --- |
| `mainMs` | Child invocation to application main-code trace |
| `firstContentfulPaintMs` | Child invocation to Chromium first-contentful paint (initial loading feedback) |
| `controlsReadyMs` | Child invocation to the first React readiness IPC event |
| `databaseReadyMs` | Child invocation to database initialization completion |
| `quickSearchPaintMs` | Click to two animation frames with a visible Quick Search dialog |
| `emptySearchMs` | Submit to observed empty search result; includes polling resolution |
| `resourceCount`, `decodedBytes` | Initial completed resource entries before opening Quick Search |

First-contentful paint can be the loading message; it is not application readiness.
The Quick Search probe checks a real dialog, and the search probe submits space-group
number 1 against the empty database. Two animation frames are a practical render
check, not a video-measured physical-display latency. Resource counts exclude requests
made after the initial snapshot; they are useful structural evidence, not timing budgets.

Every sample is retained. Reports provide minimum, median and maximum, not p95/p99
from three observations. Comparisons show absolute/percentage median changes and flag
changes in machine, OS, runtime/tool versions or harness hash. Treat comparisons with
changed conditions as contextual evidence; use matched runs to attribute regressions.
The app commit, dirty flag, diff hash, lockfile hash and benchmark hash identify the run.
For an official release comparison, use a clean checkout and retain both reports.

Timing changes are **advisory**: no arbitrary performance budget or automatic baseline
ratchet is introduced. Investigate material increases, especially first paint/readiness
and interaction delays. If a regression is intentional, explain its user benefit and
cost in the PR. Baseline updates require an explicit reason, the old/new reports and
review; use a new baseline filename to preserve history. Change the protocol version
when workload, start point or measurement semantics change.

## Coverage limits

This baseline covers the reported development launch path. It does not cover a
populated profile, source refresh, migration, first structure/JSmol initialization,
packaged launch/extraction, or actual OS-cold startup. Changes affecting those paths
still require their corresponding checks. In particular, deferred startup work must
also be checked against first search/structure viewing, as documented in the
[startup investigation](startup-investigation.md). Use the separate
[cold-start protocol](cold-start-protocol.md) for issue #40's packaged acceptance.

Benchmark comparison tests: `npm run test:startup-benchmark`.
