# rietx refinement adapter

The app pins rietx 1.4.0 at commit `41c5f64ed88070a7acbd1bab1c074478c88df9f3`
from https://github.com/yue-here/rietx (MIT). No GSAS-II runtime is used.

The selected CIF data block is read in the main process, so Rietveld receives
the atom sites, occupancies and displacement parameters as well as the cell.
If the original CIF has moved or cannot be read, the app reconstructs the selected
structure from its stored database entry, including stored symmetry and atomic
displacement data. Results and checkpoints retain a notice identifying this
fallback; changes made to the external CIF since import require reimporting it.
New runs default to editable Bragg–Brentano geometry and a 250 mm radius for all
three methods. Verify both against the actual instrument. Radius is required for
Bragg–Brentano and optional for Debye–Scherrer. Wavelength, polarization, peak
shape, U/V/W/X/Y, zero, range and solver limits are editable. A single phase and
a single constant X-ray wavelength are supported. Two-column data use rietx's
Poisson fallback, sigma = sqrt(max(intensity, 1)); normalized or processed data
do not have valid counting uncertainties under that assumption.

The upstream staged plans are `profile_only`, `pawley_default` and
`mccusker_default`. Optional Rietveld stages expose symmetry-allowed coordinates,
isotropic/anisotropic displacements and occupancies. Le Bail repeats the plan
until Rwp stabilizes or the pass limit is reached, retaining the best pass.
An error-level upstream diagnostic prevents the app from reporting convergence.
Convergence is numerical; inspect residuals and all diagnostics for validity.

Live snapshots observe the existing NumPy residual at most every 150 ms. They
include trial evaluations and do not necessarily improve monotonically. The
adapter returns the original residual unchanged and does not run an extra
forward calculation per evaluation. This private integration seam is covered by
numerical tests and must be rechecked before changing the pinned rietx revision.
Figure colors, reflection ticks and peak-preserving decimation follow upstream.

Outputs have unique names beside the experimental file: checkpoint JSON,
rietx result JSON, fit CSV, refined CIF, report, event/history JSONL, request and
process log. A checkpoint includes complete structural/instrument state,
reflection intensities, input data and source CIF. Resume verifies engine version,
method and the data fingerprint. Load checkpoint works after an app restart;
outputs then go beside the selected checkpoint. Atomic replacement protects the
last saved checkpoint. Stop saves the last completed stage; forced termination
can be recovered by loading that file. Input files are never overwritten.

Windows setup: `npm run setup:refinement`. Verify with `npm run test:refinement`,
`npm run typecheck` and `npm run build`. `npm run package` includes the isolated
Python runtime and licenses; recipients need no separate Python installation.
Numba compiles numerical kernels on first use and caches them in `.rietx-cache`
beside the experimental pattern. Cold startup is slower than subsequent runs.
