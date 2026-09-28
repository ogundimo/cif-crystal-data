# Packaged startup verification (#40)

Startup ends when the interface is visibly ready and a real search displays its
expected results. The [cold-start protocol](cold-start-protocol.md) defines the
milestones, workload matrix and required evidence. The self-extracting portable EXE
currently extracts the application on each launch. An extract-once ZIP is available
through `npm run package:zip -- --publish never`; extract all files before launching.
The installer and portable EXE remain available through the existing package command.
No change to published downloads or release policy is implied by adding this command.

## Prepare isolated workloads

Use Node 22.13+ on the Node 22 line and locked dependencies. Build and preserve the
exact executable before testing. Record its actual source commit; the preparation
script cannot infer which commit produced an arbitrary supplied binary. From the
repository root, for a build produced from the current clean commit:

```powershell
npm run package -- --publish never
$applicationCommit = git rev-parse HEAD
npm run prepare:packaged-startup -- release/win-unpacked .dist/my-startup-kit $applicationCommit
```

Alternatively supply the directory extracted from the ZIP. Use a new kit directory:
preparation refuses to overwrite an existing kit. It copies the application and
creates synthetic 168/1000-entry corpora and three profiles for each of six cases:
fresh, populated-off, populated-on, unavailable, upgrade and larger. The upgrade
case models bibliography repair by downgrading an isolated synthetic schema-10
profile to schema 9 and clearing bibliography. It does not replace representative
historical database/recovery coverage. No live profile or research original is used.

Keep the kit at its original absolute path: prepared source-folder settings refer
to its synthetic inputs. The manifest records preparation source state, the declared
application commit, executable hash, version and workload counts. Preparation and
binary inspection must finish before the restart used for a cold sample.

## Automated instrumented comparison

```powershell
npm run benchmark:packaged -- .dist/my-startup-kit ".dist/my-startup-kit/app/CIF Crystal Data.exe"
```

The runner clones each prepared profile into a new temporary location for every
sample and runs three samples per case. Original cold-test profiles remain pristine.
It records all samples and retains partial reports on failure. It checks expected
search totals, visible content, first structure evidence, unavailable-source feedback
and restored refresh controls. Search uses space-group number 1; the larger case has
1000 matching entries with the first 500 loaded. Runtime scopes are kept separate:
launch-to-search includes the fixed 200 ms input-settle delay and polling; first
structure is measured from search submission because results select a row. The
controls-restored observation is an upper bound collected after structure checks.

These runs enable inspectors and tracing, keep GPU enabled, and may restore/focus a
suppressed window. They neither reset OS caches nor establish uninstrumented cold
startup. Finish other builds/tests and keep power/environment conditions consistent.
Retain outliers; summarize each case independently using median and min/max. Do not
infer tail percentiles from three samples. Reports and raw logs contain local paths;
review and sanitize them before publication. Do not substitute these runs for cold
acceptance or a physical-display measurement.

## Cache-reset samples without restarting Windows

