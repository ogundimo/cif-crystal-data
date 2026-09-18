# Import and search reliability

Current guidance: import, bibliography, tracing and search behavior. Coverage and
packaged acceptance records below are historical evidence; GitHub tracks remaining work.

Implementation provenance: #15, #40, #49 and #61. A successful fresh-process
smoke test does not establish cold-cache startup acceptance.

## Import lifecycle

Discovery reports activity before a final file count exists. Directory/stat errors
include the affected location and reason. Discovery, read, parse and write failures
are distinct. Counts distinguish discovered/processed files, unchanged files,
committed structures, and discovered files not attempted. A cancelled discovery
explicitly leaves the undiscovered remainder unknown. Failure counts are diagnostic
records, not necessarily distinct files (several blocks of one file can fail).

Scans never follow symbolic links or Windows junctions, including a linked root.
Skipped links are counted; this prevents cycles and duplicate alias traversal.
Hard-linked files at distinct paths remain distinct sources under the identity policy.

Cancel stops at safe boundaries. Parsing a file can finish before cancellation is
noticed; cancellation does not interrupt an active SQLite commit. All blocks of one
physical file still succeed or fail together. Previous successful files remain
committed. The main mutation lock is retained until the worker closes its connection
and exits, then listeners and cancellation subscriptions are removed. There is no
persistent/resumable job queue.

**Startup refresh defaults off**, including profiles without an explicit setting.
Enable it under **Sources & backups → Refresh saved folder at startup**. The choice
persists in the profile and portable backup. Manual Refresh remains available.
Restore still clears the remembered source folder. This default is a usability
choice, not evidence that the reported cold-start delay has been diagnosed.

## Bibliography and upgrades

