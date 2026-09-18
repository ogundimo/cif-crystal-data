# Additional measurement evaluation

Decision record for [CRAP #55](https://github.com/ogundimo/cif-crystal-data/issues/55)
and [Halstead #54](https://github.com/ogundimo/cif-crystal-data/issues/54), evaluated
on 2026-09-18. **Retain both measurements as unavailable.** The tested candidates
fail attribution or syntax checks below. This is the evidence-backed deferral
outcome permitted by those issues, not measured compliance. CRAP <25 and Halstead
80 remain unadopted proposals; no blocking metric gate is introduced.

The [retained machine-readable evidence](evidence/additional-measurements/results.json)
contains actual observations, independently specified fixture expectations,
diagnostics, tool versions, input hashes and the source revision. Its dirty flag
identifies the evaluation implementation added on top of that revision. It is a
fixture experiment, **not a repository-wide baseline**. Production output keeps
explicit deferred explanations in `baseline.json` and `summary.md`.

## CRAP contract and evaluated candidate

The candidate is the existing classic ESLint complexity report joined to the
existing Vitest V8 JSON summary/LCOV outputs. The evaluation additionally captures
Istanbul-format JSON for diagnosis; that extra reporter is local to the experiment.
The [ESLint rule](https://eslint.org/docs/latest/rules/complexity) measures
functions and implicit class scopes. In the pinned implementation its ordinary
function diagnostic describes the **header**, not the body range. The current
`complexityFinding` output retains only the start, score and message.

A future acceptable join must meet this explicit contract:

- Use `C² × (1 − cov)³ + C`, with classic per-function `C` and **owned executable
  source-line coverage**, not branch coverage, function-entry hits, or file coverage.
  For each function, count distinct source lines containing its executable
  statements; a line is covered when an owned statement on it executes. This is
  line coverage, so it does not claim every expression or branch on that line ran.
- Identity is normalized repository path plus exact AST start/end offsets in the
  hashed original TS/TSX input, never function name or nearest line. Use half-open
  AST ranges. Declaration headers and type-only syntax do not supply executable
  body lines. Parameter default initializers are owned by their function and need
  validated counters; include their original source locations explicitly.
- Nested function bodies own their own statements, excluded from the parent.
  Function creation/binding work belongs to the enclosing scope. Anonymous
  functions, expression-bodied arrows and adjacent functions use the same exact
  identity rules. Statements from multiple owners sharing a line require column
  attribution before per-owner line aggregation; a shared line hit is insufficient.
- V8 results must be remapped to the exact original TS/TSX source using validated
  transformation maps, including JSX and erased type syntax. Missing maps, stale
  sources, generated wrappers and unresolved or multiple matches are unavailable.
  Never match a generated-JavaScript range directly to TypeScript coordinates.
- A function with owned executable lines and verified zero executions has `cov=0`;
  missing coverage is not zero coverage. An empty/zero-denominator function is
  unavailable, not 100% covered. Unimported files and class field/static-block
  implicit functions need separate validation before inclusion.

[Vitest documents AST-based V8 remapping](https://vitest.dev/guide/coverage.html).
That supports ordinary coverage reporting; it does not establish a join to this
repository's ESLint diagnostic identities. The experiment runs the real pinned
tools against typed TSX source twice and compares normalized findings, maps, hits
and diagnostics exactly. No global percentage is assigned to a function.

### Hand-calculable controls and rejection evidence

The source and execution script are in
[additional-fixtures.json](../scripts/quality/additional-fixtures.json).
The owned lines below are manually specified fixture oracles, not inferred using
the candidate join. Thus passing these controls does not certify automatic attribution.

| Function | C | Owned / covered source lines | Expected fixture CRAP |
| --- | ---: | --- | ---: |
| `zero` (not called) | 2 | 2,3 / none | 6 |
| `partial(true)` | 2 | 6,7,9 / 6,7 | 2 + 4/27 |
| `full(true)` and `full(false)` | 2 | 12,13 / both | 2 |
| `parent()` returning an uncalled child | 1 | 20 / 20 | 1 |
| `child` | 2 | 17,18 / none | 6 |

The five controls pass with the actual classic analyzer and real remapped V8
line counters. The separate arithmetic regression also checks exactly 50% coverage:
`C=2` gives 2.5. The parent must not inherit the child's uncovered lines, and the
child must not inherit the parent's execution.

The rejection cases are concrete:

| Case | Observation | Consequence |
| --- | --- | --- |
| Two arrows on line 22 | Function hits are 1 and 0; LCOV has one `DA:22,1` | Line-only joining cannot allocate hits between neighbors. Generated anonymous names do not supply an ESLint identity. |
| Uncalled JSX arrow on line 24 | Function hit is 0, but `DA:24,1` from initializing the binding | Assigning covered lines in a function's textual span reports false full coverage. |
| `partial` | ESLint diagnostic ends in its header; V8 function location ends at line 10 | Diagnostic extent is not the function body range. |
| Empty function | No owned executable line denominator | Do not emit a zero or full-coverage proxy. |

`missing`, `ambiguous` and `unsupported` diagnostics carry `score: null`. The
retained JSON includes function/statement maps so the counterexamples are auditable.
Tests deliberately remove findings/line counters, duplicate a complexity match,
and replace the uncalled neighbor's hit; those cases must fail validation rather
than produce a clean result. Named and anonymous functions and arrows are present;
type erasure and the unexecuted JSX mapping are exercised. Executed JSX, default
parameters, decorators, class scopes, unimported modules and arbitrary source maps
are **not** certified. A column-aware AST/function/statement join might work, but
was not established by this evaluation. Therefore no partial production ranking
is published and no missing functions are silently dropped.

## Halstead definition and candidate evaluation

The candidate is [typhonjs-escomplex](https://github.com/typhonjs-node-escomplex/typhonjs-escomplex)
0.1.0, selected because it advertises TypeScript support through Babel and exposes
operator/operand counts. Its entire isolated dependency graph is retained in the
[candidate lock](evidence/additional-measurements/candidate-lock.json). It is not
an application dependency or an adopted analyzer. Both `typescript` and `jsx`
parser plugins are explicitly enabled. Source is not transpiled to JavaScript:
compiler helpers would measure a different program.

The fixture convention defines difficulty as `(n1 / 2) × (N2 / n2)` where `n1`
is distinct operators, `n2` distinct operands and `N2` operand occurrences. Counts
are case-sensitive and per function body. Total operator occurrences `N1` and the
actual identifier sets are also checked, so matching difficulty alone cannot pass.
The convention deliberately describes **runtime syntax**: erased type annotations
and `as` assertions add no operators/operands. Own names/parameters are outside a
function's body; a nested declaration contributes its `function` operator and
name/parameter operands to its parent under this candidate's convention, but its
body is measured separately. This is a documented counting choice, not a universal
Halstead standard. No aggregate sum or average of function difficulties is defined.

For these fixtures, `return`, `+`, `function`, `.`, `?.` and `??` are distinct
operators; variable/property identifiers and literals are operands. Optional
access must count an operation just as ordinary member access does. A JSX element
counts one `jsx-element` operator and its tag once as an operand (not a second time
for its closing tag); each JSX expression container adds `jsx-expression` plus
the expression's usual counts. Punctuation, whitespace and comments are excluded.
This small explicit convention is sufficient to falsify the candidate; it is not
an exhaustive specification for all TypeScript syntax.

| Fixture | Expected body operators / operands | Expected D | Candidate D / outcome |
| --- | --- | ---: | --- |
| `return a+b` | `return,+` / `a,b` | 1 | 1; also matches with typed parameters/return |
| `return a+a` | `return,+` / `a,a` | 2 | 2 |
| `return x as number` | `return` / `x` | 0.5 | 0.5 |
| Outer with nested function | `function,return` / `inner,b,a` | 1 | 1; inner `return b+1` separately gives 1 |
| `return x.a` | `return,.` / `x,a` | 1 | 1 |
| `return x?.a` | `return,?.` / `x,a` | 1 | **0.5; access operator silently omitted** |
| Arrow `x??0` | `??` / `x,0` | 0.5 | 0.5 |
| Arrow `<span/>` | `jsx-element` / `span` | 0.5 | **0; no operators or operands, no reported error** |
| Arrow `<span>{x+1}</span>` | `jsx-element,jsx-expression,+` / `span,x,1` | 1.5 | **0.5; JSX omitted, only arithmetic counted** |
| Malformed `return x+;` | No valid measurement | unavailable | Parser error, retained explicitly |

Seven valid controls match, three valid inputs fail and one malformed input is
rejected. Both repeated evaluations are identical. Parsing TypeScript/JSX does
not mean all its syntax contributes to the metric. Even without adopting the
particular JSX convention above, silently returning zero for a JSX body without
declaring unsupported syntax is unacceptable. Candidate numeric observations are
retained as evidence, but the evaluation's public `score` remains null.

Production scope, if a replacement passes, must use `isProduction` from
`scripts/quality/scope.mjs`: first-party TS/TSX, including executable data-table
modules, excluding tests, declarations, fixtures, vendor and generated files.
Attribute by exact source ranges, exclude nested bodies and distinguish
unsupported/failed/empty inputs from zero. No repository-wide Halstead baseline
was run because this candidate failed the prerequisite fixtures. This experiment
rejects this pinned candidate/configuration, not every possible future analyzer.

## Reproduce and review

Use Node 22.13+ on the Node 22 line. From the repository root:

```powershell
npm ci
New-Item -ItemType Directory -Force reports/measurement-candidate | Out-Null
Copy-Item docs/evidence/additional-measurements/candidate-package.json reports/measurement-candidate/package.json
Copy-Item docs/evidence/additional-measurements/candidate-lock.json reports/measurement-candidate/package-lock.json
npm ci --prefix reports/measurement-candidate --ignore-scripts --no-audit --no-fund
npm run quality:evaluate-additional
npm run quality:test
```

The isolated candidate install retains an old transitive runtime; it is used only
for controlled synthetic sources, and is neither bundled nor installed by normal
project CI. The evaluator runs two V8 fixture tests, two candidate passes and
asserts deterministic observations. It writes
`reports/additional-measurements/evidence.json`, clearing the old completed report
first. Execution/assertion failures throw and write `failure.json` with a null
score; a failed run is not a completed evaluation. Compare the measurement payload
when reproducing; commit, dirty state, platform and Node patch may legitimately
differ. Source/configuration/lock hashes identify the rest of the inputs.

`quality:test` rechecks the retained evidence, arithmetic, fixture/helper hashes
and deliberate failure probes on ordinary CI without installing the rejected
candidate. It does **not** rerun that candidate or collect fresh V8 evidence;
the explicit evaluation command does that. If intentionally updating fixtures or
evaluation code, rerun the command, review every difference and then copy its
`evidence.json` to `docs/evidence/additional-measurements/results.json`.

Reconsider CRAP only with an exact source-range/statement-ownership join that passes
the counterexamples and the unvalidated source-map cases. Reconsider Halstead with
an explicitly defined syntax-complete counter (or explicit unsupported results)
that passes these hand-counted cases and broader language fixtures. Any later
integration needs fresh production provenance and its own policy review. Neither
deferral authorizes new thresholds, coverage expansion or application refactoring.
