# Performance preflight — no runtime milestone pass

The rejected generic-head correction02 was measured in a frozen production build by headless WebKit on Apple GPU for 30 seconds. reports/head-a3-webkit30.json records 1798 rAF samples, mean 16.685 ms, median 17 ms and p95 25 ms. The desktop p95 ≤16.7 ms budget was not met. The trace includes real recording and deterministic setter overhead; it is not an isolated GPU measurement or a result for the subsequent scan source. WebKit timestamps in this trace have 1 ms granularity. Do not round the result into a pass or reuse this report for a different GLB.

The first Chromium diagnostic used SwiftShader and overlapped another browser, and its multi-setter loop rendered multiple times per sample. That report is explicitly invalid as a clean desktop performance benchmark. Missing-file, responsive touch and deterministic canvas checks remain scoped technical checks, not game replay or physical-device evidence.

A later full runtime acceptance run must isolate scene timing from capture overhead, preserve an accompanying played clip of the same revision, declare browser/GPU/resolution/DPR/warmup, and test the 30 fps garage on an actual iPhone. No physical device was connected during device preflight.
