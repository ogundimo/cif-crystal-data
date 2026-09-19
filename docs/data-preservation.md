# Data identity and preservation

Current guidance: source identity, managed bytes, migrations, exports and recovery
contracts. Validation describes bounded checks, not exhaustive data-loss protection.

## Import identity

Schema 10 identifies a structure by its physical source path and data-block identity,
not its display filename. Paths are absolute and normalized; Windows paths compare
case-insensitively. The database retains the original display filename. Equal basenames
in different directories cannot replace each other's records.

| Operation | Result |
| --- | --- |
| Unchanged source at the same path | SHA-256 comparison skips the file, even when timestamps alone would be misleading. |
| Exact copy at a different path | Separate entries; reported as structures from an identical copy. Source bytes may share storage. |
| Edited source at the same path | Update blocks with matching identities, preserving their entry IDs and replacing their dependent data transactionally. |
| Move or rename | Import creates a separate source. To retain IDs, use **Relink selected source** before importing the new location. |
| Case-only path change on Windows | Same source. |
| Reordered unique block labels | IDs follow labels, while the stored block index follows the new content. |
| Added or removed block | Add or remove the corresponding entries and dependent rows after the entire file succeeds. A surviving label keeps its ID, including single/multiple-block transitions. |
| Renamed unique block label | New block identity and entry ID. No speculative structure matching. |
| Duplicate labels or unnamed blocks | Identity uses SHA-256 of trimmed block text plus the occurrence among identical blocks. Reordering unchanged block text retains IDs. Editing ambiguous blocks creates new IDs. |

Labels compare case-insensitively. Changing a label from unique to repeated (or back)
changes its identity scheme. Whitespace at the outer block edges is ignored for ambiguous
identity; other byte changes, including inter-block comments, count as edits. Identical
repeated blocks remain separate occurrences. Entry IDs are not reused after deletion; portable backups retain the ID allocator's high-water mark too.
Content fingerprints detect copies; they do not claim scientific equivalence or merge
distinct provenance automatically. Symlink aliases are treated as separate paths.

Each physical file is a transaction inside an import batch. Parsing or writing any block
fails the file as a whole; its previous metadata, atoms, authors, symmetry, block indices,
and preserved bytes remain intact. Other files continue. Results distinguish files scanned
and skipped from structures created, updated, or retained as copies. Failures include the
affected filename/block and reason; ambiguous edited blocks are reported as new structures.

## Managed storage and linked legacy records

New imports always preserve original file bytes in the `source_contents` table of the
profile's `cif-local.db`. Every indexed block references that content version and has its
own block checksum. Viewer and CIF export verify both checksums and select the stored
block. They never substitute current external content. Editing, moving, or deleting the
external original therefore does not change viewing/export until an explicit refresh or
import succeeds. Refresh and enabled startup scans intentionally update indexed metadata too. Schema 10 repairs bibliography from verified stored sources during the snapshotted upgrade; see [reliability](import-search-reliability.md).

There is no new linked-only import mode. Existing linked-only records retain their source
paths and entry IDs during migration, but cannot prove the original imported bytes from
historical timestamps. Viewing/export prompts for reimport rather than silently trusting
current external content. Reimport the original folder to establish a managed version;
the first successful refresh reconciles legacy block ordinals and preserves IDs where
feasible. Unavailable originals must be recovered from another location or backup; the
app cannot reconstruct sources or records overwritten by older filename-based imports.
Reimporting a recovered legacy file from a different location conservatively creates new
records; inspect and keep the original migration backup as the historical reference.

Migration makes a `cif-local.pre-migration-v…db` snapshot next to the database before
changing schema, then commits schema and data in one transaction. Failure or interruption
rolls back; restart retries. Keep the migration backup when downgrading: older versions
cannot open schema 10. Do not replace an open database file. Close the app before manually
recovering a profile from a pre-migration/pre-restore snapshot.

Stored versions are retained until **Clear CIFs**, including versions superseded by
refresh. Clear removes indexed records and managed bytes, but never external originals.
Database files may retain allocated space for reuse. Back up before clearing.

## Missing-source recovery

**Resolve missing source…** in the viewer error panel opens three actions:
**Locate CIF…**, **Delete this entry…**, and **Open matching entry** when a
potential duplicate with verified stored bytes is available. Formula matches are
suggestions, not proof of identical provenance; opening one does not merge or delete
records. There is no additional toolbar control or backup-picker action in this dialog.

