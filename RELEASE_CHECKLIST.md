# Release Checklist

This checklist combines the desktop release gate with every item in
`LARGE_SCALE_BACKLOG.md`. An item is complete only when its implementation and
the listed verification are complete. External-only gates must name the missing
credential, service, or target machine; they may not be reported as passed.

## Stable baseline

- [x] Commit the completed search, refresh, information-panel, atom-site, cell-metadata, and CIF-export work.
- [x] Pass unit, renderer UI, production worker, typecheck, and production-build tests.
- [x] Verify upgrade/backfill from the previously released database schema.

## Scalable data path

- [x] Add server-side result paging, total counts, and SQLite sorting.
- [x] Load result pages incrementally without holding all matches in the renderer.
- [~] Long-lived database worker: deferred by the measured 100k supported boundary; see `PERFORMANCE_BASELINE.md`.
- [x] Measure representative query plans and add only demonstrated indexes/FTS support.
- [x] Debounce restraint counts and suppress superseded preview responses.

## Large imports

- [~] Configurable import limits: deferred; no ordinary-file limit was reproduced.
- [~] Bounded asynchronous enumeration: deferred; imports already run off the UI thread and the supported boundary was not exceeded.
- [~] Resumable imports/checkpoints: deferred; fingerprints already retry changed/failed files on the next refresh.
- [x] Define the supported boundary for streaming unusually large CIF files in `PERFORMANCE_BASELINE.md`.

## Database lifecycle

- [x] Add ordered transactional migrations using `PRAGMA user_version`.
- [x] Back up the database before migrations and test supported upgrades.
- [~] User-facing backup/restore/maintenance: deferred while the database remains reproducible from CIF files; migration backups are active.
- [x] Record application/schema metadata and define migration/recovery behavior.

## Performance gates

- [x] Generate deterministic 10k, 100k, and 1M benchmark databases.
- [x] Measure insert throughput, representative query latency, full-result payload size, and serialization cost.
- [x] Define budgets and a separate scheduled/manual benchmark workflow.

## Distribution

- [x] Build and smoke-test Windows NSIS and portable artifacts.
- [x] Generate checksums and SBOM; configure GitHub/Sigstore build provenance.
- [x] Configure dependency-update automation.
- [~] Protected code-signing hooks are active; verification requires `WINDOWS_CERTIFICATE` and `WINDOWS_CERTIFICATE_PASSWORD` secrets.
- [~] Authenticated update channels: deferred until an update service and channel policy exist.
- [~] macOS/Linux packaging: deferred until those platforms are supported and native target machines exist.

## Final release

- [x] Run the complete suite from a clean dependency install.
- [x] Verify packaged startup/empty state plus automated import, refresh, search, selection, information display, and CIF export coverage.
- [~] Version and release notes are ready; tag/publish remains an explicit external release action.
