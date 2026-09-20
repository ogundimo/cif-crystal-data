# CIF Crystal Data

A local desktop database for crystallographic data extracted from CIF files, built with
Electron, React, TypeScript, Tailwind CSS, and better-sqlite3.

Released under the [MIT License](LICENSE).

## Dev mode

Development requires Node.js 22.12 or newer.

```
npm install
npm start
```

This starts the Electron app with a live-reloading renderer. `npm run dev` is an alias
for the same development command.

## Importing CIF files

Click **Import CIFs...** in the toolbar, then choose a folder in the native folder picker.
The app recursively scans the folder for `*.cif` files, parses each one, and upserts it
into the local SQLite database (deduped by filename: reimporting a file with the same name
updates the existing row instead of duplicating it). Files that fail to parse are reported,
with filename and reason, in a dismissible results panel, without aborting the rest of the
batch.

The selected folder is remembered. Click **Refresh CIFs** to scan that folder again without
choosing it again. The refresh compares each file's path, modification time, and size, so
unchanged files are skipped while new or modified CIFs are parsed and upserted.

The import preserves the inputs used by the simulated powder-diffraction view: unit-cell
lengths in ångströms, formula units per cell, radiation type and wavelength, symmetry
operations, atom positions and occupancies, and available displacement parameters. The PXRD
panel supports a per-pattern wavelength, configurable peak broadening, reflection hover labels,
and two-column `.xy` export with an optional header. Files containing multiple `data_` blocks
are indexed as separate structures while retaining their shared physical source file.

Use **Import experimental** beside **Export .xy** to overlay a two-column `.xy`, `.txt`,
or `.csv` scan (2θ in degrees, then intensity). Whitespace and comma separators, optional
2theta/intensity headers, and comment lines are supported. The experimental curve is red
and normalized to a maximum of 100 on the same axes as the blue simulated curve; the
display remains limited to 5–80° 2θ. Files must be smaller than 10 MB. Import another file
to replace the overlay, or use **Remove experimental** to clear it. The overlay is held
in the current chart session; it is not stored in the database or included in simulated
`.xy` exports.

## Le Bail, Pawley and Rietveld refinement

Select a method beside **Refine** in the simulated PXRD toolbar. The new window
prefills the selected CIF cell and uses its atom sites for Rietveld. Import the
experimental pattern, check the editable Bragg–Brentano geometry and 250 mm radius
defaults against your instrument, verify the required (*)
fields and start. Actual fitting evaluations update the plot in real time.

Outputs and complete checkpoints are saved beside the experimental file.
**Resume refinement** retains fitted parameters and intensities while allowing
edits. **Load checkpoint** restores a run after restarting the app. **Stop and
save** preserves the last completed stage. See [engine notes](docs/refinement-engine.md)
for modeling assumptions, figure conventions and checkpoint details.

Quick search opens automatically when the app starts and can be reopened from
the toolbar at any time. **Manual**, immediately before **About**, opens the
bundled [PDF user manual](docs/CIF%20Crystal%20Data%20User%20Manual.pdf) in the
default PDF viewer. The editable Word version is in the same `docs` folder.

### Inspect and export refinement plots

Scroll over the fit to zoom horizontally around the pointer. Intensity and
difference Y scales stay fixed during zooming and panning. Zooming out stops at
the original 2θ limits. Drag the plot to pan horizontally within those limits,
or use Reset view to show the full pattern. X tick labels
start at multiples of 10° and adapt during zooming. Horizontal grid
lines are omitted. Drag the vertically stacked legend to move all entries together;
Legend entries lets you hide or restore individual labels without hiding the data.

**Export Plot** opens a separate editor with a snapshot of the displayed fit.
Set width and height in inches, resolution (300 dpi by default), colors, line or
circle styles, thickness, circle diameter, labels and legend visibility. The
export preview is fixed except for dragging its legend. Its area stays fixed as
dimensions change; the drawing adjusts its aspect ratio to fit. Controls scroll
separately, and the resizable window stays within the monitor work area. Set the
major X tick interval (default 10°) and the number of evenly spaced labels between
major ticks (default zero). Exported axis limits match the preview; Full pattern
restores the entire scan.
PNG (default), JPG and TIFF include resolution metadata. SVG and PDF contain
vector graphics and do not depend on dpi. Raster output is limited to 40 megapixels.
Completed fits retain every profile sample for detailed zoom and export; live
snapshots use the preview data available at the time Export Plot is clicked.

