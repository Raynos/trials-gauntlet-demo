# Track select — five directions (mockups, no decision)

Round subject: *"redo the level selector."* Standing direction: the Broadcast language (menu B), landscape phone first (932×430 and 844×390 with safe-area insets), desktop second; every tappable thing ≥ 44 px; one-thumb reach; no more than one scroll axis; the current track select must stay reachable in the same number of taps. **No game code changed and nothing is decided here — the user picks.**

- Contact sheet (current + A–E, labelled): `assets/design/tracks/contact-sheet.jpg`
- Directions, full-res PNG as generated (1536×1024 with black letterbox): `A-biome-map.png`, `B-broadcast-schedule.png`, `C-carousel-profile.png`, `D-podium-wall.png`, `E-progression-road.png`; the same with the letterbox cropped: `*.jpg`
- Current build, headless harness capture in the same seeded state: `current-932x430.png`, `current-844x390.png`
- Generated with Codex image generation (`codex exec -s workspace-write -i current-932x430.png` reading one shared scene brief + one per-direction brief from stdin, five runs in parallel, ~3 min). They are direction studies, not pixel truth: the model re-renders rather than composites, so judge the *architecture* of each, not the terrain or exact type. Every sponsor is from the fictional set (IRONWORKS, VORTEX OIL, KESTREL TYRES, APEX SUSPENSION, NORDVIK, BOLT ENERGY). **Every mockup shows the same state** — 6 / 15 cleared (all Beginner + Easy; E3 on Pro), Medium open with M1 "UP NEXT", H1 the next unlock (locked, "medal every Medium track"), the five playgrounds open, one Lab track, B1 focused with `▶ GHOST` and the reviewer's green `2 / 6 NOTED` — so the directions are compared on layout, not on numbers.

Note on "next": with Beginner and Easy medalled, the *Medium* tier is open and unridden, so **M1 Hop Up is the next track to ride** and **H1 Rooftop Wire is the next tier gate to open**; the mockups draw both (amber UP NEXT on M1, brighter padlock + requirement on H1).

---

## 0. What is there today (`current-932x430.png`)

`TrackSelectScreen` in `src/ui/front.ts` (§ build / card): a header row (`SELECT TRACK`, `6/15 cleared` + four medal dots, the fixed `‹ MENU` pill), then `.tiers` — a **vertically scrolling** column of seven `tier-row`s (Lab, Playgrounds, Beginner, Easy, Medium, Hard, Extreme), each a text heading over a **horizontally scrolling** `.carousel` of 16:10 cards. Card = biome-tinted art, tier badge, medal disc, `▶ Ghost/PB` tag, `Pro` chip, name, technique, `Best / Target`, top-5 board. Focus is `(row, col)` with per-row column memory; the screen opens scrolled to the last-played card (E3 in the capture), so Lab and Playgrounds are above the fold and the header's Best/Target line of the row above bleeds under the heading.

Measured in the seeded state: `.tiers` scroll height **1170 px against a 344 px viewport** at 932×430 (3.4 screens), 1090 / 307 at 844×390 (3.6 screens). 22 cards, all the same rectangle. Two scroll axes (`overflow-y` on `.tiers`, `overflow-x` on every `.carousel`).

Why it fails the phone reports (`docs/plans/README.md` field table): a long same-looking scroll; the tier headings and medal totals sat under the fixed MENU pill until `8efc682`; Lab, Playgrounds and the medal tiers are the same row type, so a stranger cannot tell the proving ground from the campaign; nothing shows a track's biome or shape before the tap (the art is a tinted plate, the biome is only the tint); no sense of progression or "what's next" beyond the initial focus.

Tap count today, from the menu: **PLAY → card = 2 taps to start B1** (a click on a card both focuses and confirms), **plus one vertical scroll** when the screen opened on E3 and B1's row is above the fold; **H1 = 2 taps + scroll** (locked: the card shakes and states the rule).

---

## 1. Shared scene brief (verbatim summary of what every run was given)

