# Native gate — the ship gate and bar 3 inside the real shells

`docs/plans/STORE_RELEASE.md` bars 3 and 5. The same in-app runner, `src/platform/gate.ts`, runs in three places:

- the iOS WKWebView (Simulator)
- the Android WebView (emulator)
- headless Chromium

It checks the same things each time: cold boot, start a track, replay goldens to the finish, crash, and instant restart. It also checks that every recording finishes at a **byte-identical time** on all three.

```
node scripts/store-build.mjs debug --ios --android    # VITE_STORE=1 VITE_STORE_DEBUG=1 → store/build/web, cap sync, .app + .apk
npx tsx harness/native/gate.ts web,ios --evidence          # the web leg renders on Metal by default on macOS
npx tsx harness/native/gate.ts web,ios --from-out --evidence   # re-report the last runs without launching anything
```

**Source rule (parent, 2026-09-22):** the bundle is always built from a clean `git archive` export of HEAD (`/tmp/rockhop-build-<sha>`, node_modules linked), never from the shared working tree, which carries other sessions' uncommitted physics and UI. `store/build/SOURCE` records the sha and `gate.json` reports it as `source`. `--from-tree` is for local iteration only.

**Load rule (user, 2026-09-22):** do not start the Android emulator unless the user asks for it. With software GL it held about 490 % CPU and pushed the shared host to a load average of 50, so the Android leg is BLOCKED. The user's own Android phone is the Android check. Run the iOS Simulator leg only when `uptime` shows a load average under 12, and run one gate at a time. Web legs render on Metal by default on macOS.

## How a run works

1. **Arm.** A gate launch passes the config as a launch argument:
   - iOS: `simctl launch … -rockhopGate '<json>'`
   - Android: `am start … --es rockhopGate '<json>'`

   The debug shell then injects a document-start script. It only exists in debug builds: `#if DEBUG` in `RockhopViewController.swift`, and `FLAG_DEBUGGABLE` in `MainActivity.java`. The script:
   - makes `navigator.webdriver` true, so the game opens **no AudioContext** (the silent rule, `src/audio/automation.ts`)
   - counts every AudioContext constructed (the gate fails on anything but 0)
   - sets `window.__rockhopGate` to the config
   - provides the result sink `window.__rockhopGatePost`
2. **Boot stage (the player's path).** Cold start → hook ready → loader gone over the menu → `app.play(track)`. The runner taps the first-ride card as a player would, then runs through the countdown to riding and on to `location.replace('./?harness=1')`.
3. **Harness stage (the harness owns the clock).** In order:
   - every golden replayed with `runRecording`
   - one golden replayed again at 60 fps with a rendered frame each: this is the clip, and it proves rendering never touches the sim
   - the crash recording, then the restart mash back to control
   - 20 instant restarts

   This is the ship gate's G2–G6 (`harness/gate/ship-gate.ts`), with the limits from `harness/gate/thresholds.json`.
4. **Results.** Where each platform's results land:

   | Platform | Where the results go | Clip |
   |---|---|---|
   | iOS | `Documents/gate/<name>.json` in the app container, read with `simctl get_app_container` | `simctl io recordVideo`; the panel is portrait, so the clip is rotated upright |
   | Android | a `sessionStorage`-backed map, read over plain CDP (`adb forward` to `webview_devtools_remote_<pid>`, then `Runtime.evaluate`; Playwright's `connectOverCDP` does not work against a WebView) | `adb shell screenrecord` in 170 s segments |
   | Web | a Playwright binding | none |

**Bar 3** is each recording's finish time as the float64's own 8 bytes (`finishTimeHex`), plus the final state hash, compared across platforms. The recordings ship inside the app under `gate/`, so there is no network.

## Files

| file | what |
|---|---|
| `gate.ts` | CLI: runs the platforms, checks, bar-3 table, `--evidence` → `docs/evidence/store-release/native/<stamp>/` |
| `ios.ts` | own simulator `rockhop-gate` (iPhone 17 Pro Max, created on first use; other sessions' devices untouched); platform `ipad` runs the same iPhone-only app on `rockhop-gate-ipad` (iPad Pro 11-inch) in compatibility mode — bar 5's iPad row |
| `android.ts` | own AVD `rockhop_api36` on console port 5584, `-no-window -no-audio` (BLOCKED, see the load rule) |
| `web.ts` | headless Chromium over `store/build/web` with a plain static server |
| `screens.ts` | store screenshots from played runs: iOS 6.9" 2868×1320 from the simulator, Play 1920×1080 from Chromium as a phone; `--final` → `store/screenshots/` |
| `lib.ts` | manifest, commands, result shapes, bar-3 comparison |
