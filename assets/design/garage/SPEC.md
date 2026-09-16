# Garage — five directions (mockups, no decision)

Round subject: *"for garage give me 5 codex img generated mockups of what a new garage can look like."* Standing direction: the garage is a **model explorer** — the bike + rider is the centrepiece (≥ 45 % of the screen height, drag to rotate, pinch to zoom) on a set that reads as a real workshop; every garage control (bike class, rider outfit, rider model) lives here and nowhere else; the Broadcast language (menu B); landscape phone first (932×430 and 844×390 with safe-area insets), desktop second; every tappable thing ≥ 44 px; one-thumb reach; nothing overlaps the hero. **No game code changed and nothing is decided here — the user picks.**

- Contact sheet (current + A–E, labelled): `assets/design/garage/contact-sheet.jpg`
- Directions, full-res PNG as generated (1536×1024 with black letterbox; B came back 1672×941 from the generator, kept as generated): `A-pit-box.png`, `B-tool-wall.png`, `C-showroom-spot.png`, `D-workbench.png`, `E-shutter-door.png`; the same with the letterbox cropped: `*.jpg`
- Current build, headless harness capture in the same seeded state: `current-932x430.png`, `current-844x390.png`; the same 932×430 frame with the UI hidden, so the hero the cards are covering can be seen: `current-scene-932x430.png`
- Generated with Codex image generation (`codex exec -s workspace-write -i current-932x430.png -i current-scene-932x430.png` reading one shared scene brief + one per-direction brief from stdin, five runs in parallel, 117–144 s each, ~2.5 min wall). They are direction studies, not pixel truth: the model re-renders rather than composites, so judge the *architecture* of each (where the hero sits, where the three control groups live, what the stats are attached to), not the exact bike geometry or type. Every sponsor is from the fictional set (IRONWORKS, VORTEX OIL, KESTREL TYRES, APEX SUSPENSION, NORDVIK, BOLT ENERGY). **Every mockup shows the same state** — Rookie selected (POWER 55 · GRIP 82 · WEIGHT Planted, "Never loops at neutral · standard medal targets"), outfit `Charcoal · open-face`, rider model `Blender`, `‹ MENU` pill top-right, badge plate + `build a479a7b · 2026-09-16` top-left — so the directions are compared on layout, not on content.

Note on the option counts: the brief said three outfits, the code has **five** (`src/core/riderPresets.ts` `RIDER_PRESETS`: Mustard · barehead, Charcoal · open-face, Blue & white · Race, Charcoal · barehead, Charcoal & yellow · Race) and three rider models (`src/ui/menu.ts` `RIDER_MODEL_OPTIONS`: Classic, Blender, Img2 experiment). The mockups draw the five and the three — ten options in all, plus Rookie / Pro — because that is what the screen has to hold.

---

## 0. What is there today (`current-932x430.png`)

`GarageScreen` in `src/ui/garage.ts`: a header (`GARAGE / CUSTOMIZE YOUR RIDE`, the balance hint — hidden on `html.short`, which is every landscape phone), then `.garage-customize`, a left column 501 px wide holding two `bike-card`s (Rookie / Pro: class kicker, name, blurb, POWER / GRIP / WEIGHT bars, note) and under them the `Rider outfit` panel with five `outfit-button`s in a horizontal strip; the fixed `‹ MENU` pill top-right; `Tap a bike or outfit` bottom-right. Behind it all: the live renderer showing the **b1 start line** with the rig's idle framing, a left-to-right scrim (`.garage-screen` gradient, .94 → .10 alpha), and the `garage-plate` art masked opaque over the left 40 % of the width. The rider model chooser is **not on this screen** — it is the Visuals panel on the main menu (`src/ui/menu.ts`, `cb.models`) and Settings › Visuals (`src/ui/front.ts`).

**The hero is invisible.** Measured in the seeded state at 932×430 (`__trials.camera()` + the UI-hidden frame): the rig places the bike at `bikeScreenX 0.45 / bikeScreenY 0.55`, `bikeHeightFrac 0.369`, i.e. a projected bbox of about **x 345–515, y 170–320 (170 × 150 px, 35 % of the height)**. Over that rectangle:

