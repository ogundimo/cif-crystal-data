# Parser stage refactor (#18)

Baseline: `04482c6a90b0b8d06c6bd89654b6efc7cc3aa4a9` (PR #33), measured on
2026-09-14. Tracking issue:
[#18](https://github.com/ogundimo/cif-crystal-data-public/issues/18).

## Stages and contracts

`src/parser/cifParser.ts` remains the public entry point. Its existing function
and `CifEntry` exports remain available to ingestion, exports, tests and other
callers. `parseCif` composes `scanCif(text)` with `normalizeCif(raw)`.

The implementation is organized under `src/parser/cif/`:

| Module | Responsibility |
| --- | --- |
| `blocks.ts` | Split physical documents into data blocks, respecting semicolon text blocks and original source slices |
| `scanner.ts` | Quoted-token handling, scalar/loop scanning, multiline values and first-row citation tags |
| `loops.ts` | Decode atom sites, symmetry operations, anisotropic tensors and publication authors in source order |
| `values.ts` | Quotes, missing values, uncertainty numbers, tag lookup and address whitespace |
| `formula.ts` | Sum/moiety formulas, charge/component handling and stable formula formatting |
| `entry.ts` | Required-field validation, units, volume, space groups, publication metadata and normalized entry construction |
| `types.ts` | Parsed row, raw scan and persisted entry contracts |

The scanner owns traversal state, loop decoders receive headers/values, and entry
construction receives the complete scan result. Internal stages depend on their
helpers and contracts, never back on the public entry point. No parser stage loads
Node, Electron, SQLite, renderer or preload modules. No process-boundary exceptions,
dependencies, schema changes or numerical gates were added.

Every original function body was compared against its extracted counterpart using
the TypeScript AST. The only body adaptation is the first assignment in entry
construction: it receives `raw` instead of calling `scanCif(text)`. The public
wrapper performs that call. Formula ordering, errors, defaults, missing values,
uncertainty handling, metadata precedence and crystallographic calculations remain
unchanged. This does not expand supported CIF syntax or space-group inference.

## Measurements and exceptions

Measurements use Node 22.23.2 and the pinned ESLint 10.10.0, TypeScript parser
8.70.0 and SonarJS 4.2.0 through `scripts/quality/analyzers.mjs`. Line counts use
`physicalLines` and scores use `complexityFinding` from `scripts/quality/scope.mjs`.
Physical lines include comments/blanks; scores are per-file maximum function
complexities including callbacks, not sums.

| File / scope | Physical lines | Max cyclomatic | Max cognitive |
| --- | ---: | ---: | ---: |
| Original parser | 688 | 43 | 40 |
| Public entry point | 15 | 1 | 0 |
| Contracts | 86 | n/a | n/a |
| Block splitting | 28 | 9 | 9 |
| Value handling | 50 | 6 | 5 |
| Loop decoding | 104 | 6 | 6 |
| Scanner/tokenizer | 163 | 22 | 40 |
| Formulas | 74 | 18 | 30 |
| Entry construction | 186 | 43 | 26 |
| Refactored scope combined | 706 | 43 | 40 |

The 18 additional lines express imports and the public composition. All files are
below the advisory 500-line guideline. High function scores remain in the scanner,
moiety parser and entry normalization. These are documented exceptions to the
aspirational complexity targets: scanning state, chemical composition rules and
field precedence are cohesive behavior-sensitive logic. This change establishes
stage boundaries while preserving that logic; it does not claim a complexity
reduction. Future simplification should use targeted characterization or mutation
results rather than splitting solely to lower a score.

Reproduce the comparison with `createComplexityAnalyzer().lintFiles(...)` over
the original parser at the baseline commit and the eight current files. Local raw
reports are ignored artifacts at `reports/architecture/issue-18-{before,after}.json`.

## Regression and corpus evidence

Before extraction, the existing parser/ingestion selection passed 65 tests. Four
additional characterization cases then passed against the original implementation:
complete-entry and data-block equivalence for LF, CRLF and CR line endings, plus
isolation of scalar/loop metadata between independent block parses. After extraction,
all 272 unit tests in 22 files passed, including those cases and the existing malformed
input, quotation, formula, citation, symmetry and displacement tests.

Available local collections were also compared before/after with the same runner:

| Input collection | Files | Data blocks | Successful block parses before / after |
| --- | ---: | ---: | ---: |
| Repository parser fixture | 1 | 1 | 1 / 1 |
| Repository documentation sample | 1 | 1 | 1 / 1 |
| Local CIFS collection | 12 | 12 | 12 / 12 |
| Local ALL CIFS collection | 138 | 167 | 167 / 167 |
| Total observations | 152 | 181 | 181 / 181 |

For each file, the local runner compared source hashes, ordered block-name/text
hashes, and SHA-256 hashes of complete JSON-serialized `CifEntry` results, for both
whole-document calls and every split block. It captured thrown error messages as
hashes as well; all corpus calls succeeded in both versions. Every compared outcome
matched exactly. Counts are file/block observations, not a claim of unique structures.
The malformed-input unit tests supply error-path evidence absent from this corpus.

The comparison bundled each version with the installed esbuild and executed it
under Node 22.23.2. The runner and hash reports are local ignored artifacts under
`reports/architecture/compare-issue-18.mjs` and `issue-18-corpus-{before,after}.json`.
External CIF contents, filenames and per-record hashes are not committed or uploaded.
Reproducing that exact external comparison requires the same supplied collections;
CI uses repository fixtures. Matching the available collections is not proof of
full CIF conformance or coverage of every PCD/ICSD/CCDC release.

TypeScript, Knip, production build and native import-worker checks passed. The
worker suite verifies persistence, migration backups, typed progress, source paths,
multi-block retry/stale cleanup, savepoint failure isolation and diffraction data
through insert/update/deletion. The architecture scan covers 57 production inputs
with zero violations. Hosted results belong to the implementation PR; these are
the local validation results.

The [test-gap review](test-gap-review.md) remains the broader limitations record;
the corpus comparison above adds specific parser evidence without superseding its
packaged-workflow, migration and scientific-validation limitations.
