# Store screenshots (Phase 6 listing kit)

Every ride shot comes from a played golden (`harness/inputs/<id>/bot-3.json`, 0 faults on HEAD physics), replayed in the store debug bundle. The bundle is a clean `git archive` export of 9735f338 (`store/build/SOURCE`), and each frame is grabbed at an exact tick. Nothing is posed or retouched. The only step after capture is lossless `oxipng`, and the ImageMagick pixel signature is identical before and after it for all 18 files. Every ride frame shows BAILS 0.

- **iOS:** `store/screenshots/app-store-6.9/`, 2868×1320. These are the iPhone 17 Pro Max simulator's own WKWebView snapshots (`rockhop-gate`, a fresh install).
- **Play:** `store/screenshots/play-phone/`, 1920×1080. This is headless Chromium on Metal in the game's phone layout, at 960×540 CSS px × DPR 2.

To regenerate, from the repo root:

```sh
node scripts/store-build.mjs debug --ios
npx tsx harness/native/screens.ts ios --map --final
TRIALS_BROWSER_BACKEND=metal npx tsx harness/native/screens.ts play --map --final
```

## How the moments were picked

The golden set pieces and airtime come from `harness/trailer/survey.ts` and `harness/trailer/features.ts`. 429 candidate ticks across the 12 courses were shot and every contact sheet was read. The picks were then viewed at full size.

The zone coverage:

- **Quarry:** the head pulley and the rope bridge.
- **Alpine:** the teetering log and the flume.
- **Coast:** the hull ramp and the buoy gate.
- **Snowline:** the cornice's wind lip, with the lift line behind.

## Store order

| # | file | track · tick | shows | iOS | Play |
|---|---|---|---|---|---|
| 1 | `01-d2-conveyor-t2198` | D2 Conveyor · 2198 | **hero**: high air off the head pulley, with the headframe, the belt and the open pit behind | ✓ | ✓ |
| 2 | `02-a2-log-jam-t2164` | A2 Log Jam · 2164 | wheelie launch off the teetering log, over the logging truck | ✓ | ✓ |
| 3 | `03-c3-hull-breach-t812` | C3 Hull Breach · 812 | airborne off the stern over the harbour, with the cranes, ship and containers | ✓ | ✓ |
| 4 | `04-s2-cornice-t1428` | S2 Cornice · 1428 | high air off the cornice's wind lip, with the chairlift line and the snow-cat | ✓ | ✓ |
| 5 | `05-d3-rope-walk-t3418` | D3 Rope Walk · 3418 | front wheel up across the rope bridge's missing boards | ✓ | ✓ |
| 6 | `06-c1-low-tide-t906` | C1 Low Tide · 906 | through the buoy gate on the quay, under the signal flags | ✓ | ✓ |
| 7 | `07-s2-cornice-t2846` | S2 Cornice · 2846 | nose-down mid-air over the fence shelf | ✓ | — |
| 8 | `08-a1-sawdust-t2604` | A1 Sawdust · 2604 | off the flume's lip over the mill pond | ✓ | — |
| 9 / 7 | `…-s1-lift-line-t40xx` | S1 Lift Line · results | CLEAN LINE ticket: 0:30.500, BAILS 0, OBSIDIAN, FIRST CLEAR | ✓ | ✓ |
| 10 / 8 | `…-world-map-t0` | world map | 12 / 12 CLEARED, reached through the ticket's MAP tile | ✓ | ✓ |

The counts sit at each store's cap: iOS takes up to 10 and Play up to 8.

### How the last two shots are made

The results shot is not a harness frame. The golden is ridden in the app itself, fed tick for tick from GO, and it finishes at 30.5 s with 0 bails, the golden's own time. The ticket is shot once its reveal lands, so its tick varies by a few frames between runs.

The map reflects the run's own save. Every set course is played out to its finish first, and the other courses are ridden unrendered, so the map reads 12 / 12. A fresh save would show only one cleared course and locked zones.

## Findings for other owners

- **Brand/UI:** on the ticket, the earned medal's laurel wreath overlaps its label, so "OBSIDIAN" reads "OBSID AN".
- The iOS Simulator no longer renders the zones dark (fixed by baef4b0c). The iOS and Chromium frames match.

## Not done

- **Marketing captions:** not done. The pipeline has no caption layer, and the uncaptioned set is the final one.
- **App preview:** skipped at the parent's call. Apple's current spec for a 6.9" landscape preview is **1920×886, 30 fps, 15–30 s**, H.264 at 10–12 Mbps or ProRes 422 HQ, at most 500 MB, with stereo AAC audio if present (https://developer.apple.com/help/app-store-connect/reference/app-preview-specifications). A draft beat-capture script for the store bundle is not committed.

The Play feature graphic `store/play/feature-graphic-1024x500.png` was re-exported from `assets/brand/feature-graphic.png`, the F1 art with the current SVG wordmark, built at ab8c7af4. Its pixels are identical to the one already shipped (RMSE 0).
