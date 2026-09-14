# Quick-search responsibility refactor (#16)

Baseline: `cab5ee1090ac27fb714ab40d1881e1f322e83da3` (PR #31), measured on
2026-09-14 with Node 22.23.2. Tracking issue:
[#16](https://github.com/ogundimo/cif-crystal-data-public/issues/16).

## Boundaries and preserved behavior

The original 610-line dialog mixed form conversion, preview requests, field
controls, preview rendering and dialog lifecycle. The extraction follows those
responsibilities:

- `QuickSearchDialog.tsx` owns draft/applied forms, active slot, validation,
  submit/cancel/reset, focus restoration, keyboard trapping and the modal shell.
- `quickSearchForm.ts` defines the form defaults, criterion detection and the
  existing `SearchFilter` conversion, including legacy slots and independent
  element/text exclusions. Numeric values retain their existing angstrom units.
- `useSearchRestraints.ts` owns preview rows/status, reset and retry. It uses the
  existing 250 ms scheduler and its cleanup to suppress superseded responses.
- `QuickSearchFields.tsx` owns the periodic picker, element-slot cycling, field
  exclusion/clear actions, validation messages and cell ranges.
- `QuickSearchPreview.tsx` renders the existing invalid/loading/error/empty/ready
  states and exposes the retry action.

CSS, DOM order, labels and input IDs are preserved. The field component returns a
fragment so the periodic picker and form column remain siblings in the existing
grid. `QuickSearchParts.tsx` remains the shared presentation primitives.

All extracted modules stay in the renderer. Preview requests still pass through
`window.cifApi.restraints`; there are no new Electron, Node, database or worker
imports, API changes, dependencies or boundary exceptions.

## Measurements

The pinned ESLint 10.10.0, TypeScript parser 8.70.0 and SonarJS 4.2.0 analyzers
from `scripts/quality/analyzers.mjs` measured both versions with classic cyclomatic
complexity and cognitive reporting thresholds of zero. Values below are maximum
function scores **within each file**, including callbacks; physical lines include
comments and blank lines.

| File / scope | Physical lines | Max cyclomatic | Max cognitive |
| --- | ---: | ---: | ---: |
| Original dialog | 610 | 17 | 13 |
| Refactored dialog | 166 | 12 | 10 |
| Fields | 300 | 11 | 4 |
| Preview view | 67 | 5 | 10 |
| Form model | 93 | 3 | 1 |
| Preview hook | 42 | 3 | 2 |
| Refactored scope combined | 668 | 12 | 10 |

The combined scope grows by 58 lines for explicit module imports, prop contracts
and component/hook boundaries. This is a responsibility extraction, not removal
of search decisions. All files are below the advisory 500-line guideline. The
keyboard callback remains cohesive in the dialog despite exceeding the
aspirational cyclomatic target of 10; further splitting solely for that score
would obscure the focus-trap sequence. No numerical gate was introduced.

To reproduce the comparison, run `createComplexityAnalyzer().lintFiles(...)`
from `scripts/quality/analyzers.mjs` over the original dialog at the baseline
commit and the five current files, collecting findings with
`complexityFinding` and line counts with `physicalLines` from
`scripts/quality/scope.mjs`. Local raw reports are ignored artifacts under
`reports/architecture/issue-16-{before,after}.json`.

## Regression evidence

The existing Electron UI suite passed before extraction. The new
`scripts/quick-search-lifecycle.cjs` characterization checks also passed against
the original dialog before the production changes, and against the final
components. They exercise the real dialog through App, with preload API doubles:

- A newer preview remains visible after an older request resolves.
- Invalid space-group input disables submission and makes no preview request.
- Failed previews expose Retry and recover on a successful response.
- Enter submits the applied filter; Cancel discards a subsequent draft.
- Clear all followed by Escape restores the applied form; external Reset search
  clears both the draft and applied form.
- Opening focuses the dialog, Tab/Shift-Tab wrap, and closing restores focus.

The existing suite also verifies element cycling, independent exclusion/clear
controls and accessible layouts at 1100×650, 1200×800, 900×800 and 125% zoom.
Sixteen new unit cases cover empty/whitespace fields, standalone criteria and the
full form-to-filter payload. The shared validation and debounce unit tests remain
in place.

Local checks: 268 unit tests in 22 files, the complete Electron UI suite,
TypeScript, Knip, production build, separate viewer suite and dependency-boundary scan passed. The
boundary scan includes 44 production inputs with zero violations. Hosted CI and
the implementation PR are recorded when the change is submitted for review.

An intermediate UI run logged a JSmol `setScreenDimension` error during navigation
while all assertions passed; the final UI run did not reproduce it. This refactor
does not alter JSmol. Native database/IPC behavior remains covered by the existing
worker and CI suites rather than the renderer API doubles. Broader prerequisites
and untested paths remain in the [#14 test-gap review](test-gap-review.md).
