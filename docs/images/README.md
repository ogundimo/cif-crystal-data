# README screenshot capture

Current guidance: screenshot reproduction and synthetic sample provenance.
The checked-in captures are historical illustrations and may lag later UI changes.

These PNGs are unretouched captures of the built Electron app, using its real preload
bridge, SQLite importer, JSmol viewer, and powder-diffraction calculation. The diffraction
image is cropped to the panel bounds; the other images show the entire app content area
at 1440 × 1000 pixels and a device scale factor of 1.

## Sample and privacy

The [synthetic CIF](../samples/rocksalt-demo.cif) was authored for these screenshots and
is covered by the repository MIT license. It describes an idealized rock-salt arrangement
with eight explicitly listed sites in P1 and an illustrative cell length of 5.6 Å.
It is not an experimental refinement, a published structure, or a third-party database
record. P1 deliberately lists all sites without relying on higher-symmetry expansion.

Each capture run creates a fresh temporary Electron profile and imports only `docs/samples`.
It does not open or modify the normal application database. The folder picker is supplied
with the sample directory automatically. No publication lookup or external data is needed.
The temporary profile path is printed to the terminal after capture and can be removed
after the process exits.

## Regenerate

From the repository root, with dependencies installed:

```powershell
npm run build
npx electron scripts/capture-readme-screenshots.cjs
```

The script opens a hidden application window, imports the sample, searches for space group
1, waits for the viewer and diffraction plot, and overwrites the four PNGs in this folder.
It checks that the profile starts empty and that exactly one entry is imported.

Before committing updated screenshots:

- Inspect all four images for readable labels, complete rendering, and absence of errors,
  private paths, tooltips, or unpublished data.
- Check that the README captions still describe the visible controls and sample.
- Keep the repository-relative image paths and descriptive alternative text intact.
- Preview the README on the pushed GitHub branch and open each image to verify its link
  and rendering.

The initial four images total approximately 226 KiB. PNG preserves small UI text without
JPEG artifacts; avoid committing full-resolution desktop captures or temporary profiles.
