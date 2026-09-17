# Level select round 5 — the C Ascent mountain painted (ask 44)

Base: round 4's world map (`docs/evidence/level-select/round4`). This round replaces the CSS strata with generated art so
the zoomed-out view reads as one mountain: five seam / cliff strips (apron→Industrial quay wall, Industrial→Canyon,
Canyon→Snow, Snow→Night City, Night City→Foundry), a tileable massif rock texture under the stack, and three dressing
sprites (chairlift, lit cabin, waterfall). Briefs + runner + sources: `assets/design/tracks/round4/build/` (`briefs/*.md`,
`gen.sh`, `out/*.png` 1536×1024 / 1024×1024 as generated, `logs/`); nine `codex exec … image_gen` runs in parallel,
82–98 s each, all exit 0. Cut: `node assets/art/tiles.mjs` → `public/art/tiles/*.webp` + `tiles.json` (folded into
`public/art/manifest.json` by `assets/art/build.mjs` at the next full build). Every file is on the lazy tier — probed by
`art.probe` on the track select's first show, never on the boot set; the CSS strata stay as the fallback until a strip decodes.

| File | What |
|---|---|
| `before-after-far-932x430.jpg` | The zoomed-out view, round 4 (CSS) vs round 5 (painted). |
| `clip-menu-play-zoomout-climb-snow-m2-ride-quit-932x430.mp4` + `clip-timings.json` | **Played**: menu → PLAY → two pinches out to the fit zoom (5/5 seams, massif, 3/3 sprites decoded) → pinch in on the apron → three drag strokes up the climb → SNOW rung → pinch in on M2 → tap M2 (focus) → tap M2 (launch) → ride 3 s → pause → Quit. `harness/e2e/tracks-climb-clip.mts`. |
| `sheet-{chromium,webkit}-{932x430,844x390}.jpg`, `far-*.jpg`, `seam-*.jpg`, `quay-*.jpg`, `open-*.jpg` | The seven states per engine / geometry (`tracks-stills.mts --seed=1`) and key stills. |
| `measure-{chromium,webkit}.json` | 24 states: 0 tappables < 44 px, 0 overlaps, 0 scroll axes, 0 px page overflow (unchanged from round 4). |
| `frames-chromium-932x430.json` | rAF idle p50 7.7 / p90 9.3 ms, drag p50 7.7 / p90 9.1 ms, inertia p50 7.9 / p90 9.5 ms, camera push 15 µs, 196 scene nodes (round 4: 183). |
| `tiles.json`, `generated-contact.jpg` | Bytes per tile and the nine raw generations. |

## Bytes (all lazy tier, `public/art/tiles/`)

| Kind | Files | Bytes |
|---|---|---|
| seam strips (1024×683 alpha WebP, bottom 15 % faded) | 5 | 98 + 100 + 97 + 104 + 109 = **508 KB** |
| massif (512² tileable WebP q72) | 1 | **49 KB** |
| sprites (keyed, trimmed, ≤ 448 px, cap 56 KB) | 3 | 43 + 48 + 47 = **138 KB** |
| round-3 plates (unchanged) | 6 | 533 KB |
| **tiles total** | 15 | **1 228 KB** (round 4: 533 KB) |

Bundle gz **335.36 kB** (≤ 600; round 4: 334.95), loader untouched (the tiles are never on the boot set). Suites: `pnpm typecheck` (both configs) clean, `vitest run src/ui` 87/87 (trackMap 12, trackSelect 8 unchanged), `harness:e2e --only=front` 421/421, `--only=run` 100/100, `--only=desktop` 188/188 (the front / run counts fell from round 4's 745 / 108 with the concurrent main-menu change — the fps meter and the badge plate left the title screen, so `checkTargets` has fewer pairs; the track select's own targets are unchanged at 11–15 per state).