- One 19.5:9 landscape phone screen filling the 1536 width, black letterbox above/below, no bezel, no hands; 34 px side safe areas; every tappable element ≥ 44 px screen space; primary controls in the bottom third or corners.
- Broadcast language: charcoal slabs, one thin amber top edge on the main band, condensed italic display face, small tracked caps, tabular numerals; badge plate `TRIALS GAUNTLET` + `build 63e6b25 · 2026-09-15` top-left; `● LIVE · ROOKIE BIKE` chip and `‹ MENU` pill top-right, never over the medal totals; best-times ticker along the bottom edge; amber = the accent (focus, next, active tab); green only for a PB under target; medal colours gold/silver/bronze/platinum; locked = 60 % grey + padlock.
- Biome palettes: industrial rust/steel + sodium lamps; canyon red sandstone at sunset; snow ice-blue pines and lifts; night city blue-purple + cyan/magenta neon; foundry molten orange on black iron. Fictional sponsors only.
- The data state above, listed track by track with code, name, biome, medal, PB, target, and the chips (GHOST on B1–B3, `2 / 6 NOTED` on B1, PRO on E3, UP NEXT on M1, NEXT UNLOCK on H1).
- Hard rules: one scroll axis; Lab, Playgrounds and the tiers visibly different kinds of thing; locked tracks state their requirement on themselves; show the biome and (where asked) the shape as an elevation-profile silhouette with checkpoint dots; no iOS chrome.

The five direction briefs are in the session scratchpad (`tracksel/briefs/{shared,A..E}.md`); each is summarised under its section.

---

## 2. The five directions at a glance

| | Name | Primary grouping | Scroll axis | Lab | Playgrounds | Locked tiers | Medals | Review |
|---|---|---|---|---|---|---|---|---|
| **A** | Biome map | **biome** (5 key-art panels) | x (panel strip) | first panel: dark test hall, one pin | second panel: five biome slivers, one pin each | pins padlocked, panel region beyond the last open pin hatched; H1 pin lit + plate | disc inside the pin; per-panel `n / m cleared` bar | in the focused pin's popover (`2 / 6 NOTED`) + REVIEW pill in the band |
| **B** | Broadcast schedule | **tier** (TV-guide rows) | y (rows) | own row, one wide grid-paper tile, no medal slot | own row, five narrow tiles, `OPEN`, no medal/PB slot | rows at 60 % grey, padlock on each tile, rule on the tile; H1 dashed-amber `NEXT UNLOCK` | disc on the tile's top-right, dashed ring when none | green `2 / 6 NOTED` chip on the tile |
| **C** | Carousel + profile | **one track at a time**, tier chips filter | x (carousel; the rail scrubs the same axis) | outlined chip in the tier row + a grid-paper card in the carousel | outlined chip; P1–P5 thumbnails in the rail | rail thumbnails padlocked; HARD/EXTREME chips padlocked; H1 tooltip with the rule | big disc on the card; dot on each rail thumbnail | `REVIEW · 2 / 6 NOTED` chip under the profile |
| **D** | Podium wall | **tier** as wall sections | x (pan the wall) | pegboard section, one graph-paper ticket | five thin tickets stamped `OPEN`, no ribbon slot | dim translucent tickets with the rule stencilled across; H1 amber stencil `NEXT UNLOCK` | a ribbon hanging from the ticket's punch hole | green `2 / 6 NOTED` sticker + REVIEW pill in the band |
| **E** | Progression road | **order** (one road Lab → Extreme) | x (the road) | the shed at the road's start, one gate | side roads off the main road, one per biome, `OPEN · NO MEDALS` | barrier across the road, grey gates with padlocks, sign on H1; minimap shows the padlocks | disc on the gate plate; the bike parked at the furthest cleared gate | in the focused gate's popover + (implicit) REVIEW on the plate |

Tap counts from the menu (PLAY = tap 1), assuming a tap on an *unfocused* element focuses it and the band's RIDE pill launches; B keeps today's tap-launches-the-card rule because its tiles carry no separate RIDE:

| | Start B1 | Reach H1 (locked: shows the rule) | Notes |
|---|---|---|---|
| today | 2 (+ 1 scroll if the fold hides B1) | 2 (+ scroll) | opens on last played |
| **A** | 3 (PLAY · pin · RIDE) — 2 if a second tap on the focused pin launches | 2 + one pan right (Night City is panel 6) | opens on the panel holding the next track (Industrial → M1), so B1 is on screen |
| **B** | 2 (PLAY · tile) | 2 at 932×430 (all seven rows fit); 2 + one scroll at 844×390 | identical to today's model |
| **C** | 3 (PLAY · BEGINNER chip · RIDE) if it opens on M1; 2 if it opens on last played and the BEGINNER chip lands on B1 | 2 (PLAY · HARD chip) — the H1 card *is* the requirement | rail tap = one more |
| **D** | 3 (PLAY · ticket · RIDE) | 2 + one pan | opens on the section holding the next track |
| **E** | 3 (PLAY · gate · RIDE) | 2 + one pan, or 3 via the minimap (`HARD` dot) | opens centred on the bike |

