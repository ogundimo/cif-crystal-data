# Packaged Windows cold-start protocol (#40)

Status: **awaiting actual cold samples and agreement on usability budgets**.
Do not close #40 from warm CI, a new profile, a new Electron process, or the
instrumented packaged smoke runner. Those do not establish cold filesystem caches.

## Preparation (before the restart)

Use a dedicated test machine, or coordinate a restart with its owner. Never restart
an active workstation automatically. Use isolated copies/synthetic profiles and CIFs;
never the live database. Build once and record commit, dirty/source fingerprint,
app version and executable hash. Preserve both before-change and after-change builds.

Record Windows build, CPU, RAM, storage model/interface, antivirus configuration,
power state, startup programs, profile schema/entry count, file/block count, total
bytes and directory depth. Record the actual distribution: installed executable,
win-unpacked, or portable launcher. For a portable build, include extraction and
pre-process launch time. An unpacked result cannot explain a portable-launcher delay.

Prepare separate cases before restarting:

1. Populated current schema with unchanged CIFs, startup refresh enabled.
2. Same workload with startup refresh disabled.
3. Fresh profile.
4. Remembered folder unavailable, refresh enabled (expect actionable error).
5. Copied pre-upgrade schema/profile requiring migration and bibliography repair.
6. Representative larger collection (record sizes; do not extrapolate corpus coverage).

The repository synthetic fixture is suitable for repeatable scaling; it is not
experimental data. Keep a pristine copied profile for each upgrade repetition,
restored before the reboot. Do not pre-open the target database, binary or CIF files
after reboot. Re-establish the cold condition before **every** cold sample. Windows
Fast Startup/shutdown is not equivalent to Restart; record exactly how the condition
was established. A dedicated cache-reset method needs its own documented validation.

## Launch and measurement

Use at least three separately re-established cold samples per case and matching warm
restarts. Record raw samples, median and min/max; three samples do not justify p95/p99.
Include outliers with explanations, not silent removal.

Before the measured launch, prepare environment variables in PowerShell:

```powershell
$env:CIF_TRACE_FILE = 'C:\CifStartupTests\sample-01.jsonl'
$env:CIF_TEST_PROFILE = 'C:\CifStartupTests\profile-case-01'
```

The profile must already exist and be disposable. Both variables are needed to
redirect the app profile; otherwise the normal profile is used. Use a **new trace
filename** for each sample. These variables affect child processes, including the
portable launcher. Clear both after testing. Avoid the inspector/GPU-disabled smoke
harness for these measurements.

Record wall-clock launch invocation immediately before launching the actual chosen
distribution. Use a screen recording/stopwatch or a dedicated launch recorder to
include launcher overhead. Trace `processMs` allows estimation of process start,
but does not measure time spent before the Electron process exists.

Record first visible window paint, first responsive Quick Search opening/typing,
database readiness, successful search and visible results, discovery start/end,
refresh completion/cancellation and restored controls. Fixed trace milestones support
these observations; renderer signal delivery is not itself proof of responsiveness.
Repeatedly interact during discovery, import and upgrade and record input-to-visible
response latency (video frame counts are acceptable with the frame rate recorded).
Use the same filter and actions in each sample. Note that export/preservation controls
are disabled during mutation; Quick Search remains available.

Cancel one large import during discovery and another during ingestion. Verify the
summary accurately distinguishes committed, unattempted and unknown work, then retry
and restart. Verify IDs, stored CIF viewing/export, references and author roles after
schema upgrade. Retain the automatic migration snapshot and verify recovery/retry.

## Budgets and interpretation

Proposed discussion targets, **not agreed acceptance thresholds**: responsive search
controls within 5 seconds, first indexed search within 10 seconds, and ordinary UI
input response within 100 ms on the agreed representative workload. Upgrade and large
collection budgets need separate agreement after baseline measurement. Include the
owner-reported distribution and workload before concluding the original delay is fixed.

Attribute delay using measured phases: launcher/extraction, native module/database/
migration, renderer/JSmol load, worker startup, discovery, hashing/parsing/writing and
results rendering. Resolve the measured bottleneck, then repeat the identical matrix
on the changed build. Compare tracing on/off to quantify diagnostic overhead.

Attach raw traces, environment/workload manifest, interaction observations, sample
summary and agreed-budget assessment to #40 and link #15/#41/#61 as applicable.
If the delay cannot be reproduced, state exactly what was tested and what evidence
is still missing. Keep #40 and the reliability milestone open until the explicit
cold-start acceptance conditions are met.
