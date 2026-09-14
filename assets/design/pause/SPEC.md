# Pause + results overlays — design spec

Round subject: *the pause menu is too busy, cramped on the left, and collides with the in-run HUD on a landscape phone.*
This document is the whole deliverable: mockups, the chosen direction, and an implementable spec. No game code changed.

- Contact sheet (all 10 mockups, labelled): `assets/design/pause/contact-sheet.jpg`
- Chosen mockups (full-res PNG): `assets/design/pause/chosen-pause.png` (A3), `assets/design/pause/chosen-results.png` (A2), `assets/design/pause/chosen-crashed.png` (A4)
- Every mockup as JPG: `assets/design/pause/mockups/{A1,A2,A3,A4,B1,B2,C1,C2,D1,D2}-*.jpg`
- Mockups were generated with Codex image generation from written layout prompts; they are direction studies, not pixel truth — the numbers below are the truth.

---

## 1. Decision — Direction A, "low action bar" (A3 pause / A2 results / A4 run-over)

Four directions were mocked, each with a pause and a results variant:

| Dir | Pause | Results | What it is |
|---|---|---|---|
| **A** | A1 (centred), **A3 (low, thumb-tuned)** | **A2**, A4 (crashed-out) | Three large tiles in a centred row, title block top-left, Visuals as a chip row, HUD hidden, scene dimmed 50 % |
| B | B1 | B2 | Bottom sheet: full-width dark band in the bottom third, actions right, stats left, scene untouched above |
| C | C1 | C2 | Compact centre card with a vertical 3-item list |
| D | D1 | D2 | Trials-Rising split: huge left title block, right-aligned stacked tiles with gamepad glyphs |

**Chosen: A, in the A3 arrangement** (tiles in the lower third, title block top-left as in A1, Visuals chip row top-right, Reload tertiary in a corner).

Reasons, in priority order:

1. **Thumb reach.** A phone held landscape is gripped at the bottom corners; each thumb sweeps an arc that covers its own bottom corner and reaches the bottom-centre. A3 puts the three tiles exactly in that band (tile centres at ~28 %, 50 %, 72 % of width, bottom edge 24 px above the home indicator). B and D put every action under the *right* thumb only; C and the current build make the player reach into the middle of the screen (and cover the bike with their hand while doing it).
2. **No HUD collision by construction.** The HUD is hidden for the whole overlay (section 6). The title block is the only thing in the top band, and it sits where the HUD track pill used to be, so nothing new fights the timer/progress strip even if they were left on.
3. **Three primary actions, no more.** RESUME / RESTART / QUIT (pause) and RETRY / NEXT TRACK / MENU (results). Visuals is a secondary chip row; Reload is a tertiary corner link with an arm-then-confirm. The current six-row list mixed all three tiers into one column.
4. **Consistency with the console front end.** Top-left kicker + display title is exactly the SELECT TRACK / SETTINGS header pattern; the amber-filled focused tile is the track card / `.btn.primary`; the tiny corner text is the build stamp / legend. B's sheet and C's card introduce new containers the rest of the game does not have.
5. **The scene stays the hero.** Tiles live in the bottom third where the track deck is; the bike (framed at ~36 % x, ~51 % y while riding) and the CRASH!/FINISH banners (y ≈ 30 %) stay uncovered. B covers the deck; C covers the bike.

Why not A1 (tiles vertically centred): identical language, but the tiles sit in the dead zone between thumb arcs and cover the rider. A1's under-tile Visuals row is nicer than A3's top-right chips on desktop; the spec keeps the chips top-right on both sizes so there is one layout, not two.

Why not D even though it is the closest to Trials Rising: the right-stacked tiles are right-thumb only and the left block is the current problem mirrored. Its gamepad glyphs are adopted as the desktop legend.

---

## 2. Anatomy (both states share one frame)

```
┌──────────────────────────────────────────────────────────────┐
│ [kicker]                                    [VISUALS chips]  │  top band   (pause only)
│ [TRACK TITLE]                                                │
│ [stats line]                                                 │
│                                                              │
│                 (scene, dimmed — banners at y 30 % stay)     │  free band  (results puts the headline here)
│                                                              │
│          ┌────────┐  ┌────────┐  ┌────────┐                  │
│          │ tile 1 │  │ tile 2 │  │ tile 3 │                  │  action band
│          └────────┘  └────────┘  └────────┘                  │
│ [⟳ reload]                                    [legend]       │  corners
└──────────────────────────────────────────────────────────────┘
```

Regions, top to bottom:

