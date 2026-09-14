# Code-quality measurements

Issue [#13](https://github.com/ogundimo/cif-crystal-data-public/issues/13) establishes a
repeatable baseline before introducing blocking quality targets. Measurements identify
places to investigate; they do not prove correctness or dictate refactoring.

## Run locally

Use Node.js 22.13 or newer (the maintained ESLint release requires at least 22.13 on
the Node 22 line). CI uses Node 22. Install the locked dependencies, then run:

```powershell
npm ci
npm run quality:test
npm run quality:baseline
```

The baseline command runs the Vitest unit suite with V8 coverage, then complexity and
duplication analysis. It replaces only the generated `reports/quality` directory. Do not
run multiple baseline or coverage commands concurrently in the same checkout.
`npm run test:coverage` runs only the coverage portion.

Open `reports/quality/summary.md` for the overview and
`reports/quality/coverage/index.html` for annotated source coverage. The initial results
are retained in [the baseline snapshot](quality-baseline.md).

## Metrics and interpretation

| Measurement | Analyzer / definition | Interpretation |
| --- | --- | --- |
| Line, statement, function, branch coverage | Vitest 4.1.11 with `@vitest/coverage-v8` 4.1.11 | Executed counters divided by all instrumented counters. The summary aggregates counts by module and rounds percentages to two decimals; it does not average file percentages. A zero denominator is `n/a`. |
| Per-function cyclomatic complexity | ESLint 10.10.0 `complexity`, classic variant, with `@typescript-eslint/parser` 8.70.0 | Control-flow paths under this analyzer's rules, including conditional/default expressions and optional chaining. Nested functions are measured separately. Class initializers/static blocks may also be reported as implicit functions. |
| Per-function cognitive complexity | `eslint-plugin-sonarjs` 4.2.0, `sonarjs/cognitive-complexity` | An analyzer-specific measure of control-flow and nesting difficulty. Only positive scores appear in the report. Locations are the analyzer's locations and may differ from ESLint's function-start locations. |
| Duplication | jscpd 4.3.0, weak token mode, minimum 70 tokens and 5 lines | Candidate repeated blocks, ignoring comments and whitespace. Reports clone pairs and the tool's duplicated-line estimate. TSX can generate multiple token streams, so its line/source denominator is not the physical file inventory. |
| File size | Repository reporting script, physical lines | Counts blanks and comments, normalizing CRLF/LF and ignoring a final newline as an extra line. A large file is a review candidate, not automatically a design defect. |
| Halstead difficulty | **Deferred / unavailable** | No TypeScript/TSX operator-and-operand analyzer has been validated for this repository. No proxy score is fabricated from file size. |
| CRAP | **Deferred / unavailable** | Would combine per-function complexity with coverage for the same function. Function-range mapping and nested-function attribution have not been validated. |

The proposed CRAP calculation is `C² × (1 − cov)³ + C`, where `C` is classic per-function
cyclomatic complexity and `cov` is the fraction, from 0 to 1, of executable lines covered
inside that same function. Repository or module coverage must not be substituted. A future
implementation must specify nested-function handling and zero executable-line cases before
publishing scores. Both deferred metrics remain explicit in machine-readable reports.

Complexity rules use a reporting threshold of zero so scores can be collected. Their
messages about a maximum of zero are analyzer output, **not policy violations**. Inline
ESLint suppression comments are disabled for this measurement pass. Parser errors or
unrecognized analyzer diagnostics fail collection rather than producing an apparently
clean baseline. The configuration is dedicated to metrics, not a general style linter.

## Scope and limitations

The shared scope in `scripts/quality/scope.mjs` includes first-party production `.ts` and
`.tsx` under `src`, including untested Electron main/preload/worker entry points and UI
components. It excludes test files, the `uiTest.tsx` harness, declaration files, fixtures,
and bundled vendor code from production coverage and complexity. Declaration-only modules
have no executable denominator; a missing executable production file fails the report.

The inventory separates application logic, tests, scripts, data tables, and other JS/TS
configuration files. `periodicTableData.ts` and `periodicTable.ts` are explicitly classified
as data tables. They remain in coverage and complexity because they also contain executable
code, but are excluded from duplication to avoid treating repeated scientific tabular data
as a refactoring target. Tests and scripts receive physical-line inventory, not production
complexity/duplication scores. CSS, HTML, CIF data, and binary assets are outside these metrics.

`node_modules`, generated builds, and the pinned third-party JSmol distribution are excluded.
The first-party JSmol adapter under `src/renderer/src/jsmol` remains included. jscpd receives
an explicit file list and ignores machine-specific Git ignore settings. Its CommonJS API is
used because this version's ESM bundle contains an extensionless `colors/safe` import.

**Coverage represents the Vitest unit run only.** `test:ui`, `test:worker`, `test:viewer`, and
packaged smoke checks run separately and are not instrumented or merged into this report.
Low UI/main-process coverage therefore does not mean those workflows have never been tested.
Conversely, passing those checks does not establish coverage of every path. Pure function
coverage also does not establish that all scientific results or assertions are correct.
External CIF corpora are not required or exercised by the baseline command.

## Reports and provenance

| Artifact | Contents |
| --- | --- |
| `summary.md` | Module coverage, complexity hotspots, largest files, duplication locations, versions, and limitations |
| `baseline.json` | Combined full results, including file-level coverage and all reported complexity findings |
| `metadata.json` | Git HEAD, dirty-tree flag, Node/platform, resolved tool versions, source fingerprint, and lockfile hash |
| `inventory.json` | JS/TS paths, categories, physical lines, and normalized-content SHA-256 values |
| `complexity.json` | Cyclomatic and positive cognitive findings with file, line, column, score, and analyzer message |
| `duplication.json` | Explicit settings and input files, detector totals, and clone locations |
| `coverage/` | HTML, LCOV, and JSON summary; JSON paths are repository-relative after a full baseline run |
| `failure.md` | Error details when collection fails; partial output must not be treated as a completed baseline |

Production content hashes normalize line endings. The source fingerprint hashes the sorted
production inventory, including file names and individual hashes. Modified local checkouts
are explicitly marked dirty: their Git HEAD alone does not identify all inputs. Compare
reports using the same analyzer versions, scope, Node major, and options; version/configuration
changes may change measurements even when application behavior is unchanged. The lockfile
pins transitive dependencies, and the source inventory retains file-level evidence.

## GitHub Actions and rollout

`.github/workflows/code-quality.yml` runs on main-branch pushes, pull requests targeting main,
and manual dispatch. It verifies the reporting helpers, writes the overview to the Actions
job summary, and retains the report directory as `code-quality-<sha>` for 30 days. On PRs,
the SHA is the checked-out merge commit, not necessarily the source branch's tip.

**There are no score gates in this baseline.** High complexity, low coverage, and detected
duplication do not fail it. Failed tests, parser/tool errors, or missing measurements do fail
the reporting job visibly. The existing application CI remains in place. This new job should
not be added as a required quality-score status check during initial baseline collection.

Policy and calibrated thresholds belong to [#20](https://github.com/ogundimo/cif-crystal-data-public/issues/20).
The numerical proposals there are not accepted limits. Start by reviewing the findings with
[#14](https://github.com/ogundimo/cif-crystal-data-public/issues/14) before refactoring #16–#18.
Architecture and unused-code automation remain #24 and #25. Mutation testing remains #19;
it is not required to collect these measurements. No separate service, token, or dashboard
subscription is needed for these reports.

Analyzer references: [Vitest coverage](https://vitest.dev/guide/coverage.html),
[ESLint complexity](https://eslint.org/docs/latest/rules/complexity),
[SonarJS](https://github.com/SonarSource/SonarJS), and
[jscpd](https://github.com/kucherenko/jscpd). Exact installed versions above and in the
lockfile take precedence over examples for newer versions in upstream documentation.
