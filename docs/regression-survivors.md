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

The comparable measurements are still running. Their per-ID transitions, counts,
duration, hashes and reviewed decisions will be retained before this review is
considered complete. An initial attempt failed its dry run when the existing
large-reflection test exceeded 5 seconds during concurrent coverage collection;
that attempt produced no valid measurement. The retry keeps the same timeouts.

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

## Remaining limits

Exact equalities at angular, degeneracy, intensity, metric and work thresholds are
real policies, not automatically equivalent mutants. Likewise, removing a guard
can preserve returned values while performing extra work. Such outcomes remain
visible in the denominator and review record. Resource-admission thresholds do not
establish a performance budget on arbitrary structures. Timeouts remain separate
from assertion kills, and no 100% mutation score is promised.
