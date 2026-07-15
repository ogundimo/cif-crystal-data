# Large-Scale Backlog

This file records work that is **not required for the current desktop-scale application**, but should be reconsidered when the database, import workload, or distribution footprint grows substantially.

The current implementation already has a background import worker, batched database writes, progress reporting, runtime IPC validation, resilient database initialization, and virtualized table rows. Those items are therefore not part of this backlog.

## 1. Server-side result paging and sorting

**Current state:** Searches return every matching row over IPC. The renderer virtualizes the DOM rows, but still holds and sorts the complete result set in memory.

**Revisit when:** Typical result sets reach roughly 50,000–100,000 rows, IPC payloads become noticeable, or renderer memory/latency becomes a problem.

**Needed work:**

- Add paged query contracts with `limit`, `offset` or cursor, sort column, and sort direction.
- Return total result counts separately from page data.
- Load additional pages as the virtualized grid scrolls.
- Move sorting and filtering fully into SQLite while preserving the current search behavior.

## 2. Long-lived database worker

**Current state:** Imports run in a worker, while searches and restraint counts still execute synchronously through the main-process database connection.

**Revisit when:** Queries regularly exceed about 100 ms, reads contend with large imports, or the database grows beyond several hundred thousand entries.

**Needed work:**

- Move all database ownership into a dedicated, long-lived worker.
- Define request IDs, cancellation, timeouts, and typed worker responses.
- Serialize writes while allowing predictable read scheduling.
- Add graceful worker restart and connection recovery.

## 3. Dataset-driven indexing and query planning

**Current state:** Element lookup columns are indexed. Numeric range and text searches rely largely on SQLite scans, which are inexpensive at the current size.

**Revisit when:** Real-world query measurements show slow searches or the database reaches roughly 100,000+ entries.

**Needed work:**

- Capture representative queries and inspect them with `EXPLAIN QUERY PLAN`.
- Evaluate indexes for space-group number and cell-dimension ranges.
- Evaluate SQLite FTS5 for reference and space-group text searches.
- Run `ANALYZE` after large imports and avoid speculative indexes that increase write cost without improving measured queries.

## 4. Restraint-count optimization

**Current state:** The restraint preview can execute several separate `COUNT` queries after a debounced form change.

**Revisit when:** Preview updates exceed the UI latency target on a production-sized dataset.

**Needed work:**

- Benchmark each count query independently.
- Consider caching repeated filter counts or precomputed distributions.
- Investigate combined conditional aggregation where it preserves the current independent-field semantics.
- Support cancellation so superseded previews do not consume database time.

## 5. Very large import handling

**Current state:** Import work is off the UI thread, but each CIF is still read into memory as a complete string and directory traversal is synchronous inside the worker.

**Revisit when:** Individual CIF files approach tens of megabytes, folders contain hundreds of thousands of files, or imports need to survive interruption.

**Needed work:**

- Add configurable file-size and total-import limits.
- Use bounded queues and incremental directory enumeration.
- Consider a streaming CIF parser for unusually large files.
- Add cancellation, resumable imports, and persistent import checkpoints.
- Record enough failure metadata to retry only failed files.

## 6. Formal database schema migrations

**Current state:** Startup creates the expected schema with `CREATE ... IF NOT EXISTS`; there is no versioned migration chain.

**Revisit when:** A released update needs to alter existing tables, indexes, or stored values.

**Needed work:**

- Track a schema version with `PRAGMA user_version`.
- Apply ordered, transactional migrations at startup.
- Back up the database before destructive migrations.
- Test upgrades from every supported released schema and define rollback/recovery behavior.

## 7. Backup, restore, and database maintenance

**Current state:** Recovery diagnostics explain how to rename a damaged database and start fresh. This is adequate while the local data is easy to re-import.

**Revisit when:** Users invest significant time curating a database or the database is no longer cheaply reproducible.

**Needed work:**

- Add explicit backup, restore, and export operations.
- Run optional `PRAGMA integrity_check` diagnostics.
- Define WAL checkpoint, `VACUUM`, and retention policies.
- Preserve application and schema version metadata in backups.

## 8. Performance benchmarks and regression gates

**Current state:** Tests cover a 10,000-row virtualized grid and import/database correctness, but do not enforce throughput or memory budgets.

**Revisit when:** Performance becomes a release requirement or several developers begin changing data paths regularly.

**Needed work:**

- Generate deterministic 10k, 100k, and 1M-entry benchmark databases.
- Measure import throughput, search latency, restraint latency, IPC payload size, startup time, and renderer memory.
- Establish target budgets and track trends in CI or scheduled workflows.
- Keep benchmarks separate from correctness tests so normal CI remains fast.

## 9. Large-scale release distribution

**Current state:** GitHub Actions builds and publishes Windows release artifacts with checksums.

**Revisit when:** Releases are distributed broadly outside a controlled group.

**Needed work:**

- Code-sign Windows installers and executables using protected CI credentials.
- Add an authenticated auto-update channel with rollback support.
- Generate SBOM/provenance metadata and adopt dependency-update automation.
- Add macOS/Linux packaging only when those platforms become supported requirements.
- Define stable, beta, and emergency release channels if the user population warrants them.

## Prioritization rule

Do not implement these items solely because they are listed here. First reproduce a scale-related limit with representative data, record the baseline, and select the smallest item that removes the measured bottleneck or operational risk.
