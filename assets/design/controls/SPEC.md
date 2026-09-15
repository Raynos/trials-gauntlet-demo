# Run touch controls — five directions (mockups, no decision)

Round subject: *"It's time to put actual buttons for gameplay control on the screen. Keep the touch zones as is, 1/4 screen each. But we need actual touch buttons / icons with feedback etc."*

This document is the deliverable: the current run screen for reference, five clearly different ways to draw visible controls onto the four existing quarter zones, what each costs against `src/game/input/touch.ts` + `src/ui/styles.ts`, and a recommendation. **No game code changed and nothing is decided here — the user picks on the phone.**

- Contact sheet (current + A–E, labelled): `assets/design/controls/contact-sheet.jpg`
- Directions, full-res PNG as generated (1536×1024): `assets/design/controls/A-corner-pads.png`, `B-rails.png`, `C-ghost-dials.png`, `D-trials-classic.png`, `E-physical.png`
- Reference frame the user sent (E1 Uphill Weight, 932×430 CSS on an iPhone, 2622×1206 px): `assets/design/controls/current-e1-run.png`
- Mockups were generated with Codex image generation (`codex exec -i <reference>`) from one shared scene description plus a per-direction control brief (kept in the session scratchpad). They are direction studies, not pixel truth: the model re-renders the reference rather than compositing over it, so the canyon, crowd and HUD are close but not pixel-identical — judge the *controls*, not the terrain. Every sponsor is from the art pack's fictional set (IRONWORKS, VORTEX OIL, KESTREL TYRES, APEX SUSPENSION). Each mockup shows the same input state — **LEAN BACK held + GAS held** (the rider accelerating on the rear wheel), LEAN FWD and BRAKE idle — so held-vs-idle can be compared across directions.

---

## 0. What is there today (`current-e1-run.png`)

The touch layer (`TouchInput`, `src/game/input/touch.ts`) is a full-screen `pointer-events` div under the HUD holding six children: four `.tz` columns — `tz-back` / `tz-fwd` / `tz-brake` / `tz-throttle`, each `top:0; bottom:0; width:25%` — and two `.tz-btn` corner buttons (❚❚ pause top-left, ↻ RESTART top-right). The columns are invisible apart from a 1 px divider and a tracking-spaced text label sat on the bottom edge (`◀ LEAN`, `LEAN ▶`, `BRAKE` in red, `GAS` in green) at 35 % opacity, settling to 30 % three seconds after GO; `.held` raises the whole column to 80 % (55 % once settled) with a 7 % white wash. That is the entire feedback vocabulary: a faint label that gets slightly less faint, on a column the size of a quarter of the screen.

Why it fails the user's brief: nothing on the screen *reads as a button* — a stranger sees four words on the ground, not controls; the held state is a full-quarter tint that is invisible over the bright canyon floor and, being the quarter itself, gives no anchor for the thumb to home on; there is no sense of direction (the rider does not know from the UI whether lean is engaged, only from the bike); and because the label sits on the very bottom edge it is exactly under the thumb that presses it.

What must not change (and does not, in any direction below):

- **Hit areas are the four quarters, full height.** `zoneAt()` is pure geometry on logical width: `fx < .25` back, `< .5` fwd, `< .75` brake, else throttle, any `y` from under the HUD buttons to the bottom edge. The drawn control is a *target to aim at*, never the hit rect; a thumb anywhere in the quarter works, and every direction below says so.
- **A finger stays in its half and may slide between that half's two zones** (`zoneAt` with a `current` zone re-tests only the 25 % / 75 % split). Directions B and C are designed *around* that rule — the slide is the gesture.
- **`.live` / hit-rect rule (`src/ui/live.ts`).** Only the pause and restart *buttons* are gated on being drawn at ≥ .5 opacity for 150 ms; the four zones are always live while the layer is `.on` and no overlay is up. New visible controls are visuals inside the existing `.tz` columns, so they inherit `.touch-layer.under-overlay .tz { opacity: 0 }` and stay untappable-by-construction under pause / results. Nothing here adds a new hit rect, so nothing new needs `reveal()` / `conceal()`.
- **HUD top band** (pause, track pill, timer, faults, progress, RESTART, meter) stays as in the reference. All five directions live in the bottom band only.
- **Multi-touch** is unchanged: lean + gas + brake can all be down at once; the visuals are per-zone `.held` classes already toggled in `paint()`.