---

### A — "Biome map" (`A-biome-map.jpg`)

**What it is.** The five biomes as a horizontal strip of tall key-art panels — Industrial, Canyon, Snow, Night City, Foundry — with Lab and Playgrounds as two smaller panels ahead of them. A white route line snakes across each panel; the tracks of that biome sit on it as 44 px pins carrying the code and the medal disc (dashed ring = open, padlock = locked). The focused pin opens a popover (`FIRST RIDE · GOLD 0:41.200 · ▶ GHOST · 2 / 6 NOTED`). Each panel has a caption bar with the biome name and its own `n / m cleared` bar (Industrial `3 / 4` because M1 lives there too). The region past the last open pin is hatched. Lower third: `6 / 15 CLEARED` + medal dots, a big `RIDE FIRST RIDE ▸`, `▶ GHOST`, `REVIEW`, the ticker.

**What it does with the brief.** Biome becomes the thing you browse; tiers become a property of the pin (the code letter and the padlock). Progression is readable as the hatch creeping right in each panel. Lab and Playgrounds are panels of a different kind (a test hall; five slivers), so they cannot be mistaken for the campaign.

**Mockup vs. brief.** The generator dropped the two leading panels — only a sliver at the left edge stands in for Lab/Playgrounds — and drew Foundry with M3 and H3 only (X2, X3 missing). Read the strip as *seven* panels with Lab and Playgrounds first. Everything else is as briefed.

**844×390.** About 2.5 panels fit at a legible size; captions and pins survive; the popover must not cover the pin row, so it goes above the route line as drawn.

---

### B — "Broadcast schedule" (`B-broadcast-schedule.jpg`)

**What it is.** A TV-guide grid. Rows are the seven tiers with a dark "channel" header cell (name, blurb: `proving ground · no medals`, `always open · no medals`, `3/3`, `0/3 · up next`, `LOCKED · medal every Medium track`); columns are the tracks as short, wide programme tiles: a biome colour band on the left edge, code + name, a white elevation-profile silhouette with checkpoint dots across the lower half, the medal disc top-right, PB and target. An amber `NOW` hairline runs down the grid beside the header cells. The Lab row is one wide grid-paper tile; the Playgrounds row is five narrow tiles stamped `OPEN` with no medal or PB slot. Locked rows are grey with padlocks and the rule on every tile; H1 has a dashed amber outline and `NEXT UNLOCK`. The lower third shrinks to the ticker — the grid is the interface.

**What it does with the brief.** Everything is on one screen: all 22 tracks, every medal, every requirement, and — new — every track's *shape* and biome without a tap. "What's next" is the amber tile in the Medium row and the dashed one in the Hard row. It is the closest to today's data walk (tier rows in `build()`), rendered as a table instead of seven carousels.

**Mockup vs. brief.** The build stamp is misspelled (`65eb25`); the panel is drawn at ~1.8:1, not 19.5:9, so the real screen is ~17 % shorter than pictured. Otherwise complete — the only mockup with all 22 tracks visible.

**844×390.** The honest problem: seven rows in ~300 px of grid height is ~43 px per row *before* row gaps, under the 44 px floor. Either the grid scrolls (one axis, as briefed — the header cells stay, Extreme drops below the fold) or Lab + Playgrounds collapse to one shared row on short phones. Tiles at three per row are ~230 px wide, enough for code, name, PB and a profile.

---

### C — "Carousel + profile" (`C-carousel-profile.jpg`)

**What it is.** One big track card at a time — B1: industrial key art (NORDVIK, APEX SUSPENSION), `B1 · BEGINNER · INDUSTRIAL`, a large gold disc, the name huge, the technique, a wide elevation profile with start/finish and three checkpoint flags, then `PB 0:41.200 · TARGET 1:05.000 · LEADERBOARD 1 YOU 0:41.200 · 2 GHOST 0:43.900 · 3 —`, then chips `▶ GHOST · REVIEW · 2 / 6 NOTED · ROOKIE BIKE`. The LAB card peeks on the left (grid paper), B2 on the right. Above: tier chips `BEGINNER · EASY · MEDIUM · HARD 🔒 · EXTREME 🔒` with LAB and PLAYGROUNDS as outlined icon chips at the row's start. Below: a 44 px thumbnail rail — LAB, P1–P5, B1…H3 (X1–X3 scrolled off) — with medal dots, padlocks, `UP NEXT` on M1 and a `NEXT UNLOCK · MEDAL EVERY MEDIUM TRACK` tooltip over H1. Lower third: `6 / 15 CLEARED` + dots, a big amber `RIDE ▸` under the right thumb, ticker.

