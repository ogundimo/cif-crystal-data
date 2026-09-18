# Packaged validation record (2026-09-17)

Historical evidence for the builds and date below, not current merge or issue status.
Use the [cold-start protocol](cold-start-protocol.md) for reproduction and
[issue #40](https://github.com/ogundimo/cif-crystal-data/issues/40) for live acceptance tracking.

Application build: `6679c8b295d82f3ef57e74b0e51907c4da42803d`, version 1.1.0.
Validation head `fdfa05b` additionally replaces UI-test timing assumptions with
bounded waits for deferred details and exact keyboard selection; application code
and packaged binaries are unchanged by that test-only commit.

## Correctness and CI

- 369 unit tests and four startup-benchmark tests passed.
- Architecture and unused-code gates and their probes passed, as did search
  behavioral probes, production build/type checks, worker/preservation regressions,
  and the real bundled JSmol viewer suite.
- UI verification initially exposed a fixed-delay keyboard assertion and an attempt
  to inspect details before the deferred module mounted. The unchanged UI passed
  once on rerun; bounded condition waits were then added and the corrected suite
  passed. Record the initial failures rather than interpreting a rerun as a fix.
- Both GitHub checks passed on `fdfa05b`: Test and build, and Advisory quality report.
- Windows installer, portable and unpacked packaging passed with publishing disabled.
- Packaged reliability and preservation checks passed: import/unchanged refresh,
  bibliography upgrade, author roles, search, stored-source access, export,
  unavailable originals, portable backup/restore and restart. These instrumented
  correctness checks use a debugger and disable GPU; their times are not startup
  acceptance measurements.
- With explicit permission, isolated copies of the two bibliography examples in
  #61 recovered their source titles, complete references and publication authors
  after import and after a schema-9-to-10 repair with originals unavailable to the
  test profile. Search-grid references and detail titles/roles were checked. Entry
  IDs, stored bytes and original-file checksums were preserved. Research contents
  and local validation scripts are not published.

The previously tracked JSmol reload `setScreenDimension` error was observed during
one UI rerun; #41 retains that separate lifecycle finding. No new scientific model
or corpus-wide accuracy claim follows from these checks.

## Instrumented visible packaged startup

Three launches per distribution/profile, normal GPU behavior, isolated empty or
168-entry synthetic profiles, startup refresh off. OS caches were uncontrolled.
Timing starts at launcher invocation and ends after a real space-group-number-1
search displays the expected empty result or 168 results, followed by two animation
frames. It includes diagnostic polling and a 200 ms input-settle delay. Main and
renderer inspectors and opt-in tracing are enabled. These are not OS-cold samples
or an uninstrumented installed-app measurement.

| Distribution | Entries | Launch-to-search samples (s) | Median (s) |
| --- | ---: | --- | ---: |
| Unpacked | 0 | 1.280, 0.910, 0.976 | 0.976 |
| Unpacked | 168 | 1.382, 1.426, 1.264 | 1.382 |
| Portable EXE | 0 | 27.723, 19.901, 21.695 | 21.695 |
| Portable EXE | 168 | 19.440, 17.430, 17.277 | 17.430 |

The unpacked windows were visible without intervention. All portable windows needed
the diagnostic restore/focus step, so their total includes that intervention.
First structure detection after search submission took 0.721–0.836 seconds unpacked
and 0.790–0.980 seconds portable, using visible canvas/atom evidence. This is separate
from startup and is not a physical-display video measurement.

For the first portable sample, `main.loaded` occurred 22.883 seconds after launcher
invocation, at 0.289 seconds of Electron process uptime. This places most of that
sample's delay before application main-code initialization. The pinned
electron-builder portable template (`app-builder-lib/templates/nsis/portable.nsi`)
removes the extraction directory, extracts the embedded application, and launches it
on every invocation, then removes the directory after exit. Changing only the
extraction directory name does not provide an extraction cache. The measurements do
not separately attribute decompression, filesystem activity and security scanning.

Local raw evidence is retained in the temporary directory
`cif-packaged-visible-iOBdPB`. Do not upload raw logs without path review. The original
development baseline is unchanged and remains a different protocol under #72.

## Evidence still missing at this snapshot

The fixed-build restart kit includes three separately prepared profiles per case:
empty, 168 entries with refresh off/on, unavailable source, bibliography upgrade,
and 1,000-entry synthetic scaling. Two initial kit-preparation inspector connections
failed; an independent copied-build smoke passed, and profile preparation completed
when resumed without recopying the executable. This diagnostic failure has not been
attributed to application startup behavior.

Genuine OS-cold samples, visible interaction observations, agreed workload budgets,
before/after assessment and tracing-overhead checks remain required by #40. The
portable launch delay remains unresolved; distribution priority is awaiting the
owner's decision at this snapshot. Subsequent decisions and delivery status belong
to [issue #40](https://github.com/ogundimo/cif-crystal-data/issues/40),
[PR #63](https://github.com/ogundimo/cif-crystal-data/pull/63) and
[issue #72](https://github.com/ogundimo/cif-crystal-data/issues/72).
