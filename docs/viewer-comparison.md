# PXRD comparison and crystal viewer usability

Current guidance: comparison and viewer interaction behavior. The polyhedra
investigation and validation evidence record the implementation review.

Milestone 4 covers #64–#71 and the teardown follow-up #77. Calculated intensity
assumptions remain those in [scientific validity](scientific-validity.md); a visual
overlay is not a fit, phase identification or experimental validation.

## Comparison and formula display

The four wavelength presets are exact user-requested values, not inferred from
CIF metadata. Selection and the personal overlay live in renderer session state,
including when an empty search unmounts the details panel. Restart persistence is
not provided. No source bytes, stored metadata or export identities change.

The file picker exposes only a user-selected file through the browser File API.
Size is checked before reading, then the parser checks numeric finiteness, angular
range, strict ordering, point count and positive normalization maximum. Negative
intensity is rejected explicitly, with no offset or baseline correction. Original
values remain separate from normalized display values. Invalid/canceled replacement
preserves the previous overlay. Supported syntax and limits are in the README.

Formula display subscripts attached integer/decimal counts after element symbols
and closing parentheses/brackets. Counts equal to one are omitted, preserving the
existing grid convention. Leading and middle-dot hydrate coefficients stay literal;
use `·` for hydrates because `.` denotes a decimal. Caret charges (`SO4^2-`),
monatomic charges (`Fe3+`) and bracketed charge magnitudes (`[Fe(CN)6]3-`) stay
literal. `NH4+` retains a subscript 4. Unsupported free-form notation is not a
chemical parser; display formatting never changes the stored/search/export text.

## Viewer interaction

Expanded controls provide Distance, Angle, Polyhedra, Cancel picking and Clear
measurements. Modes are exclusive and begin with no selected atoms. Click two
distinct atoms for a distance in Å or three ordered atoms for an angle in degrees,
with the second as vertex. Progress and completed values appear below the viewer.
Coincident/repeated positions are rejected; the next measurement starts fresh.
Clear removes both completed measurements and pending selection. Cancel only
cancels picking. Opening/leaving expanded view, changing representation, or loading
a structure/supercell cancels picking; reloading also clears native measurements.
Clear polyhedra also cancels pending polyhedron selection.
Rotation, zoom, axis views and fit/reset preserve completed measurements.

The native popup is disabled at initialization and after loads, while the viewport
suppresses browser context menus. Crystallographic axes are an independent SVG
overlay using the loaded unit cell and native orientation matrix. Unit-cell
visibility, model scale and translation do not affect the indicator. Each axis
direction has length 30 before projection, preserving nonorthogonal angles without
encoding cell lengths. This keeps short cell axes visible in elongated cells;
an axis pointing into the screen still appears foreshortened.
The pointer-transparent overlay tracks the runtime at 20 Hz and scales down only
when the viewport itself is smaller than its 96-pixel footprint.

## Polyhedra investigation

The original reported structure is unavailable. A synthetic center with two carbon
neighbors at 1.5 Å reproduces the failure class: the old script creates connections
but cannot form a polyhedron. The bundled `J/shapespecial/Polyhedra.js` rejects fewer
than three bond neighbors. This does not identify every cause in the missing file.

The default remains 15–125% of summed native bonding radii. Increasing 125% by 10%
would mean 137.5%; adding ten percentage points would mean 135%. Neither has evidence
to justify a global change, and genuinely insufficient coordination cannot be fixed
by assuming additional neighbors. Ordinary ball-and-stick remains 15–110%.

The application temporarily constructs the existing radius-based neighbor set with
refresh disabled, checks for at least three non-collinear positions, and restores
the selected representation's bonds afterward. Failed prechecks retain the previous
polyhedron and give feedback. Native shape-generation failure also reports failure;
no connection artifacts are left as apparent success. Planar coordination polygons
are supported; collinear points are not. Only atoms in the displayed packed cell
block participate. Boundary atoms may require a larger block and an interior center;
this is not an infinite periodic-neighbor calculation.

## Teardown ownership

The bundled `JU/GenericApplet.js` destroy method nulls `viewer`, whereas the native
resize timer and animation-frame repaint can still call the panel. This explains
the `setScreenDimension` null dereference. The first-party lifecycle adapter cancels
the named resize timer, disables further resize work, removes canvas handlers and
registry aliases, and leaves an inert panel for queued paints to drain. It avoids
the vendor's global destroy helper, whose `_clearVars` removes shared runtime globals
needed by a subsequent viewer. No vendored file is modified. Page departure and
ordinary React unmount use the same cleanup.
An applet still initializing retains its registry entry until the native ready
callback finishes; that callback then releases it without reporting readiness.

## Validation evidence

Analytical checks use first-order Bragg law with cubic `d100 = 4 Å` (peak tolerance
1e-6 degrees), Cartesian 3–4–5 distance, and 60°/90° angles. Viewer fixtures use
synthetic 20 Å P1 cells, with 1.5 Å distances and right angles checked independently
against both app feedback and native measurement data. The nonorthogonal axes fixture
has γ = 60°. These examples are not research data or corpus-coverage claims.

The elongated-axis regression uses a synthetic 4 × 4 × 40 Å cell with
α = β = 90° and γ = 120°. Its unit directions are independently known:
a = (1, 0, 0), b = (−1/2, √3/2, 0), c = (0, 0, 1).
The Cartesian convention agrees with the bundled JSmol
[`SimpleUnitCell`](../src/renderer/public/vendor/jsmol/j2s/JU/SimpleUnitCell.js).
Unit tests check 30-unit direction lengths to 10 decimal places, rotated directions,
and end-on foreshortening. The live viewer checks both a/b arrows and labels move,
with projected lengths within 1e-4 display units before rotation; the representative
CIF also checks all three arrows and labels during rotation.

The Electron runner retains `reports/viewer/usability.json`, `lifecycle.json` and
comparison captures; regular representation captures remain in `.dist/jsmol-verification`.
Pointer tests target the actual JSmol canvas mouse handlers, not direct measurement
or application callback invocation. Capture windows are briefly shown without
taking focus so Chromium paints current frames. Synthetic events do not establish
physical input latency or native operating-system file-dialog usability.

Local validation used Windows and Node 22.23.2: 442 unit tests, full Electron UI,
production worker/preservation, bundled viewer, startup-benchmark checks,
architecture gate/probes, unused-code gate/probes, and production build/typechecks
passed. Packaging and packaged-preservation were not rerun for this renderer-only
change. The benchmark fixture explicitly selects Cu; session persistence otherwise
leaves the preceding Ag comparison active and changes the benchmark workload.

The lifecycle fixture records the original `setScreenDimension` exception and
native stack, then verifies empty registries, early-initialization cleanup,
queued paint/resize completion without exceptions, and 27 atoms in a subsequent
viewer. CI retains these JSON records and the comparison/control captures alongside
the existing representation captures.
