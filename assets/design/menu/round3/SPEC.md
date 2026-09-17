# Main menu, round 3 — B "Lobby" three ways: big buttons, no leaks, a Nalati jump (mockups, no decision)

Round subject: the user, on round 2 (`assets/design/menu/round2/SPEC.md`): *"For main menu i need more variants of B lobby, the buttons of the main menu need to be larger, we shouldnt leak anything about level, session, next up, how much cleared etc. Its just the main menu, the title menu. But garage/play/settings/Review those should be larger. We also dont need such a massive hero card / image, it can be something cool like a midair jump instead, in the nalati grassland biome we havnt built yet. 3 new variants please."* (ask #36). Standing direction as rounds 1–2: Broadcast language, landscape phone first (932×430 and 844×390, safe areas), every tappable ≥ 44 px — this round ≥ 72 px for the four actions — thumbs in the bottom corners, fictional sponsors only. **No game code changed and nothing is decided here — the user picks.**

- Contact sheet (round-2 B first, then B1–B3, labelled): `assets/design/menu/round3/contact-sheet.jpg`
- Variants, full-res PNG as generated (1536×1024 with black letterbox): `B1-plate.png`, `B2-strip.png`, `B3-glass.png`; letterbox cropped: `*.jpg`. No retries were needed: all three drew the letterbox.
- Briefs, so the parent can rerun: `briefs/shared.md` (the three reference images described, the user's words, six hard rules: the four actions are the screen / leak nothing / the picture is a jump in Nalati / Broadcast / frame / spelling), `briefs/{B1,B2,B3}.md`, `briefs/gen.sh <variant> [logdir]`, `briefs/sheet.py`. Recipe: `cat briefs/shared.md briefs/<X>.md | codex exec -s workspace-write -i round2/B-lobby.png -i round2/current-932x430.png -i round2/ref-garage-932x430.png -o <log> -` from the repo root — round 2's chosen B for the architecture, the current menu for the badge plate / stamp / font, the live garage for the hero's likeness. Three runs in parallel: B1 111 s, B2 114 s, B3 119 s (2.07 min wall clock, 23:05:01 → 23:07:05). Codex 0.154.0.
- Every variant shows the same thing and nothing more: the badge plate + `build 4d2e762 · 2026-09-17`, the five words PLAY / GARAGE / REVIEW / SETTINGS / CREDITS, the jump, one sponsor object in the scene. No state of any kind is on any of them.

---

## 0. What changed vs round-2 B

Round-2 B (`round2/B-lobby.jpg`) was a *lobby*: the hero parked at a red-light start gate on the left, and on the right a run sheet — SESSION · ROOKIE BIKE, UP NEXT Hop Up with tier / biome / target, LAST RUN Stairway with medal, PRO chip and "8.7 s under target", 6 / 15 CLEARED with four medal totals — PLAY at its foot, four 44 px pills under the scene, the best-times ticker along the bottom. The user kept the **split** (picture + charcoal panel) and rejected everything the panel *said*: this is the title menu, not a status board. Three changes, applied to all three variants:

1. **The four actions are the screen.** In round-2 B the three secondaries were 44 px pills and PLAY ~70 px. Now (measured on the drawings, scaled to 932×430): B1 SETTINGS / REVIEW / GARAGE ≈ 75 px tall, PLAY ≈ 106 px; B2 all four tiles ≈ 89 px, PLAY the same height and 1.6× the width; B3 pills ≈ 72 px, PLAY ≈ 92 px. Every one is ≥ 72 px with the word in the display face at the size round-2 B used for its `HOP UP` headline. CREDITS stays a small grey tracked-caps word in a corner of the panel.
2. **Nothing leaks.** No chip, no ticker, no card, no numbers except the build stamp. The only text: the wordmark, the stamp, five words, one sponsor in the scene (B1 KESTREL TYRES flag, B2 NORDVIK fence banner, B3 VORTEX OIL course marker).
3. **The hero card is a jump.** The parked bike and the run-sheet card go; the picture is the rider mid-flight in **Nalati grassland** — an alpine steppe we have not built: green meadow, wildflowers, a dirt line, spruce at the treeline, snow-capped Tian Shan, yurts, big sky. Each variant shows it a different way (below), and each variant lights it differently: B1 golden hour, B2 midday cumulus, B3 dusk alpenglow.

| Var | Name | The split | The jump | PLAY | GARAGE · REVIEW · SETTINGS | CREDITS | Drawn aspect |
|---|---|---|---|---|---|---|---|
| **B1** | Plate | round-2 B's **hard vertical split**: plate left ~57 %, charcoal panel right ~43 % edge to edge | full-bleed **plate**, side-on, golden hour, KESTREL TYRES flag at the lip, yurts far right | bottom of the panel, amber, ≈ 106 px | **stacked** above PLAY in the panel, icon left / word right, ≈ 75 px each | panel's top-right corner | **2.15** (the phone) |
| **B2** | Strip | the split **turned sideways**: a wide cinematic strip top ~58 %, a charcoal band bottom ~42 % | **strip**, low three-quarter tracking shot, midday, rider huge, NORDVIK banner motion-blurred, yurts on the ridge; the wordmark LARGE over the sky at the left | right end of the band, amber, 1.6× a tile, ≈ 89 px | three equal **tiles** in a row, icon above word, ≈ 89 px | under GARAGE, bottom-left of the band | 1.93 |
| **B3** | Glass | the picture is the **whole screen**; the panel is a **translucent slab** floating right ~40 %, inset from the top and bottom edges | **full-bleed**, high from behind-left, dusk, the arc away over the valley, VORTEX OIL marker, yurts with smoke | bottom of the slab, amber, ≈ 92 px | **stacked** pills above PLAY on the slab, ≈ 72 px each | slab's top-right corner | 2.05 |

---

## 1. The three variants

### B1 — "Plate" (`B1-plate.jpg`)

**What it is.** Round-2 B with the panel emptied and the buttons grown. Left: the jump as a plate, edge to edge — the rider side-on at the top of the arc, feet off the pegs, dirt from the rear wheel, a KESTREL TYRES flag at the kicker's lip, wildflowers in the foreground, spruce, the peaks catching the last light, two yurts in the valley, a warm sky; the badge plate + stamp top-left over it. Right: one charcoal panel from top to bottom with the amber edge, holding only SETTINGS / REVIEW / GARAGE stacked (icon left, word right, ≈ 75 px each) over a taller amber PLAY ▸ (≈ 106 px) at the foot, and a small grey CREDITS alone in the top-right corner.

**What it does with the brief.** The closest to what the user already chose: the same silhouette as round-2 B, so the phone screen they saw is the phone screen they get, with the three rules applied and nothing else moved. GARAGE lowest of the three so it is the one nearest the thumb after PLAY.

**Mockup vs brief.** Element for element, and the only one of the three drawn at the phone's aspect (2.15 vs 2.17) — read it as-is. The panel's top fifth is empty charcoal as asked; the drawing's rider is the garage's (blue-white tank, charcoal hoodie, open-face helmet).

**844×390.** Four rows of 75 / 75 / 75 / 106 with 8 px gaps is 349 px — inside 390 only because the panel runs to both edges; the empty top fifth is the slack, and CREDITS moves into that space. Fine.

**What it costs against `front.ts`.** Lowest. `MainMenuScreen` keeps its `FocusList` of five; the list becomes a vertical column (`flex-direction: column`, `nav()` already collapses both axes to one step) inside a `.menu-panel` absolutely positioned right 43 %; `credits` `minor` is rendered as the corner word. Delete the ticker, the chip and `setBike()`'s chip update, `setTracks()` and `bestOf` (only the ticker used them — the constructor's `bestOf` and `state` parameters go). The plate is `.menu-keyart` as today with a new art entry (`art.keyart('nalati')` — the biome does not exist in `BIOME_TINT` or the art manifest yet, so it is a key-art plate, not a biome, until Nalati is built) sized to the left 57 %. Half a day.

### B2 — "Strip" (`B2-strip.jpg`)

**What it is.** The split turned sideways. Top ~58 %: a wide cinematic strip of the jump — low three-quarter tracking shot, the rider huge and flying left-to-right, dirt spray, a motion-blurred NORDVIK fence banner, yurts on a ridge, cumulus over the peaks — with the wordmark LARGE in two lines of the near-white display face over the sky at the left, the badge plate + stamp under it. Bottom ~42 %: a charcoal band with the amber edge holding one row of four big tiles — GARAGE / REVIEW / SETTINGS (icon above word, ≈ 89 px) and PLAY ▸ at the right, amber, 1.6× wider — and a small grey CREDITS under GARAGE.

**What it does with the brief.** "Larger buttons" in its purest form: the band is the buttons and nothing else, one per thumb-arc position (GARAGE under the left thumb, PLAY under the right). The title is a title — the only variant where TRIALS GAUNTLET is the size the screen deserves — and the strip is the most *poster* of the three jumps.

**Mockup vs brief.** On brief. Drawn at 1.93, so read the strip ~11 % shorter; the tiles are at the drawn height, which is already the phone's. The rider's helmet is an open-face with a peak — right likeness. The strip's aspect drawn is ~2.4:1, not the asked 2.8:1 (the rider needed the height).

**844×390.** The band (≈ 89 px tiles + 20 px margins ≈ 130 px) leaves ~260 px for the strip, which at 844 wide is 3.2:1 — a real cinematic crop, and the big wordmark then wants one line or a smaller size to clear the rider. The tiles' icon-above-word stack is the tight part: at 89 px the word is ~36 px and the icon ~28 px; drop the icons at 844 or go icon-left as B1.

**What it costs against `front.ts`.** Low. Today's band *is* a row of tabs: this is `.menu-band` grown from 92 px to ~130 px with `.menu-item` restyled as tiles (`flex: 1`, `play` `flex: 1.6`), the same `FocusList`, the same `nav()`. The big wordmark is a second `.wordmark` in the display face over the strip (the `menu-plate` badge stays). Delete ticker / chip / `bestOf` / `setTracks` as in B1. The strip is `.menu-keyart` with a new plate, cropped by the band. Half a day; the least code of the three.

### B3 — "Glass" (`B3-glass.jpg`)

**What it is.** The jump fills the screen — high camera from behind-left, the rider's arc going away over the whole Nalati valley at dusk, alpenglow on the peaks, a comet of dirt, a VORTEX OIL marker post, yurts with a thread of smoke, the dirt line snaking below. The panel is a charcoal glass slab on the right ~40 %, inset from the top and bottom so the landscape shows around it, the scene softly visible through it, the amber edge on top; SETTINGS / REVIEW / GARAGE stacked as pills (≈ 72 px) over a taller amber PLAY ▸ (≈ 92 px), CREDITS small in the slab's top-right corner. The badge plate + stamp top-left over the sky.

**What it does with the brief.** The split as a *layer* rather than a cut: the picture is uninterrupted and the controls sit on it. It is the most atmospheric of the three (the dusk sky and the amber PLAY are one hue, as BE3 and the garage UI are) and the only one where the landscape reads as a place rather than a crop.

**Mockup vs brief.** On brief except that the rider does not cross behind the slab — the arc ends left of it, so the "glass in front of the world" cue is only the blur. The drawn pills at ≈ 72 px are the minimum the user asked for; they should be B1's 75+ in the build. Drawn at 2.05.

**844×390.** The slab is inset 40 px top and bottom by design; at 390 that plus four rows (72 / 72 / 72 / 92 + gaps) is ~350 px — it fits only if the insets shrink to ~16 px. The blur behind the slab costs `backdrop-filter` on a phone (below).

**What it costs against `front.ts`.** Low for the DOM (B1's column in a `.menu-glass` with `backdrop-filter: blur(12px)` and 80 % charcoal), but `backdrop-filter` over a full-screen canvas is a per-frame blur on iOS Safari — on a `low` tier phone that is the one thing in the three variants that can cost frame time on the menu. The honest fallback is B1's opaque panel with the same insets (the blur is a detail; the inset slab is the design). Half a day, plus a check on the phone with `?bench=1`.

---

## 2. Cost shared by all three: the Nalati plate

None of the three needs the biome to exist — each shows the jump as a **still plate** in `.menu-keyart`'s slot, the way today's menu shows the industrial key art. That is one new art-manifest entry (`keyart-nalati-1920.webp`, from the chosen mockup's plate re-generated at 1920 without the UI, or a paint-over) and, for B1/B3, a `background-position` that keeps the rider in the visible part. The live canvas is not seen on any of the three (the panel covers what the plate does not), so the boot stays as cheap as today's. When Nalati is built as a biome the plate can become the live scene; nothing in the layouts assumes it.

---

## 3. Recommendation

**B1, "Plate", with B2's band as the alternative if the user wants the title big.** Reasons:

1. **It is the round-2 pick with the three corrections and nothing else changed.** The user chose the split; B1 keeps its exact silhouette, empties the panel of every leak and grows the buttons — the smallest step from the thing they already said yes to.
2. **Drawn at the phone's aspect**, the only one of the three, so its 844×390 story is the simplest: four rows in a full-height panel.
3. **Cheapest and safest**: a column `FocusList` in a panel, no blur, no second wordmark; half a day, and the plate is the only asset.

Pick **B2** if the priority is the title and the buttons as a single big band under both thumbs — it is the least code of all (today's band grown) and the best poster; its risk is the 844 crop of the strip. Pick **B3** for atmosphere and the uninterrupted landscape, and budget the `backdrop-filter` check or accept the opaque fallback.

Whichever wins, the round that ships it needs the played clip on the phone harness (cold boot → the title menu → PLAY under the thumb → the diorama), the menu-stills e2e (`harness/e2e/menu-stills.mts`) re-pointed at the new layout at 932×430, 844×390 and 1280×720 with a check that no `.menu-*` element carries a time, a track name or a count, and the four action buttons measured ≥ 72 px at both phone geometries.
