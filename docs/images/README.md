# README screenshot capture

Current guidance: screenshot reproduction and synthetic sample provenance.
The checked-in captures show application revision
[`023f149`](https://github.com/ogundimo/cif-crystal-data/commit/023f149556352a3dc14cac73929dc4e79e6cd1b0)
on Windows with Electron 44.1.0, refreshed for
[issue #87](https://github.com/ogundimo/cif-crystal-data/issues/87). The owner requested
this refresh before startup milestone 11 finished; it records the merged UI at that
revision, not changes in the unmerged startup work. Future UI changes may require new captures.

These PNGs are unretouched captures of the built Electron app, using its real preload
bridge, SQLite importer, JSmol viewer, and powder-diffraction calculation. The diffraction
image is cropped to the panel bounds; the other images show the entire app content area
at 1440 × 1000 pixels and a device scale factor of 1. The comparison panel crop is
708 × 340 pixels. [capture.json](capture.json) records the application revision,
source tree, clean application-source state, normalized input hashes, image hashes,
dimensions and file sizes; it contains no local profile paths.

## Sample and privacy

The [synthetic CIF](../samples/rocksalt-demo.cif) was authored for these screenshots and
is covered by the repository MIT license. It describes an idealized rock-salt arrangement
with eight explicitly listed sites in P1 and an illustrative cell length of 5.6 Å.
It is not an experimental refinement, a published structure, or a third-party database
record. P1 deliberately lists all sites without relying on higher-symmetry expansion.

The red imported trace uses [synthetic-comparison.xy](../samples/synthetic-comparison.xy),
also original and MIT-licensed. It is an arbitrary Gaussian illustration on a 5–80°
grid with 0.1° spacing, intended only to make the comparison workflow visible.
Its header records every peak, the intensity formula and a nominal Cu wavelength.
It is not experimental data, a fitted result or an independent scientific reference.
The blue trace is the application's actual calculation from the synthetic CIF.

Each capture run creates a fresh temporary Electron profile and imports only `docs/samples`.
It does not open or modify the normal application database. The folder picker is supplied
with the sample directory automatically. No publication lookup or external data is needed.
The temporary profile path is printed to the terminal after capture and can be removed
after the process exits.

## Regenerate

From the repository root, with dependencies installed:

```powershell
npm ci
npm run build
npx electron scripts/capture-readme-screenshots.cjs
```

The script opens a hidden application window, imports the sample, searches for space group
1, waits for the viewer and diffraction plot, and overwrites the five PNGs in this folder.
It checks that the profile starts empty and that exactly one entry is imported. Build
immediately before capture and keep application source/configuration unchanged between
those commands; the capture script consumes the existing build.

It uses the real keyboard divider control to give the details more space and mouse
drags to rotate the crystal. The comparison file enters through the real file-input
handler and parser. The quick-search image waits for the one-entry preview. The viewer
image shows a 2×2×2 block and the measurement/polyhedra controls. The batch-export image
shows one checked entry and its confirmed export count; no export is performed.
The runner checks the wavelength options, completed calculation, visible errors,
resource errors and chart bounds before capture. It does not replace application
responses, alter UI styles, or retouch captured pixels.

Before committing updated screenshots:

- Inspect all five images for readable labels, complete rendering, and absence of errors,
  private paths, tooltips, or unpublished data.
- Check that the README captions still describe the visible controls and sample.
- Keep the repository-relative image paths and descriptive alternative text intact.
- Preview the README on the pushed GitHub branch and open each image to verify its link
  and rendering.

The refreshed five images total approximately 645 KiB. PNG preserves small UI text without
JPEG artifacts; avoid committing desktop captures or temporary profiles. Regeneration
may vary pixels slightly with rendering/timing; review the actual output rather than
requiring identical image hashes across different runs.