- **Title block** (top-left): kicker line, track title, stats line. Left edge aligned with the front-end header column (`7vw + sal`).
- **Visuals chip row** (top-right, pause only): `VISUALS` label + two segmented controls.
- **Headline** (results only, centred in the free band): time, faults, PB delta, medals.
- **Action band**: three equal tiles, centred horizontally, in the lower third.
- **Corners**: reload (bottom-left, tertiary), input legend (bottom-right, non-touch only).

Everything is positioned from the safe-area insets (`--sat/--sar/--sab/--sal`), never from the raw viewport edge.

---

## 3. Measurements

Tokens from `src/ui/styles.ts`: spacing 4/8/12/16/24/40, radii 6/10/16, `--t1/t2/t3` 120/240/400 ms, `--ease`. `1rem` = 14.55 px on 844×390 (the `clamp` yields `1.25vw + 4px`) and 18 px on 1280×720 (clamped). Pixel values below are already resolved; the rem in brackets is what to write.

### 3.1 Phone 844×390 (iPhone 14 logical, landscape). Safe area: left 47, right 47, bottom 21, top 0 → `html.short` applies.

| Element | Box | Type |
|---|---|---|
| Content inset | left/right `24px + sal/sar` = 71 / 773; top 16; bottom `24 + sab` = 345 is the action-band baseline | — |
| Kicker | x 71, y 16, h 12 | UI 700, 10.5 px (.72rem), tracking .34em, uppercase, `--amber` |
| Track title | x 71, y 30, h 30, max-w 320 (ellipsis) | Display 900 italic, 32 px (2.2rem), line-height .9, uppercase, `--ink`, text-shadow `--outline` |
| Stats line | x 71, y 66, h 14 | UI 500, 12 px (.82rem), `--ink-dim`, values `--ink` 700, tabular-nums |
| Visuals row | right edge 773, y 16, h 32 (hit area padded to 44), w ≈ 372 | see 3.3 |
| Action tiles | 3 × **160×92**, gap 12 → row w 504; x 170…674; y 253…345 | see 3.4 |
| Reload | x 71, baseline 357, hit area 44×44 centred on the text | UI 700, 10.5 px, tracking .16em, `--ink-mute` |
| Legend | hidden on touch | — |

Vertical budget check for results on 390 px (section 4.2): title block 16…80, headline 92…226, tiles 253…345, reload 357. 13 px slack; nothing wraps.

### 3.2 Desktop 1280×720 (also gamepad on TV). No safe-area insets.

| Element | Box | Type |
|---|---|---|
| Content inset | left/right `7vw` = 90 / 1190; top 40; bottom 64 is the action-band baseline | — |
| Kicker | x 90, y 40, h 14 | UI 700, 13 px (.72rem), tracking .34em, `--amber` |
| Track title | x 90, y 58, h 50 | Display 900 italic, 54 px (3rem), lh .9 |
| Stats line | x 90, y 114, h 18 | UI 500, 15 px (.82rem) |
| Visuals row | right edge 1190, y 40, h 36, w ≈ 460 | see 3.3 |
| Action tiles | 3 × **240×128**, gap 16 → row w 752; x 264…1016; y 528…656 | see 3.4 |
| Reload | x 90, baseline 688 | UI 700, 13 px, tracking .16em, `--ink-mute` |
| Legend | right edge 1190, baseline 688 | existing `.legend` (kbd chips / `.pad` glyphs) |

Between the two sizes the implementer should interpolate with the existing rem scale; only the tile size is a hard step (`html.short` → 160×92, else 240×128, both `min-height ≥ 44`).

### 3.3 Visuals chip row (pause state only)

One horizontal group, right-aligned in the top band, `--slab` background, 1 px `--line-2` border, radius `--r2`, padding 6 × 12:

```
VISUALS   RIDER  [PROCEDURAL | MODELLED]   BIKE  [PROCEDURAL | MODELLED]
```

- `VISUALS` label: UI 700, .66rem, tracking .3em, `--amber`.
- `RIDER` / `BIKE` labels: UI 700, .66rem, tracking .12em, `--ink-dim`.
- Segments are the existing `.mini-seg` (`b.on` = amber fill, `--amber-ink` text). Each option cell ≥ 44 px wide × 32 px tall visually; the tap target is the full 44 px row height. Phone: option text 9.5 px; desktop 11.9 px.
- Live preview: flipping a segment calls `models.set()` immediately (already the case in `PauseMenu.cycleModel`) and the scene behind the overlay re-renders with the new rider/bike — the 50 % dim is a flat scrim, not a freeze frame, so the swap is visible without leaving the menu. Do not add a blur on this row's hit-test path (see 6).
- Hidden when `cb.models` is undefined (same condition as today).
- The row is removed in the results states; nothing takes its place.

