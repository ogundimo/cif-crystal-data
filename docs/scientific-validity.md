# PXRD scientific contract and validation (#39)

Current guidance: scientific assumptions, supported inputs and validation limits.
Reference comparisons are evidence for the stated fixtures and tolerances only.

The calculated pattern is an ideal, monochromatic, unpolarized X-ray powder
model. It is not an experimental measurement, phase identification, quantitative
phase analysis, or a prediction of instrument-specific intensities.

## Model and supported inputs

`IT92-neutral-v1` replaces the atomic-number exponential approximation with
neutral-atom IT92 form factors for H–Cf. The coefficients are extracted from
[Gemmi 0.7.5](https://github.com/project-gemmi/gemmi/tree/v0.7.5), without
renormalizing them. Their provenance, source and MPL-2.0 license are retained in
[third-party notices](../third_party/THIRD_PARTY_NOTICES.md). See
[Gemmi's scattering documentation](https://gemmi.readthedocs.io/en/stable/scattering.html)
and the [IUCr coefficient definition](https://www.iucr.org/__data/iucr/cifdic_html/3_orig/CORE_DIC/Iatom_type_scat.Cromer_Mann_a1.html).

For s = sin(θ)/λ in inverse ångströms, the model evaluates
f(s) = Σ aᵢ exp(−bᵢs²) + c. Its supported domain is s < 2 Å⁻¹.
Amplitude includes occupancy and exp(−B s²); if B is absent, B = 8π²U.
An explicit B takes precedence over U. Lengths/wavelength use Å, angles use
degrees, B/U use Å², and coordinates are fractional. Legacy lengths stored in
nanometres are converted with a visible diagnostic.

Structure factors sum complex site amplitudes after expansion by supplied
symmetry. Equivalent images of each site are deduplicated on a periodic 10⁻⁵
fractional-coordinate grid. Separate CIF sites are not merged: disordered sites
and their occupancies remain the author's responsibility. Operations must parse,
have integer unimodular rotation matrices, and preserve the supplied cell metric
within 10⁻⁵ of the largest squared cell length. This tolerance permits rounded
cell angles; it does not validate that the supplied group is complete or that the
structural model is scientifically correct. Missing operations are accepted only
for P1, with an explicit identity assumption.

Rotation coefficients are read from linear terms directly, avoiding floating-point
subtraction of fractional translations. A regression compares three translations
at 0, 1/3 and 2/3 against explicitly listed sites; valid thirds must not be rejected
as noninteger rotations.

The calculation includes the unpolarized powder Lorentz-polarization factor
(1 + cos²2θ)/(sin²θ cosθ). Enumeration includes one member of each Friedel pair;
with real neutral-atom factors, omitted partners have equal intensity and their
common factor of two cancels on normalization. All remaining equivalent planes
contribute multiplicity through enumeration. This convention agrees with the
[powder formalism documented by pymatgen](https://pymatgen.org/pymatgen.analysis.diffraction.html).

Reflections in 5–80° 2θ are summed only when degenerate within 10⁻⁷ degrees.
The old 0.025° merge conflated distinct close reflections; broadening now combines
their profiles instead. A degenerate family's label is its first enumerated hkl,
not a claim that it is a unique or conventional family label. Peak intensities
are normalized to a maximum of 100. Gaussian broadening uses the selected FWHM,
a 0.02° grid, and tails extending approximately five standard deviations (rounded
outward to grid points). Profiles are separately normalized to a maximum of 100.
FWHM below 0.04° is explicitly identified as undersampled. This does not deliver
the separately tracked plot/sampling redesign.

## Visible defaults, unsupported inputs and limits

The collapsible assumptions panel and optional export header disclose:

- Missing wavelength: 1.5406 Å. Missing radiation: monochromatic X-rays.
- Missing angles: 90°; missing occupancy: one; missing isotropic displacement: zero.
- Element inference from labels when type symbols are absent.
- Neutral-atom scattering, including when atom symbols contain ionic charges.
- Isotropic displacement only; anisotropic tensors, anomalous scattering,
  absorption, preferred orientation, extinction, instrumental profiles and
  wavelength doublets are not modeled.

Non-finite/nonpositive wavelengths, wavelengths above 10 Å or exceeding the
IT92 domain over this angular range, non-X-ray radiation, invalid/degenerate
cells, missing/non-finite coordinates, unsupported elements, occupancy outside
[0,1], negative/non-finite displacement, and unusable symmetry return an
unsupported result with a reason. Invalid sites/operations are never silently
discarded to produce a partial pattern. Zero occupancy is valid; an empty
reflection range has its own message.

Each reflection index remains bounded by 36. Conservative requested bounds are
ceil(length/d_min)+1, derived from |h| ≤ a/d_min (and likewise b,c); skew cells
therefore do not justify smaller bounds. A required bound above 36 labels the
result **incomplete** and warns of missing peaks. More than 10,000 expanded atoms
or an estimated 50 million atom/reflection evaluations is unsupported. More than
10,000 distinct output reflections is also unsupported to bound plot work. These are
explicit desktop resource limits, not scientific convergence criteria.

## Independent references and tolerances

[scientific-reference.py](../scripts/scientific-reference.py) uses pinned Gemmi
0.7.5 for reciprocal geometry, symmetry and complex structure factors. It does
not import application code. The small independent powder adapter enumerates
both Friedel partners and directly evaluates Gaussians across the full grid.
Special-position occupancies use Gemmi's crystallographic convention.

Seven authored synthetic cases cover cubic NaCl, body-centered Fe, hexagonal Mg,
tetragonal Ti/O, monoclinic Fe/Na, triclinic Na/Fe/H, and a larger orthorhombic C/O
cell. These are shareable fictional models, not database records or experiments.
All tests use identical cells, atomic data, wavelength, 0.1° FWHM and 0.02° grid.
The checked-in [reference data](../src/renderer/src/__fixtures__/pxrd-reference.json)
declare tolerances before comparison:

| Quantity | Absolute tolerance | Reason |
| --- | --- | --- |
| Peak position | 10⁻⁶ degrees 2θ | Floating-point metric/trigonometric calculations; well below four-decimal export resolution |
| Integrated relative intensity | 0.002 percentage points on max=100 | Single-precision upstream coefficients and independent structure-factor arithmetic; not a physical accuracy bound |
| Broadened relative profile | 0.003 percentage points | Same numerical effects plus the app's bounded Gaussian tails versus the reference's full tails |

The [measured comparison](baselines/pxrd-reference-validation.json) retains input
hashes and all seven results (2–2,588 peaks per case). Maximum observed differences
were 4.27×10⁻¹⁴ degrees, 0.00002575 intensity percentage points and 0.00002610
profile percentage points, all within the predeclared tolerances.

Analytic tests separately cover cubic/monoclinic/triclinic metrics, centering
extinctions, mixed-element interference, multiplicity, occupancy, equivalent U/B,
special positions, malformed input, close reflections, limits and export.
Agreement establishes implementation consistency for these inputs. It does not
establish quantitative agreement with experimental intensities or corpus coverage.
Experimental comparisons require instrument/sample corrections and independently
known structures, and cannot use these numerical tolerances as measurement errors.

Regenerate deliberately in an isolated Python environment with `gemmi==0.7.5`:

```powershell
python scripts/scientific-reference.py
npx vitest run src/renderer/src/pxrd.test.ts
```

Review generated changes; never regenerate expectations merely to accept a failed
application calculation. Gemmi is a validation prerequisite only; normal tests use
the checked-in references without Python or network access.

## Export and scheduling

With **Header** checked, XY exports include model version, completeness status,
wavelength, Gaussian FWHM, range, grid, normalization and assumptions. Export the
managed CIF alongside the pattern to retain its exact structural inputs. Unchecking
Header retains the existing plain two-tab-separated-column format and precision.
Exports continue to require a new destination; no overwrite policy changed.

Calculation and broadening run in a local browser worker. Selection, wavelength
or FWHM changes terminate the previous job, clear stale output and disable export
until the current result arrives. Failures provide Retry; data-load failures also
clear the prior structure's pattern. See [recovery evidence](scientific-recovery.md).
