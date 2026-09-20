# Batch CIF export

Current guidance: selection, export and recovery behavior. The recorded packaged
run is historical evidence for its stated build and workload.

Run a Quick search, then use **Exportâ€¦** in the toolbar. Choose
**Selected structures** or **All matching the current search**, review the exact
request count, and export CIF files only. No summary or outcome-report files are
created. All matching includes results beyond the
500-row loading pages. It evaluates the same complete, validated database filter.
One selected structure defaults to a single-file save dialog; multiple selected
structures default to batch export. The focused structure remains available as an
explicit single-file option. Both actions use the same filename convention.

## Selection and consistency

Click selects one row and shows its details. Ctrl+click toggles an individual row;
Shift+click selects the inclusive range from the last anchor in the displayed sort
order. Repeated Shift gestures extend or shrink that range; Ctrl+Shift adds a range.
Ranges include all intervening rows across loaded pages, including rows outside
the virtualized viewport. Sorting preserves selected identities and resets the
range anchor to the new focused position for the next range gesture.

With the results grid focused, arrows, Home and End move to loaded rows and select
them; Shift extends a range, and Ctrl moves focus without changing selection.
Ctrl+Space toggles the focused row. Ctrl+A selects **all search matches**, including
unloaded pages, without fetching their metadata. Ctrl+click afterward excludes
individual structures from that selection; export honors these exclusions.
Escape clears selection while retaining the focused structure's details.
Shortcuts do not act in text inputs or modal dialogs. The focused row has an outline,
and all selected rows have a highlighted background and accessible selected state.

Paging and sorting preserve selection. A new search selects its first result;
reset, successful import/refresh and clear discard the prior selection. Recovery
selects the opened entry or the refreshed first result. Selected requests support
up to 100,000 individual IDs (or exclusions); all-matching selection has no total
selection limit. The selection count and export preview state the chosen scope.

Starting an export captures the chosen IDs or filter. The main process validates
the payload and count and excludes app imports, refreshes, clear, relink, backup
and restore through destination selection and completion. A changed count rejects
the request before output; reopen the dialog to review the current count. After
the picker, a dedicated read-only SQLite connection pins a consistent WAL snapshot.
Even changes through another database connection cannot alter that run's rows or
stored bytes. Entries always export in ascending stable entry-ID order, independent
of the grid's display sort. A missing selected ID is a reported failure.

## Files and cancellation

Choose an existing destination folder. Each run atomically creates a new
`cif_batch_YYYY-MM-DD_HH-mm-ss` subfolder using local date and time. If that name
already exists, a numeric suffix (`_2`, `_3`, …) reserves a separate folder.
Retries never overwrite a previous run or the original sources. Canceling the
picker writes nothing. Filenames have the form `FORMULA_SPACE-GROUP-NUMBER.cif`,
matching individual exports. Invalid Windows characters are sanitized and the
formula is limited to 160 characters. Duplicate names (including case,
sanitization and truncation collisions) receive an `_entry-ID` suffix before
`.cif`, with a counter if needed.

Each CIF is exactly the verified managed block used by the single-entry export.
Complete-file and selected-block checksums are checked; current external originals
are never substituted. Moved, deleted, modified or unreadable originals do not
prevent export of a valid managed copy. Missing associations, legacy linked-only
records, missing blocks and checksum failures fail individually and other entries
continue.

Files are written and flushed under temporary `.partial` names, then published by
exclusive hard link. Existing final names cause a failure rather than an overwrite,
including a competing file created during export. Use a filesystem supporting hard
links, such as NTFS; unsupported destinations fail safely. Temporary files are
removed after publication or a failed write. Process interruption or cleanup failure
may leave an incomplete `.partial` file; it is never counted as a completed CIF.
Cancellation stops before the next entry and leaves completed CIFs in place.

The export dialog shows completed, failed and not-attempted counts and expandable
failure details with entry IDs, intended filenames and actionable reasons. These
details stay in the app; no report is written to the destination. Cancelled or
partially failed runs never show complete success. No private absolute source paths
are included in failure details.

## Validation and limits

