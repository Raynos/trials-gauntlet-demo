# Native gate evidence (store release bars 3 + 5)

The harness is `harness/native/README.md`. Each run is written to its own `<stamp>/` directory:

- `gate.json` — every check, the boot and result messages, and the bar-3 table
- `<platform>-clip.mp4` + `-sheet.jpg` — the played clip: cold boot → menu → countdown → the paced golden ride → crash → restarts

Since `20260923-005522`, `scripts/store-build.mjs` builds from a clean `git archive` of HEAD, never the shared working tree. The sha is `source` in `gate.json`.

## 20260923-005522 — HEAD `a736a26f`: web, iPhone and iPad (compatibility mode) byte-identical on 7 rows

Bundle: store debug build of `a736a26fb89caff64218b8d662ab315b04ef20f5`, from a clean export.

**Bar 3.** Each row compares the float64 bytes of the finish time, the tick count and the state hash. Every row is identical on all three platforms:

- web: headless Chromium, ANGLE Metal
- iOS: 26.5 Simulator, iPhone 17 Pro Max, WKWebView
- iPad: Pro 11-inch M5, the iPhone app in compatibility mode

| recording | finish time | bytes | hash |
|---|---|---|---|
| flat-test `bot-3.json` | 8.591666666666667 | `efeeeeeeee2e2140` | `622bb2554e0f9a26` |
| b1-first-ride `bot-3.json` | 40.083333333333336 | `abaaaaaaaa0a4440` | `368f1ca5bd9e830a` |
| b1-first-ride `bot-3-pro.json` (Pro bike) | 38.825 | `9a99999999694340` | `5f78ab40a954f176` |
| c2-crane-hop `bot-3.json` | **no finish** (tick 39 after a bail) | — | `a775d149aec89fa9` |
| d3-rope-walk `bot-3.json` | **no finish** | — | `beb04535deaabed3` |
| s1-lift-line `bot-3.json` | **no finish** | — | `502ee6a306b1a85d` |
| flat-test paced at 60 fps, rendered | 8.591666666666667 | `efeeeeeeee2e2140` | `622bb2554e0f9a26` |

**Finding:** at this HEAD the committed ROCKHOP goldens (C2, D3, S1) do not finish when the game replays them through `runRecording`. The plain web build of the same commit gives the same result: `a775d149…` for C2, so this is not a store-build difference. The runs bail identically on every platform, which makes it a recording/track mismatch for the Tracks owner, not a shell problem.

**Ship gate:** every check passes on all three, except `clear.golden` on those three ROCKHOP rows.

| check | web | iPhone | iPad compat | limit |
|---|---|---|---|---|
| boot → loader gone | 5.6 s | 6.3 s | 8.4 s | informational |
| `app.play` → riding | 3.2 s | 4.1 s | 4.0 s | reaches riding |
| crash fault / fault → control | 0.858 s / 25 ms | 0.858 s / 25 ms | 0.858 s / 25 ms | ≤ 8 s / ≤ 500 ms |
| restart: one tick, wall p95, frame p95 | yes, 0.1, 4.3 ms | yes, 1.0, 5.0 ms | yes, 1.0, 7.0 ms | 1 tick, ≤ 5 ms, ≤ 33 ms |
| no countdown on restart | 1 tick | 1 tick | 1 tick | ≤ 12 |
| paced flat-test (516 frames) | — | 8.69 s | 8.61 s | real time: 8.6 s |
| AudioContexts (boot / harness) | 0 / 0 | 0 / 0 | 0 / 0 | 0 |

Clips: `ios-clip.mp4` and `ipad-clip.mp4`, each with a sheet. On the iPad, the iPhone-only app runs as a letterboxed window over the iPad's portrait home screen, which is iPadOS compatibility mode (D12).

## 20260922-234239 — first native gate: web and iOS identical; Android partial, then blocked

Bundle: the store debug build (`VITE_STORE=1 VITE_STORE_DEBUG=1`) of the working tree on top of `af0f8c39`, with physics as shipped. This run came before the clean-export rule; the numbers match the clean HEAD run above.

**Bar 3 — finish time: the float64 bytes, plus the state hash after the last tick.**

| recording | web (headless Chromium, ANGLE Metal) | iOS (Simulator, iPhone 17 Pro Max, iOS 26.5 WKWebView) | Android (emulator API 36 WebView, SwiftShader) |
|---|---|---|---|
| flat-test `bot-3.json` (1031 ticks) | 8.591666666666667 `efeeeeeeee2e2140` hash `622bb2554e0f9a26` | 8.591666666666667 `efeeeeeeee2e2140` hash `622bb2554e0f9a26` | 8.591666666666667 `efeeeeeeee2e2140` hash `622bb2554e0f9a26` |
| b1-first-ride `bot-3.json` (4810 ticks) | 40.083333333333336 `abaaaaaaaa0a4440` hash `368f1ca5bd9e830a` | 40.083333333333336 `abaaaaaaaa0a4440` hash `368f1ca5bd9e830a` | 40.083333333333336 (the shortest round-trip decimal names one double); hash not captured |
| flat-test paced at 60 fps, rendered | 8.591666666666667 `efeeeeeeee2e2140` hash `622bb2554e0f9a26` | 8.591666666666667 `efeeeeeeee2e2140` hash `622bb2554e0f9a26` (516 frames in 8.75 s) | — |

Web and iOS are identical to the byte on every row. The Android numbers come from the first emulator run's logcat, `android-logcat-20260922-1826.txt`:

- The flat-test row is complete and identical.
- The b1 row's finish time is identical.
- The b1 row's hash is missing: the log line was cut at 400 characters.
- Android's `result` message was lost before the harness could read it. The CDP reader had missed it across the boot→harness navigation; it now keeps results in `sessionStorage`.

The re-run was stopped by the user's instruction: the emulator's software GL pushed the shared host to a load average of 50. **The Android gate is BLOCKED; the user's Android phone is the Android check.**

**Ship gate, both platforms PASS:**

| check | web | iOS | limit |
|---|---|---|---|
| boot → loader gone over the menu | 7.0 s | 6.3 s | informational: the whole 36 MB offline pack is read from the bundle |
| `app.play` → riding (first-ride card tapped, countdown) | 3.2 s | 4.0 s | reaches riding |
| goldens cleared | 2 / 2 | 2 / 2 | all |
| crash fault at | 0.858 s (tick 103, `crash`) | 0.858 s (tick 103) | ≤ 8 s |
| fault → control (restart mash) | 25 ms | 25 ms | ≤ 500 ms |
| restart: tick 0 after one tick, 20 reps | yes | yes | yes |
| restart wall p95 | 0.1 ms | 1.0 ms | ≤ 5 ms |
| restart → synced frame p95 | 3.7 ms | 7 ms | ≤ 33 ms |
| no countdown on restart | 1 tick | 1 tick | ≤ 12 |
| AudioContexts constructed (webdriver true) | 0 | 0 | 0 |

The clip, `ios-clip.mp4` (30 s, sheet `ios-sheet.jpg`), still shows the old name and the warehouse world. The reskin has not landed; the gate proves the shell, not the look.
