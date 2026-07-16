# Release Checklist

This checklist combines the desktop release gate with every item in
`LARGE_SCALE_BACKLOG.md`. An item is complete only when its implementation and
the listed verification are complete. External-only gates must name the missing
credential, service, or target machine; they may not be reported as passed.

## Stable baseline

- [ ] Commit the completed search, refresh, information-panel, atom-site, cell-metadata, and CIF-export work.
- [ ] Pass unit, renderer UI, production worker, typecheck, and production-build tests.
- [ ] Verify upgrade/backfill from the previously released database schema.

## Scalable data path

- [ ] Add server-side result paging, total counts, and SQLite sorting.
- [ ] Load result pages incrementally without holding all matches in the renderer.
- [ ] Move database ownership to a long-lived worker with typed request IDs, cancellation, timeouts, restart, and recovery.
- [ ] Measure representative query plans and add only demonstrated indexes/FTS support.
- [ ] Optimize restraint counts and cancel superseded previews.

## Large imports

- [ ] Add configurable per-file and total-import limits.
- [ ] Use bounded asynchronous directory enumeration and work queues.
- [ ] Add import cancellation, persistent checkpoints, resume, and failed-file retry metadata.
- [ ] Define the supported boundary for streaming unusually large CIF files.

## Database lifecycle

- [ ] Add ordered transactional migrations using `PRAGMA user_version`.
- [ ] Back up the database before destructive migrations and test supported upgrades.
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
