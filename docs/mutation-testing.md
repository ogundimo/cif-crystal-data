# Targeted mutation testing (#19)

Current command behavior and cadence are adopted in [Regression protection](regression-protection.md).
See [the later survivor review](regression-survivors.md) for #50/#78 decisions.
The original pilot measurements below remain historical evidence.

The milestone-3 follow-up is recorded in [PXRD survivor review](pxrd-mutation-review.md).
It retains the original results below, measures new analytic tests against the
unchanged source, and separately validates the replacement IT92 model.

This pilot measures whether tests detect deliberate changes in selected critical
logic. It complements the [unit coverage baseline](code-quality.md); it does not
establish scientific accuracy or replace Electron UI, worker and viewer checks.

## Reproduce

Use Node 22 (at least 22.13) and the lockfile:

```powershell
npm ci
npm run test:mutation
```

Open `reports/mutation/index.html` for source annotations; the same run's structured
results are in `reports/mutation/mutation.json`. Both are generated and ignored by
Git, as is Stryker's `.stryker-tmp` sandbox. Run only one mutation command per
checkout. Reports contain source text; retain them with the corresponding revision.
Only use reports from a completed successful run: a failed local attempt can leave
the preceding run's report files in place.

The pinned toolchain is StrykerJS core, Vitest runner and TypeScript checker
**10.0.0**, with Vitest **4.1.11** and TypeScript **5.9.3** resolved in the lockfile.
`stryker.config.json` is the executable scope:

| Mutated file | Reason |
| --- | --- |
| `src/parser/cif/formula.ts` | Formula token validation, component counts and formatting |
| `src/shared/searchValidation.ts` | Numeric input validation and inclusive search limits |
| `src/renderer/src/pxrd.ts` | Symmetry expansion, diffraction positions/intensities and exported profiles |

All other production modules, tests, declarations, data tables and vendor code are
outside this pilot's mutation denominator. Imported first-party dependencies still
execute normally. Generated builds/reports and bundled viewer assets are omitted
from the sandbox. No mutation operator, individual mutant or static mutant is
disabled. An equivalent survivor stays visible in the score.

The runner uses the existing Vitest configuration and related tests, with per-test
coverage selecting tests for each mutant. Two concurrency slots are shared between
the checker and test runner. The TypeScript checker uses `tsconfig.mutation.json`
and accurate checking (`prioritizePerformanceOverAccuracy: false`) to distinguish
invalid mutations from test detections. The timeout allowance is 5 seconds plus
1.5 times the measured test duration. Initial tests must pass before mutation starts.
No incremental result cache is configured.

This runs pure TypeScript logic in Node. It adds no Electron entry point or IPC
channel and does not import main-process or native database responsibilities into
the renderer. Existing architecture and application checks remain required.

## Reading results

Killed means an assertion/test failed; survived means selected tests passed; no
coverage means no test executed the mutation. Timeout is reported separately and
counts as detected under Stryker's definition. Compile and runtime errors are
invalid, not killed; ignored mutants are also outside the score denominator.
The score is `(killed + timeout) / (killed + timeout + survived + no coverage)`.
Always inspect counts alongside it, especially timeouts and invalid mutations.

