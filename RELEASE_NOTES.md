# CIF Crystal Data 1.2.0 — Windows release

## Changes since 1.1.0

- Add batch CIF export and CSV summaries, including selected entries and all matching search results.
- Preserve imported CIF bytes and source identities, with profile backup/restore and source recovery workflows.
- Improve crystal-viewer controls, PXRD comparison, import reliability and search validation.
- Validate neutral-atom X-ray diffraction against independent references and strengthen parsing, database, viewer and recovery regression coverage.
- Require packaged reliability, preservation, batch-export and portable-launcher checks before publication; retain revision identifiers and artifact hashes.

## Data compatibility

The database schema is version 10. Existing databases migrate transactionally with a
pre-migration backup. Original CIF files are not rewritten. Older linked records may
require an explicit refresh/reimport from their original files to establish managed
CIF bytes for viewing and export. Keep existing profile backups when upgrading.

## Validation and limitations

Automated unit/UI, production worker, JSmol viewer, packaged workflow and portable
launcher checks run against the release revision before publication. Disposable
hosted Windows tests also cover silent install, restart, uninstall, reinstall and
upgrade from 1.1.0, checking entry identity, exact CIF exports and data preservation.
Those upgrade tests use current code with a test-only newer version.

Interactive clean-Windows installation, native file-dialog and SmartScreen checks
were explicitly waived for this release and remain untested. Automated tests use
controlled file dialogs; they do not establish those manual results or cold-start
performance. Scientific checks cover the documented reference fixtures, not every
experimental CIF or model.

## Downloads

- **Setup executable:** Windows x64 installer.
- **Portable executable:** launches without installation; the user profile does not necessarily travel with the executable.
- **SHA256SUMS.txt:** checksums for the downloadable artifacts.
- **sbom.cdx.json:** software bill of materials.

Windows binaries are unsigned; Windows may display publisher or reputation warnings.
