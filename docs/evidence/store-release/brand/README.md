# Brand / UI evidence (store release D17–D23)

`after/`: headless captures of the shipped build, silent. Chromium ran on the Metal backend and WebKit ran headless, one at a time, at the two phone sizes 932×430 and 844×390. Each run shows five screens:

- the home screen;
- the countdown (`READY`);
- mid-ride, with the HUD layout unchanged and a BAILS pill;
- the results ticket after a played Low Tide finish on held full gas;
- the world map after the ticket's MAP.

The script is `assets/brand/tools/capture.mts`. `results-reveal.webm` is the same flow in Chromium 932×430 as a clip.

`before/` holds the pre-rebrand screens from round 1 (`assets/design/store-release/round1/current-*`).

ip-audit on the store build's `dist/` (`pnpm build:store && node scripts/ip-audit.mjs dist`):

| term | before (P0 baseline) | after round 1 (ab8c7af4) | after the cutover |
|---|---:|---:|---:|
| trials | 95 | 24 | 0 |
| gauntlet | 34 | 16 | 8 |
| demo | 7 | 2 | 0 |
| rising | 4 | 7 | 7 |
| retired level names | 123 | 127 | 108 |
| **total** | **264** | **176** | **123** |

What is left, and who owns it:

- Retired level names in the JS bundle, plus `gauntlet` ×3 and `rising` ×5. The retired curriculum is still registered in `src/tracks` (Tracks).
- `x3-gauntlet`, See-Saw and Stairway in `art/manifest.json` and `load-manifest.json`. These are the track thumbs in `public/art/thumbs` (World).
- `rising` ×2 in the OFL licence texts: "ar**ising**" in the licence's own words. This is an ip-audit false positive, and the audit needs a word boundary (Release).
