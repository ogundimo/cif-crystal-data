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
- [ ] Add backup, restore, integrity-check, WAL checkpoint, and vacuum operations.
- [ ] Record application/schema metadata and define recovery behavior.

## Performance gates

- [ ] Generate deterministic 10k, 100k, and 1M benchmark databases.
- [ ] Measure import throughput, search/restraint latency, IPC size, startup time, and renderer memory.
- [ ] Define budgets and a separate scheduled/manual benchmark workflow.

## Distribution

- [ ] Build and smoke-test Windows NSIS and portable artifacts.
- [ ] Generate checksums, SBOM, and build provenance.
- [ ] Configure dependency-update automation.
- [ ] Add protected code-signing hooks and verify signing when credentials are available.
- [ ] Add authenticated stable/beta/emergency update channels with rollback support.
- [ ] Add macOS/Linux packaging only with supported target machines, then verify those artifacts natively.

## Final release

- [ ] Run the complete suite from a clean dependency install.
- [ ] Manually verify startup refresh, import, search, selection, information display, and CIF export.
- [ ] Update version and release notes, commit, tag, and publish only after every applicable gate is satisfied.