### 3.4 Action tiles

- Box: 160×92 (phone) / 240×128 (desktop), radius `--r2`, gap 12 / 16, row centred on the viewport (not on the safe area — the row must stay symmetric under the thumbs).
- Layout inside: icon 22 / 28 px centred, 8 / 10 px gap, label beneath. Label: Display 900 italic, uppercase, 1.05rem (phone ≈ 15 px) / 1.25rem (desktop ≈ 22 px), tracking .02em, one line, no wrap (`NEXT TRACK` at 240 px fits with 30 px to spare; at 160 px it fits at 15 px).
- Rest: `--slab-3` fill, 1 px `--line` border, `--plate` shadow, label `--ink`, icon `--ink-dim`.
- Focused / primary: `--amber` fill, `--amber-ink` label and icon, border transparent, `inset 0 0 0 2px var(--amber-ink)` on focus-visible, outer glow `0 0 24px -8px var(--amber)`. Exactly one tile is amber at a time (the focused one). Pointer hover on another tile moves focus to it (same as `FocusList`).
- Pressed: `transform: scale(.97)` over `--t1`.
- Icons (inline SVG, 2 px stroke): play ▶ (resume), circular arrow ↻ (restart / retry), door (quit / menu), fast-forward ⏭ (next track), grid ▦ (tracks).
- Tap targets are the whole tile. The tiles are `<button>`s; the FocusList spatial navigation already handles a horizontal row (`navigateFrom` scores by geometry).

---

## 4. States

### 4.1 `pause`  (phase riding · paused)

Copy, exactly:

| Slot | Text |
|---|---|
| Kicker | `PAUSED · {TIER}` e.g. `PAUSED · BEGINNER` |
| Title | `{Track name}` uppercase via CSS, e.g. `FIRST RIDE` |
| Stats | `TIME 0:34.233  ·  FAULTS 3` (labels `--ink-dim`, values `--ink`; `·` separator with 2 spaces each side) |
| Tile 1 | `RESUME` |
| Tile 2 | `RESTART` |
| Tile 3 | `QUIT` |
| Visuals | `VISUALS` · `RIDER` `PROCEDURAL` `MODELLED` · `BIKE` `PROCEDURAL` `MODELLED` |
| Reload | `⟳ RELOAD GAME` (desktop) / `⟳ RELOAD` (html.short) |
| Reload armed | `⟳ TAP AGAIN TO RELOAD` (phone) / `⟳ PRESS AGAIN TO RELOAD` (desktop), `--amber`, disarms after 2 s |
| Legend (non-touch) | `ENTER SELECT` · `ESC RESUME` · `R RESTART` — gamepad: `Ⓐ SELECT` · `Ⓑ RESUME` · `Ⓨ RESTART` |

Behaviour: RESUME → `cb.resume()`; RESTART → `cb.restartTrack()` (hard cut, no fade, per reference clip 08); QUIT → `cb.quit()` (cold-boot path to the menu, as today). Default focus: RESUME.

**Crashed sub-variant** (`phase === 'crashed'` when pause is opened — the CRASH! stamp is on screen): kicker becomes `CRASHED · {TIER}` in `--red`; stats line appends ` · CHECKPOINT {n} OF {m}`; the tiles and everything else are unchanged. The CRASH! banner at y 30 % sits in the free band and is not covered.

### 4.2 `results-cleared`  (phase finished, after `resultsDelay`)

Replaces the current centre-right `.results` card. Layout: title block top-left (no Visuals row), **headline centred in the free band**, action tiles in the action band.

