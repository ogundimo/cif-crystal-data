# Performance Baseline

Measured on 2026-07-16 with Electron 39.8.10, Node 22.22.1, and SQLite 3.51.2 on
the release-development Windows machine. Run `npm run benchmark:database` to
repeat the deterministic 10k, 100k, and 1M-row benchmark. The benchmark is a
manual/scheduled release gate, not part of the fast correctness suite.

## Baseline before paging

| Rows | Insert rows/s | Fetch all | JSON encoding | Payload |
| ---: | ---: | ---: | ---: | ---: |
| 10,000 | 88,410 | 37 ms | 24 ms | 3.37 MB |
| 100,000 | 47,245 | 704 ms | 390 ms | 33.94 MB |
| 1,000,000 | 30,651 | 10.72 s | 6.79 s | 341.28 MB |

This reproduced the backlog's 50k–100k paging threshold. Search now transfers
at most 500 rows per request, returns the total separately, loads more near the
end of the grid, and sorts in SQLite.

## Query medians

| Rows | Query | Before index | After index |
| ---: | --- | ---: | ---: |
| 100,000 | SG number | 17.76 ms | 0.03 ms |
| 100,000 | Cell-a range | 24.01 ms | 0.77 ms |
| 1,000,000 | SG number | 475.02 ms | 0.15 ms |
| 1,000,000 | Cell-a range | 292.65 ms | 8.01 ms |
| 1,000,000 | Reference contains | 625.16 ms | 447.60 ms |
| 1,000,000 | Element | 735.02 ms | 558.02 ms |

The SG-number and cell-dimension indexes are justified and included in schema
version 3. A normal B-tree cannot accelerate a leading-wildcard reference
search. FTS is deferred because 100k reference and element medians remain below
100 ms (84.43 ms and 91.70 ms); changing their matching semantics is not
justified for the supported desktop scale.

## Release budgets and boundary

- Supported release scale: up to 100,000 compound entries and ordinary CIF
  files below tens of megabytes.
- Search page: no more than 1,000 rows; the UI requests 500.
- Indexed SG/cell filters at 100k: median below 10 ms.
- Reference and element filters at 100k: median below 100 ms.
- Full 10k/100k/1M benchmark must complete and publish its log in the scheduled
  performance workflow.

The million-row case remains a stress measurement, not a supported workload.
A long-lived database worker, FTS, resumable imports, and streaming parsing are
triggered only if production requirements expand beyond this documented
boundary or representative 100k operations exceed these budgets.