The engine is [rietx](https://github.com/yue-here/rietx), pinned at 1.4.0;
the previous GSAS-II integration has been removed.
Build-machine setup requires Windows x64, PowerShell 7 and Python 3.12 with pip:
run `npm run setup:refinement`, then `npm run test:refinement`.
`npm run package` bundles the runtime so recipients need no Python installation.
In this checkout use `./npm.cmd` if npm is not installed globally.

The parser is regression-tested against the current PCD, ICSD, and CCDC/CSD corpus. It
accepts CCDC moiety formulas when a sum formula is absent, resolves the corpus's symbol-only
space groups, and stores CCDC deposition numbers, CSD refcodes, ICSD identifiers, and DOI
metadata for source-aware publication links. DOI links are preferred; when a DOI is absent,
clicking the link performs a conservative, session-cached Crossref lookup. A DOI is used only
when returned metadata agrees across the available title and citation fields. Ambiguous matches
are never stored and retain the exact-title Scholar or Access Structures fallback.

## Building the packaged app

```
npm test          # Vitest unit and regression tests
npm run typecheck # TypeScript, no emit
npm run build     # builds main/preload/renderer bundles
npm run package   # builds + runs electron-builder for Windows
```

`npm run package` produces a `release/win-unpacked` folder (runnable directly) plus an NSIS
installer and a portable executable, targeting Windows x64.

For macOS, `npm run setup:refinement:mac` prepares a native bundled runtime and
`npm run package:mac` builds a DMG and ZIP on a Mac. The **Build macOS installers**
GitHub Actions workflow builds Apple Silicon and Intel packages separately.
See [macOS build instructions](docs/macos-build.md) for native validation,
artifact downloads, and optional Developer ID signing and notarization.

## Local crystal viewer

The compound details workspace includes a reusable JSmol 16.4.15 HTML5 viewer.
The pinned runtime is packaged under `dist/vendor/jsmol`; it does not use a CDN,
PHP relay, remote rendering service, tracking endpoint, or database-loading URL.
Fullscreen controls provide packed 1×1×1, 2×2×2, and 3×3×3 unit-cell blocks and an
atom double-click mode for displaying radius-based coordination polyhedra.

The Electron security boundary remains unchanged: context isolation is enabled
and Node integration is disabled. The preload bridge exposes only
`getViewerSource(entryId)`, which validates the database entry in the main
process and returns the original CIF text plus its filename. Renderer and JSmol
code receive neither source paths nor general filesystem access. JSmol requires
`unsafe-eval` in the renderer CSP for its Java-to-JavaScript class runtime; the
policy continues to disallow remote scripts, inline scripts, and object content.
The generated one-line applet bootstrap handler is removed and invoked from the
trusted runtime adapter so `script-src 'unsafe-inline'` is not required.

Third-party licence text and notices are packaged from `third_party/`.

### Native module (better-sqlite3)

The pinned better-sqlite3 13 release uses Node-API and ships prebuilt native binaries,
including Windows x64. These binaries work in both Node.js and Electron without an
Electron-specific rebuild. Installation intentionally has no native rebuild hook, and
packaging keeps `npmRebuild: false`.

If an older checkout fails during `electron-builder install-app-deps` with a missing
Visual Studio error, update to this package configuration and rerun `npm install`.
The supported Windows x64 setup does not require Visual Studio or moving the project
to a path without spaces.

## Publishing a GitHub release

The `Release Windows application` GitHub Actions workflow publishes the NSIS installer,
portable executable, `SHA256SUMS.txt`, and a CycloneDX SBOM. It runs the complete test suite
before packaging, creates a signed GitHub artifact attestation when the repository is public,
and retains the same files as a workflow artifact for 14 days. GitHub does not offer artifact
attestations for user-owned private repositories.

To publish a release:

1. Update `version` in `package.json` and `package-lock.json`, then commit the change.
2. Create a matching semantic-version tag, such as `v1.1.0`:

   ```powershell
   git tag v1.1.0
   git push origin main v1.1.0
   ```

3. The tag push starts the release workflow. GitHub generates the release notes and attaches
   both Windows executables and their checksums.

The workflow can also be run manually from the Actions tab for an existing tag. Manual runs
do not create tags, and the workflow fails if the tag version differs from `package.json`.
Tags containing a prerelease suffix, such as `v1.2.0-beta.1`, create GitHub prereleases.

The generated Windows executables are unsigned unless the protected
`WINDOWS_CERTIFICATE` and `WINDOWS_CERTIFICATE_PASSWORD` repository secrets are configured.
The workflow verifies every configured signature and fails instead of publishing an invalid
one. Unsigned builds may trigger a Windows SmartScreen warning.

## Workspace preferences and keyboard controls

Panel sizes and results-table column widths are saved locally and restored on reopening.
Panel sizes are constrained to fit the available window. Focus a divider with Tab and use
its arrow keys to resize; Enter or double-click restores its default split. Focus the
results table and use Up/Down to select rows; Home/End navigate the currently loaded rows.
The About dialog supports Escape, contained Tab navigation, and return of focus to its opener.

## Packaged workflow verification

After packaging, run the isolated real-data smoke test with explicit paths:

```powershell
node scripts/packaged-smoke.mjs "release/win-unpacked/CIF Crystal Data.exe" "path/to/CIF-folder"
```

The test uses a temporary database/profile, reads the supplied CIFs, searches and exports,
checks detail/PXRD rendering, and restarts the packaged executable to check database persistence.
Its report and any available screenshot are saved in the printed temporary profile directory.
It does not install the NSIS package or modify the normal application database.
