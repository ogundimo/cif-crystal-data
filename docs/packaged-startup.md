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
the workstation or clears OS caches. The execution-policy override is process-local.

The optional `-Distribution portable` requires placing the matching portable EXE
in the kit before restarting; its versioned name comes from the manifest. Results
for one distribution cannot establish another's performance. This does not install
an application or modify the user's normal database.

## Completion

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
