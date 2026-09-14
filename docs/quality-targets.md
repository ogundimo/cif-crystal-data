# Quality targets and next steps

Recorded on 2026-09-14 so future sessions can use the proposed targets discussed
during the quality-baseline work. These are repository-specific starting proposals,
not universal standards or approved numerical CI gates. Calibrating and adopting
score gates belongs to [#20](https://github.com/ogundimo/cif-crystal-data-public/issues/20).

Read this alongside the [measurement guide](code-quality.md) and the immutable
[initial baseline](quality-baseline.md). The values below are historical baseline
values, not a fresh measurement of every subsequent change.

## Enforced gates

These gates reject findings under their documented scope and exceptions. They do
not prove that all dead code or runtime boundary problems have been eliminated.

| Gate | Reviewed baseline | Current status |
| --- | --- | --- |
| Unused code and dependencies | Zero findings in the #25 scan | Enforced by TypeScript and Knip in CI; [PR #28](https://github.com/ogundimo/cif-crystal-data-public/pull/28) merged and #25 closed |
| Architecture boundaries and cycles | 40 production inputs; zero forbidden dependencies, cycles and unresolved imports | Enforced by dependency-cruiser in CI; [PR #29](https://github.com/ogundimo/cif-crystal-data-public/pull/29) merged and #24 closed |

Architecture scope, counts and provenance are recorded in the
[#24 policy](architecture.md). PR #29 merged as
`2b0275fbaae010352f6203b53c2576f2da748c52` after both hosted workflows passed.
The [Test and build run](https://github.com/ogundimo/cif-crystal-data-public/actions/runs/34815705992)
verified the architecture gate, deliberate-regression probes and existing application
checks. This supersedes the pre-hosted-verification status in the architecture
document's local validation snapshot.

## Advisory targets and proposed ceilings

The following numbers guide investigation and planning; none is a blocking CI
threshold. Historical measurements remain unchanged from the initial baseline.

| Metric | Recorded baseline | Target / action | Status |
| --- | --- | --- | --- |
| Cyclomatic complexity per function | Maximum 43 (`parseCif`) | Aspirational target: <=10 in new or substantially changed functions; review above 20. #20 proposes a ceiling of <22 | Advisory; ceiling requires calibration and adoption in #20 |
| Cognitive complexity per function | Maximum 44 (`simulatePxrd`) | Aspirational target: <=15; review above 20. #20 proposes a ceiling of <22 | Advisory; ceiling requires calibration and adoption in #20 |
| Production file size | Largest files: parser 688, database 662, QuickSearchDialog 610 physical lines | Review files above 500 lines for mixed responsibilities; no automatic splitting requirement | Advisory |
| Overall unit line coverage | 42.53% | First milestone: >=60% | Proposed, not enforced |
| Overall unit statement coverage | 40.73% | First milestone: >=60% | Proposed, not enforced |
| Overall unit function coverage | 33.44% | First milestone: >=50% | Proposed, not enforced |
| Overall unit branch coverage | 36.28% | First milestone: >=50% | Proposed, not enforced |
| New critical logic coverage | No separate baseline for this subset | Aim for >=90% lines and >=85% branches; define the relevant files/functions in each change | Proposed, not enforced |
| Duplication | 1 clone pair, 26 detector lines, 0.31% | Review new clones; no numerical ceiling agreed yet | Advisory; calibrate in #20 |

The aspirational complexity targets describe a preferred direction for new work;
#20's proposed ceilings describe a possible future enforcement limit. They serve
different purposes and neither is approved as a gate. Review above 20 is an early
investigation trigger, not a failure condition. For integer complexity scores,
`<22` would permit at most 21 if adopted. Use the baseline's pinned analyzers when
calibrating these proposals.

## Deferred measurements

| Metric | Current evidence | Next action |
| --- | --- | --- |
| Mutation score | Not measured | Establish the focused #19 pilot, including execution cost and equivalent-mutant handling, before choosing a threshold |
| Halstead difficulty | No validated TypeScript/TSX measurement | Validate an analyzer before evaluating #20's proposed reference value of 80 |
| CRAP | No validated function-level complexity/coverage mapping | Validate attribution before evaluating #20's proposed target of <25 |

These are unavailable measurements, not zero scores. Do not infer them from file
size, repository coverage or other proxy metrics.

## How to apply the proposals

Coverage above is for the Vitest unit suite only. Separate Electron UI, worker,
viewer and packaged smoke runs are not merged into those percentages. Keep those
checks; do not interpret missing unit coverage as proof that a workflow is untested.
Use the same scope, analyzer versions and options when comparing measurements.

Prioritize meaningful assertions and failure paths in parsing, search validation,
database operations and scientific calculations. The critical-logic targets do not
replace the overall coverage milestones, and reaching a percentage does not prove
correctness. Avoid weakening existing well-tested code to meet a lower global target.

Complexity and file-size thresholds trigger investigation. Refactor when doing so
clarifies responsibilities and preserves behavior; do not split functions or files
solely to lower a score. Review duplication for shared semantics before extracting
helpers, particularly where scientific data or intentionally distinct behavior is
involved.

For #20, first compare fresh reports with this baseline, then decide whether to
enforce targets on changed code or use a gradual no-regression policy. Document
scope, exceptions and failure behavior, and verify that intentional regressions
are detected before enabling a numerical gate. This document alone does not
authorize a change to CI thresholds or repository branch protection.

## Work tracked by existing issues

With #13, #14, #16, #17, #24 and #25 completed, **#18: Refactor parser stages**
is the current workstream. [PR #33](https://github.com/ogundimo/cif-crystal-data-public/pull/33)
merged with both hosted checks passing and closed #17. The
[test-gap review](test-gap-review.md) and [quick-search refactor](quick-search-refactor.md)
retain their evidence; the [database refactor](database-refactor.md) records #17's
boundaries and benchmarks, and the [parser refactor](parser-refactor.md) records
#18's stages, metrics and corpus parity. Continue with the #19 mutation pilot. #20
coordinates incremental adoption of the results; #15 remains an independent
supporting workstream.

| Issue | Next deliverable |
| --- | --- |
| [#14](https://github.com/ogundimo/cif-crystal-data-public/issues/14) | Completed in PR #31: priority regression tests and a separate blocking viewer CI step; remaining gaps recorded in the test-gap review |
| [#16](https://github.com/ogundimo/cif-crystal-data-public/issues/16) | Completed in PR #32: quick-search responsibilities separated with characterization checks and measured results |
| [#17](https://github.com/ogundimo/cif-crystal-data-public/issues/17) | Completed in PR #33: database responsibilities separated with native regressions and benchmark evidence |
| [#18](https://github.com/ogundimo/cif-crystal-data-public/issues/18) | Separate parser stages with characterization tests, corpus parity and before/after measurements |
| [#19](https://github.com/ogundimo/cif-crystal-data-public/issues/19) | Pilot mutation testing on a focused, well-tested module and establish a baseline |
| [#20](https://github.com/ogundimo/cif-crystal-data-public/issues/20) | Calibrate these proposals and document which numerical targets become enforced gates |
| [#15](https://github.com/ogundimo/cif-crystal-data-public/issues/15) | Investigate runtime usage that static unused-code analysis cannot establish |

No additional issue is needed merely to record these proposals: policy adoption is
already tracked by #20. Update this record when targets are adopted or work status
changes, while preserving the original measured baseline snapshot.