`npm test` includes temporary-database coverage for more than 1,000 matches,
consistent snapshots during deletion/update, selected subsets and missing IDs,
multiple blocks, duplicate basenames, missing/modified originals, corrupt managed
sources, cancellation/retry, competing output files, timestamp-folder collisions,
write failures and temporary-file cleanup. IPC tests cover validation, cancelled pickers, stale counts,
mutation exclusion and lock release after failure. `npm run test:ui` covers Explorer-style mouse
and keyboard selection, paging/sorting retention, search/import reset, exact scopes,
progress and cancelled/partial results. Production worker tests retain the database
chunk's independent-loading and recovery checks.

After `npm run package -- --publish never`, run
`npm run test:packaged-batch-export`. It imports 1,205 synthetic files containing
1,206 structures, makes the originals unavailable, exports selected and all-matching
scopes, verifies CIF-only folder contents, cancels a real IPC run, checks picker cancellation,
reimports exported blocks, preserves single-entry export and exercises the packaged
dialog. It retains a JSON report and screenshot in a temporary directory.

The exporter reads metadata in batches of 100 and holds at most one physical CIF
payload at a time, yielding between entries and using asynchronous filesystem
writes. It does not load CIF contents into the renderer. Individual stored-file
verification and SQLite queries remain synchronous in the main process; unusually
large physical CIFs or expensive filters can delay main-process responses. The
benchmark uses small synthetic CIFs, not an experimental corpus or an upper bound
for arbitrary inputs. Native dialog interaction, removable filesystems, installer
interaction and exhaustive crash/power-loss behavior are not claimed.

## Recorded packaged run (2026-09-18 UTC)

The [retained benchmark record](evidence/batch-export-benchmark.json) identifies
clean revision `bf78f0dea13dce109062abb091af5485bddb90b8`, application code revision
`385b86b74c5f49d1407d9c09916027fc39b02dbc`, and the tested `app.asar` SHA-256.
Later evidence-only documentation changes do not change the tested application.
The run used Node 22.23.2, Electron 44.1.0, Windows 10.0.26200 and an Intel
i7-1165G7. Its 1,205 synthetic files contained 1,206 structures and 2,439,739 input
bytes. All outputs passed count/content checks, and both selected blocks reopened
through the packaged import worker with unchanged text.

| Scope and format | Structures | Elapsed | Sampled main-process peak RSS | Largest main timer gap | Largest renderer timer gap |
| --- | ---: | ---: | ---: | ---: | ---: |
| Selected CIFs + summary | 2 | 0.039 s | 132.9 MiB | 17.6 ms | 24.0 ms |
| All matching CIFs + summary | 1,206 | 7.355 s | 135.9 MiB | 24.0 ms | 24.0 ms |
| All matching CSV only | 1,206 | 0.138 s | 134.2 MiB | 10.3 ms | 14.0 ms |

These are single-run observations, not performance budgets or cold-cache results.
Heartbeat timers requested 10 ms intervals; RSS samples cover the entire main
process, not solely the exporter. The hidden-window harness disables background
timer throttling. A preceding successful run measured 9.101 s for the same large
CIF export, illustrating filesystem/cache variability. The latest run also checked
real IPC cancellation and a picker cancellation that created no batch folder.
The packaged dialog's completed result was captured and visually reviewed.

Validation found and corrected a production chunk dependency on the Electron entry:
the filename sanitizer now lives in the portable shared chunk. Production
worker/recovery checks passed after that correction. A subsequent packaged test
repeat exposed a test timing assumption: it clicked the export button before the
asynchronous count preview was ready. The committed smoke test waits for the
enabled button and the final clean-revision run passed. This was a harness fix;
it did not bypass the application's count validation.

Final local validation passed: 457 unit tests, four startup-tool tests, both
TypeScript projects, Electron UI checks, production worker/preservation regressions,
the separate JSmol viewer suite, architecture (75 inputs, zero violations), unused
code, both gates' regression probes, production build and Windows packaging. The
final unpacked package includes the dialog focus-return change; the full installer
build preceded that renderer-only refinement. The packaged acceptance run above
tests the final unpacked app. Hosted CI remains a publication-time check. Existing
development dependency audit alerts remain tracked in [#80](https://github.com/ogundimo/cif-crystal-data/issues/80).
