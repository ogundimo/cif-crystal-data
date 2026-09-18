<!-- Snapshot from the first successful Node 22 collection; do not edit measured values by hand. -->

Historical evidence: this immutable initial snapshot is not the current gate policy.
See [Regression protection](regression-protection.md) for enforced limits.

Measured on 2026-09-14 using Node 22.23.2. Production source is unchanged from the commit
below; the dirty-tree flag reflects the new baseline tooling and documentation. Use the
source fingerprint and pinned analyzer versions when comparing results. Commands, scope,
and interpretation are documented in [Code-quality measurements](code-quality.md).
# Code-quality baseline

Commit: `116b72966820e6e1f6fb52bfd3788699b61b7863` · working tree: **modified (see source hashes)**
Node v22.23.2 on win32. Source fingerprint: `9023a45ba51f87870e711c4f369b3f3750c14c4b2b7a50b7e8f8b4d003a83cbd`.

**Advisory measurements; no score thresholds enforced.** Coverage is from Vitest unit tests only; separate Electron UI/worker/viewer runs are not included.

## Coverage

| Module | Lines | Statements | Functions | Branches |
| --- | ---: | ---: | ---: | ---: |
| main | 48.13% | 46.07% | 54.14% | 38.15% |
| parser | 96.75% | 93.26% | 98.04% | 84.03% |
| preload | 0% | 0% | 0% | n/a |
| renderer | 23.95% | 22.93% | 16.8% | 21.65% |
| shared | 94.34% | 95.16% | 93.33% | 86.05% |
| total | 42.53% | 40.73% | 33.44% | 36.28% |

Untested executable production files are included. Declaration-only modules have no executable denominator.

## Source inventory

| Category | Files | Physical lines |
| --- | ---: | ---: |
| application | 38 | 6736 |
| data-tables | 2 | 119 |
| other | 4 | 82 |
| scripts | 11 | 1897 |
| tests | 23 | 1932 |

Physical lines include blanks and comments. Tests, scripts, and data tables are not mixed with application logic in this inventory.

## Cyclomatic complexity: top 10

| Location | Score | Analyzer description |
| --- | ---: | --- |
| src/parser/cifParser.ts:562:8 | 43 | Function 'parseCif' has a complexity of 43. Maximum allowed is 0. |
| src/renderer/src/App.tsx:30:1 | 40 | Function 'AppInner' has a complexity of 40. Maximum allowed is 0. |
| src/renderer/src/App.tsx:190:3 | 37 | Async function 'handleSearch' has a complexity of 37. Maximum allowed is 0. |
| src/main/db.ts:582:8 | 34 | Function 'computeRestraints' has a complexity of 34. Maximum allowed is 0. |
| src/renderer/src/pxrd.ts:120:8 | 33 | Function 'simulatePxrd' has a complexity of 33. Maximum allowed is 0. |
| src/main/db.ts:474:8 | 25 | Function 'buildWhereClause' has a complexity of 25. Maximum allowed is 0. |
| src/renderer/src/components/JSmolViewer.tsx:53:16 | 25 | Function 'JSmolViewer' has a complexity of 25. Maximum allowed is 0. |
| src/parser/cifParser.ts:288:1 | 22 | Function 'scanCif' has a complexity of 22. Maximum allowed is 0. |
| src/main/searchFilterValidation.ts:66:8 | 21 | Function 'validateSearchFilter' has a complexity of 21. Maximum allowed is 0. |
| src/renderer/src/jsmol/scripts.ts:39:8 | 19 | Function 'projectedStructureZoom' has a complexity of 19. Maximum allowed is 0. |

## Cognitive complexity: top 10

| Location | Score | Analyzer description |
| --- | ---: | --- |
| src/renderer/src/pxrd.ts:120:17 | 44 | Refactor this function to reduce its Cognitive Complexity from 44 to the 0 allowed. |
| src/parser/cifParser.ts:288:10 | 40 | Refactor this function to reduce its Cognitive Complexity from 40 to the 0 allowed. |
| src/renderer/src/App.tsx:30:10 | 37 | Refactor this function to reduce its Cognitive Complexity from 37 to the 0 allowed. |
| src/main/db.ts:474:17 | 36 | Refactor this function to reduce its Cognitive Complexity from 36 to the 0 allowed. |
| src/parser/cifParser.ts:481:17 | 30 | Refactor this function to reduce its Cognitive Complexity from 30 to the 0 allowed. |
| src/parser/cifParser.ts:562:17 | 26 | Refactor this function to reduce its Cognitive Complexity from 26 to the 0 allowed. |
| src/main/db.ts:582:17 | 25 | Refactor this function to reduce its Cognitive Complexity from 25 to the 0 allowed. |
| src/main/ingest.ts:49:17 | 24 | Refactor this function to reduce its Cognitive Complexity from 24 to the 0 allowed. |
| src/main/searchFilterValidation.ts:66:17 | 22 | Refactor this function to reduce its Cognitive Complexity from 22 to the 0 allowed. |
| src/renderer/src/pxrd.ts:36:10 | 20 | Refactor this function to reduce its Cognitive Complexity from 20 to the 0 allowed. |

Cognitive output lists positive scores only. Reporting thresholds of zero collect findings; they are not accepted limits.

## Largest production files

| File | Physical lines |
| --- | ---: |
| src/parser/cifParser.ts | 688 |
| src/main/db.ts | 662 |
| src/renderer/src/components/QuickSearchDialog.tsx | 610 |
| src/renderer/src/App.tsx | 412 |
| src/renderer/src/components/JSmolViewer.tsx | 362 |
| src/renderer/src/components/CompoundInfoPanel.tsx | 343 |
| src/main/index.ts | 335 |
| src/renderer/src/jsmol/runtime.ts | 324 |
| src/renderer/src/components/DataGrid.tsx | 287 |
| src/main/migrations.ts | 248 |

## Duplication

1 clone pairs; 26 duplicated lines reported by jscpd (0.31%).
Weak token mode, minimum 70 tokens and 5 lines. 38 input files; 51 tokenized sources and 8309 detector lines (TSX can produce multiple token streams). Data tables, tests, and scripts excluded. This is a detector estimate, not a percentage of physical source lines or logic that should be removed.

| First location | Second location |
| --- | --- |
| src/main/db.ts:184–210 | src/main/db.ts:153–178 |

## Deferred metrics

- Halstead difficulty: Deferred: no validated TypeScript/TSX operator-and-operand analyzer has been selected. Not inferred from file length.
- CRAP: Deferred: no validated function-range join between ESLint complexity and V8 source coverage yet. Proposed formula: C^2 * (1 - cov)^3 + C, where C is per-function classic cyclomatic complexity and cov is the fraction of executable lines covered within that same function. Nested-function attribution must be defined before calculation. Global coverage must not be substituted.

## Analyzer versions

- vitest: 4.1.11
- @vitest/coverage-v8: 4.1.11
- eslint: 10.10.0
- @typescript-eslint/parser: 8.70.0
- eslint-plugin-sonarjs: 4.2.0
- jscpd: 4.3.0

Full results: baseline.json, complexity.json, duplication.json, inventory.json, coverage/index.html, and coverage/lcov.info in the quality artifact.
