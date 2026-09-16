You are generating ONE UI mockup image with the built-in image_gen tool. Generate exactly one image, 1536 wide by 1024 tall (landscape). Then copy the generated PNG to the exact output path given at the end of this prompt (mkdir -p the folder). Do not edit any other file. Report the saved path.

TWO images are attached. The FIRST is the CURRENT track-select screen of "Trials Gauntlet", a Trials-style 2.5D motorbike game, captured headless on a landscape iPhone (932x430 CSS px): a REFERENCE for the art style, the colours, the font and the data on the cards — do not copy its layout. The SECOND is the ISOMETRIC DIORAMA mockup the user chose last round: five chunky raised terrain tiles of the five biomes on a dark water table, joined by small bridges, with 44 px round pins on posts (code + medal disc, name plate, PB and target under it), hazard-tape fences with the lock rule on them, and a separate proving-ground island holding a NORDVIK test hangar and five coloured practice pads. HOLD THAT DIORAMA LANGUAGE — the same tile construction, pin construction, fences, island and Broadcast chrome — and change only what the direction brief at the end says to change.

## Round 3 (what this round is)
Five variants of the isometric diorama. The user liked it; its one weakness was that Foundry's X2 and X3 fell off the right edge and the whole thing is tall for a 430 px (or 390 px) screen. Each variant is a different ARCHITECTURE for the same diorama, described at the end. Three rules carried over from last round that must hold:
1. FRAME: the phone screen is EXACTLY 1536 x 708 image px (19.5:9), centred, with 158 px of plain black letterbox above and 158 px below. The UI must fill 1536 x 708 edge to edge. The attached diorama got this right — match it.
2. IN FRAME: the LAB and the PLAYGROUNDS must be visible inside the frame (the island), AND at least one LOCKED track with its requirement text must be visible inside the frame (H1 Rooftop Wire with "NEXT UNLOCK · MEDAL EVERY MEDIUM TRACK"). Compose so that B1 (focused), M1 (UP NEXT) and H1 (locked) are all on screen at once, and — where the direction says so — all fifteen medal tracks including X2 The Rolling Mill and X3 The Stack.
3. TEXT: spell every name, code, time and the build stamp exactly as given; no garbled ticker entries. (Last round wrote "CONTAINER YARE" and "HARM TRACK" — don't.)

## Framing (same for every mockup)
- Draw a landscape PHONE SCREEN, aspect 19.5:9 (like 932x430), filling the full 1536 width; the leftover height above and below is plain black letterbox. No phone bezel, no hands, no reflections, no shadow. The UI must fill the screen edge to edge as a real app would.
- Leave a 34 px (screen-space) safe area on the left and right edges (notch side / home side): no text or tappable element inside it.
- Every tappable element is at least 44 x 44 px in screen space (a 932x430 screen = 1536x708 in the image, so 44 px = ~73 image px). One-thumb reach: primary controls live in the bottom third or the corners.

## Visual language: "Broadcast" (the game's chosen menu style)
- A TV sports package. Dark charcoal slabs (#0c0e12 to #171a20) with ONE thin amber top edge (#f2a93b) on the main band; near-white condensed italic display face for headlines (like the reference "SELECT TRACK"), small caps tracked-out labels for secondary text, tabular numerals for times.
- Top-left: a small angled dark badge plate reading TRIALS GAUNTLET with, under it, a tiny grey build stamp "build 63e6b25 · 2026-09-15". Top-right: a small "● LIVE · ROOKIE BIKE" chip and, at the far right, a round-cornered dark pill "‹ MENU" (44 px tall). These must NOT overlap any medal totals or headings.
- Very bottom edge: a thin best-times ticker strip, small text scrolling like a stock ticker: "B1 FIRST RIDE 0:41.200 ▸ E3 STAIRWAY 1:01.300 PRO ▸ B2 LEAN BACK 0:47.900 ▸ ...".
- Amber (#f2a93b) is THE accent: focus rings, the "next" highlight, active tab underline. Green (#5ad36a) only for a best time under target. Medals: gold #e2b23c, silver #b9c0c9, bronze #b7713d, platinum a pale cyan-white. Locked = 60 % grey, desaturated, padlock glyph.
- Biome colour bands / key art (use these consistently): INDUSTRIAL = rust orange and steel grey warehouse, shipping containers, sodium lamps; CANYON = red-orange sandstone at sunset; SNOW = pale blue-white alpine, pines, frozen lifts; NIGHT CITY = deep blue-purple rooftops with cyan and magenta neon; FOUNDRY = molten orange, sparks, black iron.
- Any sponsor/banner text in art must be from this fictional set only: IRONWORKS, VORTEX OIL, KESTREL TYRES, APEX SUSPENSION, NORDVIK, BOLT ENERGY. No real brands.
- Film-grain-free, crisp UI. Text must be legible and spelled exactly as given.

## Data state (identical in every mockup) — 6 of 15 cleared, "6 / 15 CLEARED" shown once with medal totals ● 0 platinum · ● 1 gold · ● 3 silver · ● 2 bronze
Tiers in order, with the tracks (code, name, biome, medal, PB, target):
- LAB (always open, no medals, "physics proving ground"): LAB · Physics Test · industrial.
- PLAYGROUNDS (always open, no medals, one beginner course per biome): P1 Container Yard (industrial) · P2 Canyon Run (canyon) · P3 Snow Line (snow) · P4 Night Circuit (night city) · P5 Foundry Floor (foundry).
- BEGINNER (3/3 cleared, industrial): B1 First Ride — GOLD — PB 0:41.200 / target 1:05.000 — has "▶ GHOST" tag and a green review chip "2 / 6 NOTED"; B2 Lean Back — SILVER — 0:47.900 / 1:05.000 — ▶ GHOST; B3 Kicker Row — BRONZE — 0:58.100 / 1:05.000 — ▶ GHOST.
- EASY (3/3 cleared, canyon): E1 Uphill Weight — SILVER — 0:52.400 / 1:10.000; E2 Rear Wheel First — BRONZE — 1:06.800 / 1:10.000; E3 Stairway — SILVER — 1:01.300 / 1:10.000 — with a small blue "PRO" bike chip.
- MEDIUM (open, 0/3, the tier to ride next): M1 Hop Up (industrial) — no medal — PB "—" / target 1:10.000 — this is the NEXT TRACK TO RIDE, mark it "UP NEXT" in amber; M2 Drum Roll (snow) — target 1:10.000; M3 See-Saw (foundry) — target 1:10.000.
- HARD (LOCKED — "Medal every Medium track"): H1 Rooftop Wire (night city) — the NEXT UNLOCK, lit slightly brighter than the other locked tracks with the label "NEXT UNLOCK · MEDAL EVERY MEDIUM TRACK"; H2 Container Yard (night city); H3 The Pour (foundry). Targets 1:25.000.
- EXTREME (LOCKED — "Medal every Hard track"): X1 The Ascent (snow); X2 The Rolling Mill (foundry); X3 The Stack (foundry). Targets 1:30–1:35.
- So by biome: INDUSTRIAL holds B1 B2 B3 M1 (3 / 4 cleared); CANYON holds E1 E2 E3 (3 / 3); SNOW holds M2 X1 (0 / 2); NIGHT CITY holds H1 H2 (0 / 2, both locked); FOUNDRY holds M3 H3 X2 X3 (0 / 4).
- Focus: B1 is the currently focused/selected track in every mockup (amber ring) so the mockups compare like for like. A tap on a pin focuses it; the big amber RIDE pill (or a second tap on the focused pin) launches.

## Hard rules
- Exactly ONE scroll axis in the whole screen (say which by the layout, never draw two scrollbars).
- Lab, Playgrounds and the five medal tiers must be visually DIFFERENT kinds of thing, not the same row repeated.
- Locked tracks state their requirement on themselves.
- Show the biome of a track and, where the direction asks for it, the SHAPE of the track (an elevation-profile silhouette: a thin white line with bumps, gaps and a climb, checkpoints as small dots).
- Header: "SELECT TRACK" small in the display face next to the badge plate; MENU pill top right.
- Bottom band (lower third, dark slab with amber top edge): left "6 / 15 CLEARED" with the four medal-total dots (● 0 PLATINUM · ● 1 GOLD · ● 3 SILVER · ● 2 BRONZE); centre-right a large amber pill "RIDE  FIRST RIDE ▸"; two smaller dark pills "▶ GHOST" and "REVIEW"; the ticker at the very bottom edge.
- No real phone UI chrome (no iOS status bar, no home indicator).