**What it does with the brief.** Maximum information per track (this is where the top-5 board and the profile fit comfortably), minimum overview: you see one track and 22 thumbnails. Biome is per card, not per group. Lab and Playgrounds are a different *kind of chip*, and their cards look different (grid paper / no medal).

**Mockup vs. brief.** As briefed; drawn at ~1.79:1. The ticker runs into the RIDE pill's margin at the bottom right.

**844×390.** The card loses ~90 px of height: the key art half compresses to a band behind the name, the board drops to `YOU · GHOST` on one line, the chip row stays. The rail keeps 44 px. Peeking cards can go.

---

### D — "Podium wall" (`D-podium-wall.jpg`)

**What it is.** A paddock wall of corrugated steel with KESTREL TYRES / VORTEX OIL / BOLT ENERGY decals and a rail along the top. Tracks are tall paper tickets hanging from the rail: a biome art strip at the top, the code big, the name, the biome in small caps, a printed elevation profile, PB and target; cleared tickets have a medal ribbon hanging from the punch hole with the disc on it; E3 has a blue PRO sticker; B1 a green `2 / 6 NOTED` sticker and `▶ GHOST`; M1 an amber `UP NEXT`. Painted vertical section labels on the steel divide the wall — `PLAYGROUNDS` (five thin tickets stamped `OPEN`), `EASY`, `MEDIUM`. Lower third: `6 / 15 CLEARED` + dots, `REVIEW`, `RIDE FIRST RIDE ▸`, ticker.

**What it does with the brief.** The most *physical* of the five: medals are objects, locked tracks are dim tickets with the rule stencilled across them, tiers are places on a wall you pan along. Height is used for once — a ticket is taller than wide, so the profile, PB and stickers stack without shrinking.

**Mockup vs. brief.** The frame stops at M2: the locked Hard / Extreme tickets — the direction's signature, `LOCKED — MEDAL EVERY MEDIUM TRACK` stencilled on the paper — are off-frame right, and the Lab pegboard is off-frame left (only P5 of the Playgrounds shows). The `BEGINNER` section label is missing. One ticker entry is garbled (`B2 LEAN BACK 0:41.900 PRO`). Drawn at ~2.0:1.

**844×390.** Tickets are ~110 px wide at the drawn proportion — six or seven visible, which is the same count as the mockup; the ribbon + art strip shrink first, the profile and PB last.

---

### E — "Progression road" (`E-progression-road.jpg`)