Shared build baseline (applies to every direction, on top of its own row): the `mk()` helper in the `TouchInput` constructor grows from `<span>label</span>` to a small template per zone (an inline SVG glyph + a fill element + a label); `paint()` keeps toggling `.held`; `.tz` in `styles.ts` drops `align-items: flex-end` text styling in favour of a positioned child; the `settled` opacity step is kept. The current e2e touch harness (`harness/e2e/touch.mts`) reads zones by geometry, so it is unaffected; the `.live` unit test is unaffected because no new surface is registered.

---

## 1. The five directions

| Dir | Name | Visual per quarter | Idle | Held | Reads mid-run by | Covers |
|---|---|---|---|---|---|---|
| **A** | Corner pads | One rounded translucent pad per quarter, big glyph + label, outer two in the corners | 30 % frosted glass | Liquid fill from the bottom (white / red / green), glyph solid + 10 % bigger, glow | Four coloured blocks lighting in the periphery | Bottom ~20 % of each quarter's centre; corners under the thumbs |
| **B** | Rails | One low horizontal rail per *half*: lean rail (bike knob slides + tilts), drive rail (red ← · → green) | 30 % dark glass, tick scale | The held half fills from the rail centre outward, end-cap glyph glows, knob slides | Two horizontal gauges, like a level meter | A ~6 %-tall strip along the bottom edge only |
| **C** | Ghost dials | One thin ring per half, centred on the 25 % / 75 % lines, lower third off-screen: lean dial (tilting bike, ◀ ▶), drive dial (red arc / green arc) | 25 % thin lines | Held half-ring solid + thick + glow, arc fills bottom-up, bike tilts | Two half-moons of colour at the bottom corners of vision | Two ~24 %-wide half-discs on the bottom edge |
| **D** | Trials classic | Flat strip: four flush rectangles, one per quarter, glyph + label, 1 px dividers | 40 % dark glass | Whole quarter column lights (fading toward the top), strip button goes solid with black glyph | The quarter itself changes colour — maximum peripheral signal | The bottom ~13 % strip always; the full quarter column while held (translucent) |
| **E** | Physical | Skeuomorphic: lean rocker (seesaw with LEDs) bottom-left, brake lever + throttle grip on a metal plate bottom-right | Dark metal, unlit LEDs | Rocker tips, LED lights orange; throttle rotates + arc fills; brake pulls + flashes red | Orange LEDs and a filling arc | Two opaque hardware plates, bottom ~22 % of each half |

**Reading the mockups against the phone.** The generator's canvas is 3:2; the phone is 932×430 (2.17:1). Everything vertical in the mockups is therefore ~45 % taller relative to the screen than it would be on the device — a pad that is 25 % of the mockup's height is ~17 % of the phone's. The contact sheet shows the current frame letterboxed at its true aspect next to the 3:2 mockups, which makes the difference visible. The proportions to build to are in each direction's *phone fit* line, in CSS px on 932×430 (`1rem` ≈ 15.6 px there; bottom safe-area inset 21 px). In the reference frame the bike's wheels sit at y ≈ 70 % and the rider's head at ≈ 45 %; the bottom 30 % is the ground under the bike. The four quarters are 233 px wide each.

Colours used across the directions are the existing tokens: `--amber` (HUD), the brake red `rgba(255,90,90)` and gas green `rgba(90,255,140)` already on the `.tz-brake span` / `.tz-throttle span` rules, white for lean.

### A — "Corner pads" (`A-corner-pads.png`)

**What it is.** One rounded pad per quarter, horizontally centred in its quarter and sitting on the bottom edge, so the two outer pads land in the bottom corners under the thumbs and the two inner ones sit at 37.5 % / 62.5 %. Each pad carries one big glyph and a small uppercase label: ◀ + a bike on its rear wheel (LEAN BACK), a nose-down bike + ▶ (LEAN FWD), a red brake disc (BRAKE), a green throttle grip (GAS). Idle pads are frosted glass; a held pad fills from the bottom like a liquid in its colour, the glyph goes solid and grows ~10 %, and the pad glows.

**Phone fit.** Pads 150 × 82 px (`9.6rem × 5.25rem`), radius 16, bottom edge at `12px + sab` = 33 px up; glyph 40 px, label `.72rem` / tracking .2em. Outer pads' centres at 116 px and 816 px from the left — dead under the resting thumbs; inner pads at 350 px and 583 px, a thumb roll away. Top of a pad at y = 315 px = 73 % — just under the wheel line, so on flat ground the pads sit in the dirt band; on a descent the track ahead can pass behind the inner pads at idle opacity.