Download [RAMMap from Microsoft](https://learn.microsoft.com/en-us/sysinternals/downloads/rammap)
and extract it outside tracked source. The helper verifies its Microsoft signature.
The snapshot parser currently supports RAMMap 1.63 amd64 only. From a **normal,
unelevated** terminal, run a pilot:

```powershell
npm run benchmark:packaged -- .dist/my-startup-kit ".dist/my-startup-kit/app/CIF Crystal Data.exe" --cache-reset .dist/cache-reset-tools/rammap/RAMMap64.exe --case fresh --samples 1
```

Omit `--case fresh --samples 1` for three samples of every workload. Each reset
helper requests Windows UAC elevation; the application remains unelevated. The
helper accepts RAMMap's bundled license for this invocation. It performs **Empty
System Working Set** (`-Es`) then **Empty Standby List** (`-Et`), waits two seconds,
and repeats that pair to evict pages released during the first pass. It does not trim
other applications' working sets, delete files, disable antivirus/prefetch, or reboot.
System-wide cache eviction can temporarily slow other applications; avoid concurrent
builds or disk-heavy work while measuring.

Each sample retains RAMMap before/after `.rmp` snapshots, tool version/hash, command
exit codes, memory counters, reset-to-launch delay and startup timings. Those files
can be large and include unrelated private file paths: keep them local. All profile
copying, SQLite inspection and executable hashing precede the reset. Snapshot analysis
runs after measurement so it does not delay the launch or read the app's files.

The analyzer checks the snapshot format and reconciles all PFN records with its
page-list totals. It requires positive target-file residency before reset and **zero
target-file pages** afterward, including active, standby and modified pages, for the
app directory, isolated profile and relevant synthetic input directory. Residual pages
mark that sample invalid and the matrix continues; the final command exits with a
failure if any cold condition failed. Unsupported snapshots or failed reset commands
stop the run. All collected timings are retained; do not select only passing samples.
The parser's Windows layouts are documented in [System Informer's memory definitions](https://github.com/winsiderss/systeminformer/blob/master/phnt/include/ntmmapi.h)
and [PFN request definitions](https://github.com/winsiderss/systeminformer/blob/master/phnt/include/ntpfapi.h).

This establishes **target-file cache-cold at the prelaunch snapshot**, not a freshly
booted OS. Shared Windows DLLs, hardware caches and background reads after the snapshot
remain uncontrolled. Report the reset-to-launch interval; saving the post-reset
snapshot itself takes time. Never pool these samples with restart-based or uncontrolled
launches. [PCMark also uses cache flushing for cold app-start tests](https://support.benchmarks.ul.com/support/solutions/articles/44002160654-app-start-up),
but that does not establish equivalence between its implementation and this protocol.

For a visible sample without inspectors, use the manual launcher instead:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/startup/launch-packaged.ps1 -Kit .dist/my-startup-kit -Case fresh -Sample 1 -Condition cache-reset -RamMap .dist/cache-reset-tools/rammap/RAMMap64.exe
```

Record the same visible search endpoint and operator delay described below. The
launcher captures evidence but does **not** automatically validate its snapshots;
review them before classifying a manual sample as cache-cold. Use `-Condition repeat`
for its matching repeat launch. A new cache-reset sample needs a fresh reset and
unused prepared profile, not a reboot. A repeat after migration measures current-schema
startup. Portable extraction remains part of elapsed startup when testing that launcher.

## Restart-based visible samples

After preparing the kit, save work and use Windows **Restart**. Let Windows settle;
do not pre-open the application, database or executable contents. Start video timing
or a stopwatch, then run from the repository:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/startup/launch-packaged.ps1 -Kit .dist/my-startup-kit -Case fresh -Sample 1 -Condition cold
```

Open Quick search promptly, enter space-group number 1 and select Search. Record
first feedback, layout, expected visible results and manual input delay separately.
Fresh expects zero results; larger expects 1000; the other cases expect 168. Close
the app fully and repeat with `-Condition repeat`. Each new cold sample requires a
new restart. Repeat samples 1–3 for each case. A post-upgrade repeat is current-schema
startup, not a second upgrade; use the separately prepared profiles for cold upgrades.

The launcher uses the kit's application/profile with tracing, no inspector and no
GPU override. It refuses overwrites and a second recorded cold launch in the same
boot. Boot timestamps cannot prove that other software did not read files: record
startup programs, antivirus activity and interference. A fresh boot has not been
automatically arranged or verified simply by preparing the kit. No helper reboots
the workstation. Cache eviction occurs only with explicit `-Condition cache-reset`.
The execution-policy override is process-local.

The optional `-Distribution portable` requires placing the matching portable EXE
in the kit before restarting; its versioned name comes from the manifest. Results
for one distribution cannot establish another's performance. This does not install
an application or modify the user's normal database.

## Completion

### Cache-reset baseline on 2026-09-17

The [complete sanitized baseline](baselines/packaged-cache-reset-2026-09-17.json)
retains all 18 samples from the two-pass reset matrix. All functional search,
structure, refresh and unavailable-folder assertions passed. No window required
diagnostic restore/focus in this matrix. Launch-to-search results were:

| Case | Samples (s) | Median (s) | Validated cache-cold samples |
| --- | --- | ---: | ---: |
| Fresh | 1.313, 1.130, 1.136 | 1.136 | 1/3 |
| 168 entries, refresh off | 1.472, 1.516, 1.505 | 1.505 | 0/3 |
| 168 entries, refresh on | 1.733, 1.811, 1.384 | 1.733 | 0/3 |
| Unavailable source folder | 1.504, 1.463, 1.424 | 1.463 | 0/3 |
| Bibliography upgrade | 1.520, 1.349, 1.475 | 1.475 | 0/3 |
| 1000 entries | 1.401, 1.207, 1.189 | 1.207 | 0/3 |

These are **cache-reset attempts, not a completed cold-start acceptance matrix**.
Seventeen samples retained 107–2165 target-file pages (about 0.42–8.46 MiB), so the
runner correctly exited with `failed-cache-validation`. One had zero remaining
pages. Launch followed the final reset by 5.071–7.572 seconds, including the time to
save the post-reset snapshot; background repopulation remains possible. The cause of residual
pages has not been attributed. Keep the strict condition failures visible rather than
relaxing the check to obtain a pass. This run does not demonstrate a reboot equivalent.

Earlier pilot evidence remains local: `cif-packaged-visible-b51fIo` (one-pass reset,
1.545 s; 59886 target pages before, zero after); `cif-packaged-visible-NiIwIy` (1.903 s
with zero pages, then 1.824 s with 1528 residual pages); and `cif-packaged-visible-qWAwwW`
(two-pass pilot, 1.319 s with 102 residual pages). An initial invocation failed on an
inherited PowerShell module path before any reset or application launch; the helper
now selects its own host's inbox modules. The complete matrix's raw snapshots remain
in local temporary evidence `cif-packaged-visible-Cu3cdm`; do not publish those files.

Validation: eight startup comparison/parser tests pass, including rejected malformed
snapshots, active/standby/modified residual pages and empty evidence scopes. The
remaining #40 work includes a consistently validated cache condition, physical-display
and instrumentation-overhead assessment, agreed workload budgets and the distribution
decision. Development startup stays deferred under #72. The self-extracting portable
EXE is unchanged by these measurements of the extracted ZIP application.

### ZIP validation on 2026-09-17

An extract-once ZIP was built from the preserved application at `6679c8b` using
electron-builder's ZIP target. The extracted executable matches the preserved
unpacked executable. The first completed six-case instrumented run recorded:

| Case | Launch-to-search samples (s) | Median (s) |
| --- | --- | ---: |
| Fresh | 1.068, 1.092, 1.172 | 1.092 |
| 168 entries, refresh off | 1.292, 1.741, 1.893 | 1.741 |
| 168 entries, refresh on | 2.335, 1.687, 1.793 | 1.793 |
| Unavailable source folder | 1.432, 1.598, 1.541 | 1.541 |
| Bibliography upgrade | 1.724, 1.698, 1.664 | 1.698 |
| 1000 entries | 1.595, 1.597, 1.587 | 1.595 |

All windows needed the diagnostic restore/focus step. These numbers include that
intervention and do not establish natural foreground or cold-cache performance.
They measure the extracted ZIP application; initial ZIP extraction is a separate,
one-time setup step. The self-extracting portable EXE remains unchanged and slow.
There is no direct controlled before/after speedup claim across these different
launch protocols. Local evidence: `cif-packaged-visible-MKQQn3` in temporary storage.
An earlier partial run (`cif-packaged-visible-jVFgPe`) failed a diagnostic assertion:
it checked the unavailable-folder error after a new search intentionally cleared
the error. The runner now checks feedback before search. Both reports are retained.

A second completed run using the newly prepared ZIP kit and profile/binary guards
is retained as `cif-packaged-visible-Dr5VMt`. Its medians were 1.510 s fresh,
1.631 s refresh off, 1.609 s refresh on, 1.614 s unavailable, 1.844 s upgrade and
2.545 s larger (maximum sample 2.687 s). The application was unchanged; this spread
illustrates environmental variability rather than another optimization. All 18
samples passed. The subsequent runner metadata addition records date, OS/CPU/RAM,
Node version and executable hash for future runs.

Keep #40 open until actual cold evidence, agreed workload budgets, before/after
assessment and instrumentation overhead are documented. Proposed ordinary-profile
targets are 3 seconds for repeat and 5 seconds for OS-cold launch-to-usable-search;
these await owner agreement. Operator/automation delay must remain explicit and
must not be silently subtracted to obtain a pass. Upgrade and larger profiles need
separate budget assessment. Development startup remains deferred under #72.