**What it is.** One continuous road in side profile from the Lab shed on the far left to Extreme on the far right; every track is a start-gate arch with a light tower and a plate under it (code, name, biome, medal disc, PB, target, `▶ GHOST`). The scenery behind the road changes by biome (warehouse skyline → red canyon → snow pines; the mockup's visible span). The rider's bike is parked at E3 under `YOU ARE HERE · E3 STAIRWAY · PRO`; M1's gate flies `UP NEXT`; painted road signs mark `BEGINNER`, `EASY`, `MEDIUM`. Playgrounds are side-road plates (`P1 CONTAINER YARD · OPEN · NO MEDALS` …) branching off at their biome. A minimap strip of the whole road sits top-centre (Lab → Beginner → … → padlocked Hard, Extreme; P1–P5 as drop-offs; a dot at the bike). Lower third: `6 / 15 CLEARED` + dots, `RIDE FIRST RIDE ▸`, ticker.

**What it does with the brief.** Progression *is* the layout: how far the bike is along the road is the career, the barrier is the lock, the minimap is the whole game in one glance. Biome is scenery, so it is felt rather than labelled. Lab is the start of the road, not a row.

**Mockup vs. brief.** The barrier and the grey Hard/Extreme gates are off-frame (only in the minimap); the side roads were drawn as floating plates rather than roads that branch; the B1 popover crowds the badge plate. Drawn at 2.17:1 — the one mockup at the true phone aspect.

**844×390.** The gate row and the plate row are two stacked bands plus the minimap and the lower third — four bands in 390 px. The plate becomes the 44 px target (the arch is decoration); the minimap must fold into the header line or go.

---

## 3. Trade-offs

| | Scroll axis | Biome discoverability | Density at 844×390 | Implementation cost on today's `front.ts` card model |
|---|---|---|---|---|
| **A** Biome map | x, panel strip; snap per panel | **Highest** — biome is the primary grouping and each panel is its key art | Good: ~2.5 panels per screen, pins 44 px, one popover | **High.** The grouping flips from tier to biome (new walk over `TrackDef.meta.biome`; `progress.ts` stays tier-based for the lock rule); cards become pins + one popover (the popover *is* today's card body); focus becomes `(panel, pin)`. Needs five biome key-art plates — we have industrial and canyon (`keyart-*-1920.webp`), snow / nightCity / foundry are new art. ~2 days + 3 plates. |
| **B** Broadcast schedule | y, the grid; header cells fixed | Good — a colour band and a biome label on every tile, all 22 visible at once | **Tightest**: seven rows ≈ 43 px each before gaps; must scroll or merge Lab + Playgrounds on short phones | **Lowest.** Same `build()` walk (tier rows in `TIER_ORDER`, Lab and Playgrounds first), same `(row, col)` focus, the carousel's `overflow-x` dropped for a fixed three columns; `card()` restyled to a tile; one new util renders the elevation silhouette as an inline SVG polyline from the compiled track heights (`src/tracks/compile.ts` already produces the surface). ~1 day + the profile util. |
| **C** Carousel + profile | x, one carousel; the rail scrubs the same axis | Lowest — one track's biome at a time; the rail is tinted only | Fine: the big card compresses (art → band, board → one line), rail stays 44 px | **Medium.** Tier chips = the existing horizontal `FocusList`; the big card = `card()` grown (profile util as in B, top-3 from `boardOf`, review chip from `ReviewStore.count`); the rail reuses the `track-card` art lookup; focus becomes `(tier, index)` with the carousel index as the single source. Per-track key art already exists as `track-card` plates. ~1.5 days. |
| **D** Podium wall | x, pan the wall; sections snap | Good — a biome strip and art on every ticket, but no biome grouping | **Best use of height**: 6–7 tall tickets per screen, nothing shrinks below the profile + PB | **Medium.** Tickets are `card()` with a tall aspect (body reflows; ribbon = CSS on `.medal`); the seven tier rows become sections of one horizontal scroller (Lab and Playgrounds keep their own section styles); focus becomes a linear index with section memory. Needs one wall backdrop plate. ~1–1.5 days + 1 plate. |
| **E** Progression road | x, the road; minimap taps jump | Strong as *feel* (scenery), weak as *lookup* — no biome label until the plate | **Hardest**: gates + plates + minimap + band = four stacked bands; the minimap has to fold into the header | **Highest.** A bespoke scene: gates and plates in one horizontal scroller (the plate = `card()` slimmed), five scrolling scenery plates with parallax, a bike sprite at `nextTrack()`'s predecessor, the minimap, and the side roads — which are a second visual row and the one place a second scroll axis could sneak back. ~2–3 days + 5 scenery plates. |

Every direction keeps the Broadcast band (badge plate, LIVE chip, MENU pill, ticker) and starts a track in ≤ 3 taps from the menu; B is the only one that keeps today's 2-tap path unchanged, C is the only one that reaches a locked track's requirement in 2 taps with no scroll or pan.

---

## 4. What the generator could not render

- **Frame aspect.** Only E landed the 19.5:9 phone frame (2.17:1); A and D are ~2.0–2.1:1, B and C ~1.8:1 — read B and C as 15–17 % shorter than pictured. None of the runs was repeated at 844×390; the 844×390 rows above are reasoned from the 932 layouts and today's measured stylesheet, not rendered.
- **Off-frame state.** A lost the Lab and Playgrounds panels and X2/X3; D and E show no locked track in frame (Hard/Extreme are beyond the right edge; E shows them only in the minimap). The briefs asked for the locked state to be visible — treat those two as *showing the open half* of their strip.
- **Text.** B's build stamp reads `65eb25`; D's ticker has one garbled entry; E's B1 popover overlaps the badge plate. Cosmetic.
- **Side roads (E)** rendered as floating plates, not branching roads.
- **Naming collision found while briefing:** the Hard track `h2-gap-chain` and the playground `p1-container-yard` are both named **Container Yard** (`src/tracks/courses/hard.ts`, `playgrounds.ts`). Whichever direction ships, one of them should be renamed — B and D put both names on the same screen.