| Slot | Text / geometry |
|---|---|
| Kicker | `TRACK CLEARED · {TIER}` — `--green` when a medal was earned, `--amber` otherwise |
| Title | `{Track name}` |
| Stats | `PB 0:37.760  ·  TARGET 0:45.000` (previous best and platinum target; `PB —` on first clear) |
| Time | Display 900 italic, tabular, `--ink`; **64 px** (4.4rem) phone / **120 px** (6.6rem) desktop; centred at x 50 %; phone y 92…156, desktop y 200…320. Milliseconds at .58em like the HUD timer. |
| Faults | right of the time, baseline-aligned, 8 / 16 px gap: `✕ 0 FAULTS`, UI 700, 1.05rem / 1.4rem, `✕` in `--red` |
| PB line | centred under the time, UI 700, .82rem / .95rem, tracking .12em, uppercase: `−0:02.410 · NEW PERSONAL BEST` (`--green`) · `+0:01.120 · BEST 0:34.230` (`--red` delta, rest `--ink-dim`) · `FIRST CLEAR` (`--green`) |
| Medals | centred row of four, 40 / 56 px discs with 8 / 12 px gaps, label beneath UI 700 .62rem/.7rem tracking .1em: `BRONZE` `SILVER` `GOLD` `PLATINUM`; unearned at opacity .35, earned at 1 with `0 0 22px -6px currentColor` glow and a 1 px currentColor ring; each disc's threshold beneath the label on desktop only (`≤ 0:45.000 · 1✕`), omitted on phone. Uses the existing `.medal` art/fallback discs. Phone y 176…226; desktop y 352…428. |
| Tile 1 | `RETRY` |
| Tile 2 | `NEXT TRACK` (disabled — `--ink-mute` label, no border — when the next track is locked or this is the last track; still focusable so the row keeps its shape) |
| Tile 3 | `MENU` |
| Legend (non-touch) | `ENTER SELECT` · `R RETRY` · `ESC MENU` — gamepad `Ⓐ SELECT` · `Ⓑ RETRY` · `Ⓨ NEXT` |

Default focus: `NEXT TRACK` when it is enabled, else `RETRY`. Keyboard `R` / gamepad `B` / any throttle edge = RETRY regardless of focus — retry must stay one press from the moment the timer freezes (reference §19), and the game already restarts on edge input in `finished`.

Staged reveal, keyed off `resultsAt` as today but with the tiles earlier: time 0.15 s → faults 0.35 s → medals 0.6 s (earned medal pops to 1.08 at 0.9 s) → PB line 0.9 s → **tiles 0.6 s** (they may appear together with the medals; the implementer should not make the player wait 1.1 s for a tappable Retry).

### 4.3 `results-crashed-out`  (run ended without crossing the line)

Today the only way a run ends without a finish is the player leaving from the pause menu, so this state has no live trigger; it is specified so a future fault cap, time cap or "give up" lands in the same frame. Reference mockup: A4.

| Slot | Text |
|---|---|
| Kicker | `RUN OVER · {TIER}`, `--red` |
| Title | `{Track name}` |
| Stats | `TIME 0:34.233  ·  FAULTS 4  ·  REACHED CHECKPOINT 2 OF 4` |
| Headline | none — the free band is left to the ragdoll and the CRASH! stamp |
| Tile 1 | `RETRY` (primary, default focus) |
| Tile 2 | `TRACKS` → track select |
| Tile 3 | `MENU` |

---

## 5. Focus, keyboard and gamepad order

One `FocusList`-style ring per state; spatial navigation as already implemented in `navigateFrom` (geometry scoring), with these guarantees:

**pause**

```
        [Visuals: RIDER seg]  ⇄  [Visuals: BIKE seg]      (up from any tile lands on the nearest seg)
                 ↑ / ↓
   [RESUME]  ⇄  [RESTART]  ⇄  [QUIT]                       (left/right wraps at the ends)
                 ↑ / ↓
        [⟳ RELOAD]                                          (down from any tile; only reachable, never default)
```

- Left/right on a tile moves between tiles. Left/right **on a Visuals segment flips its value** (live preview); up/down moves between the seg row and the tiles. `A`/Enter on a segment cycles it forward, as today (`cycleModel`).
- Shortcuts: `Esc` / `Ⓑ` / Start = RESUME. `R` / `Ⓨ` = RESTART (no hold needed while paused). `Enter` / `Ⓐ` = focused item.
- Reload needs two activations within 2 s (armed copy in 4.1) on every input method; a single accidental thumb-brush at the bottom-left corner must never reload.

**results**

```
   [RETRY]  ⇄  [NEXT TRACK]  ⇄  [MENU]        (no vertical neighbours; up/down does nothing)
```

- `R` / `Ⓑ` / throttle edge = RETRY. `Ⓨ` / `N` = NEXT TRACK when enabled. `Esc` = MENU. `Enter` / `Ⓐ` = focused.
- Focus is set when the tiles become visible (0.6 s), not at `showResults`, so a stale Enter from the run does not pick a tile before it is on screen. Edge-input retry still works from t = 0.

Pointer: hovering a tile moves focus; there is never a second highlight.

---

## 6. Motion and what the overlay does to the scene

