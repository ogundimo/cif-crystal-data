# Windows release acceptance (#93)

The release workflow must validate the revision and packaged payload before
publishing. This is functional acceptance, not a claim of exhaustive CIF support,
experimental PXRD accuracy, code signing or cold-start performance.

## Automated publication gate

The [release workflow](../.github/workflows/release.yml) runs unit and Electron UI
tests, builds production bundles once, and runs the native import-worker and
separate JSmol viewer suites. It then packages those bundles without rebuilding.
`npm run test:packaged` runs these existing suites sequentially against that build:

| Suite | Required evidence |
| --- | --- |
| Reliability | Import/refresh, search/paging, bibliography upgrade, restart/persistence, actual JSmol model and worker-generated PXRD, headerless XY export, unavailable originals. |
| Preservation | Backup, restore into a fresh profile, restart, stable entries and exact managed-CIF export after originals disappear. |
| Batch export | Selected/all-matching exports beyond one page, collisions, cancellation, reimported exported blocks, and the packaged export dialog. |

These use synthetic fixtures in temporary profiles. The inspector harness replaces
native dialogs with controlled paths and disables the GPU. They run `win-unpacked`,
not the NSIS installer or portable extraction launcher. Existing database backups
and exports in a normal user profile are never used.

The workflow also invokes the actual portable launcher with a private extraction
directory and synthetic profile, checking initial import/export, restart and
relocation of the executable. `portable-launcher.json` identifies the tested
launcher hash and records each instrumented launch. This is separate from the
payload report and does not claim uninstrumented launch or default-profile behavior.

Changes to release tooling trigger the same validation job on pull requests, with
read-only repository permissions and no signing credentials. Publication is a
separate dependent job, excluded for pull requests. It downloads the tested assets
without rebuilding and verifies that the release tag still identifies the tested
commit. PR runs cannot attest or publish a GitHub release.

On these PR runs only, disposable GitHub-hosted Windows runners exercise silent
NSIS install, restart, uninstall, reinstall and a version upgrade. The test refuses
to run outside that environment. It uses the default profile of the disposable
account and verifies database/original-file preservation and shortcut removal.
The old v1.1.0 installer is pinned by its published SHA-256 digest. The newer
installer uses current bundles with a test-only incremented patch version; it is
stored under `release/upgrade-probe` and excluded from release assets. The upgrade
checks identity before explicit refresh, which establishes managed bytes for legacy
records. This is migration/lifecycle evidence, not verification of the eventual
release version or interactive dialogs. Reports identify all three installers.

A nonzero runner exit, missing artifact or artifact change fails the gate and
prevents the later publication step. The first failure stops subsequent suites.
No acceptance step uses `continue-on-error`; publication retains GitHub Actions'
default success condition. Gate regression tests inject failure using synthetic
files and child processes, without publishing a test release. Ordinary CI also
runs these probes; the full packaged suites run in the release workflow.

## Reproduction and evidence

Use Node 22.13+ on the Node 22 line and locked dependencies. From the repository:

```powershell
npm ci
npm run test:release-validation
npm run package -- --publish never
npm run test:packaged
```

Run the instrumented portable check separately with an explicit executable:

```powershell
npm run test:portable-launcher -- "release/CIF Crystal Data 1.1.0.exe"
```

Use the actual candidate filename/version. Do not run the installer test locally;
open a PR with the release-tooling changes to run it on disposable hosted Windows.

For an isolated candidate output directory:

```powershell
npm run package -- --publish never --config.directories.output=release/candidate
npm run test:packaged -- release/candidate
```

The gate creates a fresh `reports/release-validation/run-*/` directory containing
`validation.json`, one log per attempted suite, detailed reports for passing suites,
and the batch-export capture. A zero exit without its required JSON report fails
acceptance. The report records commit,
dirty status, package version, runtime, timestamps, outcomes and SHA-256 hashes
of both distribution executables and every file in `win-unpacked`. Hashes are
checked again after the suites finish. A failed run retains its partial report
and logs. Detailed reports identify their separate temporary profiles; those
profiles are not uploaded or treated as portable release evidence.

