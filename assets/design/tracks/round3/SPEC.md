# Track select, round 3 — the isometric diorama five ways (mockups, no decision)

Round subject: the user, on round 2 (`assets/design/tracks/round2/SPEC.md`): *"A3 isometric diorama looks sick, can you do 5 variants of that for me to look at."* Same standing direction: Broadcast language, landscape phone first (932×430 and 844×390 with safe-area insets), every tappable thing ≥ 44 px, one-thumb reach, at most one scroll/pan axis, the round-1 invariants (≤ 2 taps to B1 once focused, locked H1 with its rule, M1 `UP NEXT`, `6 / 15 CLEARED`, `▶ GHOST` on B1, `2 / 6 NOTED`, `‹ MENU` top-right, badge plate top-left). **No game code changed and nothing is decided here — the user picks.**

- Contact sheet (round-2 A3 + the five, labelled): `assets/design/tracks/round3/contact-sheet.jpg`
- Directions, full-res PNG as generated (1536×1024 with black letterbox): `A3a-fitted.png`, `A3b-one-tile.png`, `A3c-tower.png` (the retry), `A3d-turntable.png`, `A3e-night.png`; the same with the letterbox cropped: `*.jpg`. A3c's first run filled the whole 1536×1024 canvas (a 3:2 screen, no letterbox) and is kept as `A3c-tower-run1-tall.png/.jpg` (§ 3).
- Briefs, so the parent can rerun: `briefs/shared.md` (round 2's shared brief with a new intro describing the two reference images and a "Round 3" paragraph), `briefs/{A3a,A3b,A3c,A3d,A3e}.md`, and `briefs/gen.sh <variant> [logdir]`. Recipe: `cat briefs/shared.md briefs/<X>.md | codex exec -s workspace-write -i assets/design/tracks/current-932x430.png -i assets/design/tracks/round2/A3-isometric-diorama.png -o <log> -` from the repo root — **two `-i` references this round**, the current build and the chosen diorama, so the tile / pin / island language holds. Five runs in parallel: A3d 157 s, A3e 161 s, A3a 184 s, A3b 196 s, A3c 241 s (4.0 min wall clock); one retry of A3c (§ 3).
- Every mockup shows the same seeded state as rounds 1 and 2 (6 / 15 cleared, E3 on Pro, M1 up next, H1 the next unlock, B1 focused).

They are direction studies, not pixel truth. The second reference did its job: all five kept the slab-with-cut-sides tiles, the pin-on-a-post with the code + medal disc, the hazard-tape fences carrying the rule, and the NORDVIK hangar island with five coloured pads.

---

## 1. The five at a glance — what each varies

| | Name | What changes vs. round-2 A3 | Navigation (the one axis) | X2 / X3 in frame? | Lab / Playgrounds |
|---|---|---|---|---|---|
| **A3a** | Fitted | same world, re-tiled smaller so **all 22 pins fit one screen, no pan**; pins carry code + disc + name only (PB / target move to the popover); a **tier-tab row** (`LAB · PLAYGROUNDS · BEGINNER 3/3 · EASY 3/3 · MEDIUM 0/3 · HARD 🔒 · EXTREME 🔒`) along the bottom of the map jumps the focus | none for the world; the tab row is a `FocusList` (x) that moves the focus ring and nudges the camera | **yes** — Foundry fully inside the right edge with M3, H3, X2, X3 | island front-left, as before |
| **A3b** | One tile at a time | the camera sits on **one biome tile drawn huge** (Industrial: four big pins with full plates, a `NEXT TIER GATE → HARD` sign leading to a small adjacent Night City stub with H1's lock and rule); the **other tiles are miniatures in a row** along the bottom of the map with count + medal dots / padlocks; tap = fly | x, the miniature row (swipe on the big tile does the same) | not in frame — Foundry's miniature shows `0 / 4` with one dashed dot and three padlocks | island **top-right**, small, as its own fly target |
| **A3c** | Tower | tiles stacked **by tier** into a zig-zag tower — Beginner (industrial) at the base, Easy (canyon), Medium (industrial + snow + foundry strips), Hard (night city + foundry, greyed, gated), Extreme (snow + foundry, greyer, gated) at the top — joined by stair-bridges; a **vertical tier rail** on the right edge | **y**, pan up the tower (the rail jumps) | in the tall first run yes; in the canonical retry X1–X3 are one pan up (§ 3) | island at ground level, bottom-right |
| **A3d** | Turntable | the tiles sit **around a hub** (`TRIALS GAUNTLET` pillar): the focused tile faces the camera, its neighbours are angled and smaller, the far ones peek over the hub; **swipe rotates** one slot; the focused track's info is a **card that rises from the tile** (code, name, biome · tier, medal, PB / target, elevation profile, chips) instead of a popover | x, rotate (`◀ ● ○ ○ ○ ○ ▶ SWIPE TO ROTATE`) | no — Foundry is the slot behind the hub, only its dot shows | island takes **one turntable slot** of its own (left of Industrial) |
| **A3e** | Night | the round-2 layout, camera pulled back so **all 22 pins fit**, at night: each tile lit by its own lamps (sodium, campfire + sunset band, ice-blue moon + lit cabin, neon, molten glow; the island under cold floodlights), the cleared route **glows amber**, and each tile's medals stand as **lit trophies on a front ledge** (empty pedestals for open tracks, padlocked pedestals for locked) | x, pan (`◀ ● ○ ○ ○ ▶`), though the drawn frame already holds everything | **yes** — M3, H3, X2, X3 all in frame | island front-left, as before |

Tap counts from the menu (PLAY = tap 1; a tap on a pin focuses, `RIDE` or a second tap launches):

| | Start B1 | Reach H1's rule |
|---|---|---|
| **A3a** | 3, or 2 with the double-tap rule / when B1 is the opening focus | **2, no pan** — H1 and its plate are on the one screen; the HARD tab also carries the rule |
| **A3b** | 3 / 2 | **2, no fly** — the `NEXT TIER GATE` stub shows H1 + rule on the Industrial tile; the Night City miniature repeats the rule |
| **A3c** | 3 / 2 | 2 + one pan up (or 3 via the rail's HARD stop; the rail's padlock is visible without a pan) |
| **A3d** | 3 / 2 | 2 + two rotations (Night City is at the back — its H1 plate is readable over the hub without rotating, at ~9 px type) |
| **A3e** | 3 / 2 | **2, no pan** at the drawn scale |

---

## 2. Per variant

### A3a — "Fitted" (`A3a-fitted.jpg`)

**What it is.** The round-2 diorama with the camera pulled back and the tiles shrunk until the whole world — island + five tiles + every pin from LAB to X3 — sits on one screen. Pins keep the 44 px disc and a name plate; the PB and target live only in B1's popover. Below the map a seven-tab row (`LAB · PLAYGROUNDS · BEGINNER 3/3 · EASY 3/3 · MEDIUM 0/3 · HARD 🔒 MEDAL EVERY MEDIUM TRACK · EXTREME 🔒`), BEGINNER underlined amber. Fences and rules as before; `UP NEXT` on M1; H1 lit with `NEXT UNLOCK · MEDAL EVERY MEDIUM TRACK`; E3 `PRO`.

**What it does with the brief.** The direct answer to round 2's weakness: nothing is off-frame, and there is nothing to pan. The tab row gives tier-wise navigation for the thumb and for the pad (left/right across tabs, then across pins), which the free diorama never had.

**Mockup vs. brief.** On-spec frame (1536×708, 158 px letterbox). Complete: 22 pins, both fences, both `MEDAL EVERY …` rules, all five `OPEN` stamps. No text errors found.

**844×390.** The map band is ~230 px tall and every tile is already a ~150 px object at 932; at 844 the pins are 44 px discs on ~120 px tiles with name plates that will overlap on Foundry (four pins on one tile) and Industrial (four). Fix: drop the name plate from unfocused pins (code + disc only; name in the popover) — then it fits. The tab row's seven tabs are ~110 px each at 844; fine.

### A3b — "One tile at a time" (`A3b-one-tile.jpg`)

**What it is.** The Industrial tile fills two-thirds of the screen as a proper diorama (VORTEX OIL tank, gantry crane, forklift, container rows, an amber route), its four pins big with full plates (`LEAN BACK · PB 0:47.900 · TARGET 1:05.000 · ▶ GHOST` …), `INDUSTRIAL · 3 / 4` engraved across the front, and a hazard-tape `NEXT TIER GATE → HARD` sign leading over a short bridge to a small Night City stub carrying H1 (`ROOFTOP WIRE · NIGHT CITY · LOCKED · NEXT UNLOCK · MEDAL EVERY MEDIUM TRACK`). Along the bottom of the map a row of five miniature tiles — `INDUSTRIAL 3/4` (underlined amber, gold · silver · bronze · dashed), `CANYON 3/3`, `SNOW 0/2`, `NIGHT CITY 0/2 · MEDAL EVERY MEDIUM TRACK`, `FOUNDRY 0/4` — with `‹ ›` arrows. The island sits top-right with its hangar and five pads.

**What it does with the brief.** The most *legible* diorama: one tile's worth of pins at card size, and still the whole world in the miniature row. It is round-2 A2 (tabbed atlas) rebuilt in the diorama language, and it inherits A2's virtue — the next tier gate, with its rule, on the page you are already looking at.

**Mockup vs. brief.** On-spec frame. Complete. The `NEXT TIER GATE` stub was drawn as a real mini-tile (nice — it is the neighbour peeking, not a sign). No text errors found.

**844×390.** The best fit of the five: the big tile loses ~40 px of height and nothing else changes; the miniature row is 44 px by design; the island top-right must not collide with the LIVE chip / MENU pill (it does not at 932; at 844 shrink the island or drop it into the row as a sixth miniature).

### A3c — "Tower" (`A3c-tower.jpg`, first run `A3c-tower-run1-tall.jpg`)

**What it is.** The tiles restacked by tier into a climbing zig-zag: `BEGINNER · 3 / 3` (industrial, IRONWORKS) at the base, a stair-bridge up to `EASY · 3 / 3` (canyon), another to `MEDIUM · 0 / 3 · UP NEXT` (three strips — industrial M1, snow M2, foundry M3), then `HARD · 0 / 3` (night city H1, H2 + foundry H3, gated `LOCKED · MEDAL EVERY MEDIUM TRACK`, H1 lit `NEXT UNLOCK`) and `EXTREME · 0 / 3` (X1 snow, X2, X3 foundry, `LOCKED · MEDAL EVERY HARD TRACK`) at the top; the island at ground level bottom-right; a vertical tier rail on the right edge with medal discs / padlocks per tier and an amber marker on BEGINNER.

**What it does with the brief.** Progression becomes *altitude*: how high the amber route has climbed is the career, the locked tiers are literally above you behind a gate. The biome is the terrain of each tier tile (Medium's three strips), so the biome grouping the user chose in round 1 is demoted to texture — this is the one variant that stops being a *biome* map.

**Mockup vs. brief.** The first run drew a **3:2 screen filling the whole canvas** (1536×1024, no letterbox at all) — codex's own note: *"The generated image omitted the requested black letterboxing"*. Read that image as ~45 % taller than the phone: at 19.5:9 you see roughly the bottom two tiers plus the island, not the whole tower. It is otherwise the most complete picture of the round (all 22 pins with PB and target, every rule, the rail). Retried once (§ 3). No text errors found in the first run.

**844×390.** The honest problem is inverted: this is the only variant whose one axis is *vertical*, and the phone's short axis is vertical. Each tier level needs ~120 px (tile + pins + plates), so 390 px shows two levels plus the header and band — Beginner and Easy; M1 `UP NEXT` and H1's rule are a pan away unless the opening camera sits on Easy/Medium. The rail stays; it is the cheap way to see the locks without panning.

### A3d — "Turntable" (`A3d-turntable.jpg`)

**What it is.** A circular platform on the water with a `TRIALS GAUNTLET` hub pillar; Industrial faces the camera (`INDUSTRIAL · 3 / 4`, four pins with full plates), the island (`NORDVIK`) is the slot to its left, Canyon (`CANYON · 3 / 3`, E1–E3) the slot to its right, Snow (M2, X1) and Night City (H1 lit `NEXT UNLOCK · MEDAL EVERY MEDIUM TRACK`, H2) show over the hub at the back, Foundry is behind the pillar. `◀ ● ○ ○ ○ ○ ▶ SWIPE TO ROTATE` under the rim. B1's card rises from the tile: `B1 · FIRST RIDE · INDUSTRIAL · BEGINNER`, gold disc, `GOLD 0:41.200 · TARGET 1:05.000`, an elevation profile, `▶ GHOST`, `2 / 6 NOTED`.

**What it does with the brief.** The most *object-like* — a trophy-cabinet turntable rather than a map — and the rising card is a better focused-track surface than any popover (it has room for the profile). The back tiles being visible over the hub is a genuine advantage: the lock rule is readable without rotating.

**Mockup vs. brief.** On-spec frame. Text errors: H2's target reads `1:35.000` (should be 1:25.000); H1's plate lost its name (`NEXT UNLOCK` only, no `ROOFTOP WIRE`). Five dots where six slots were briefed (island + five tiles). Foundry (M3, H3, X2, X3) hidden by design.

**844×390.** The turntable is a circle and the screen is a wide strip: at 390 px the front tile keeps its pins at 44 px but the back tiles' plates (already ~9 px type) become unreadable, so the rule on H1 must move to a rim label or the rising card must handle locked tracks. Two rotations to reach Night City and three to Foundry is the cost of the circle.

### A3e — "Night" (`A3e-night.jpg`)

**What it is.** Round-2's layout at night, camera pulled back so all 22 pins fit: the island under white floodlights with the pads edge-lit in their colours; Industrial under sodium masts; Canyon with a last sunset band and campfire glow; Snow ice-blue with the cabin lit; Night City neon (KESTREL TYRES) behind its fence; Foundry lit from below (BOLT ENERGY, APEX SUSPENSION). The amber route glows from B1 to B3 and a pulsing dashed segment to M1. Every tile's front ledge carries its medals as lit trophies: Industrial gold · silver · bronze + an amber-outlined empty pedestal, Canyon silver · bronze · silver, Snow an empty + a padlocked pedestal, Night City two padlocked, Foundry one empty + three padlocked. Pins as before with PB and target.

**What it does with the brief.** The mood the user reacted to in A3, turned up; the trophy ledge is round-2 AD's shelf idea in diorama form and reads at a glance which tiles are done. It also quietly fixes the off-frame problem the same way A3a does (pull back), without giving up PB and target on the pins — at the cost of 22 plates on one screen.

**Mockup vs. brief.** On-spec frame. Text errors: X2 is labelled `X3` (two X3 pins; the names `THE ROLLING MILL` / `THE STACK` are right), M3's target reads `1:25.000` (should be 1:10.000), H3's rule is garbled (`MEDAL EVERY MEDIM TRACK`). Otherwise complete.

**844×390.** 22 pins with PB + target plates in a ~230 px band is the same density problem as round-2 AE: the plates collide on Foundry and Industrial. Same fix as A3a (code + disc only when unfocused) — then the night lighting, the glowing route and the trophy ledges are pure CSS/art cost and fit fine.

---

## 3. Off-spec, per variant (and the one retry)

| | Frame | Text errors | Off-frame tracks | Other |
|---|---|---|---|---|
| **A3a** | 1536×708, exact | none found | none — all 22 | — |
| **A3b** | 1536×708, exact | none found | Foundry / Snow / Canyon tracks only as miniature dots (by design) | — |
| **A3c** | **first run 1536×1024, no letterbox (3:2)**; retry 1.76:1 (canonical) | none found (either run) | run 1: none (all 22, with PB + target); retry: X1–X3 above the top edge (one pan) | the tower is by tier, not biome; the retry does not grey the Hard tile |
| **A3d** | 1536×708, exact | `H2 … 1:35.000` (1:25.000); H1 plate lacks `ROOFTOP WIRE` | Foundry behind the hub (by design) | five dots for six slots |
| **A3e** | 1536×708, exact | `X3` on X2's pin; `M3 … 1:25.000` (1:10.000); `MEDIM` on H3 | none — all 22 | — |

- **A3c retry.** Per the round rule (retry once on an off-spec run) A3c was rerun with the same briefs and references (144 s). The retry drew a **1.76:1** screen (1536×873 inside the canvas, thin letterbox) — still not 19.5:9, but it is the honest picture of what the phone frames: Beginner, Easy and Medium in full, the Hard tile with H1's `NEXT UNLOCK · MEDAL EVERY MEDIUM TRACK` plate, and Extreme cut by the top edge with only its gate (`LOCKED · MEDAL EVERY HARD TRACK`) showing; X1–X3 are above the frame, one pan up. It is the canonical `A3c-tower.png`; the tall first run (all 22 pins) is kept as `A3c-tower-run1-tall.png`. The retry's Hard tile is lit neon rather than greyed as briefed, and its `MEDIUM · 0 / 3 · UP NEXT` plate is as briefed; no text errors found.
- No run refused the two images or errored (six exits 0 including the retry). Codex's own last messages are in the scratch logs (`tracks-r3/logs/*.last.md`).
- The two `-i` references worked as intended: the pin, tile, fence and island constructions are the round-2 ones in every variant — compare the island in A3a, A3c, A3e (front-left / bottom-right / front-left) and A3b, A3d (top-right / a turntable slot).
- Round 1's naming collision still stands (`h2-gap-chain` and `p1-container-yard` are both **Container Yard**); A3a, A3c and A3e draw both on one screen.

---

## 4. Build notes for `TrackSelectScreen` (`src/ui/front.ts`)

Common to all five (and to round-2 A3): the seven `tier-row`s + nested `.carousel`s become **one absolutely-positioned scene** in a single scroller (or none, for A3a); `card()` shrinks to a pin (`button.pin` with `data-track`, the medal disc from `art.medal()`, a name plate) positioned by a **hand-authored anchor table** in tile space; focus becomes a linear index in tier order with `nextTrack()` as the opening focus; locked pins keep `lockLine`'s text (`Medal every ${TIER_LABEL[prev]} track`) as their plate; the popover / card / plaque is one element repositioned on focus. The art is the cost — every variant needs the tiles as plates (isometric, matching projection and lighting) plus the island; none of the existing `plate-*` / `keyart-*` / `track-*` art is isometric.

| | Extra over the common build | Estimate |
|---|---|---|
| **A3a** | no scroller; the tab row = the existing horizontal `FocusList` bound to tier → first pin; a camera nudge is a CSS transform on the scene; pins without name plates when unfocused | ~1.5 days UI + 6 plates (5 tiles + island) at one fixed scale |
| **A3b** | one snapping horizontal scroller of six big tiles (island + five), `scroll-snap-type: x mandatory`; the miniature row = a second `FocusList` bound to the same index (one axis, two controls, as round-2 A2); the `NEXT TIER GATE` stub = the next tile's edge peeking + a template string from `TIER_ORDER[i+1]` / `tierUnlocked`; **the closest to today's code** (seven rows → six pages) | ~1.5 days UI + 6 big plates + 6 miniatures (the big plates downscaled may do) |
| **A3c** | a vertical scroller (the only variant on y — today's `.tiers` axis, so the least structural change to `build()`), tiles by tier not biome (the data walk is already per tier: `tracksInTier`), stair-bridges as plates, the rail = a vertical `FocusList` bound to the scroll position; Medium's three-strip tile is a composite plate | ~2 days UI + 5 tier plates (Medium and Hard are composites) + island + bridges |
| **A3d** | a fake 3-D rotation: six slots on an ellipse, each tile a plate with `transform: translate/scale` by slot angle and z-order by depth; swipe = index ±1 with a tween; the rising card = round-2 C's big card with a rise transition; back-slot plates need a legible fallback for the lock rule | ~2.5 days UI + 6 plates rendered *from the front* (angled views are the scale/skew of the same plate) + hub |
| **A3e** | A3a's build + night versions of the six plates (or the day plates with a multiply overlay and additive lamp sprites), the route as an SVG polyline with a glow filter, the trophy ledge = one `<div class="ledge">` per tile with `medal(m)` art on pedestal sprites | A3a + ~0.5 day + 6 night plates + trophy/pedestal sprites |

---

## 5. Recommendation (for the user to accept or reject)

**Build A3b (one tile at a time), and light it like A3e.** In order:

1. **It fits the phone without a new idea.** One big tile with ≤ 4 pins at card size, a 44 px miniature row, and the island as a sixth page or a corner object — the 844×390 story is "lose 40 px of tile height", nothing else. A3a and A3e need pins to drop their name plates at 844; A3c shows two tiers; A3d's back tiles are unreadable.
2. **It is the cheapest and the closest to the code**: six snap pages in one horizontal scroller is today's row model turned sideways (the same conclusion as round 2's A2, now in the diorama language the user likes).
3. **The next tier gate is on the page you are on** — the H1 stub with its rule solves "what's next" without a tap, and the miniature row repeats every lock.
4. **A3e's lighting and trophy ledge are page furniture, not architecture** — a night plate per tile, a glow on the route, and a ledge element — so they bolt onto A3b for the mood the user reacted to.

Second pick **A3a** if the user wants the whole world visible at once (it does exactly that, and is the same build as A3e); it costs the per-pin PB/target and the name plates at 844. **A3c** only if progression-as-altitude matters more than biome grouping — it is the one variant that abandons the biome map the user chose in round 1. **A3d** is the best object and the worst phone fit; keep its rising card as the focused-track surface for whichever ships.
