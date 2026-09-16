# Development startup investigation — 2026-09-16

The reported problem is an unusually long blank window after `npm run dev`, before
the layout becomes usable. The approximate 45–60 seconds reported by the owner is
context, not a reproduction threshold. Startup remains unresolved. This investigation
identifies contributing phases; it does not establish a complete root cause or a fix.

Investigated source: `2f67f7a471255742cbeb090b5c0bd0eb76e80d0e`, PR #63,
tracking issue #40. The initial investigation was read-only; the implementation and
subsequent measurements below are separate from that historical evidence.

## Method and limitations

Windows 10.0.26200, Intel i7-1165G7, Node 22.23.2, repository-locked dependencies.
All runs used separate empty temporary profiles, disabled startup refresh, and the
existing opt-in tracing. No research database or research CIFs were read or modified.
No restart or filesystem cache reset was performed. A fresh Vite dependency cache
is explicitly **not** a cold operating-system cache.

The earlier unprofiled development measurements reached the first React
`controls-ready` IPC event in 27.309, 8.615 and 6.394 seconds. The first spent
21.310 seconds before `main.loaded`, then 5.999 seconds until that React event.
Those numbers identify a real delay but do not measure visible paint or usability.

This investigation added renderer resource/navigation timings, a sampled CPU profile,
timestamped build output, and Vite dependency/transform logs through a temporary
diagnostic harness. These instruments add overhead. Timing variants are small,
sequential exploratory samples, not statistically controlled performance comparisons.

**Measurement correction:** the diagnostic renderer reported `visibilityState=hidden`;
paint entries were absent and animation-frame interaction probes timed out, even after
requesting foreground activation. The earlier descriptions of React readiness as
visible/usable controls were too strong. DOM insertion probes subsequently confirmed
that Quick Search could mount, but do not establish screen paint or input-to-display
latency. Foreground interactive measurements remain necessary.

## Measured phases

| Diagnostic case | Command to main code | Command to first React readiness event | Database initialization |
| --- | ---: | ---: | ---: |
| Existing cache, original configuration | 1.593 s | 4.171 s | 64 ms |
| Fresh dependency cache, sample 1 | 2.476 s | 10.420 s | 172 ms |
| Existing cache, diagnostic configuration | 2.091 s | 6.424 s | 94 ms |
| Fresh dependency cache, sample 2 | 1.830 s | 6.159 s | 171 ms |
| JSmol omitted from test HTML | 2.259 s | 7.303 s | 129 ms |
| Fresh cache, explicit dependencies/no discovery | 2.647 s | 7.445 s | 95 ms |

The no-JSmol case also logged a configuration-triggered dependency reoptimization.
It is not a clean speed comparison. Neither experimental variant demonstrates an
overall performance improvement. Both were diagnostic-only configuration overrides.

### 1. Development preparation is a confirmed contributor

`npm run dev` builds main/preload, starts Vite, then launches Electron. The previous
slow sample spent about 21 seconds before application main code. This cannot explain
time spent inside an already-visible blank window, but contributes to the total wait
after the command. Subsequent runs were much faster; filesystem/security scanning,
tool loading and machine load were not independently profiled, so their individual
contributions are unknown.

With a new Vite cache, dependency logs directly recorded a 3,138.69 ms scan and
228.74 ms bundling operation. In that run, optimization completed about 5.10 seconds
after command invocation, with React readiness at 6.16 seconds. In the other fresh-cache
sample, the renderer's `main.tsx` request lasted 3.53 seconds. Cache invalidation and
dependency preparation therefore contribute to the window's loading interval.

An explicit-dependency diagnostic override removed discovery and reduced the entry
request to 278 ms, but total readiness still took 7.45 seconds. Do not promote that
override as a proven fix; it also introduces dependency-list maintenance requirements.

### 2. The initial renderer waits for an eager module graph

The normal profile captured 44 resource requests totaling about 2.53 MB decoded,
including development React code, CSS, dialogs, compound details, JSmol adapters and
diffraction modules before any result was selected. Static imports connect
`App → ResultsWorkspace → CompoundInfoPanel → viewer/diffraction` even when the
empty-results path does not mount the details panel. Module requests arrive in
successive dependency waves, with the deepest JSmol adapter modules among the final
requests before DOM content loaded.

In the 4.17-second sample, renderer navigation completed in 2.16 seconds. Individual
requests included CSS at 806 ms and App at 504 ms. These durations overlap and must
not be added together. The renderer CPU profile recorded about 2.05 seconds in idle
samples, compared with roughly 0.27 seconds attributed to the DataGrid module's
top-level frame. This supports waiting for development resources as a contributor;
it is not proof that a specific transform or React component causes the entire delay.

### 3. JSmol blocks parsing but is not established as the dominant cause

`index.html` loads the 222 KB JSmol script synchronously in the head. Chromium
classified it as render-blocking. Requests measured approximately 139–449 ms in
the examined baseline/fresh-cache traces; one CPU profile attributed about 8 ms of
samples to its top-level frame. Omitting it did not eliminate the multi-second wait.
Deferring it is a candidate for investigation, with viewer readiness/error handling
and the viewer regression suite required before any implementation change.

### 4. Imports and empty-database initialization do not explain these samples

No import worker started. Database initialization occurred after the first React
readiness event and took 64–172 ms. The renderer mounts its layout before requesting
the database summary; there is no database-await gate around initial React mounting.
This does not rule out migration or native-module delays with populated profiles.

### 5. The loading experience is blank by construction

The HTML body initially contains only an empty root. React and its static dependency
graph must finish loading before application controls or an explanatory message can
appear. There is no initial loading indicator or startup phase/error display outside
that graph. This amplifies the perceived failure during real loading delays.

## Recommended next implementation experiments

