# Incremental regression protection

Current guidance: enforced coverage and complexity rules, baseline governance, and
advisory mutation comparisons. Recorded pilot results remain historical evidence.

This policy implements #44–#46 and #48. The formula and replacement-model
survivor reviews are recorded in [mutation survivor review](regression-survivors.md).
Historical measurements remain unchanged. The [duplication policy](duplication-policy.md)
implements #47 separately. The old 60/60/50/50 coverage goals remain advisory;
there is no blanket 100% mutation target.

## Reproduce and review

Use Node 22.13+ on the Node 22 line and `npm ci`:

```powershell
npm run quality:test
npm run quality:baseline
npm run quality:regression -- --base origin/main
npm run test:mutation:dev -- --file <changed pilot file>
```

The existing required **Test and build** job runs the numerical gates and policy
probes. The separately named **Advisory quality report** also runs the gate; its
historical status name is retained. Both retain measurements and failures for
30 days. Unit/UI/worker/viewer, architecture and unused-code checks remain intact.
Mutation testing is on demand and advisory, with no CI workflow; see
[cadence](mutation-testing.md#cadence). The complete `npm run test:mutation` is
reserved for updating the comparison reference. Execution failures fail both
mutation commands.

## Coverage

The [versioned baseline](baselines/regression-policy.json) stores integer covered
and total counters for every production file and all four dimensions. Initial
aggregate floors are 1720/3074 lines (55.95%), 2080/3809 statements (54.61%),
364/851 functions (42.77%) and 1434/2896 branches (49.52%). Comparisons use exact
fractions, not rounded displayed percentages. These measurements include the new
survivor tests and all existing production code at `b213933`.

Each existing file and the aggregate must retain its baseline ratio in every
dimension. Added code in a changed file participates in the complete file's
denominator. Gains elsewhere cannot conceal that file's regression. This is a
file-level policy, not a claim to measure changed-line coverage. Improvements pass
without updating the baseline; a reviewed snapshot can later ratchet floors up.
Existing zero-coverage UI/entry files remain at zero rather than pretending unit
tests cover Electron execution. Such a floor does not protect new logic in those
files; meaningful workflow and unit assertions remain review responsibilities.

New files must meet the initial aggregate ratio in each nonempty dimension and
cannot introduce a wholly uncovered executable dimension. A newly executable
dimension in an existing file whose old denominator was zero requires full coverage.
Zero denominators are n/a, never an invented 100%. Deleted files stop contributing
to the current aggregate, which still must pass. Declaration-only modules may omit
counters only after TypeScript emission confirms there is no executable code.
Missing executable files, invalid counters, mismatched totals and reports collected
with different source/tests/configuration fail. Coverage is exclusively the Vitest
unit run; Electron results are neither instrumented nor added to its percentages.

Scope remains [scope.mjs](../scripts/quality/scope.mjs): first-party production TS/TSX,
including untested entries and data tables; tests, declarations, fixtures, the UI
harness and vendor code are excluded. The scope/configuration hashes and pinned
analyzer versions are part of the baseline contract. Changing exclusions cannot
quietly improve a reported result.

## Function complexity

Both classic ESLint cyclomatic and SonarJS cognitive complexity have an initial
default ceiling of **20**. The historical advice called for review above 20; this
policy uses that review boundary for new functions instead of forcing all existing
functions below the previously proposed 22. Lower aspirations (10 cyclomatic,
15 cognitive) remain guidance. The two metrics are compared independently.

There are 13 existing cyclomatic and 16 cognitive exceptions after
[targeted simplification](targeted-simplification.md) removed the two parser/PXRD
allowances from each metric. Each records the
function identity, source location, measured maximum, responsibility-based reason
and review trigger in the baseline. Existing exceptions cannot grow beyond their
recorded value. All accepted exceptions remain visible in console output and
`reports/quality/regression.json`; no file or operator is ignored. Their presence
is a constraint on future growth, not a claim that these functions are easy to maintain.

Identities use file paths and lexical function names, including owning functions,
class names and ordinal anonymous callbacks. Line shifts preserve identity.
Renames/moves are new functions and receive the default limit; exceptions are not
transferred heuristically. Reordering anonymous siblings can require explicit
review. Class field initializers and static blocks are included as the analyzer's
implicit functions. Changed functions retain their identity and allowance; new
functions must meet 20. Existing functions below 20 can grow up to that ceiling.
The parser and PXRD extraction and retained-hotspot decisions are recorded in
[targeted simplification](targeted-simplification.md).

## Baseline governance

`npm run quality:regression:capture -- "review rationale"` writes a **candidate**
baseline from complete current measurements. Review the entire diff, every
exception reason and the provenance; it is not an automatic acceptance command.
Do not replace specific reasons with the candidate generator's generic defaults.

On PRs CI compares both the current code and proposed baseline to the target
branch's baseline, fetched by immutable SHA. On pushes it uses the previous SHA.
Lowering floors, increasing ceilings/waivers, removing baseline scope, or changing
measurement contracts fails even if the new snapshot would pass itself. The first
adoption explicitly reports that no previous policy exists. Deliberate analyzer,
scope or deleted-file baseline migrations therefore need a separately reviewed
policy/workflow migration; there is no environment-variable bypass or automatic
reset. Capture alone never changes an enforced allowance. Branch protection still
requires the existing Test and build status.

## Mutation policy

The command wraps the unchanged three-file Stryker pilot (formula, search validation,
PXRD). Scattering is exercised in the separately retained #78 review, not silently
added to the pilot. A wrapper removes named old output reports before starting and
records start/end, duration, commit, tool/configuration hashes, production hashes
and test inputs. Failed initial tests, runner errors, missing/malformed reports,
pending mutants, source mismatches and inputs changed during execution all fail.
Ignored mutants are rejected because no exclusion policy has been adopted.

Reports keep killed, survived, uncovered, timeout, compile error, runtime error and
ignored outcomes separate. Timeouts count in Stryker's displayed detection score
but are not assertion kills. Invalids do not count as detections. Reviewed equivalent
mutants remain enabled and in the denominator. Scores and survivor/uncovered changes
are advisory; they never convert failed execution into a pass.

Comparable runs require unchanged production inputs, mutation population, operator
configuration, Node major, lockfile and analyzer versions. Test changes are retained
as provenance and may be compared. Changed contracts explicitly report **not
comparable**, with no claimed improvement. There is no score-based failure and no
schedule: the earlier hosted mutation step took 14m52s and the full replacement
model local run took 28m44s. This evidence does not justify a stricter timeout or
weekly automation. Run manually for changes to the pilot source or its tests.

The initial [mutation comparison reference](baselines/mutation-policy.json) retains
the completed historical 709-mutant pilot (442 killed, 94 survived, six timeouts,
167 compile errors). Its source hashes and counts were checked against the retained
raw report and [original record](mutation-results.json). Its old model and missing
full-production fingerprint are explicitly **not comparable** to current IT92 runs.
After a completed current pilot, review `reports/mutation/policy.json` alongside
`execution.json` and the raw report, then update the reference in a PR with its
provenance and rationale. Never copy a score from a failed run or overwrite the
historical record. Test and fixture hashes are retained separately; production JSON
coefficient tables participate in the comparison contract.

Policy probes test completed advisory runs, deliberate survivors/uncovered mutants,
failed execution, stale/missing reports, ignored/pending results and baseline/config
changes without repeatedly spending a full mutation run. Population identity is
independent of concurrent result order. The assessor was also exercised against the
actual completed 1,030-mutant before/after review and correctly reported comparable
outcomes; that separate scope does not replace a hosted run of the default pilot.
Analyzer probes actually
insert branching/nesting and check the named function's failure. Coverage probes
include loss in an exercised file, a new untested file, zero denominators and normal
improvements. These checks supplement application regressions; they do not establish
scientific correctness or exhaustive fault coverage.