- **In (pause):** `--t2` 240 ms `--ease`. Scrim `rgba(6,7,9,0) → rgba(6,7,9,.5)` flat (no left-heavy gradient — the current gradient is why the menu looks pinned left). Canvas gets `filter: saturate(.8) brightness(.85)` over the same 240 ms (`#app.dim` already exists; reuse it). Title block fades in place; tiles `rise` 12 px + fade with 0 / 40 / 80 ms stagger left→right; Visuals row and corner text fade in at 120 ms with no rise.
- **Blur:** optional `backdrop-filter: blur(4px)` on the scrim on non-`html.short` only. Phones skip it — iOS Safari compositing a full-screen backdrop blur over a WebGL canvas costs frames and makes the Visuals live preview mushy.
- **Out (resume):** the game unpauses on the *first* frame; overlay fades over `--t1` 120 ms, canvas filter releases over 120 ms. No rise-out.
- **Out (restart / retry / quit):** hard cut — overlay `display:none` on the same frame the world resets; the iris/cold-boot path is unchanged. Never a 240 ms fade before a restart (reference §8).
- **Results in:** the scene keeps running (finish coast, crowd) at full brightness for the first 0.6 s, then the scrim eases to `.35` (not .5 — the crowd cam is part of the reward) over 400 ms while the headline stages in. Tiles `rise` at 0.6 s.
- **Reduced motion:** `prefers-reduced-motion` → no rise, no stagger, opacity only.

### HUD while an overlay is up

- **Everything hides**: `.hud-top` (track pill, timer + faults pill, progress strip, delta), `.hints`, `.tz-pause`, `.tz-restart`, the touch zone labels. Implementation: add `.hud.overlay` (or reuse `.hud.hidden`) on `paused` and `finished`, faded over `--t2`. The kinetic banners (`CRASH!`, `FINISH`, `GO!`) are exempt — they live in the free band and are part of the moment.
- **Timer ghost:** the recommendation is *none of the HUD survives*; the frozen time is restated once, in the title block's stats line (pause) or the headline (results). If the implementer still wants a ghost, it is the `.hud-timer` element alone, at opacity .35, in its normal position — never the full pill — and only in `pause`, never in results.
- On unpause the HUD fades back in over `--t2` as the overlay fades out over `--t1`; the 120 ms overlap is intentional.

---

## 7. Colour and surfaces (all existing tokens)

| Use | Token |
|---|---|
| Scrim | `rgba(6,7,9,.5)` pause · `.35` results |
| Tile rest | `--slab-3` + `--line` border + `--plate` |
| Tile focused | `--amber` fill, `--amber-ink` text |
| Kicker | `--amber` (pause), `--green` (cleared with medal), `--red` (crashed / run over) |
| Title, time | `--ink` + `--outline` text-shadow |
| Stats labels, secondary | `--ink-dim`; corner text `--ink-mute` |
| Faults ✕ | `--red` |
| PB delta | `--green` ahead / `--red` behind |
| Medals | `--bronze --silver --gold --plat` |
| Visuals segment on | `--amber` / `--amber-ink` (existing `.mini-seg b.on`) |

No new colours, radii or durations are introduced.

---

## 8. Notes for the implementer

- **What changes in `src/ui/menu.ts` `PauseMenu`:** the panel becomes three regions (title block, tile row, visuals row + corners) instead of one `FocusList` column; `Restart track` → `RESTART`, `Main menu` → `QUIT`; Rider/Bike leave the list and become the chip row; `⟳ Reload game` becomes the armed corner link. `show(info)` needs `checkpoint`/`checkpointCount` and `phase` to render the crashed kicker; both are already in `RunInfo`.
- **What changes in `src/ui/hud.ts` results:** `.results` stops being a card; the headline goes centred and the `.actions` become the shared tile row component. `showResults(r)` already has everything needed except the "next track enabled" flag (currently the Next button is always live) and the previous PB for the stats line.
- **`.overlay` CSS:** drop the left-weighted gradient and the `justify-content: flex-start` / `7vw` left padding; the overlay becomes a full-frame grid (`grid-template-rows: auto 1fr auto auto`) with safe-area padding.
- **Touch layer:** while an overlay is up the `.touch-layer` must not receive pointer events (`on` removed or `pointer-events: none`), otherwise the tile row sits over the throttle/brake zones and a tile tap also revs.
- **Tile row is centred on the viewport, not the safe area.** On a notched phone the safe insets are symmetric in landscape, so this is the same thing; the rule matters on devices where they are not.
- **Text fitting:** track names up to 14 characters fit the title slot on phone at 32 px; longer names ellipsise (existing `.hud-track` pattern). Tile labels never wrap; if a locale ever needs longer labels, shrink the label to .95rem before wrapping.
- **Evidence gate for the round that ships this:** a played clip on the phone harness showing pause → flip Bike to MODELLED (scene updates behind) → RESUME with no HUD frame overlap; and results on a cleared track with RETRY reachable by the throttle edge before the tiles finish staging. Judge the clip, not a still.