Locate a CIF with the file picker (up to 32 MiB), choose its data block, compare its
metadata, and confirm the association. The selected entry retains its ID. All blocks
are imported transactionally, and existing source ownership prevents implicit merging.
Known fingerprints must match. Without one, historical source identity cannot be
established. Confirmation uses the bytes captured during preview; previews expire after
15 minutes or a database change. Originals are never modified.

Deletion asks **Delete [filename] from the app?** and requires **Delete entry**.
Deletion requires no snapshot and creates none. Only the selected unavailable entry
and its dependent database metadata are removed; the original CIF is never deleted or
modified. Cancel keeps the entry. Healthy managed entries cannot be removed through
this missing-source dialog.

Refreshing the saved folder reimports deleted entries if their CIF files are still
present and valid in that folder. New entries receive new IDs. Deletion invalidates
surviving fingerprints for the same source so multi-block files are scanned again too.
If the file is absent, refresh cannot reconstruct the deleted metadata. Missing files
alone never automatically delete app entries during refresh. Snapshot requirements for
migration, profile restore, and source replacement do not apply to confirmed entry deletion.

Recovery also saves a snapshot automatically before modifying the entry. Snapshots
preserve the whole profile, including unavailable legacy records. They are SQLite
profile snapshots, not portable archives; close the app before manually restoring one,
as described above. Failed parsing or writes leave the previous entry intact.

## Relinking

Select a structure, then **Sources & backups → Relink selected source**. Choose an
accessible CIF with exactly the same complete-file SHA-256 as the imported version.
Relinking updates all sibling blocks' locations and keeps IDs and content unchanged.
It never writes to the selected file. Cancel leaves the database untouched.

Different contents, reordered/renamed blocks, inaccessible files, and paths already
owned by another source are rejected with an explanation. To use changed bytes, import
the changed file explicitly and review its results. A legacy record without a content
fingerprint requires reimport; matching a basename alone is never sufficient.

## Portable backup and restore

**Save portable backup** writes a single `.cifbackup` SQLite archive containing a consistent
database snapshot, stored original CIF versions, entry IDs and dependencies, application
settings, layout preferences, and an integrity manifest. SHA-256 table digests cover all
data tables; source and selected-block checksums are also verified. This detects corruption,
not authenticity: a checksum is not a digital signature.

The app validates its snapshot before creating the destination. Legacy records without
managed content prevent a complete backup and produce an explicit incomplete-backup error.
No apparently successful archive is published. Reimport/recover those sources and retry.
Changes to external files during backup do not matter because the snapshot reads only
the imported versions already in SQLite. Import, refresh, clear, relink, backup, and restore
are mutually exclusive through the application API.

Choose a **new filename** for backup and CIF/PXRD export. Existing destinations, including
original source files, are never overwritten—even if another process creates the destination
after the save dialog. A write failure or process interruption can leave an incomplete
destination; choose another filename for retry. Restore rejects incomplete archives.

**Restore backup** asks before replacing the current profile's records. Before accepting
data, it checks the archive format, supported schema, expected database schema (ignoring SQL formatting),
table manifest, SQLite integrity, foreign keys, content hashes, and every block association.
Unexpected objects, incompatible schema, missing payloads, and corrupt checksums are rejected.
The archive is held in a read transaction throughout validation and transfer, preventing a
concurrent archive change from altering the restored snapshot.

Before replacement, restore saves `cif-local.pre-restore-…db` beside the current database.
It then replaces all profile rows in one SQLite transaction. Failure or interruption leaves
the prior database usable; restart and retry. Restore does not extract arbitrary archive
paths or write to external source files. Old source paths remain provenance only; the saved
import folder is cleared so startup cannot refresh against the old machine's directories.
Layout preferences are restored and the workspace reloads. Search, view and export work in
a fresh profile without any of the original folders. Select a new import folder when needed.

Keep both the backup and pre-restore snapshot until the restored profile is verified.
Snapshot creation and integrity checks require free disk space and currently run synchronously;
large archives can temporarily pause the desktop UI.

## Validation

`npm run test:worker` includes `scripts/preservation-regressions.cjs`, exercising production
bundles with Electron's SQLite ABI and temporary synthetic profiles. It covers collisions,
copy detection, equal-size/time edits, Windows case handling, block reorder/add/remove,
ambiguous labels, relink mismatches, missing originals, fresh-profile restore, corruption,
write failure, migration/restore process interruption, retry, dependent data, and IDs.

Run `node scripts/packaged-preservation-smoke.mjs` after packaging to verify a fresh-profile
restore, restart, search, view and export using the packaged executable and synthetic files.
The run retains its temporary profile and JSON report for inspection. Unit, UI, viewer,
type, architecture, unused-code checks and the database API benchmark complement these tests.
