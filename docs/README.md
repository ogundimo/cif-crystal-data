# Documentation index

Start with the [project README](../README.md) for installation and everyday use.
For contributions, read [Architecture](architecture.md) and
[Data preservation](data-preservation.md), then the measurement and testing guides
below. Live work, dependencies and delivery status belong to
[GitHub issues](https://github.com/ogundimo/cif-crystal-data/issues) and
[milestones](https://github.com/ogundimo/cif-crystal-data/milestones).

## Current guidance

These pages describe supported behavior, reproducible procedures or adopted policy.
Mixed pages identify historical evidence or proposals in their relevant sections;
recorded test counts and timings apply only to their stated revisions and workloads.

| Document | What to read it for |
| --- | --- |
| [Architecture](architecture.md) | Layer boundaries, worker isolation and the enforced dependency gate; includes its original baseline. |
| [Data preservation](data-preservation.md) | Source/block identity, managed bytes, migration, backup, restore and export contracts. |
| [Import and search reliability](import-search-reliability.md) | Cancellation, bibliography, tracing and search lifecycle; includes historical coverage and packaged evidence. |
| [Batch export](batch-export.md) | Selection snapshots, CSV fields, cancellation and recovery; includes a dated packaged run. |
| [Viewer and PXRD comparison](viewer-comparison.md) | Comparison controls, viewer measurements, polyhedra and implementation evidence. |
| [Scientific validity](scientific-validity.md) | PXRD assumptions, reference comparisons, tolerances and unsupported inputs. |
| [Scientific recovery](scientific-recovery.md) | Failure and responsiveness contracts, reproduction commands and dated validation. |
| [Windows release acceptance](release-validation.md) | Packaged publication gate, artifact evidence, and manual installer/upgrade/uninstall/portable checks. |
| [Code-quality measurements](code-quality.md) | Measurement commands, report interpretation, scope and unused-code enforcement. |
| [Regression protection](regression-protection.md) | Enforced coverage/complexity rules and baseline governance; advisory mutation comparisons. |
| [Duplication policy](duplication-policy.md) | Enforced clone comparison and the evidence supporting the retained writer allowance. |
| [Mutation testing](mutation-testing.md) | Reproduction and result interpretation; later sections preserve the original pilot history. |
| [Startup baseline](startup-baseline.md) | Development-startup reproduction and comparison rules; preserves original reference samples. |
| [Cold-start protocol](cold-start-protocol.md) | Packaged startup acceptance procedure; budget suggestions remain proposals. |
| [Screenshot capture and sample provenance](images/README.md) | Regenerate screenshots in an isolated profile and review their contents. |
| [Synthetic rock-salt sample](samples/rocksalt-demo.cif) | MIT-licensed illustrative CIF used by screenshots and viewer checks, not experimental data. |

The executable commands live in [package.json](../package.json). Check
[Test and build](../.github/workflows/ci.yml) and
[the quality-report workflow](../.github/workflows/code-quality.yml) when changing policy.
Mutation testing has no workflow; it runs on demand ([cadence](mutation-testing.md#cadence)).
The quality-report job name does not make its coverage, complexity or duplication
regression checks advisory. Mutation scores and proposed numerical targets are
distinct from these enforced checks.

## Historical evidence

These records preserve decisions, measurements and validation at named revisions.
They are useful rationale and reproduction context, not a current backlog or a
claim that today's checkout has the same scores. Original JSON reports in
[baselines](baselines/) and [evidence](evidence/) retain their own provenance;
policy baseline JSON files are also active inputs to the documented gates.

| Document | Evidence retained |
| --- | --- |
| [Initial quality baseline](quality-baseline.md) | Original coverage, complexity, duplication, inventory and analyzer versions. |
| [Additional measurement evaluation](additional-measurements.md) | CRAP attribution contract, Halstead counting fixtures, reproducible candidate failures and retained deferral decisions. |
| [Test-gap review](test-gap-review.md) | Review scope, added regressions, viewer CI decision and gaps at the review date. |
| [Unused-code review](unused-code-review.md) | Removal/retention decisions and the later automation review. |
| [Quick-search refactor](quick-search-refactor.md) | Responsibility boundaries, comparable measurements and UI regressions. |
| [Database refactor](database-refactor.md) | Persistence/query extraction, native tests and performance evidence. |
| [Parser refactor](parser-refactor.md) | Stage contracts, complexity measurements and bounded corpus evidence. |
| [Targeted simplification](targeted-simplification.md) | Parser/PXRD extraction, boundary assertions, mutation evidence and writer review. |
| [Formula and IT92 survivor review](regression-survivors.md) | Comparable mutation populations, assertions and survivor decisions. |
| [PXRD survivor review](pxrd-mutation-review.md) | Analytic checks, original-model survivors and replacement-model evidence. |
| [Original mutation pilot](mutation-testing.md#initial-measurement-and-follow-up) | Initial measurements, hosted timing and original survivor decisions. |
| [Development startup investigation](startup-investigation.md) | Dated profiling, proposed experiments and subsequent implementation measurements. |
| [Packaged startup validation](packaged-startup-validation.md) | Build-specific correctness checks, instrumented launch timings and missing evidence at that date. |

## Proposals

Proposals explain possible targets or experiments; they do not establish enforced
gates or replace acceptance decisions in the relevant issue.

- [Quality targets and historical proposals](quality-targets.md): earlier numerical
  aspirations and snapshots, plus measurement prerequisites for Halstead and CRAP.
  Use the current regression policies above for adopted limits.
- [Cold-start budgets](cold-start-protocol.md#budgets-and-interpretation): discussion
  targets requiring workload agreement and actual cold-start evidence.
- [Startup experiments proposed at the investigation date](startup-investigation.md#proposed-experiments-at-the-investigation-date):
  historical alternatives explaining the subsequent implementation, not a delivery queue.

## Maintenance

Keep supported behavior, contracts, commands, scientific limits and reproduction
instructions in documentation. Keep live progress, owners, dependencies, next
deliverables and open/closed status in GitHub issues, PRs and milestones; link to
them instead of copying a work queue into a page.

Use short status notes near a page's start when its role could be unclear. For
mixed pages, label the historical or proposed sections rather than assigning the
entire page one status. Preserve dates, revisions, measured values, validation
failures and provenance. Add a separately scoped record for new measurements;
never rewrite an old snapshot as the current result.

When guidance changes, check its scripts and workflow configuration, update this
index, and verify relative links, heading anchors and rendered Markdown. Keep
assets at stable paths. Before tracking additional work, search existing issues
and link evidence and acceptance criteria to the appropriate issue and milestone.
