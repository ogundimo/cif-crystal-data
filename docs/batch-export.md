# Batch CIF export and CSV summaries

Current guidance: selection, export and recovery behavior. The recorded packaged
run is historical evidence for its stated build and workload.

Run a Quick search, then use **Batch export…** below the toolbar. Choose
**Selected structures** or **All matching the current search**, review the exact
request count, and choose CIF files plus a CSV summary, CIF files plus a compact
outcome report, or a CSV summary alone. All matching includes results beyond the
500-row loading pages. It evaluates the same complete, validated database filter.
The original **Export CIF** button still exports the highlighted detail row.

## Selection and consistency

Each results row has a labelled checkbox. Tab and Space operate checkboxes;
with the results region focused, Up/Down selects the detail row and Space toggles
that row's batch checkbox. The visible batch count is independent of the detail
highlight. Paging and sorting preserve checked IDs, including IDs outside the
currently loaded page. A new search, reset, successful import/refresh, clear,
relink or restore clears the batch selection. **Clear selection** only clears
checkboxes. Selected requests support up to 100,000 distinct IDs; all-matching
requests do not have that selection-array limit.

Starting an export captures the chosen IDs or filter. The main process validates
the payload and count and excludes app imports, refreshes, clear, relink, backup
and restore through destination selection and completion. A changed count rejects
the request before output; reopen the dialog to review the current count. After
the picker, a dedicated read-only SQLite connection pins a consistent WAL snapshot.
Even changes through another database connection cannot alter that run's rows or
stored bytes. Entries always export in ascending stable entry-ID order, independent
of the grid's display sort. A missing selected ID is a reported failure.

## Files, reports and cancellation

Choose an existing destination folder. Each run creates a new `cif-export-*`
subfolder, so retries cannot overwrite a previous run or the original sources.
Canceling the picker writes nothing. Filenames have the form
`entry-ID_SOURCE_block-N.cif`: invalid Windows characters are sanitized, the source
stem is limited to 80 characters, the fixed prefix avoids device names, and the ID
prevents case-insensitive collisions. N is the one-based source block index.

Each CIF is exactly the verified managed block used by the single-entry export.
Complete-file and selected-block checksums are checked; current external originals
are never substituted. Moved, deleted, modified or unreadable originals do not
prevent export of a valid managed copy. Missing associations, legacy linked-only
records, missing blocks and checksum failures fail individually and other entries
continue. CSV-only export reads metadata and does not require available CIF bytes.

Files are written and flushed under `.partial` names, then published by exclusive
hard link. Existing final names cause a failure rather than an overwrite, including
a competing file created during export. Use a filesystem supporting hard links,
such as NTFS; unsupported destinations fail safely. Failed writes or process
interruption may leave `.partial` files. They are never counted as completed CIFs.
Cancellation is checked before each entry; completed files remain. The report
continues through the snapshot to include all not-attempted entries. A large report
can therefore take additional time to finish after cancellation.

Every run writes `report.csv` or `summary.csv`, with entry ID, intended output
filename, and `completed`, `failed` or `not-attempted` status and an actionable
failure reason. No private absolute source paths are included. The dialog reports
completed, failed and not-attempted counts; cancelled or partially failed runs
never show complete success. If report publication fails, the dialog explicitly
reports an incomplete export. Completed CIF files can still be used; CSV-only rows
are counted as failed if the summary cannot be published.

## CSV fields and spreadsheet handling

Summaries also contain source filename, stable block identity, zero-based block
index, formula, cell lengths in ångströms, angles in degrees, volume in cubic
ångströms, space-group number/symbol, reference, DOI, CCDC deposition ID, CSD refcode,
and ICSD ID. Missing values are empty; the database's unknown space-group sentinel
is empty. Stored explicit ångström lengths are used without fabricating values.

CSV is UTF-8, comma-separated, with CRLF record endings and standard quoting for
commas, quotes and embedded line breaks. Text that could be treated as a spreadsheet
formula (after whitespace, `=`, `+`, `-` or `@`), or begins with a tab, CR, LF or
apostrophe, receives one leading apostrophe. Numeric fields remain numeric. This
does not use spreadsheet formulas to represent scientific strings. For exact text
recovery, parse CSV normally, then remove exactly one initial apostrophe from a
text field that starts with one: original leading apostrophes are doubled too.
The CIF contents are unchanged. Spreadsheet import behavior varies; import text
columns as text to avoid additional date/identifier conversions by the spreadsheet.

## Validation and limits

`npm test` includes temporary-database coverage for more than 1,000 matches,
consistent snapshots during deletion/update, selected subsets and missing IDs,
multiple blocks, duplicate basenames, missing/modified originals, corrupt managed
sources, cancellation/retry, competing output files, write failures and incomplete
report publication. IPC tests cover validation, cancelled pickers, stale counts,
mutation exclusion and lock release after failure. `npm run test:ui` covers mouse
and keyboard selection, paging/sorting retention, search/import reset, exact scopes,
progress and cancelled/partial results. Production worker tests retain the database
chunk's independent-loading and recovery checks.

After `npm run package -- --publish never`, run
`npm run test:packaged-batch-export`. It imports 1,205 synthetic files containing
1,206 structures, makes the originals unavailable, exports selected and all-matching
scopes plus CSV-only output, cancels a real IPC run, checks picker cancellation,
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