1. Add a minimal early startup display and a renderer-load failure path; measure
   first visible feedback separately from usable controls. This improves feedback,
   not necessarily total startup time.
2. Test moving result-only viewer/diffraction/detail code off the initial import path,
   and lazy-load JSmol with explicit readiness handling. Compare module waterfalls,
   first search, and first structure viewing; do not merely move an unexplained delay.
3. Profile the Vite process during a slow first launch and compare dependency
   prebundling/warmup configurations. Retain both cache-valid and cache-rebuilt cases.
4. Repeat in a foreground desktop session with a synthetic populated profile,
   migration case, and actual typing/search/paint measurements. Keep the separate
   packaged cold-start acceptance protocol in #40; do not substitute these dev tests.

## Retained evidence

Local raw reports, network events and CPU profiles are retained under the temporary
directories below; these contain local source paths and are not intended for public
upload without sanitization. Harness/config files are local under `.dist`.

| Case | Temporary directory basename |
| --- | --- |
| Earlier ordinary dev measurements | `cif-normal-launch-LVvIqx` |
| Existing cache/original config | `cif-dev-investigation-xN6eNO` |
| Fresh cache 1 | `cif-dev-investigation-aLbkvg` |
| JSmol omitted | `cif-dev-investigation-4pcWmp` |
| Existing cache/diagnostic config | `cif-dev-investigation-MOEPTs` |
| Fresh cache 2 with Vite logs | `cif-dev-investigation-E3BZAz` |
| Explicit dependency experiment | `cif-dev-investigation-cAtcfo` |

Checks performed: isolated startup traces, resource/CPU profiling, Vite logs, DOM
Quick Search mounting, source inspection, and documentation diff review. Full unit,
UI, worker and packaging suites were not rerun because no product source was changed.

## Startup implementation and subsequent measurements

The working change defers `CompoundInfoPanel` and its viewer/diffraction dependency
graph until a result is selected. A scoped error boundary keeps search available if
that chunk fails. JSmol's local script loads on demand, with one shared request,
timeout/error reporting, and protection against creating an applet after disposal.
HTML now supplies initial startup feedback; a small bootstrap dynamically loads React
and offers reload when the renderer entry cannot load. No Vite optimization settings,
scientific calculations, database migrations or import behavior were changed.

The revised diagnostic harness explicitly shows/focuses the Electron BrowserWindow
through the main-process inspector. These samples reported visible document state;
they supersede the earlier hidden-window observations for this comparison. Both
variants used fresh Vite caches, isolated empty profiles, Node 22.23.2 and the same
machine. Baseline is an archived checkout of `2f67f7a` sharing the dependency install;
changed source is the working tree. Different checkout paths, sequential ordering,
instrumentation, and uncontrolled OS caches limit causal timing claims.

| Metric | Baseline samples | Changed samples |
| --- | --- | --- |
| Command to first React readiness | 4.565 / 7.408 / 7.697 s | 4.920 / 4.224 / 6.681 s |
| Median React readiness | 7.408 s | 4.920 s |
| Initial resource count | 44 each | 34 each |
| Initial decoded resource bytes | 2,632,274 each | 2,057,331 each |

The changed median is about 34% lower in this small sample; this is not a percentile
claim or a guarantee of the same gain on other machines. The structural reduction is
10 initial requests and about 22% fewer decoded bytes. Chromium recorded changed
first-contentful paint at approximately 2.09 / 2.14 / 3.17 seconds from command
invocation, before React readiness in each sample. Two baseline paint observations
were still unavailable when collected, so there is no three-sample paint-speedup claim.

First-selection tradeoff, one exploratory sample per version using copies of the
same synthetic one-entry profile: from entering/submitting the search (including a
200 ms input-settling wait), details/loaded viewer took 0.335/0.864 seconds before and
0.588/2.465 seconds after. Loaded viewer means a canvas and visible atom data, not
merely a script tag. Deferred loading adds latency to first structure viewing; the
tests do not support claiming that every workflow became faster. Subsequent viewer
loads reuse the runtime. Real JSmol representation, resize, failed-load recovery and
rapid-selection regressions passed.

Additional regressions verify early startup feedback while the renderer request is
held, reload feedback after that request fails, absence of JSmol/details requests in
the empty workspace, shared runtime loading, failure/retry, timeout and disposal.
All 369 unit tests, Electron UI and viewer suites, production build/type checks,
architecture and unused-code gates passed. The UI test also exposed an intermittent
JSmol `setScreenDimension` error at reload; an untouched baseline reproduced it, and
the final changed UI run did not. It remains a separate lifecycle follow-up, not a
demonstrated regression introduced by deferred loading.

The production worker/native preservation suite and architecture/unused-code gate
regression probes also passed. The final UI run injected a deferred-details download
failure and verified that results and Quick Search remained available. Expected
React diagnostics from that injected failure are not unexpected runtime failures.
The baseline reload finding is tracked on
[#41](https://github.com/ogundimo/cif-crystal-data/issues/41#issuecomment-5701555043).
Windows packaging and actual OS-cold acceptance were not rerun for this change.

The startup problem is improved, not declared universally resolved. Vite scanning
still contributes to fresh-cache development launches. Actual OS-cold packaged
measurements and representative populated/migration acceptance remain outstanding.

New local raw-report directory basenames: baseline `cif-dev-investigation-vUp2SW`,
`cif-dev-investigation-SJTDdj`, `cif-dev-investigation-qkXnos`; changed
`cif-dev-investigation-7mc6Dx`, `cif-dev-investigation-hFdNlK`,
`cif-dev-investigation-UG903Z`. First selection: baseline
`cif-dev-investigation-wbrAEN`, changed `cif-dev-investigation-kQcgV3`.
