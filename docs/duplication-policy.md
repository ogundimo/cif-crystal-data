# Duplication regression policy and writer review

Issues [#47](https://github.com/ogundimo/cif-crystal-data/issues/47) and
[#56](https://github.com/ogundimo/cif-crystal-data/issues/56) introduce a pair-specific
gate and retain the existing writer mapping after semantic review.

Run `npm run quality:duplication -- --base origin/main` on Node 22. The required
Test and build workflow and the quality-report workflow run it after the existing
coverage/complexity gate. `npm run quality:test` includes real detector and policy
probes. Complete reports and both clone locations remain in
`reports/quality/duplication-current.json` and `duplication-regression.json`.

## Comparison contract

The gate runs the same pinned jscpd detector and application input list as the
baseline report: weak mode, at least 70 tokens and five lines. Existing data-table,
test, fixture and vendor exclusions remain in [scope.mjs](../scripts/quality/scope.mjs).
There is no new file exclusion. Detector percentages and line counts remain visible
descriptions, not the failure criterion: changes in unrelated file sizes must not
hide a new clone.

An allowance identifies the unordered pair of file paths and the TypeScript token
fingerprints of the complete reported line ranges. Tokens come from the complete
parsed source, preserving regex literals and JSX lexical context. Trivia is ignored; identifiers,
operators and literal contents remain significant. Ordinary line shifts preserve
identity. New, changed or expanded token sequences and changed paths require review.
Complete boundary lines are deliberately conservative: edits outside the detector's
column span on those lines can also trigger review. This is textual identity, not
proof of semantic equivalence. Multiplicity is limited, so adding another identical
pair cannot reuse the existing allowance indefinitely. Removing a clone passes.

The [versioned allowance](baselines/duplication-policy.json) records the review,
locations, fingerprints and allowed count. Both current and target-branch policies
are checked. Adding allowances, increasing counts, or changing analyzer/scope/lockfile
hashes requires an explicit policy migration reviewed together with its workflow
change; editing the baseline alone cannot make that PR pass. There is no environment
bypass, blanket path waiver, automatic reset, or unreviewed capture command.
The first adoption reports that the target branch has no duplication policy.

For a proposed exception, include both locations, the exact detector output, why
shared code would obscure distinct contracts, a narrow fingerprint/count allowance,
validation and a review trigger. Analyzer upgrades and file moves require the same
explicit migration rather than guessed identity matching.

## Database-writer decision

The pre-change detector at `5e23e57dfc7927d1f51fbc10a7b3f0e7e6d64eff` reports one
pair, 26 detector lines and 181 detector tokens, in
[writer.ts](../src/main/database/writer.ts), lines 123–148 and 154–180.
The duplicated region is the ordered mapping of 26 persisted entry fields.

| Responsibility | Update | Insert |
| --- | --- | --- |
| Entry identity | Reuses the selected source/block ID, including supported legacy adoption | SQLite allocates a new ID; records remain separate across source copies |
| SQL parameters | 26 fields, then existing ID for `WHERE id = ?` | Source display filename, then the same 26 fields |
| Source/block identity | Shared `setIdentity` after the write | Same shared operation after obtaining `lastInsertRowid` |
| Dependent data | Shared deletion/replacement of elements, atom sites, authors, symmetry and displacement rows | Same shared population logic; deletion is harmless for a new ID |
| Transactions | Same per-physical-file nested transaction inside the batch | Same transaction; a failing block rolls back every block of that file |
| Recovery | Failed groups clear reported outcomes and preserve prior rows/bytes; other groups continue | Failed IDs/rows are not partially published; retry remains supported |

Retain the two explicit parameter mappings. A generic tuple would obscure which SQL
statement owns the filename prefix and ID suffix without removing a distinct
responsibility. Row replacement, identity assignment, source-byte storage and
transaction/savepoint isolation are already shared. No SQL, schema, cascade, retry,
ID-allocation or persistence behavior changes in this review. The allowance covers
only this exact pair and one occurrence; all other writer code remains scanned.
Any field/schema/SQL-contract change reopens the decision.

Existing native writer/identity/preservation regressions remain necessary evidence;
a clone detector cannot establish database correctness. Milestone validation is
recorded in [targeted simplification](targeted-simplification.md).