The tokenizer treats blank lines/comments as whitespace, retains opening text-field
content and tokens after closing semicolons, and preserves quoted control words.
Incomplete loop rows and unterminated strings now fail explicitly rather than
silently dropping trailing data. Fixtures are synthetic and redistributable.
See the [IUCr CIF 1.1 syntax](https://www.iucr.org/what-we-do/digital-standards/cif/cif1/file-syntax).

For citation loops, select the row whose `_citation_id` is `primary` (case-insensitive),
otherwise the first citation row. Authors with `_citation_author_citation_id` must
match that selected ID exactly. Unassociated citation authors are accepted only
when there is no ambiguity from multiple citations. Publication author scalars/loops
are not attached to an explicitly non-primary selected citation. Scalar publication fields may supplement an explicitly primary citation (or a sole unnamed citation); they never supplement a selected secondary citation or borrow fields from another loop row.

References preserve a first page/article identifier without requiring an end page.
When journal name, year, volume or first page/article identifier is absent, append available title and DOI to the remaining
citation fields. That text is persisted in the reference column and remains searchable.
`_audit_author_name` and addresses are stored and displayed as **Data-block authors**,
separately from publication authors; they are not passed to publication matching.
No author names are invented. Empty source metadata and loading failures have
separate UI messages.

Schema 10 creates data-author storage and repairs bibliography from verified managed
sources within the existing snapshotted migration transaction. It never needs the
external original and never changes entry IDs, file/block identity, source bytes,
atom rows or provenance. Shared file versions are read/parsed once during repair.
A checksum/parser failure rolls back the upgrade and retains the snapshot; restore
verified data and retry. Legacy records without managed bytes still require reimport.
Migration is synchronous and must be included in cold-start measurements; it is not
claimed to be free of startup cost. Older-schema portable archives are rejected by
the existing exact-schema restore contract; retain the original app and snapshots.

## Tracing

Set `CIF_TRACE_FILE` to an absolute writable JSONL destination before launching;
unset it to disable tracing. Default production runs do not log. Records contain
fixed route/event names, process/thread IDs, wall-clock/process-relative time and
operation duration. Arguments, results, errors, CIF text, publication metadata and
source paths are deliberately excluded. An unwritable trace cannot fail an operation.
The trace destination itself is locally chosen and may contain private directory names.

IPC spans cover completion and rejection. Events include application/window/renderer
readiness, database initialization, discovery, worker creation/exit and cancellation.
A ready-to-show event records Electron's first-paint signal, not interactive readiness.
Renderer readiness/results/restored-controls events are separate. IPC duration includes
native-dialog dwell time where applicable. Synchronous file logging adds overhead;
compare tracing enabled/disabled when investigating performance.

`npm run test:packaged-reliability` uses an isolated synthetic profile, opts into tracing,
and retains JSONL plus a report with commit, dirty flag, environment and observed events.
It exercises import/unchanged refresh, search/paging/sorting, details/authors, viewer
source, diffraction input, exports, startup preference/restarts and an unavailable folder.
It uses an inspector and disables GPU; its timings are **instrumented process starts**,
not cold-cache measurements. Separate UI/viewer suites validate rendering/calculation.
Unobserved routes are candidates for further tests, never evidence of dead code.

## Search tests and coverage

The search request lifecycle is isolated in `searchController.ts`, consumed by App
through the typed preload API. Tests control promise ordering and assert filter handoff,
page offsets/sort requests, busy/error transitions, selection, resets, empty results,
retry and same-tick duplicate paging exclusion. Stale successes and failures cannot
replace a newer generation. Failed sorting clears the old order, preventing mixed pages.

### Historical coverage comparison

Comparable unit-only runs: base `0c4b83f` (333 tests) and the working implementation
(366 tests in 30 files), Node 22.23.2, Vitest/V8 4.1.11, identical coverage configuration.

| Metric | Base | Working implementation |
| --- | ---: | ---: |
| Lines | 1175/2463 (47.70%) | 1375/2532 (54.30%) |
| Statements | 1326/2871 (46.18%) | 1595/3024 (52.74%) |
| Functions | 228/641 (35.56%) | 290/696 (41.67%) |
| Branches | 953/2156 (44.20%) | 1130/2301 (49.11%) |

The formerly unexecuted App search orchestration now has a separately tested controller:
100% lines/functions, 97.78% statements, 96.77% branches at this snapshot. App JSX still
has zero unit coverage; Electron UI evidence is separate and is not merged into these
numbers. New migration/worker tests also contribute to the overall increase.

## Historical packaged acceptance record (2026-09-17)

See [cold-start protocol](cold-start-protocol.md) and the
[packaged validation record](packaged-startup-validation.md). Authorized isolated
copies of both reported bibliography examples now pass import and stored-source
upgrade checks, including visible titles/references and preservation of IDs/bytes.
Actual cold-cache samples and owner-approved workload budgets remain outstanding.
Instrumented unpacked launches are fast in the tested cases, while the portable
launcher has an unresolved pre-application delay. On 2026-09-17 the owner accepted
current packaged performance as sufficient to continue the roadmap and moved #40
to the dedicated [Startup performance and validation milestone](https://github.com/ogundimo/cif-crystal-data/milestone/11).
Live acceptance status and subsequent measurements belong to
[issue #40](https://github.com/ogundimo/cif-crystal-data/issues/40) and
[PR #74](https://github.com/ogundimo/cif-crystal-data/pull/74). This reprioritization
does not claim that cold-start validation passed or that the portable delay is fixed.
Development-startup work is tracked in
[issue #72](https://github.com/ogundimo/cif-crystal-data/issues/72).

## Reproducible installation

The lockfile retains better-sqlite3 13.0.2's upstream `gypfile: false` metadata.
Without it, npm ci inferred an unwanted node-gyp rebuild from binding.gyp despite
the bundled Node-API prebuild. The corrected lock passed ordinary npm ci with
Node 22.23.2/npm 10.9.8 and installation scripts enabled; no dependency versions
changed and npmRebuild remains false.

`npm run test:search-probes` passed the unchanged controller and confirmed behavioral
assertions fail when stale successes are accepted, stale errors are displayed, or paging
incorrectly restarts from offset zero. Probes run in disposable copies, not the source tree.
