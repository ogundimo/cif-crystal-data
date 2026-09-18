# Quality targets and next steps

Current coverage, cyclomatic/cognitive complexity and mutation policies are in
[Regression protection](regression-protection.md). The historical snapshots and
proposals below remain evidence, not the current enforcement configuration.
Milestone 7's parser/PXRD extraction, boundary evidence and duplication decision
are recorded in [Targeted simplification](targeted-simplification.md).

The historical record below follows completed [PR #42](https://github.com/ogundimo/cif-crystal-data-public/pull/42) and the first successful
hosted mutation run. Numerical targets remain proposals; this documentation update
introduces no thresholds or repository-setting changes.

Read the [measurement guide](code-quality.md) alongside the immutable
[initial baseline](quality-baseline.md). The comparison below keeps initial values
separate from the newer snapshot at revision
`0b4458d79f4f1b96a85341b43831721b599787ee`. It does not claim that future revisions
have the same scores.

## Evidence and enforcement

- [Main quality report](https://github.com/ogundimo/cif-crystal-data-public/actions/runs/35046896794): coverage, complexity,
  duplication and inventory at the snapshot revision.
- [Passing PR #42 application checks](https://github.com/ogundimo/cif-crystal-data-public/actions/runs/35045680188): build,
  unit/UI/worker/viewer checks, unused-code and architecture gates and their
  deliberate-regression probes.
- [First hosted mutation run](https://github.com/ogundimo/cif-crystal-data-public/actions/runs/35048065514): successful manual
  run at the same snapshot revision.

| Check | Status at the historical snapshot | Policy / owner |
| --- | --- | --- |
| Strict typing, unused code and dependencies | Enforced; zero unused-code findings in the reviewed PR #42 checks | TypeScript and Knip; #25 completed in PR #28; [policy](code-quality.md#unused-code-regression-gate-25) |
| Architecture boundaries and cycles | Enforced; 57 production inputs, zero violations in the reviewed #19 work | dependency-cruiser; #24 completed in PR #29; [policy](architecture.md) |
| Application tests and build | Enforced, including separate Electron UI, worker and viewer checks | Existing Test and build workflow |
| Coverage, complexity and duplication scores | Advisory; tool/report failures fail CI, numerical scores do not | [#44], [#45], [#46], [#47] |
| Mutation score | Advisory manual workflow; execution failures fail, score threshold is zero | [#48] |

The original architecture snapshot had 40 production inputs; the later count is
57 after responsibility extractions. This does not replace the historical
[#24 snapshot](architecture.md). Static checks do not prove absence of all runtime
boundary problems or dynamically used code.

## Advisory targets and proposed ceilings

No numerical target below was blocking at that snapshot. Use consistent analyzer versions and scope;
complexity reporting thresholds of zero collect findings and are not accepted limits.

| Metric | Initial baseline | Snapshot at 0b4458d | Proposed target / next owner |
| --- | --- | --- | --- |
| Cyclomatic complexity per function | Maximum 43 (`parseCif`) | Maximum 43 (`normalizeCif`) | Aspirational <=10 for new/substantially changed functions; review above 20. Historical <22 ceiling remains unadopted; [#45] calibrates policy, [#52] owns the normalization refactor |
| Cognitive complexity per function | Maximum 44 (`simulatePxrd`) | Maximum 44 (`simulatePxrd`) | Aspirational <=15; review above 20. Historical <22 ceiling remains unadopted; [#46] calibrates policy, [#53] owns the PXRD refactor |
| Production file size | Parser 688, database 662, QuickSearchDialog 610 physical lines | Largest: `App.tsx`, 412 lines; all production files below 500 | Review mixed responsibilities above 500 lines; no automatic splitting requirement |
| Overall unit line coverage | 42.53% | 48.65% | First milestone >=60%; incremental policy in [#44] |
| Overall unit statement coverage | 40.73% | 47.48% | First milestone >=60%; incremental policy in [#44] |
| Overall unit function coverage | 33.44% | 36.82% | First milestone >=50%; incremental policy in [#44] |
| Overall unit branch coverage | 36.28% | 45.16% | First milestone >=50%; incremental policy in [#44] |
| New critical logic coverage | No separate subset baseline | Still no consistently defined changed-code subset | Aim for >=90% lines and >=85% branches after defining the relevant scope; [#44] |
| Duplication | 1 clone pair, 26 detector lines, 0.31% | 1 clone pair, 26 detector lines, 0.32% | No agreed ceiling; [#47] owns policy, [#56] reviews the existing writer clone |

The refactors reduced file sizes and separated responsibilities, but did not
eliminate the largest function-level hotspots. The duplication percentage changed
while the pair and duplicated-line counts stayed the same: the detector denominator
changed, not the clone count.

Aspirational targets describe a preferred direction for new work; proposed ceilings
describe possible enforcement limits. Neither had been adopted at that snapshot. For integer
complexity scores, <22 would permit at most 21 if adopted.

## Mutation evidence and hosted timing

[#19](https://github.com/ogundimo/cif-crystal-data-public/issues/19) completed in [PR #42](https://github.com/ogundimo/cif-crystal-data-public/pull/42).
The three-file pilot covers formula parsing, shared search validation and PXRD.
It improved from 59.04% initially to **82.66%** after stronger tests. The first
hosted run matched the local outcome totals:

| Killed | Survived | Uncovered | Timeout | Compile error | Runtime error | Ignored |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 442 | 94 | 0 | 6 | 167 | 0 | 0 |

There are 709 mutants. Of the 94 survivors, 12 are reviewed equivalents and 82
remain open. Timeouts count as detected under Stryker's definition; invalid and
ignored mutants are outside the score denominator. See the
[mutation record](mutation-testing.md) and historical
[machine-readable comparison](mutation-results.json) for scope and decisions.

| First hosted run measurement | Duration |
| --- | --- |
| Dispatch to completion | 17m08s |
| Queue/start delay | 4s |
| Job duration | 17m04s |
| Dependency installation | 1m32s |
| Mutation command step | 14m52s |
| Stryker internal execution timer | 14m48s |

These are distinct clocks from the [same successful run](https://github.com/ogundimo/cif-crystal-data-public/actions/runs/35048065514),
created at 2026-09-16 02:27:41 UTC and completed at 02:44:49 UTC. The local
follow-up's internal Stryker timer was 21m04s. One hosted observation does not
guarantee future runtime or justify a new schedule/threshold by itself. The workflow
remains manual with a 30-minute job limit; [#48] owns any policy change.
[#50] and [#51] own unresolved formula and PXRD survivor investigations.

## Deferred measurements

| Metric | Availability | Next owner |
| --- | --- | --- |
| Halstead difficulty | No validated TypeScript/TSX operator-and-operand measurement | [#54] validates reporting before considering the historical reference value of 80 |
| CRAP | No validated function-level complexity/coverage join | [#55] validates attribution before considering the historical target of <25 |

These are unavailable measurements, not zero scores. Do not infer them from file
size, repository coverage or other proxies. Neither has an enforced target.

## How to apply the proposals

Coverage above is for Vitest unit tests only. Separate Electron UI, worker, viewer
and packaged smoke results are not merged into these percentages. Keep those checks;
missing unit coverage alone does not prove a workflow is untested.

Prioritize meaningful assertions and failure paths in parsing, search validation,
persistence and scientific calculations. Critical-logic targets do not replace
overall milestones, and a percentage does not prove correctness. Do not weaken
well-tested code to meet a lower global target.

Complexity and file-size findings trigger investigation. Refactor to clarify
responsibilities while preserving behavior; do not split solely to lower scores.
Review clones for shared semantics before extracting helpers.

For each policy issue, compare fresh evidence with the recorded baseline, define
scope and failure behavior, review narrow exceptions and verify intentional
regressions are detected. Baseline updates must be explicit and reviewable; do not
silently reset them to hide regressions. This document does not authorize changes
to thresholds or branch protection.

## Work ownership and sequence

#13, #14, #16, #17, #18, #19, #24 and #25 are completed. The
[test-gap review](test-gap-review.md), [quick-search refactor](quick-search-refactor.md),
[database refactor](database-refactor.md) and [parser refactor](parser-refactor.md)
retain their evidence and limitations.

[#20](https://github.com/ogundimo/cif-crystal-data-public/issues/20) is **closed** with a completed state reason.
Its closure does not mean its proposed numerical gates were implemented. It remains
a historical proposal; the focused issues below own the remaining work. This update
neither reopens #20 nor treats it as an active implementation owner.

| Issue | Single deliverable |
| --- | --- |
| [#43] | This documentation refresh |
| [#44] | Incremental unit-coverage regression gate |
| [#45] | Incremental cyclomatic-complexity gate |
| [#46] | Incremental cognitive-complexity gate |
| [#47] | Incremental duplication regression gate |
| [#48] | Evidence-based mutation regression policy |
| [#49] | Renderer search-orchestration unit regressions |
| [#50] | Formula-parser mutation survivor investigation |
| [#51] | PXRD mutation survivor investigation |
| [#52] | Reduce branching complexity in `normalizeCif` |
| [#53] | Reduce control-flow complexity in `simulatePxrd` |
| [#54] | Trustworthy Halstead difficulty reporting |
| [#55] | Trustworthy function-level CRAP reporting |
| [#56] | Semantic review of the existing database-writer clone |
| [#15](https://github.com/ogundimo/cif-crystal-data-public/issues/15) | Existing runtime-tracing workstream |
| [#39](https://github.com/ogundimo/cif-crystal-data-public/issues/39) | Existing PXRD scientific-validation workstream |

Finish #43 first, then begin #44. Follow each issue's dependencies: the PXRD
refactor follows its survivor tests and cognitive policy; the writer clone review
follows duplication policy. Runtime tracing and deferred-measurement validation
can proceed independently. Do not duplicate scientific model work owned by #39 or
recovery/responsiveness work in #41.

Update this record when measurements, policies or work status change, preserving
the immutable initial baseline and historical mutation comparison.

[#43]: https://github.com/ogundimo/cif-crystal-data-public/issues/43
[#44]: https://github.com/ogundimo/cif-crystal-data-public/issues/44
[#45]: https://github.com/ogundimo/cif-crystal-data-public/issues/45
[#46]: https://github.com/ogundimo/cif-crystal-data-public/issues/46
[#47]: https://github.com/ogundimo/cif-crystal-data-public/issues/47
[#48]: https://github.com/ogundimo/cif-crystal-data-public/issues/48
[#49]: https://github.com/ogundimo/cif-crystal-data-public/issues/49
[#50]: https://github.com/ogundimo/cif-crystal-data-public/issues/50
[#51]: https://github.com/ogundimo/cif-crystal-data-public/issues/51
[#52]: https://github.com/ogundimo/cif-crystal-data-public/issues/52
[#53]: https://github.com/ogundimo/cif-crystal-data-public/issues/53
[#54]: https://github.com/ogundimo/cif-crystal-data-public/issues/54
[#55]: https://github.com/ogundimo/cif-crystal-data-public/issues/55
[#56]: https://github.com/ogundimo/cif-crystal-data-public/issues/56
