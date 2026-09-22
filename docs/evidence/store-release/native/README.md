# Native gate evidence (store release bars 3 + 5)

The harness is `harness/native/README.md`. Each run is written to its own `<stamp>/` directory:

- `gate.json` — every check, the boot and result messages, and the bar-3 table
- `<platform>-clip.mp4` + `-sheet.jpg` — the played clip: cold boot → menu → countdown → the paced golden ride → crash → restarts

## 20260922-234239 — first native gate: web and iOS identical; Android partial, then blocked

Bundle: the store debug build (`VITE_STORE=1 VITE_STORE_DEBUG=1`) of the working tree on top of `af0f8c39`, with physics as shipped.

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