**How feedback reads mid-run.** Best of the five for peripheral vision after D: a 150 × 82 block turning solid white / green / red in the bottom corner is a luminance change the eye catches without looking down, and the fill's direction (bottom-up) gives a crude sense of "engaged". Lean back + gas held = white bottom-left and green bottom-right, which is the shape of the hop preload the game teaches.

**Zones / `.live`.** The pad is decoration inside the existing `.tz` column: the hit area is still the full quarter, a thumb outside the pad still works, and the pad brightening on a touch that landed 60 px away from it is the correct behaviour (the pad *reports* the zone). Nothing new is registered with `reveal()`.

**Cost.** Low. `mk()` templates: an inline SVG glyph per zone (four small paths; the bike silhouette can be reused flipped), a `.fill` div and the label — ~50 lines in `touch.ts`. CSS: `.tz-pad` box positioned `bottom / left:50% / translateX(-50%)`, `.fill { transform: scaleY(0); transform-origin: bottom }` → `.held .fill { scaleY(1) }` over `--t1`, `.held` glow via `box-shadow`, per-zone colour variables — ~50 lines in `styles.ts`. Half a day including the phone-harness clip. The one design decision left: idle opacity on a bright canyon floor (the mockup's 30 % is too faint over the sunlit dirt at the top of E1; start at .5 and let `settled` take it to .4).

### B — "Rails" (`B-rails.png`)

**What it is.** Two slim horizontal rails on the bottom edge, one per half. The lean rail (left half) has ◀ and ▶ end caps and a white bike silhouette as a knob at its centre — the 25 % seam; the held half fills white from the seam outward and the knob slides and tilts toward it. The drive rail (right half) has a brake disc at the left end and a throttle grip at the right; brake fills red leftward from the 75 % seam, gas fills green rightward. (The suggested "vertical bars at the screen edges" were dropped: the second quarter has no screen edge, so vertical bars cannot map 1:1 onto the four zones; horizontal rails can — each half of a rail is one quarter.)

**Phone fit.** Rails 420 × 26 px, inset 24 px from the edges and 22 px from the centre, bottom at `10px + sab`; labels under the end caps. The rail occupies only y = 380–406 px (88–94 %) — the least occlusion of any direction — but that also makes it the smallest visual target: 26 px tall is the height of the current text label. The rail's fill pattern matches the `zoneAt` slide rule exactly: a thumb that lands on BACK and rolls right across the 25 % seam becomes FWD, and the knob follows.

**How feedback reads mid-run.** Weakest peripheral signal of the five: a 26 px bar going green at the very bottom of the screen is below the area the eye monitors while riding, so it mostly reads when the player looks down. What it adds instead is a *direction* readout — the bike knob's slide/tilt is a tiny picture of what the lean input is doing, useful for the hop (back-then-forward) but a detail signal, not a glance signal. Making the fill taller fixes the glance problem and turns B into a flat version of A.

**Zones / `.live`.** Each column can draw its own half-rail (the left column the left half with its cap, the right column the right half), so the fills stay inside the existing `.tz` elements and `.held`. The knob straddles the seam, so it is one extra non-hit-testing child of the layer per half whose `transform` `paint()` sets from the lean sign (`translateX(∓40px) rotate(∓18deg)`); it must carry `pointer-events: none` like everything else in the layer, and it is not a button so `.live` is untouched.

**Cost.** Medium. Half-rail templates + two knob elements (~70 lines `touch.ts`, including a `paint()` that also positions the knobs), CSS for the rail track, tick scale (a `repeating-linear-gradient`), fills as `scaleX` from the seam origin, knob transition — ~70 lines. One day. Honest caveat for B and C: touch input is digital (`throttle = has('throttle') ? 1 : 0`), so a "gauge" only ever snaps between empty and full (over `--t1`); it never shows a magnitude because there is none.

### C — "Ghost dials" (`C-ghost-dials.png`)

**What it is.** Two thin rings, one per half, each centred on its half's seam (25 % / 75 %) with its lower third off the bottom edge. Lean dial: a tilting bike in the middle, ◀ BACK at the ring's left, ▶ FWD at its right; the held half-ring goes from a 25 % hairline to a thick, glowing solid arc that fills from the bottom of the ring upward, and the bike tilts that way. Drive dial: left half-ring red for BRAKE (disc glyph), right half-ring green for GAS (grip glyph). Everything is hairlines until touched, so the scene shows through.

**Phone fit.** Ring diameter 224 px (24 % of width), centre at y = 430 − 75 = 355 px so 150 px of the ring shows (65–100 % of the height); stroke 2 px idle, 8 px held; glyphs 28 px at the ring's horizontal extremes; bike 48 px. **The mockup over-draws this**: the generator put the rings almost fully on screen (tops at ~34 % from the bottom of a 3:2 canvas), so the picture shows more ring than the spec would. Even at spec size, the ring's top (65 %) is the highest reach of any direction except D's column wash, and the LEAN dial's centre is 233 px from the left — the left ring's right half runs under the rider's usual x (≈ 36 %) on a descent.

**How feedback reads mid-run.** Good, and the most "game": two half-moons of colour blooming at the bottom corners of vision, one white one green, is a strong peripheral cue while the idle state is nearly invisible. The bike-tilt inside the ring is the same detail readout as B's knob. The cost is idle legibility: at 25 % hairlines a stranger on first boot sees nothing that looks like a control, which is the failure the user is asking to fix; the fix is to idle at .5 stroke opacity (which also satisfies the `.live` opacity number should zones ever be put under it — see §3).

**Zones / `.live`.** Each column draws its half-ring as an SVG arc (`stroke-dasharray` for the bottom-up fill), the two halves meeting at the seam; the bike icon straddles the seam like B's knob and is one extra `pointer-events: none` child per half. No new hit rect. A thumb anywhere in the quarter lights that half-ring — including a thumb 200 px from the ring — which reads fine because the ring is a gauge, not a button.

**Cost.** Medium-high. Two SVG arcs per column with dash-offset animation (~80 lines `touch.ts` templates + `paint()` for the bike tilt), ~70 lines CSS; the arc geometry has to be laid out from the seam in CSS `calc()` so it survives 844 / 932 / desktop widths. One to one and a half days.

### D — "Trials classic" (`D-trials-classic.png`)

**What it is.** A flat button strip flush with the bottom edge: four rectangles exactly one quarter wide each, 1 px dividers, glyph + label (◀ LEAN BACK · LEAN FWD ▶ · ◉ BRAKE red · ▲ GAS green), in the language of the console button-prompt strip. Held: the strip button goes solid in its colour with a black glyph, and the whole quarter column lights up as a translucent wash fading toward the top — today's `.held` column wash, made visible.

**Phone fit.** Strip 56 px tall (`3.6rem`) plus `sab`, so y = 353–430 px (82–100 %); glyph 22 px, label `.78rem`. The strip is the only element; the column wash is `linear-gradient(to top, colour 0 → transparent 55 %)` over the quarter, i.e. it reaches the bike's wheel line at ~20 % alpha and is gone above it. The mockup's strip is darker than the brief (~70 %, not 40 %); build at 40 % and let `settled` take it to 30 %.

**How feedback reads mid-run.** Strongest peripheral signal of the five: the *quarter itself* changes colour, which is unmissable without looking down; two held quarters give the white-left / green-right hop picture across half the screen. The trade is that it is the least "button-like" (a strip segment, not a pad) and the column wash tints the track ahead in the third and fourth quarters while gas is held — which is most of the time — so the wash must stay faint (≤ 12 % at the bottom) or the canyon turns green.

**Zones / `.live`.** Zero mismatch: the strip segment *is* the quarter's bottom, and the column wash *is* the existing `.tz` column with its existing `.held` rule. No new elements beyond the glyph markup. This is the direction that is most honest about the hit area — what lights up is exactly what you can press.

**Cost.** Lowest. Glyph markup in `mk()` (~20 lines), `.tz` gets a `::after` strip with the label moved into it and the `.held` background becomes the gradient (~35 lines CSS). Two to three hours; the phone clip is the only real work. D is also the natural *add-on* to any other direction: A's pads + D's faint column wash is a one-rule addition.

### E — "Physical" (`E-physical.png`)

**What it is.** Skeuomorphic hardware: a brushed-metal lean rocker bottom-left (rubber seesaw, embossed bike, orange arrows and LEDs at each end — the pressed end tips down and its LED lights), and a metal plate bottom-right with a red-capped brake lever (third quarter, red LED) and a fat rubber throttle grip in the corner with an orange arc gauge that fills as it is held. Orange accents match the HUD amber; the plates are opaque.

**Phone fit.** Plates ~95 px tall (22 %) across the full width, y = 335–430 — the largest and the only opaque footprint. It covers the ground band completely and on a descent it covers the track ahead. The rocker spans both lean quarters so the 25 % seam is its pivot, which is a natural reading; the brake lever and throttle each occupy their quarter.

**How feedback reads mid-run.** Medium: an orange LED and a filling arc are small, and the pressed rocker is a geometry change rather than a colour change; against the orange canyon the orange accents also have the worst contrast of any direction's feedback colour. The idle look is the strongest "these are controls" statement of the five — a stranger cannot mistake a lever for scenery — and it is the only direction that looks *designed for this game* rather than for any game.

**Zones / `.live`.** The plates are decoration in the columns like the others, but the rocker is one element spanning two columns; it would be a single child per half with two pressed states driven from `paint()`. Opaque plates raise a `.live`-adjacent question: they *look* like the only place to press, and the quarters above them still work — that is fine for play but the on-boarding hint should say "hold anywhere in the quarter".

**Cost.** Highest, and the only one that is not CSS-only: the rocker, lever and grip need drawn art (vector or a 2× raster sheet) plus a pressed variant of each; the arc gauge is an SVG stroke; the metal plate can be CSS gradients. Two to three days with the art, plus a memory/paint check on the phone because it is the only direction adding textures to a layer that repaints every frame it is held. It also breaks the flat-slab HUD / pause-tile language the rest of the front end has just been unified on.

---

## 2. Recommendation

**A, "Corner pads" — with D's faint column wash added as a second held cue.** Reasons, in priority order:

1. **It is the brief, literally.** "Actual touch buttons / icons with feedback": a pad with a glyph is a button; a liquid fill, glow and press-scale is feedback; the four quarters are untouched. B and C are gauges, D is a strip, E is a dashboard — all defensible, none is as plainly *buttons*.
2. **The feedback reads without looking down.** A 150 × 82 block turning solid in a bottom corner is a peripheral event; add D's ≤ 12 % column wash under it and the quarter itself confirms it. B's 26 px rail is the only direction that fails this test outright.
3. **Corners under thumbs, seams respected, nothing over the bike.** The outer pads sit where the thumbs already rest; the inner pads are one roll inward; nothing crosses the 25 % / 75 % seams so nothing needs a cross-column element; the top of the pads is at the wheel line, not above it.
4. **Half a day, CSS + inline SVG only**, inside the existing `.tz` columns and `.held` toggle — no new hit rects, no `.live` change, no harness change. E is the only one that buys a noticeably stronger identity, and it costs two to three days plus a repaint check.
5. **It composes with the front end**: rounded slab + glyph + uppercase label is the pause tile and `.btn` language; brake red and gas green are the tokens already on the zone labels.

If the user wants the *least* UI rather than the most button, pick **D** — two hours, and the most honest picture of the hit areas. Pick **C** if the priority is the scene staying clean until touched and the game feel of the arcs, budgeting the idle-legibility fix (hairlines at .5, not .25). Pick **E** only if the whole run HUD is going skeuomorphic with it; alone it fights the slabs.

Whichever wins, the round that ships it needs a played clip on the phone harness (`harness/e2e/touch.mts`): cold boot → GO → lean back + gas held together (both cues lit, no dropped GAS on the second finger — the P0 multi-touch rule) → brake flash → restart via the corner button, with a stranger's first hold landing in the right quarter without a hint.

---

## 3. Notes for whoever builds it

- **Idle opacity ≥ .5.** The zones are not under the `.live` drawn-opacity rule today and must not be (they have to work during the three-second settle and before the first touch), but `LIVE_OPACITY` is .5 and every mockup idles below it (A/B 30 %, C 25 %, D 40 %). Build idle at .5 → `settled` .4 so the rule *could* be applied later without a redesign, and because 30 % frosted glass disappears over the sunlit dirt at the top of E1.
- **Held state is binary.** Every fill / arc / tilt goes idle → full over `--t1` (120 ms) on `.held` and back over `--t2`; there is no analog value in the touch frame. Do not animate a "ramp" longer than `--t1` or the cue lags the physics.
- **Brake flash.** A held brake fills red and stays red; the "flash" is a one-shot `box-shadow` pulse on the `.held` transition, not a loop.
- **Never above the wheel line.** Cap every control's top at 27 % of the height from the bottom on short screens (`html.short`), so a descent still shows the track ahead.
- **Pause / restart unchanged.** They keep `reveal()` / `conceal()` and the ≥ .5 rule; new controls must not extend into their 56 × 44 rects (top band), which none of the five do.
