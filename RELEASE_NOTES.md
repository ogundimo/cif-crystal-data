# CIF Crystal Data 1.0.0 — local release checkpoint

## Current features

- Compact desktop theme with grouped toolbar actions, explanatory tooltips, and distinct empty states.
- Incremental local CIF import and refresh, including separate structures from multi-block files.
- Quick Search with element groups, exclusions, live restraint counts, space groups, references, and cell lengths in ångströms.
- Paged, virtualized results with sorting and keyboard row selection.
- Resizable information, crystal-viewer, and diffraction panes. Arrow keys resize focused dividers; Enter or double-click resets them.
- Panel sizes and results-column widths are remembered locally. Saved panel sizes are clamped to the available window space.
- Compound metadata, atomic sites, authors, and source-aware publication links.
- Local JSmol viewer with representations, cell blocks, axis controls, labels, and radius-based coordination polyhedra.
- Simulated PXRD with wavelength and peak-broadening controls, undistorted responsive labels, reflection hover information, and `.xy` export.
- About dialog with contributor credits, keyboard focus containment, Escape to close, and focus restoration.

## Data compatibility

The current database schema is version 8. Existing databases are migrated transactionally,
with a pre-migration backup beside the active database. Original CIF files are not rewritten.
The finishing pass changes layout and accessibility only; scientific calculation routines
retain their existing implementation.

## Verification — September 10, 2026

- 176 unit tests across 20 files pass.
- Complete renderer UI suite passes, including 1100×650, 1200×800, 900×800, and 125% zoom.
  Viewport checks now size the renderer explicitly and verify that scrolled controls remain
  reachable instead of treating intentional scroll content as an overflow defect.
- Keyboard selection, all three dividers, About focus/Escape handling, and preference restoration after reload pass.
- Production worker tests cover progress, migration/backup, multi-block imports, and failure isolation.
- Live JSmol regression checks pass for model loading, representations, supercells, polyhedra, labels, axes, and resizing.
- Fresh Windows NSIS installer and portable artifacts were built.
- The packaged executable imported the local 138-file corpus as 167 structures without failures,
  searched it, rendered compound details/PXRD, exported matching CIF content, and reopened the
  persisted database. This used a temporary profile, leaving the working database untouched.

## Distribution notes

Windows artifacts are unsigned. Building an installer is not a clean-machine installation
or uninstallation test; that remains a separate distribution check. The packaged smoke test
uses an inspector harness solely to isolate its profile and automate file dialogs. Scientific
processing and database operations use the packaged application code.

The unpacked packaged executable passed the smoke test. The portable wrapper was built,
but its inspector-based automation timed out; portable-launcher verification remains open.
Hidden-window screenshot capture was unavailable, so packaged verification used DOM and
workflow assertions rather than a screenshot review.
