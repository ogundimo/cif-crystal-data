# Formula and IT92 mutation survivor review

This review addresses #50 and #78 without modifying production formula or
diffraction behavior. Historical IDs belong to their original reports, not to
newly generated populations. The original [formula report](mutation-results.json)
and [IT92 report](baselines/pxrd-mutation-current.json) remain unchanged.

## Comparable measurements

The current production source differs from the historical IT92 measurement because
the already-merged thirds-translation correction reads rotation terms directly.
Consequently, the new before run uses current production with the pre-review tests;
the after run uses the exact same production bytes and operators with added tests.
Both target formula, PXRD and scattering, use Node 22.23.2/Stryker 10.0.0, two
concurrency slots, the existing TypeScript checker and unchanged timeout settings.
Search validation remains in the separate three-file policy pilot.

The [retained comparison and per-ID decisions](baselines/regression-survivors.json)
record 1,030 identical replacements, measured with tests at `b213933` before and
`bde2341` after. Both completed successfully; wall times were 38m55.5s and 39m13.5s.
Concurrent report ordering is normalized when checking population identity.

| Scope | Killed before → after | Survived before → after | Uncovered before → after | Timeout before → after | Compile errors |
| --- | --- | --- | --- | --- | --- |
| Formula | 96 → 101 | 16 → 11 | 0 → 0 | 1 → 1 | 23 |
| PXRD | 501 → 625 | 184 → 71 | 7 → 0 | 13 → 9 | 165 |
| Scattering | 11 → 21 | 10 → 0 | 0 → 0 | 0 → 0 | 3 |
| Total | 608 → 747 | 210 → 82 | 7 → 0 | 14 → 10 | 191 |

There were no runtime errors or ignored mutants. The displayed score rose from
74.14% to 90.23%; this includes timeouts, which are not assertion kills. Specifically,
128 survivors, all seven fresh uncovered replacements and four prior timeouts became
assertion kills. No previously killed replacement became a survivor. The initial
related-test runs contained 226 and 306 tests respectively.

An initial attempt failed its dry run after 58.2 seconds when the existing
large-reflection test exceeded 5 seconds during concurrent coverage collection.
It produced no valid measurement. The completed retry used the same timeouts.

## Formula decisions

All 16 historical survivors are reviewed against the supported flat, comma-separated
moiety grammar: a body has whitespace-separated element counts and optional charge
tokens; a numeric prefix may multiply one parenthesized body. Nested groups and
commas inside a parenthesized body are not supported. Empty outer components are
currently skipped; this review does not silently tighten or expand that behavior.

| Historical IDs | Decision |
| --- | --- |
| 1 | Empty quoted/whitespace-only sums should contain no atoms; test token filtering directly through public output. |
| 80 | Whitespace inside a multiplied component must be filtered; assert its elemental totals. |
| 86, 87 | A valid component must not conceal malformed embedded charge tokens; assert rejection in mixed inputs. |
| 124 | A valid component must not conceal a nonempty charge-only component with no atoms. |
| 2, 3, 31, 34, 81, 122 | Retain earlier equivalence reasoning: redundant trim/filtering, harmless extra scan iteration, and zero/nonzero-only element counter. |
| 39, 41, 42, 47, 55 | Differences concern unsupported nested/internal-comma or unmatched-parenthesis syntax. Valid flat bodies do not exercise those differences. Malformed diagnostic text can differ, so these are not claimed equivalent for arbitrary strings. |

No operator is excluded. The tests preserve fractional counts, valid charges,
empty-component behavior and public parser output. A stricter grammar would require
a separately proposed behavior change and compatibility evidence.

## IT92 analysis and assertions

The review covers all 200 historical survivors and seven uncovered replacements.
Classifications distinguish a missing assertion, duplicated public validation,
proven algebraic equivalence, numerical/resource boundary, and extra work. A passing
suite by itself is never evidence of equivalence.

The seven uncovered replacements receive particular attention:

