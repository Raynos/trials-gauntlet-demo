# Frozen qualification — paused at user request

Simulation fingerprint `1255af7f`, implementation commit `2dece1ce`. Frozen capture
build: `/tmp/trials-poses-round3/dist`; served JavaScript/model hashes are in each
capture's `evidence.json`. Input-only recordings and full production snapshot replay
checks live in `inputs/`. Fresh bot and stranger evidence is in sibling
`goldens-round3/` and `strangers-round3/`. Earlier fingerprint results are historical.

Typecheck/build and139 contact/stance/cloth/release/snapshot tests pass. The transition
audit covers20 outfit/detail/class combinations,1700 actual-skin samples, minimum
rear-fender clearance8.197mm. Hop audit covers1220 samples, no fault, minimum12.625mm.
These geometry checks do not substitute for played visual review.

`visual-review.json` records parent judgments of temporally ordered decoded frames
from actual input-driven30fps clips. Full MP4s remain available; this is not a claim
of human continuous-video viewing. Raw capture folder `/tmp/trials-poses-round3/`
contains both success and failure reports. Two early low-tier captures were rejected
only because the harness treated Chromium's Canvas2D readback optimization advisory
as an execution error; that exact warning remains in evidence but no longer blocks
capture. All other warning/error rules remain unchanged. Fresh reruns are separate.

Headless WebKit phone-layout transition capture:932×430 CSS pixels, requestedDPR3,
actual1398×645/DPR1.5,165 frames, no errors. Synced render p95 is4.68ms on this Mac
under concurrent work, a diagnostic compatibility result, not iPhone performance.
Actual-device judgment is queued separately (HR-14).

Handling/replay/stranger/ship and full motion appearance qualification are underway.
No completion claim is made here.

Round 3 motion qualification now includes 60 reviewed combinations: two classes ×
five outfits × two detail tiers × lean transitions / hop-flat-impact-crash-restart /
kicker-sloped-impact-thrown release. See `visual-review.json`. The complete archive
contains 62 clips including the extra initial Race and WebKit phone captures;
`all-capture-replays.json` proves 14,810 sampled states, hashes, run clocks and display
times equal to independent production replay. `captures.json` records file hashes.
The thrown-motion actual-skin audit reaches -2.38 mm minimum signed fender clearance,
inside its declared 5 mm numerical envelope, with no samples beyond that envelope.
This is not a claim of mathematically zero surface penetration.

The first full Metal gate passed 30/31, including native rendering p95 4.73 ms and
restart frame p95 5.63 ms. Its single failure was raw JS heap growth 8.36 MB. Both
failure and software-renderer results are retained. `heap-diagnostic.mts` reproduces
five minutes of production play and records raw and GC-retained heaps at each minute:
retained heap falls from 24.19 MB to 22.91 MB after one minute and is 23.45 MB after
five minutes. The raw endpoint mixed live objects with uncollected garbage. The gate
now measures retained growth with GC at both endpoints, outside all timed samples;
the 5 MB limit and 60 seconds of play are unchanged. The fresh full Metal gate passes 31/31 (`metal-ship-gate.json` and `.log`): rendering p95 5.06 ms, with every original hardware limit retained.

The loaded full test run has 1,074 passes, five failures and two skips. Failures are
the two unchanged 5 microsecond CPU bars, two not-yet-refreshed hard-track goldens,
and a 5 second cloth-test timeout under concurrent load. These remain failures until
fresh, appropriately scheduled verification succeeds; their log is preserved.

Headless WebKit complete-clear replay also passes all four selected recordings:
B1 and E2 on both classes, exact physics hashes, finish-time bytes, continuous-clock
bytes and zero faults (`webkit-clears.json`). The first attempt used a Chromium-only
heap helper and stopped before replay; its setup error is retained separately.
The cloth file rerun in one worker passes all 14 tests; no timeout was raised.

## Pause checkpoint

The user requested a pause because of usage. See [PAUSE.md](PAUSE.md) for the
authoritative current state and precise next step. All 48 goldens and 12 fresh
players are now exact-qualified. The serial suite passes 1,078 tests with one R8
recovery-measurement failure and two skips; CPU bars pass. The R8 diagnosis is
preserved without changing its test or physics. Final capture total is 63, with
15,020 exact sampled states including the Snow Line phone sequence.
