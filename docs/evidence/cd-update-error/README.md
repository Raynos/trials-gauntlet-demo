# Ask 84: "new build" pill, crash screen, readable stacks

Played headless against built `dist/` (build `1647f7cb`) plus a second build of the same tree
(`GIT_DIR=/nonexistent VERCEL_GIT_COMMIT_SHA=feedc0de… npx vite build`, build `feedc0d`, which is also the Vercel sha
fallback path). One static server switches its root mid-test, the way a deploy lands while the app is open.
Every run was silent: `?audio=0` on every game URL, and `--mute-audio` on Chromium.
Engines: WebKit 932×430 phone (touch, iPhone UA), WebKit 430×932 portrait, Chromium 1280×720 desktop.
The script is `verify.mts` (header has the commands). Raw numbers are in `results.json`.

| check | WebKit phone | Chromium desktop |
|---|---|---|
| (a) `/version.json` build == running `__BUILD_ID__` | ✓ | ✓ |
| (b) deploy → `visibilitychange` → 1 fetch → pill lit on menu and world map (hit-tested) | ✓ | ✓ |
| (b) pill absent for the whole ride, including a check fired mid-run, and absent on pause | ✓ | ✓ |
| (b) back on the menu → pill → tap → cache-busted reload → running `feedc0d`, pill gone | ✓ `webkit-update.mp4` | ✓ `chromium-update.mp4` |
| (b) the same tap with the service worker in control: waiting worker adopted (`handOver`), worker reports `feedc0d-…`; version.json answered by the network, not the worker | ✓ `webkit-sw.mp4` | ✓ `chromium-sw.mp4` |
| (c) `?crash=play`: sheet over the run; stack `crashTestSetRun ← render ← advance ← tickFrameInner ← tickFrame ← frame`, no 1–2 letter frame | ✓ `webkit-crash.mp4`, `19-…sheet.jpg` | ✓ `chromium-crash.mp4` |
| (c) `?crash=reject` (unhandled rejection) and `?crash=boot` (boot step → sheet over the loader) | (portrait boot sheet `02-…`) | ✓ `chromium-reject.mp4`, `chromium-boot.mp4` |
| (d) cold boot → ride → loop-out bike crash → Enter restart → riding: no sheet, no pill, 0 page errors | ✓ `webkit-clean.mp4` | ✓ `chromium-clean.mp4` |
| portrait: pill sits above the rotate prompt; boot crash sheet fits 430×932 | ✓ `01-…`, `02-…` | n/a |

What remains minified: frames that run inside the inline loader (`index.html`, the boot plan's `step`/`A`). That
loader is esbuild-minified separately to fit its 8 KB budget (8162 B now), so those frames stay short. Frames from
the game bundle all read.

`names-probe.mjs`: `keepNames` alone is not enough. It sets `fn.name`. V8 prints that name in a stack;
JavaScriptCore (every iPhone browser) prints the source identifier instead. So production ships the
entry chunk with its identifiers unmangled, and still mangles three.js and the audio worklet.

## Size

| build, same tree | vite budget count | ship-gate `bundle.jsGzipKB` count (all `assets/*.js`) |
|---|---|---|
| fully mangled (before) | 570.1 KB gz | 584.7 KB gz |
| wildshard's `keepNames` + `minifyIdentifiers:false`, every chunk | 635.3 | ~651 |
| shipped: entry chunk unmangled, three + worklet mangled | 599.8 (600.1 after concurrent edits) | 614.5 |

The delta is **+29.7 KB gz** (+5.2 %). The raw entry chunk grows from 1125 KB to 1316 KB. `boot-ab.json` compares the
two builds booted alternately. `ready` p50 is Chromium 60 vs 60 ms. WebKit is bimodal at about 190 or 370 ms in both
builds, and its p50 flips between reruns. The Chromium menu cold boot is 12.8 vs 12.2 s, and WebKit is 5.1 vs 5.2 s.
None of these differences is larger than the run-to-run noise.