The configured 90/70 display bands are presentation defaults, not adopted targets.
`thresholds.break: 0` intentionally imposes no score gate. Tool failures and failing
initial tests still fail the command. Numerical policy belongs to
[#48](https://github.com/ogundimo/cif-crystal-data-public/issues/48), following the
historical proposal in closed #20.

## CI cadence

`.github/workflows/mutation.yml` provides manual dispatch on Windows with Node 22,
a 30-minute job limit and reports retained for 30 days. The pilot merged in PR #42;
run it when changing a targeted module or its tests. Keep routine PR checks fast;
consider a weekly run after several hosted measurements confirm runtime stability.
Policy changes, including cadence and score calibration, belong to #48.

## Initial measurement and follow-up

Measured on Windows with Node **22.23.2** on 2026-09-14. The production source is
unchanged from `6716a927e6a3b2374756f7403e33e3465409809b` (merged parser PR #38).
The initial run used that revision's tests; the follow-up uses this change's tests.

| Initial scope | Killed | Survived | Uncovered | Timeout | Compile error | Score |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Formula | 69 | 38 | 5 | 1 | 23 | 61.95% |
| Search validation | 50 | 13 | 10 | 0 | 37 | 68.49% |
| Diffraction | 195 | 156 | 0 | 5 | 107 | 56.18% |
| Total | 314 | 207 | 15 | 6 | 167 | 59.04% |

There were 709 generated mutants, zero ignored mutants and zero runtime errors.
The 167 compile errors include removed return bodies (TS2355) and mapping an empty
callback into a typed array (TS2322). They are invalid TypeScript, not successful
test detections. Six timeouts included reversed loop increments and a mutation
that expands the diffraction search bounds. They are not six assertion kills.

The initial run took **18 minutes 50 seconds**, including 127 related tests in its
initial run. Keep the configured two-slot concurrency when comparing this cost;
it is a local observation, not a hosted CI estimate. A follow-up attempt failed
during its initial test run and produced no valid measurement; it was retried
without changing the timeout or excluding any mutants.

The completed follow-up took **21 minutes 4 seconds**, with 180 related tests in
its initial run, using the same 709 mutants and configuration:

| Follow-up scope | Killed | Survived | Uncovered | Timeout | Compile error | Score |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Formula | 96 | 16 | 0 | 1 | 23 | 85.84% |
| Search validation | 73 | 0 | 0 | 0 | 37 | 100.00% |
| Diffraction | 273 | 78 | 0 | 5 | 107 | 78.09% |
| Total | 442 | 94 | 0 | 6 | 167 | 82.66% |

All 128 status changes were to killed: 113 former survivors and all 15 uncovered
mutants. Invalid, timeout and ignored counts did not change. Excluding timeout
detections, assertion/test kills account for 81.55% of valid mutants (442/542).
There are still zero runtime errors, ignored or pending mutants. The
[machine-readable comparison](mutation-results.json) preserves per-file counts,
input hashes, all status changes and the remaining mutant IDs/replacements.
Of the 94 survivors, 12 are reviewed equivalents below; **82 remain open**, not
certified equivalent. These two local timings support manual runs for now, with
weekly automation considered after hosted timing evidence.

The expanded suite addresses concrete gaps exposed by the report:

- Formula token anchors, implicit/fractional counts, multi-digit component
  multipliers, charge tokens, invalid components and count rounding.
- Inclusive search endpoints and equal bounds, reversed bounds on all three
  axes, whitespace, non-finite numbers and actionable validation messages.
- Independent monoclinic Bragg positions and orthorhombic mixed-element
  interference ratios, including hydrogen; signed/fractional symmetry operations;
  wavelength fallbacks, reflection labels and Gaussian profile truncation.

These tests exercise public module behavior. No production implementation was
changed or exported solely to make it easier to mutate. Unit count increased from
272 in 22 files to **325 in 23 files**.

Local validation also passed the production build, Electron search UI, native
SQLite/import-worker regressions, JSmol viewer checks, TypeScript/Knip and both
unused-code and architecture deliberate-regression probes. The architecture scan
reported 57 inputs and zero violations. Hosted mutation execution was subsequently
verified on the merged revision, as recorded below.

## First hosted verification

The [manual run](https://github.com/ogundimo/cif-crystal-data-public/actions/runs/35048065514)
on merged revision `0b4458d79f4f1b96a85341b43831721b599787ee` passed and uploaded
its reports. It matched the local outcome totals: 442 killed, 94 survived, six
timeouts, 167 compile errors, and zero uncovered, runtime-error or ignored mutants;
709 total and an 82.66% score. Its initial run passed 180 relevant tests.

| Measurement | Duration |
| --- | --- |
| Dispatch to completion | 17m08s |
| Queue/start delay | 4s |
| Job duration | 17m04s |
| Dependency installation | 1m32s |
| Mutation command step | 14m52s |
| Stryker internal execution timer | 14m48s |

GitHub recorded creation at 2026-09-16 02:27:41 UTC, job start at 02:27:45 and
completion at 02:44:49. The internal Stryker timer is comparable to the local
21m04s timer; the command-step and total durations also include other work.
This is one hosted observation, not a guaranteed runtime. The manual cadence and
30-minute job limit were retained at that stage and are preserved by the later
[adopted policy](regression-protection.md). The historical local comparison
and its input hashes remain intact; this hosted run used the corrected lockfile.

## Dependency exception

The new development-only Stryker dependency chain brings `typed-rest-client`,
which pins `qs` 6.15.1. The narrow package override upgrades only that consumer to
patched **qs 6.16.0**; no advisory is suppressed. The install audit then returned
to three pre-existing findings (`@xmldom/xmldom`, `baseline-browser-mapping`,
`browserslist`), outside this pilot's dependency change. Recheck the override when
updating Stryker and remove it once the upstream chain resolves a patched version.
The initial measurement preceded this override; the follow-up includes it. Stryker,
Vitest, TypeScript, mutation settings and production source remained the same.

PR #42's first hosted runs failed during dependency installation because the
lockfile omitted optional `@emnapi/core` and `@emnapi/runtime` 1.11.3 entries.
The follow-up restores those entries without changing existing package versions.
The recorded mutation input hashes remain the historical measurement from
`3ac5b93`; the corrected lockfile is not presented as a new mutation measurement.
A clean isolated install with Node 22.23.2/npm 10.9.8 passed using
`npm ci --ignore-scripts`. The full local install passed lockfile validation but
could not compile SQLite without Visual Studio C++ tools; full install/build
verification subsequently passed in the
[PR #42 application checks](https://github.com/ogundimo/cif-crystal-data-public/actions/runs/35045680188)
and [quality report](https://github.com/ogundimo/cif-crystal-data-public/actions/runs/35045680194),
with install scripts enabled.

## Survivor decisions

Mutant IDs refer to this pinned toolchain and unchanged target source; they may
change after edits or tool upgrades. These reviewed equivalents remain enabled:

| Initial mutant IDs | Reason |
| --- | --- |
| Formula 2, 3, 81 | Removing the sum's trim, or splitting on one whitespace character rather than a run, produces the same tokens after empty tokens are filtered. |
| Formula 31 | Outer moiety whitespace is already removed when each component is processed; whitespace does not affect the parenthesis/comma scan. |
| Formula 34 | One extra loop iteration reads `undefined`; none of the three character comparisons matches and no state changes. |
| Formula 122 | Decrementing the parsed-element counter still distinguishes zero tokens from a nonzero count; no consumer uses its magnitude or sign. |
| Diffraction 351, 357 | Changing `> 0` to `>= 0` does not admit zero because the preceding truthiness check already excludes it. |
| Diffraction 493, 495 | Negating the complete real or imaginary sum leaves its square unchanged in the intensity calculation. |
| Diffraction 461, 464 | Allowing sine values exactly zero or one reaches the later angle-range check, which rejects 0 or 180 degrees. |

Other survivors are **not presumed equivalent**. In particular, tolerance equality
boundaries, near-degenerate cells, general triclinic geometry, representative labels
and accumulated intensity for merged peaks, formula empty-component/embedded-charge
handling, and reflection/profile loop bounds need further domain-specific
review. Some alter work performed without changing ordinary returned values. The
pilot deliberately leaves these visible instead of adding private-helper tests,
weakening production checks or suppressing operators merely to improve the score.
Formula survivors are tracked in [#50](https://github.com/ogundimo/cif-crystal-data-public/issues/50),
PXRD survivors in [#51](https://github.com/ogundimo/cif-crystal-data-public/issues/51),
and mutation policy in #48. Use these findings in that work; this pilot
does not claim that every meaningful survivor has been eliminated.

## Tool references

See the official [Vitest runner](https://stryker-mutator.io/docs/stryker-js/vitest-runner/),
[TypeScript checker](https://stryker-mutator.io/docs/stryker-js/typescript-checker/),
[configuration](https://stryker-mutator.io/docs/stryker-js/configuration/) and
[mutant state definitions](https://stryker-mutator.io/docs/mutation-testing-elements/mutant-states-and-metrics/).
