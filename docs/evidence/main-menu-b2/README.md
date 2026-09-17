# Main menu — round 3 B2 "Strip" built (ask 42)

The user picked B2 (`assets/design/menu/round3/B2-strip.jpg`, SPEC § B2) with the round's rules: the four actions large (≥ 72 px), nothing about level / session / next up / cleared on the title menu, the hero card replaced by a midair jump in the Nalati grassland. Everything here is captured headless from the built `dist/` (`?sw=0`), Chromium/SwiftShader, DPR 2, iPhone UA on the phone geometries.

## Stills (`harness/e2e/menu-stills.mts --out=docs/evidence/main-menu-b2`)

| Geometry | Still | Strip | Band | Tile heights (PLAY · GARAGE · REVIEW · SETTINGS) | CREDITS target | Leak audit |
|---|---|---|---|---|---|---|
| 932×430 | `menu-932x430.png` | 932×279 (3.3:1 box, the plate at 50 % / 50 %) | 151 px | 95 · 95 · 95 · 95 | 206×44 | clean |
| 844×390 | `menu-844x390.png` | 844×248 | 142 px | 86 · 86 · 86 · 86 | 188×44 | clean |
| 1280×720 | `menu-1280x720.png` | 1280×532 (2.4:1: the whole plate) | 188 px | 132 · 132 · 132 · 132 | 88×44 | clean |

Tile height is `--tile-h: clamp(72px, 22vh, 132px)`; PLAY is `flex-grow: 1.6` (290 px wide at 932, 260 at 844, 411 at 1280) and the only amber tile. The band is `12px + --tile-h + 44px (CREDITS row) + safe-area-bottom`, so PLAY's centre sits at 79–83 % of the height on the phones (`band-low` in the e2e).

**Leak audit** = the menu's rendered words (`innerText`, the build stamp removed) must equal exactly `TRIALS GAUNTLET TRIALS GAUNTLET PLAY GARAGE REVIEW SETTINGS CREDITS` (the big title, the badge, the five actions) and match no time (`m:ss`), count (`n / n`), or progress word (cleared, next, last, session, best, rookie, medal); `.menu-ticker` / `.menu-chip` must not exist in the DOM. It runs in three places: `menu-stills.mts` (fails the process), `harness/e2e/touch.mts` `front` flow (`menu-no-leak`, `menu-no-progress`, `menu-no-ticker-chip`, `menu-tile-72`) and the clip below (every return to the menu). Source-side, `MainMenuScreen` no longer takes `bestOf` / `state`, and `setTracks` / `setBike` / the ticker / the chip are deleted, not hidden (`src/ui/front.test.ts` pins the exact rendered text).

## Played clip (`clip.mts` here; also `harness/out/main-menu-b2/clip.mts`, which `harness/out/` ignores)

`clip-boot-menu-play-garage-settings-932x430.mp4` (29.5 s) with `clip-timings.json`: cold boot → the loader → the title menu (the grassland tint, then the plate decodes 0.7 s after the menu is live) → PLAY (tap, the level select) → MENU → GARAGE → back → SETTINGS → back. Every tap goes through the touchscreen onto the live tile; the audit ran on all four menu visits: `allClean: true`, tiles 95 px, plate loaded. Onboarding is pre-dismissed (`trials.onboarded`) — the card shows on the first run, not over the menu, so the menu path is unchanged by it.

## The Nalati plate

The biome does not exist; the strip is a key-art plate. Brief + recipe: `assets/design/menu/round3/build/plate-brief.md`, `gen-plate.sh` (`codex exec -s workspace-write -i B2-strip.png -i round2/ref-garage-932x430.png`, image_gen 1536×1024; two runs — the first, `nalati-plate-r1.jpg`, drew the rider 59 % of the frame tall, which no phone strip can hold; the second, with the rider inside the middle 40 %, is the one shipped). Raw kept at `assets/art/raw/keyart-nalati.png`; `assets/art/selection.json` carries the crop (`1536x640+0+210`, 2.4:1: rider, yurts, peaks, NORDVIK banner) and `q: 74`; `build.mjs` honours both, so the pack rebuilds it. Manifest: `kind: keyart`, `biome: nalati`, appended after the industrial / canyon entries (so `keyart()` without a biome still resolves industrial first).

| Tier | File | Size | Bytes |
|---|---|---|---|
| 2x (DPR > 1.5 or width > 1400) | `public/art/menu/keyart-nalati-1920.webp` | 1920×800 | 236 120 |
| 1x | `public/art/menu/keyart-nalati-960.webp` | 960×400 | 97 812 |

(The industrial plate it replaces on the menu: 263 302 / 92 208.) Loaded as before: the manifest fetch after boot, `applyBackground` decodes the image and fades it in over the tint; nothing awaits it. Bundle after the change: index 330.81 KB gz + three 192.10 KB gz (budget 600 KB).

## e2e

- `pnpm harness:e2e --only=front` (932×430 + 844×390): 673 / 678 — the 5 fails are `front@iphone13:tracks R3-overlap` on `.tpin` / `.tm` / `.gate` (the level-select owner's world map, in flight in the same checkout); every menu check passes on both phones.
- `pnpm harness:e2e --only=desktop` (keys + pad at 1280×720 and 1920×1080): 188 / 188 — tab order `play,garage,review,settings,credits`, nav-right steps, focus back on Play.
- `vitest run src/ui`: 87 / 87 at the end (a `trackSelect.test.ts` fail mid-round was the same owner's, since fixed). Menu: 6 / 6.