| Element (DOM rect, CSS px) | Overlap with the hero bbox |
|---|---|
| `.garage-customize` 57–558 × 65–390 (the scrolling column, with the screen's scrim behind it) | **100 %** |
| Pro `bike-card` 312–550 × 73–235 | full width × y 170–235 = **43 %** of the hero's area |
| `.garage-outfits` 65–550 × 247–354 (heading line + the five buttons at y 274–343) | y 247–320 = **49 %** (buttons alone 31 %, the heading 18 %) |
| the 12 px gap between the card and the outfit panel (y 235–247) | 8 % — the only sliver not under a control, and it sits under the scrim at ~.5 alpha |

At 844×390 the same story (hero ≈ x 313–467, y 154–290; Pro card 283–499 × 69–223 covers 51 %, the outfit panel 59–499 × 236–322 covers 40 %, the gap 9 %). **92 % of the hero is under an opaque control and 0 % is visible undimmed** — the capture shows the crowd and the barrier and no bike at all. The 3D preview the cards are supposed to drive (`previewBike` swaps the livery on focus) is a preview of nothing on a phone.

Second finding: the set is not a garage. The backdrop is the b1 start line (crowd, sponsor barrier, containers); the "garage" is a painted plate on the left that the cards then cover. Third: the outfit strip at 932 shows three of five buttons (the fourth is clipped at x 542) — the strip scrolls horizontally inside the column, a second scroll axis the touch layer has to arbitrate.

Tap counts today, from the garage: **bike = 1 tap** (a tap on a card commits), **outfit = 1 tap** (commits, then the load), **rider model = not here**: `‹ MENU` → Visuals › Rider on the main menu = 2 taps and a screen change, with no bike preview while doing it.

---

## 1. Shared scene brief (verbatim summary of what every run was given)

- Two reference images: the current screen (style, colours, type, the exact control text — "do NOT copy its layout, the live bike is hidden behind the cards") and the same frame with the UI hidden ("draw THAT bike and THAT rider, larger, as the centrepiece": blue-tanked trials bike, charcoal hoodie, open-face helmet, jeans).
- One 19.5:9 landscape phone screen filling the 1536 width, black letterbox above/below, no bezel, no hands; 34 px side safe areas; every tappable element ≥ 44 px screen space; primary controls in the bottom third or corners; nothing overlaps the bike.
- A model explorer: bike **with** rider, ≥ 45 % (ideally 55 %) of the screen height, on a real garage set — concrete floor with tyre marks, tool wall / roller shutter / tyre stack / workbench / tool cart / pit-board per direction; one warm key lamp + cool fill, a contact shadow; a small grey `drag to rotate · pinch to zoom` affordance with a rotate glyph.
- Broadcast language: charcoal slabs, one thin amber top edge on the control band, condensed italic display face, tracked small caps, tabular numerals; badge plate `TRIALS GAUNTLET` + `build a479a7b · 2026-09-16` + `GARAGE` top-left; `‹ MENU` pill top-right, nothing else up there; ticker along the bottom optional and never over a control; amber = the accent (selected chip, focus, the selected bike's stat bars); Rookie tint amber `#ffb020`, Pro tint blue `#5aa9ff`; no green here. Fictional sponsors only.
- The three control groups, same state everywhere: BIKE `ROOKIE` (selected) / `PRO` with the Rookie stat strip; OUTFIT the five exact labels with `Charcoal · open-face` selected; RIDER `Classic` / `Blender` (selected) / `Img2 experiment`. Compact chips or tags ≥ 44 px, all ten visible without scrolling, no other buttons (selection is immediate — no Play, no Save).
- Hard rules: hero unobstructed and ≥ 45 % height; all ten options in frame; exactly the state above; no iOS chrome.

The briefs are in the session scratchpad (`garage-mockups/briefs/{shared,A..E}.md`, run script `gen.sh`); each direction's is summarised under its section.

---

## 2. The five directions at a glance

| | Name | Hero | Controls | Stats | Ticker |
|---|---|---|---|---|---|
| **A** | Pit box | on a chequered-rim turntable, centre, pit bay behind (tool chest, banners, tyre warmers, open bay door) | one full-width **pit-board slab** along the bottom: BIKE · OUTFIT · RIDER sections with 44 px chips + swatch dots | on the slab under ROOKIE | none drawn (optional) |
| **B** | Tool wall | side-on in front of a pegboard of real tools, centre-right, the largest of the five | **tags on a rail** down the left edge, three stencilled headings on the board; two tags per row | a **clipboard** hung top-right (typewriter face, hand-drawn bars) | none |
| **C** | Showroom spot | huge, three-quarter, in one spotlight pool on black; tyre stack and tool cabinet as silhouettes | one **minimal chip row** on the bottom edge under an amber hairline, groups split by dots | a **floating stat card** beside the selected chip (drawn over ROOKIE, mid-left) | none |
| **D** | Workbench | low camera, on a diamond-plate scissor lift, centre-left; tyre stack foreground-left | a **red wheeled tool cart** on the right: top tray BIKE, drawer OUTFIT (2 rows, with garment icons), drawer RIDER | a dark plate on the lift's front edge | none drawn (optional) |
| **E** | Shutter door | side-on, centre, against a half-open roller shutter with daylight spill | **spray-stencil zones on the floor** along the bottom: BIKE \| OUTFIT (2 rows) \| RIDER | stencilled on the shutter rail, top-left, one line + three bars | none |

Tap counts from the garage (every option is a direct chip in all five, so the numbers only differ from today on the rider model):

| | Change bike | Change outfit | Change rider model | Scroll / pan needed |
|---|---|---|---|---|
| today | 1 | 1 (4th and 5th outfit: 1 + a horizontal scroll) | 2 + a screen change (`‹ MENU` → Visuals) | column scrolls on short phones; outfit strip scrolls x |
| **A–E** | 1 | 1 | 1 | none — all ten options in frame |

---

### A — "Pit box" (`A-pit-box.jpg`)

**What it is.** A race-team pit bay: red IRONWORKS tool chest and workbench left, NORDVIK and APEX SUSPENSION banners, a hanging lamp as the warm key, an open bay door as the cool fill, KESTREL TYRES warmers and a BOLT ENERGY flight case right. The bike + rider stand on a round steel turntable with a chequered rim and a rotation arrow; `drag to rotate · pinch to zoom` sits on the rim. The bottom 25 % is one charcoal **pit-board slab** with the amber top edge, split by thin rules into BIKE (ROOKIE amber / PRO, the three stat bars and the note underneath), OUTFIT (five chips with colour dots in one row) and RIDER (three chips). The slab's top edge is just under the wheels.

**What it does with the brief.** The most literal reading: hero above, every control in one band below, both thumbs reach everything, the stats live with the bike chips. The turntable makes the rotate affordance a physical object.

**Mockup vs. brief.** As briefed. The helmet touches the lamp / the top edge — at the real aspect the rider would clip; the camera needs to sit a touch lower or the slab a touch shorter. Rider drawn in boots (the Charcoal · open-face preset has trainers). Drawn at 1.84:1.

**Hero share.** Bike + rider ≈ 68 % of the panel height; the slab 25 %; at 19.5:9 the slab keeps its 44 px chips and the hero shrinks to ~55 %.

**844×390.** The slab needs 44 px chips + a 16 px heading + the 3-bar stat strip: ~120 px, 31 % of 390. Ten chips across 776 px of safe width is 70 px each — the outfit labels have to go to two lines or the swatch-only form with the label on the selected one. The hero drops to ~50 %.

---

### B — "Tool wall" (`B-tool-wall.jpg`)

**What it is.** A home-workshop back wall: pegboard hung with a spanner row, a torque wrench, hex keys, a KESTREL TYRES tin sign, a BOLT ENERGY plate, a strip light above (cool) and a clip-on lamp left (warm). The bike + rider fill the centre-right, side-on, the largest hero of the five. Down the **left edge** a steel rail with hooks carries dark **shop tags** with punched holes and strings, two per row, under three headings stencilled on plywood strips: BIKE (ROOKIE amber with a bike icon / PRO), OUTFIT (five tags with garment and helmet icons and a colour bar), RIDER (three tags with rider silhouettes). A paper **clipboard** hangs top-right: `ROOKIE — CLASS A`, three hand-drawn bars with the numbers, the note. `drag to rotate · pinch to zoom` under the rear wheel on the rubber mat.

**What it does with the brief.** The most *garage* of the five — the controls are objects on the wall, not a UI band, and the stats are a sheet of paper. Height is used: ten tags stack in a column, so the horizontal space goes to the bike (82 % of the panel height).

**Mockup vs. brief.** As briefed; the generator returned 1672×941 instead of 1536×1024 (kept as generated) at 1.81:1, and painted the top 90 px as a solid black title bar rather than letting the set run under the badge plate — read that band as part of the letterbox. `KESTREL` on the tank and `TG` on the swingarm are fictional. Rider in boots.

**Hero share.** ≈ 82 % of the panel height; the tag column ≈ 21 % of the width; the clipboard ≈ 17 % × 35 %.

**844×390.** The honest problem: six tag rows (1 bike + 3 outfit + 2 rider) at 44 px plus three headings is ~340 px of a 390 px screen — it fits only with the headings inline and no gaps, or with the outfit tags in one three-wide row. The tags are under the **left thumb only**, and the BIKE pair is at the top-left, outside either thumb's arc. The clipboard is fine (informational, no tap).

---

### C — "Showroom spot" (`C-showroom-spot.jpg`)

**What it is.** A dark studio: black floor with a wet reflection, one hard spot from above on the bike + rider (three-quarter front, 74 % of the panel height), a cool rim from behind-left, haze in the beam, a dim VORTEX OIL neon high right, a tyre rack and a tool cabinet as silhouettes at the edges. The **only UI** is one chip row on the bottom edge under an amber hairline — `BIKE` ROOKIE (amber) PRO · `OUTFIT` five outlined pills · `RIDER` three — with tiny group captions above, and a **floating stat card** (POWER / GRIP / WEIGHT bars, the note, a caret) that fades in beside the selected bike chip; the mockup draws it mid-left, pointing down at ROOKIE. `drag to rotate · pinch to zoom` under the front wheel.

**What it does with the brief.** Maximum hero, minimum chrome; the stats are on demand, so the frame is the bike and one line of chips. It is the closest to a real game's showroom and the cheapest set to build (a floor, a spot, two silhouettes).

**Mockup vs. brief.** The chips are drawn ~58 image px tall = **35 CSS px at 932 — under the 44 px floor**; grown to 44 px the row takes ~55 px of height, which the frame has. The stat card's caret points at empty floor, not at the chip (the card was asked for "above ROOKIE"; it landed 80 px higher). PRO carries its blue mark as briefed. Drawn at 1.93:1.

**Hero share.** ≈ 74 %; the chip row ≈ 7.5 % (≈ 12 % once the chips are 44 px).

**844×390.** Fine: the row is one band; the stat card moves up and can overlap the dark void, never the bike; the hero keeps ≥ 60 %. Ten chips in one row across 776 px is the same 70 px-per-chip squeeze as A — outfit labels to two lines or swatch-first.

---

### D — "Workbench" (`D-workbench.jpg`)

**What it is.** Low camera at hub height, the bike + rider on a diamond-plate **scissor lift** centre-left, three KESTREL TYRES stacked in the left foreground, a work light on a stand as the warm key, a skylight and an open shutter as the cool fill, APEX / VORTEX OIL / NORDVIK banners and an IRONWORKS stencil on the back wall. The right 35 % is a red **wheeled tool cart**: its top tray holds BIKE (ROOKIE amber with an `A` chip / PRO with a blue `P`), the first drawer OUTFIT as two rows of tags with garment icons, the second drawer RIDER (Classic / Blender amber / Img2 experiment with silhouettes). A dark plate on the lift's front edge carries `ROOKIE · CLASS A`, the bars and the note; `drag to rotate · pinch to zoom` is stencilled on the lift's deck.

**What it does with the brief.** The controls are a prop with drawers — the three groups are physically separate things, so a stranger reads "the cart is where you change stuff" without a heading. The low camera makes a 54 % hero feel bigger than C's 74 %.

**Mockup vs. brief.** As briefed. The tags are ~70 image px = 42 CSS px, a hair under the floor. The rider is drawn in trainers, correct for the preset. Drawn at 1.84:1.

**Hero share.** ≈ 54 %; the cart ≈ 35 % × 64 %; the stat plate ≈ 27 % × 19 % under the lift.

**844×390.** The cart is under the **right thumb only** and its top row (BIKE) sits at 40 % height — reachable but a stretch; the three groups need ~250 px of the 390 (6 rows of 44 with the outfit tags two-wide), so the cart grows to ~70 % of the height and the hero compresses to ~48 %. The tyre stack and the stat plate go first.

---

### E — "Shutter door" (`E-shutter-door.jpg`)

**What it is.** A bay seen from inside: the bike + rider side-on, facing left, in front of a half-open steel roller shutter — daylight floods the lower half and throws the bike's shadow toward the camera; the shutter's upper half carries an IRONWORKS stencil and a BOLT ENERGY sticker; a work lamp on the left wall keys the near side; a bench with a vice left, a NORDVIK drum right. The controls are **spray stencils on the floor** along the bottom 20 %: three painted zones BIKE | OUTFIT | RIDER, each option a stencilled word in a painted box (ROOKIE amber / PRO with a blue tick; the five outfits in two rows; the three riders in two rows). The stats are stencilled on the shutter's rail top-left: `ROOKIE · POWER 55 · GRIP 82 · WEIGHT Planted`, three bars, the note.

**What it does with the brief.** The most atmospheric set for the least geometry (a shutter, a floor, daylight); the controls are diegetic without being props. The only mockup at the true phone aspect.

**Mockup vs. brief.** The stencils are ~50 image px = **30 CSS px, well under the floor**; two rows of 44 px plus a heading is ~120 px = 28 % of 430, so the strip grows and the hero (64 %) drops to ~55 %. The stat line on the rail is 9 px type on the phone — it needs to become a plate or move to the ROOKIE zone. Drawn at 2.17:1.

**Hero share.** ≈ 64 %; the stencil strip ≈ 20 %.

**844×390.** The strip at 44 px rows is 31 % of the height; the daylight band behind the bike compresses; the hero holds ~50 %. Both thumbs reach the strip.

---

## 3. Trade-offs

| | Hero share (as drawn → at 19.5:9 with 44 px controls) | Control real estate | Thumb reach | Risk at 844×390 | Set cost on today's renderer |
|---|---|---|---|---|---|
| **A** Pit box | 68 % → ~55 % | bottom slab, full width, 25–31 % height | both thumbs | **medium** — ten chips in one row need two-line or swatch-first labels; slab reaches 31 % | medium: turntable + pit-bay dressing; the plate can do the back wall, the turntable is geometry |
| **B** Tool wall | 82 % → ~70 % | left column 21 % width, full height | **left thumb only**; BIKE out of reach | **high** — six 44 px rows + headings ≈ 340 px of 390 | low–medium: one pegboard plate behind the hero + a floor; the tags are DOM |
| **C** Showroom spot | 74 % → ~62 % | one bottom row, ~12 % height | both thumbs | **low** — one band; the stat card floats over the void | **lowest**: black floor, one spot, two silhouette plates; the spot and reflection are lighting work already in `environment.ts` |
| **D** Workbench | 54 % → ~48 % | right cart 35 % × 64–70 % | **right thumb only**; BIKE at 40 % height | **high** — the cart wants 70 % of the height; hero under 50 % | high: scissor lift + cart + tyre stack as geometry, low camera preset |
| **E** Shutter door | 64 % → ~55 % | bottom strip 20–31 % height, two rows | both thumbs | **medium** — two 44 px rows = 31 %; the stat line must move | medium: shutter + daylight spill is one plate + a directional light; the floor stencils are DOM with a perspective transform or a floor decal |

All five put every garage control on one screen with no scroll axis and reach the rider model in 1 tap (today: 2 + a screen). A, C and E keep both thumbs on the controls; B and D are one-handed by construction.

---

## 4. Recommendation

**C, "Showroom spot", as the layout — with A's slab as the fallback if the on-demand stat card tests badly.** Reasons:

1. **It is the brief.** The hero is the screen; the chrome is one row. Nothing can overlap the bike because nothing else is there. It is the only direction whose 844×390 story is "the same, slightly shorter".
2. **Cheapest set that still reads as a garage.** A black floor, one spot, a reflection and two silhouette plates — the work is in `src/render/lighting/environment.ts` and the camera, not in geometry. A, D and E are props; B is a plate but a tall column of DOM.
3. **The one thing it has to prove** is the on-demand stat card: a stranger must see POWER / GRIP / WEIGHT without hunting. If the phone clip shows people not finding it, A's slab (stats always on, under the bike chips) is the same chip row with a taller band — a CSS change, not a redesign.
4. **Both thumbs, one band** — the pause / results tiles already live low; the garage joins the same rule.

Pick **A** if the stats must be permanently visible and the pit-bay dressing is wanted for the menu too (menu A "Paddock" shares the set). Pick **B** for the most *garage* and the biggest bike, and budget the short-phone squeeze and the one-handed column. **D** and **E** are the best-looking sets and the worst control layouts on a short phone; either could donate its set to C's layout.

Whichever wins, the round that ships it needs a played clip on the phone harness: cold boot → menu → garage → drag the bike round → tap an outfit → tap Pro → back → countdown, with the hero ≥ 45 % of the height in every frame and a stranger's first tap landing on a chip.

---

## 5. Notes for whoever builds it

- **Camera.** The rig's idle framing puts the bike at `bikeHeightFrac 0.369`, `bikeScreenY 0.55` (`src/render/camera/rig.ts`); every direction wants ≥ 0.45 and the aim raised so a bottom band fits (C ≈ 0.62 / aim at 0.48; A/E ≈ 0.55 / aim at 0.42). The working tree already carries an uncommitted `CameraOverride.mode = 'orbit'` with `yaw` / `pitch` / `dist` / `screenY` (`src/core/types.ts`, `rig.ts`) — that is the model-explorer camera; `screenY` is the knob for the band.
- **Rotate / zoom.** Pointer drag → `yaw`, wheel / pinch → `dist`, on the canvas, gated so the chips keep their taps (`touch-action: none` on the scene, not on the UI). The affordance text goes away after the first drag.
- **Rider model moves in.** `RIDER_MODEL_OPTIONS` and `cb.setModel('rider', …)` are in `src/ui/menu.ts` / `front.ts` today; the garage needs the same three-way segment and the menu's Visuals panel then loses the rider row (the bike model row can stay in Settings). `loadRiderModelFamily` in `src/ui/outfit.ts` already reads the stored choice.
- **Chips.** `RIDER_PRESETS[].label` and `BIKE_SPECS[].name` are the exact strings; ten chips in one row at 844 wide is 70 px each, so A / C / E need either two-line labels or swatch-first chips with the label on the selected one. B / D stack them and pay in height.
- **Stat strip.** `bar()` in `garage.ts` already renders POWER / GRIP / WEIGHT with the `weightFeel` text; C's card is that markup absolutely positioned above the selected bike chip, shown on `.on`.
- **Sets.** `art.byId('garage-plate')` is the existing garage plate; C needs a floor and a spot (lighting), B one pegboard plate, E one shutter plate + a daylight directional, A and D geometry. The plate must sit *behind* the hero in depth, not as a CSS layer in front of the canvas (today's `.garage-plate` mask is exactly the layer that hides the bike).
- **`html.short`.** Both phone geometries are "short" (≤ 500 px); the garage's short rules in `styles.ts` (§497–505) are the ones that matter, the desktop rules are secondary.
- **Thumb reach.** A, C, E: both thumbs on the band. B: left column — put BIKE at the bottom of the rail, not the top. D: right cart — put BIKE on the lowest drawer.
- The `14 fps · 1258 ms · L` readout in the capture is the dev fps counter, not part of the screen.
