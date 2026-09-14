# Database responsibility refactor (#17)

Baseline: `9afc736b8f4eae50135d9d8a2e4214f82d9780c6` (PR #32), measured on
2026-09-14. Tracking issue:
[#17](https://github.com/ogundimo/cif-crystal-data-public/issues/17).

## Structure and contracts

The original `src/main/db.ts` combined connection setup, migrations, prepared
writes, metadata, search SQL and preview counts. It is now a stable export facade:

| Module under `src/main/database/` | Responsibility |
| --- | --- |
| `connection.ts` | Process-local connection, WAL/foreign-key setup, existing migrations and version settings |
| `writer.ts` | Reusable prepared statements, insert/update batches, nested savepoints, fingerprints, stale-block cleanup and transactional clear |
| `metadata.ts` | Counts, ordered atom/symmetry/author reads, viewer/export source records and import-folder settings |
| `query.ts` | Pure filter resolution, parameterized predicates, LIKE escaping and angstrom-to-nanometre bounds |
| `search.ts` | Bounded pagination, allowlisted sorting, stable ID tiebreak and total count |
| `restraints.ts` | Per-field preview counts, content descriptions and combined total |

The main process still dynamically imports `./db`; the worker and ingestion code
keep their existing imports. Default and explicitly supplied database arguments
retain their previous behavior. The modules depend directly on connection/query
helpers, never back on the facade, avoiding cycles. Each process/thread retains
its own module-local connection; no connection is shared across Electron boundaries.

All implementation bodies, SQL statements, parameter order and transaction scopes
were moved unchanged. The new exports inside the directory only connect those
responsibilities. The public facade retains its existing exports. Migration code,
schema, IPC validation and renderer/preload code were not changed. Anisotropic
data remains stored, replaced on update and removed by existing cascades.

No process-boundary exceptions were added. Knip explicitly lists the new Electron
benchmark script as an entry point, matching the existing benchmark convention;
this is not an unused-file exclusion. No dependencies or quality thresholds changed.

## Comparable measurements

Measured with Node 22.23.2 and the repository's pinned ESLint 10.10.0, TypeScript
parser 8.70.0 and SonarJS 4.2.0, using `scripts/quality/analyzers.mjs` and
`scripts/quality/scope.mjs`. Physical lines include blank lines and comments;
complexity values are maximum function scores per file, including callbacks.

| Scope | Physical lines | Max cyclomatic | Max cognitive |
| --- | ---: | ---: | ---: |
| Original `db.ts` | 662 | 34 | 36 |
| Facade | 12 | n/a | n/a |
| Connection | 31 | 2 | 1 |
| Writer | 269 | 8 | 7 |
| Metadata | 90 | 4 | 0 |
| Query construction | 152 | 25 | 36 |
| Paged search | 28 | 5 | 3 |
| Restraints | 94 | 34 | 25 |
| Refactored scope combined | 676 | 34 | 36 |

The 14 additional lines express imports and the facade. Every module is below
the advisory 500-line guideline. The high scores in `buildWhereClause` and
`computeRestraints` remain explicit exceptions to the aspirational complexity
targets: they enumerate supported independent filter fields, and this extraction
preserves their decisions rather than rewriting them to reduce a score. They
remain candidates for separately characterized simplification. No complexity
improvement or numerical-gate adoption is claimed.

Reproduce by running the pinned `createComplexityAnalyzer().lintFiles(...)` over
the original file at the baseline commit and the seven current files. Collect
scores with `complexityFinding` and line counts with `physicalLines`. Local raw
results are ignored artifacts at `reports/architecture/issue-17-{before,after}.json`.

## Regression and performance evidence

The original production build and native worker suite passed before extraction.
After extraction, all 268 unit tests in 22 files, TypeScript/Knip, production
build and native worker tests passed. The boundary scan covers 50 production
inputs with zero violations, including worker reachability checks. Existing tests
verify filtering, stable pagination, preview totals, source lookup, clear cascades,
migration backups/backfill, insert/update diffraction data, failed-file savepoints
and multi-block retry/stale cleanup. No public contract was changed to satisfy a test.

The new `npm run benchmark:database:api` builds the application, then exercises
the emitted database chunk with Electron and an isolated temporary database.
It writes 10,000 entries in batches of 250, updates all entries, and checks metadata,
anisotropic persistence and matching preview/search totals. Query timings are the
median of seven samples after a warm-up. Both baseline and refactor used the same
script, fixture and Electron 44.1.0 / embedded Node 24.19.0 runtime on Windows.

| Production API operation | Before (ms) | After (ms) |
| --- | ---: | ---: |
| Insert 10,000 entries | 3659.11 | 1960.14 |
| Update 10,000 entries | 3609.74 | 3499.67 |
| Filtered, sorted page | 18.14 | 16.51 |
| Restraint counts | 13.74 | 11.12 |
| Atom/author/symmetry metadata reads | 0.14 | 0.13 |

These are one before/after run with warmed query samples, not statistical evidence
of a speedup. Filesystem caches, scheduling and SQLite I/O affect timings; the
underlying statements and transaction strategy are unchanged. No slowdown was
observed in this production API sample. The unchanged scale benchmark is recorded
below separately because it uses synthetic SQL rather than the production API.

| Rows | Insert seconds (before → after) | Read all rows ms (before → after) | JSON ms (before → after) |
| ---: | ---: | ---: | ---: |
| 10,000 | 0.11 → 0.14 | 17.31 → 21.53 | 7.15 → 8.35 |
| 100,000 | 1.26 → 1.76 | 140.51 → 188.08 | 67.45 → 88.27 |
| 1,000,000 | 22.62 → 22.05 | 2431.29 → 4392.38 | 740.88 → 1156.5 |

Query medians in milliseconds (before → after):

| Rows | Query | Original indexes | Added indexes |
| ---: | --- | ---: | ---: |
| 10,000 | primaryKeyPage | 0.08 → 0.15 | 0.1 → 0.16 |
| 10,000 | spaceGroupNumber | 0.35 → 1.14 | 0.01 → 0.02 |
| 10,000 | cellRange | 0.39 → 0.72 | 0.05 → 0.08 |
| 10,000 | referenceContains | 1.77 → 5.32 | 2.09 → 3.73 |
| 10,000 | element | 1.99 → 6.46 | 2.09 → 3.47 |
| 10,000 | combined | 3.75 → 8.34 | 3.87 → 6.46 |
| 100,000 | primaryKeyPage | 1.29 → 1.49 | 2.06 → 2.42 |
| 100,000 | spaceGroupNumber | 9.86 → 10.14 | 0.04 → 0.07 |
| 100,000 | cellRange | 10.2 → 10.4 | 1.38 → 0.59 |
| 100,000 | referenceContains | 26.17 → 49.47 | 25.15 → 51.14 |
| 100,000 | element | 28.99 → 60.41 | 38.75 → 47.25 |
| 100,000 | combined | 81.03 → 105.96 | 110.62 → 87.38 |
| 1,000,000 | primaryKeyPage | 191.23 → 181.31 | 159.07 → 180.45 |
| 1,000,000 | spaceGroupNumber | 200.46 → 206.63 | 0.31 → 0.19 |
| 1,000,000 | cellRange | 199.14 → 204.8 | 6.49 → 5.68 |
| 1,000,000 | referenceContains | 358.39 → 443.68 | 540.48 → 455.03 |
| 1,000,000 | element | 479.79 → 555.94 | 683.88 → 572.91 |
| 1,000,000 | combined | 766.94 → 876.11 | 861.44 → 824.9 |

The synthetic query plans and serialized payload sizes matched. Timings varied
in both directions, including slower small-corpus scans in the second run. This
script does not import any refactored module, so those differences cannot establish
an application-code regression or speedup. The production API sample above is the
direct check of the moved paths; neither benchmark is a controlled performance study.

Run comparisons sequentially, using the same runtime and no overlapping benchmark
processes. `npm run benchmark:database` defaults to 10k, 100k and 1m rows;
`npm run benchmark:database -- 10000` selects a smaller diagnostic run. The API
benchmark is opt-in, not a timing-sensitive CI gate. Its assertions supplement
rather than replace the blocking worker regression suite.

Remaining external corpus, corrupt/interrupted migration and packaged-workflow
limitations are described in the [test-gap review](test-gap-review.md). Local logs
are in `reports/architecture/issue-17-*.log`; hosted results are recorded in the
implementation PR when submitted.