The workflow retains acceptance evidence and viewer captures for 30 days even
when a test fails. Download and retain the evidence with the release record before
that retention expires. A report from a dirty checkout is local development
evidence, not proof that an immutable release tag passed. Record manual outcomes
against the exact distribution hashes from the successful release candidate;
rebuilding invalidates those outcomes for the replacement artifacts.

## Manual distribution acceptance

For distribution acceptance, use a disposable supported Windows x64 VM or a clean test
account containing no research data. Keep a VM snapshot for recovery and use only
`docs/samples/rocksalt-demo.cif` and other repository-owned synthetic inputs.
Never run upgrade/uninstall experiments against a normal research profile.

For each check record Windows version, account/install scope, release tag and
commit, package version, SHA-256 of the exact executable, expected/actual result,
and pass/fail/not-tested. Record prompts and timings without calling warm startup
a cold-start measurement. Identify installer, portable launcher and unpacked
payload separately; one passing format does not establish another.

| Check | Procedure and acceptance |
| --- | --- |
| Clean NSIS install | On the clean VM, launch the candidate Setup executable through Explorer. Complete the supported default installation; record security/publisher prompts. Start from the installed shortcut. The workspace must open without runtime/native-module errors. Record installed path/version. |
| Native dialogs and persistence | Import the synthetic folder through the actual picker; search and open its structure/PXRD. Export CIF and XY through the actual save dialogs to new destinations. Cancel a picker and confirm no files change. Close and reopen; entries and managed CIF contents must persist. Compare CIF bytes to the imported fixture and check XY has two numeric columns. |
| Upgrade from the previous release | Revert to a clean snapshot, install the previous supported release, import the synthetic fixtures, record entries/exports, then quit. Snapshot the stopped profile (including any WAL/SHM files) or VM. Install a candidate with a newer package version over that installation. Reopen and verify retained entries, viewing/search/export, migration snapshot where applicable, and persistence after another restart. A same-version reinstall is not upgrade evidence. |
| Uninstall and reinstall | Quit the app. Record/hash the synthetic originals and copy the stopped profile for comparison. Uninstall using Windows Installed apps or the supplied uninstaller. Installed application files/shortcuts must be removed; originals and the retained user profile must remain intact. Reinstall the same candidate and confirm the synthetic entries are still available. Any profile deletion or unrecoverable change fails acceptance. |
| Portable launch | Revert to a clean snapshot with no installed app. Launch the portable executable through Explorer from a writable directory whose path contains spaces. Confirm the workspace appears and exercise import, view, export and quit. Relaunch the same executable and confirm persistence. Record extraction/launch time and the observed profile location; do not assume the profile travels with the executable. |
| Portable relocation | Quit, move only the portable executable to another directory on the same VM/account, relaunch and record persistence behavior. Confirm original CIF bytes are unchanged. This is not a cross-machine portability claim. |

Locate the profile actually created on the clean test account (the directory
containing `cif-local.db` under that account's application data), rather than
assuming the executable directory is the database location. Copy or hash database
files only after the app has quit. If a check fails, retain logs/profile snapshots,
do not publish, and investigate before repeating with a new candidate.

The automated report intentionally marks installer and portable-launcher
manual acceptance `not-tested`; separate distribution reports record only the
automated checks actually performed. It does not infer manual approval. Attach the completed
manual record to the release issue/PR with the tested artifact hashes. The workflow
enforces automated acceptance only; it does not wait for a manual attestation.
Do not describe an automatically published artifact as installer/portable-verified
until these checks have passed on those exact files. This procedure defines
acceptance but is not evidence that clean install, real upgrade, uninstall or
portable launch has already passed. Signing policy remains in #96; startup budgets
and cold-cache evidence remain in #40/#72.
