# CIF Crystal Data 1.0.0

## Highlights

- Incremental CIF folder refresh at startup and on demand; unchanged files are skipped.
- Quick Search with cyclic element boxes, per-field not-equal controls, and ångström cell lengths.
- Empty startup view that displays results and headers only after a search.
- Resizable result and compound-information workspace with cell, volume, sample, colour, and atom-site details.
- Selected-row CIF export using `Formula_SG-number.cif` filenames.
- Higher-contrast, larger periodic table using element-category colours.
- 500-row incremental search paging, SQLite sorting, and measured SG/cell indexes for databases up to 100,000 entries.

## Data compatibility

Schema version 3 upgrades older databases transactionally. Before an upgrade, the app creates
a consistent `cif-local.pre-migration-vN-<timestamp>.db` backup beside the active database.
The first scan after upgrading refreshes stored file metadata and atom-site details.

## Release verification

- 99 unit tests and all renderer UI checks pass.
- Production worker, legacy upgrade/backfill, build, NSIS, portable, checksums, SBOM, and packaged startup smoke pass.
- Deterministic 10k, 100k, and 1M-row measurements are recorded in `PERFORMANCE_BASELINE.md`.

Windows artifacts are unsigned until the release repository is supplied with its protected
code-signing certificate secrets.