- Integer-matrix return guard: finite integer coefficients can overflow when added
  at a unit vector while yielding zero at the origin. An explicit huge-coefficient
  input reaches that rejection and asserts unsupported status.
- Three legacy cell-length fallbacks in metric validation: per-axis tests check
  nanometre conversion, identical peaks, compatible rotations, incompatible swaps
  and the visible conversion diagnostic.
- Missing atoms, malformed type and inferred-element diagnostic strings: public
  results now assert exact actionable messages and absence of spurious inference.

All seven historical uncovered replacements changed from uncovered to killed in
the fresh comparison. Historical locations are aligned against the changed source
before matching the original expression, operator and replacement; all 207 mappings
are unique and retain both old and current locations.

Other meaningful additions cover signed fractional symmetry with explicitly listed
mixed-element sites; periodic rounded-site deduplication; accepted/rejected radiation
and charge notation; defaults on mixed sites; nonfinite and invalid cell/atom/profile
inputs; inclusive sampling, wavelength and resource limits; high-order cubic Bragg
positions; and single-line export diagnostics.

One initially tempting equivalence is deliberately rejected: changing the sign of
a cross product term is harmless for a triangular reciprocal basis but the same
helper also computes symmetry determinants. The non-reduced cell uses
`G = [[16,-16],[-16,32]]` and `R = [[1,-2],[1,-1]]` in its b/c subspace;
direct multiplication gives `Rᵀ G R = G` and `det(R)=1`, with two nonzero products
in that determinant. Its four explicitly expanded positions provide an independent
public test. No helper is exported solely for mutation testing.

Metric tolerance is checked using a=10 Å, b=4 Å and c=4.00004 Å. A b/c swap changes
the squared-length term by about 0.00032 Å², below the declared largest-length
tolerance 0.001 Å² but above a shortest-length tolerance 0.00016 Å². A larger
mismatch is rejected. This tests the declared tolerance, not experimental accuracy.

For scattering at s²=0, an independent decimal transcription of the Na coefficients
is summed. The 5e-6 absolute assertion tolerance accommodates Gemmi's stored
single-precision values. This is consistent with the existing
[scientific model and reference provenance](scientific-validity.md); all fixtures
are synthetic. No new experimental or corpus-coverage claim is made.

## Supplemental boundary checks

After the complete comparison, a [separate 93-mutant line-range check](baselines/regression-boundaries.json)
took 4m35.6s: 78 killed, ten survived and five compile errors, with no timeouts,
uncovered, runtime errors or ignored mutants. It kills eleven additional targeted
historical survivors (37, 91, 203, 226, 227, 229, 426, 727, 729, 731, 808);
the already killed ID 47 stays killed. Assertions cover leading integer coefficients,
special positions translated below -1, near-degenerate cells, wrong symmetry
component counts, large legacy cells and an oversized profile step with a peak at
the first sampling position. The original full comparison remains unchanged.

A [five-mutant unknown-element check](baselines/regression-element.json) took 39.8s
and killed all five, including full-run survivor 270. The test now distinguishes an
unsupported element from a complete empty pattern. Current-only survivors 576/577
receive explicit duplicate-validation/unused-wrapping reasoning in the review record.
These focused runs preserve operators and source, retain their exact ranges and
input hashes, and do not supply a replacement full-population score.

The final [radiation-default diagnostic check](baselines/regression-diagnostic.json)
took 33.2s and killed historical survivor 542; its other three replacements were
compile errors. This protects the positive default message alongside existing
assertions that explicit radiation metadata suppresses that message.

## Remaining limits

Exact equalities at angular, degeneracy, intensity, metric and work thresholds are
real policies, not automatically equivalent mutants. Likewise, removing a guard
can preserve returned values while performing extra work. Such outcomes remain
visible in the denominator and review record. Resource-admission thresholds do not
establish a performance budget on arbitrary structures. Timeouts remain separate
from assertion kills, and no 100% mutation score is promised.
