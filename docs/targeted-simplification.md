# Targeted code simplification

Milestone 7 covers [#52](https://github.com/ogundimo/cif-crystal-data/issues/52),
[#53](https://github.com/ogundimo/cif-crystal-data/issues/53),
[#47](https://github.com/ogundimo/cif-crystal-data/issues/47),
[#56](https://github.com/ogundimo/cif-crystal-data/issues/56) and
[#83](https://github.com/ogundimo/cif-crystal-data/issues/83).
Its pre-change reference is `5e23e57dfc7927d1f51fbc10a7b3f0e7e6d64eff`.
Historical quality/mutation records remain unchanged.

## Responsibilities and measured complexity

Normalization now separates formula, lengths, geometry, space group, publication,
radiation and authors. Required-field validation retains its original order,
including formula before lengths before space group. Missing-value fallback rules,
nanometre search columns, ångström columns, scalar/loop author precedence and the
public parser facade remain unchanged.

The old `simulatePxrd` hotspot had already moved into `calculatePeaks` as part of
scientific validation; `simulatePxrd` remains the public thin wrapper. This change
separates reflection enumeration, reciprocal geometry, atomic interference and
peak merging/normalization. It preserves signed enumeration order, arithmetic
evaluation order, the first enumerated merged-family label, weighted positions,
normalization, wavelength overrides, diagnostics, profiles and exported text.
Everything remains in the same portable calculation module. Worker scheduling,
IPC, rendering and the IT92 model are unchanged.

Measurements use the same pinned ESLint classic and SonarJS analyzers on Node
22.23.2. Values below are cyclomatic / cognitive complexity.

| Function or group | Before | After |
| --- | --- | --- |
| `normalizeCif` | 44 / 26 | 4 / 2 |
| New normalization helpers, maximum | n/a | 10 / 5 |
| `calculatePeaks` | 28 / 36 | 6 / 1 |
| `reflectionIntensity` | Within old function | 2 / 1 |
| `reflectionPeak` | Within old function | 6 / 3 |
| `excludedFriedelMember` | Within old function | 9 / 3 |
| `enumerateReflections` | Within old function | 6 / 14 |
| `mergeReflections` | Within old function | 5 / 6 |

The obsolete `normalizeCif` and `calculatePeaks` allowances are removed from both
complexity policies. All extracted functions meet the existing ceiling of 20;
coverage floors, analyzer contracts and other ceilings are not lowered.

Two unchanged scientific hotspots retain narrow allowances: `calculatePxrd`
(45 / 35) deliberately keeps ordered public input validation and diagnostics
together; `parseCoordinate` (14 / 25) implements the symmetry-expression grammar.
Neither is the reflection-generation/intensity/aggregation responsibility selected
for extraction. Review their allowances when validation/diagnostic precedence,
resource policy or grammar changes, rather than splitting conditions merely to
reduce a score. The new boundary tests exercise their relevant guards.

## Characterization and independent boundary assertions

`node scripts/compare-simplification.mjs` loads the immutable base and current
portable implementations without modifying a checkout or opening a database.
It compares 194 normalization cases from the two committed synthetic CIF fixtures,
including missing, uncertain, invalid and boundary scalar values. Complete normalized
objects or exact error messages must match. No private research corpus is used.

It also compares 28 PXRD cases: cubic, triclinic mixed sites, body-centred extinctions,
thirds translations, a capped search, invalid geometry and zero occupancy at all
four wavelength presets. Complete results, two Gaussian widths, and both export
modes require exact deep/string equality, with **zero numerical tolerance**.
These are refactoring characterizations, not independent evidence of scientific
accuracy. Existing Gemmi-backed and analytic reference tests retain that role.

Ten new boundary tests precede the PXRD extraction; a subsequent full mutation
review extends the capped-axis fixture to all three axes (twelve tests in total).
Their independent scalar
reference is reproducible with `node scripts/verify-pxrd-boundary-reference.mjs`.
All fixtures are bounded synthetic inputs.

| Boundary | Independent expectation and representability |
| --- | --- |
| 5° | A one-dimensional cell with `c = λ/(2 sin 2.5°)` reaches exactly 5 in Node 22; a slightly longer cell excludes 001 below the cutoff. |
| 80° / integer reciprocal bound | `c = 10 d_min` retains 00,10 just below 80; shortening it excludes that plane. Adjacent binary64 sine inputs produce 79.99999999999999 and 80.00000000000001 in the tested runtime. The exact upper-equality mutant survives; this runtime evidence is not a universal libm proof. |
| Capped indices | A length of `36.5 d_min` on each tested axis requires an incomplete search and retains the positive index 36 at its independently calculated Bragg angle. |
| Degenerate geometry | `sin(gamma) = 1e-8` and an orthogonal volume of `1e-8 Å³` are admitted; the adjacent smaller fixtures reject. Admission does not establish accuracy for ill-conditioned geometry. |
| Raw intensity | For a single Na 001 plane at d=1.3 Å, pinned coefficients and the scalar Lorentz-polarization expression give exactly `1e-8` at occupancy `0.000008983789640712616`; it is excluded before normalization. Slightly larger occupancy is retained. |
| Peak merge tolerance | Separate cells bracket `1e-7°`. Every binary64 angle in [5,80] is a multiple of `2^-50`; their difference cannot equal the finer binary representation of `1e-7`. The equality mutant remains enabled. |
| Metric tolerance | Swapping b=1 and c=sqrt(11) changes the metric by exactly 10 Å², equal to `1e-5 a²` for a=1000 Å. An adjacent smaller a rejects. This tests the declared tolerance, not physical accuracy. |
| Estimated work | Bounds of 12 on each axis and 6,400 sites give `25³ × 6400 / 2 = 50,000,000`; one extra site rejects. A narrow gamma keeps actual test work bounded without changing the admission policy. |
| Plot count | An independent inverse-metric cofactor enumeration gives exactly 10,000 and 10,003 reflections for the two fixed triclinic cells. Minimum peak separation exceeds `8e-7°` and endpoints are away from 5/80, so neither merging nor cutoff ambiguity explains the count. |
| Periodic grid rounding | Explicitly expanded sites reproduce the binary64 half-grid deduplication outcome and numerical intensities within `1e-9`, positions within `1e-10°`, with exact labels. No universal bitwise periodic-equivalence claim is made. |

No production defect was reproduced by these fixtures. Scientific cutoffs, operators,
timeout settings and supported scope are unchanged.

## Mutation evidence

The [comparable focused record](baselines/simplification-boundaries.json) retains
source/configuration hashes, execution times, all 96 replacement outcomes and
historical ID mappings. Both runs use unchanged production and the same line ranges,
operators, TypeScript checker and timeouts; only the boundary tests are added.

| Outcome | Before | After |
| --- | ---: | ---: |
| Assertion killed | 62 | 79 |
| Survived | 21 | 7 |
| Timeout | 5 | 2 |
| Uncovered | 0 | 0 |
| Compile error | 8 | 8 |
| Runtime error / ignored | 0 / 0 | 0 / 0 |

Thirteen of the fifteen specifically requested historical replacements become
assertion kills. The two equality cases described above remain visible. The other
five survivors concern redundant finite/zero-length guards whose changed inputs
are rejected downstream; the two timeouts concern enlarged or nonterminating
enumeration, not assertion kills. Nothing is excluded to improve a score.
This focused population is not a replacement full-PXRD or default-pilot score.

The [completed post-extraction pilot](baselines/simplification-mutation.json) uses
the unchanged default three-file configuration and records 1,127 replacements:
829 assertion kills, 54 survivors, ten timeouts, 234 compile errors and zero
uncovered, runtime-error or ignored outcomes. The wrapper completes in 35m51.9s
(Stryker's internal timer: 35m47s). Its advisory score is 93.95%; the changed source
and population are explicitly **not comparable** to the earlier focused run or
historical model. All source/configuration and fresh-report checks pass.

Review of the extracted stages distinguishes squared-component sign equivalence,
zero components of the triangular reciprocal basis, redundant downstream filters,
empty-array normalization, and extra enumeration work from assertion gaps. One
reachable gap remains in that full measurement: omitting the positive capped k
endpoint. The subsequent all-axis fixture addresses it in a separate focused run;
the [five-replacement supplement](baselines/simplification-axis.json) records its
transition from survived to assertion killed, with three assertion kills, one
timeout and one compile error overall in 47.9 seconds. The full report is retained
unchanged. Timeouts from reversed loop increments or
additional enumeration remain timeouts, not converted to assertion kills.

## Duplication and validation

The [duplication policy and semantic writer review](duplication-policy.md) retain
the one explicit parameter-mapping clone: before and after, one pair, 26 detector
lines and 181 tokens. The new gate detects additional/changed/expanded pairs without
excluding the writer or changing the pinned detector scope.

Validation results and source hashes are retained in
[the milestone evidence](baselines/targeted-simplification.json). The full unit
coverage run passes 554 tests. Coverage is 56.20% lines, 54.84% statements, 43.57%
functions and 49.59% branches; both current and target-branch gates pass. Numerical
metrics do not replace native preservation, UI, production-worker or viewer tests.
