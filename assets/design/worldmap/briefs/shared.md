You are generating ONE UI mockup image with the built-in image_gen tool. Generate exactly one image, 1536 wide by 1024 tall (landscape). Then copy the generated PNG to the exact output path given at the end of this prompt (mkdir -p the folder). Do not edit any other file. Report the saved path.

No reference image is attached on purpose. Design this screen FROM SCRATCH from the words below.

## What this screen is
The WORLD MAP of "Trials Gauntlet", a Trials-style 2.5D motorbike game (one rider, one bike, physics tracks). It is the level select. It must look like the world map of a big-budget console RPG: ONE single, continuous, beautiful landscape — a whole continent with coastlines, mountains, rivers, forests, roads, cities — that the player pans in two axes and zooms with a pinch, with the game's tracks as places ON that landscape. The land is the hero of the screen; the UI is a thin layer over it.

What it must NOT be (the current screen was rejected for exactly this): NOT a set of separate floating isometric tiles or squares, NOT dioramas, NOT islands connected by a line, NOT chunky raised slabs with cut sides, NOT pins on posts, NOT a list of regions in a side column, NOT a page-per-region carousel. No floating pieces of terrain anywhere: every region is part of the same ground, and the ground runs edge to edge under everything.

## The world (identical geography in every mockup)
One continent, one route. The five regions lie in CAMPAIGN ORDER along a continuous route from the south-west coast to the far north-east, and each region blends into the next through real geography (a river, a pass, a ridge, a coast road):
1. INDUSTRIAL — the south-west: a port and steelworks on the coast. Rust orange and steel grey, gantry cranes, container yards, chimneys, rail sidings, sodium-orange lamp glow. Roads and rail lines.
2. CANYON — north of Industrial across a river: red-orange sandstone mesas and slot canyons at the last of sunset, dry riverbeds, a single desert highway.
3. SNOW — the high country beyond the canyon: an ice-blue alpine range, pines, glacier, a frozen lake, a chairlift line, a lit cabin.
4. NIGHT CITY — east of the mountains, on a bay: a dense neon metropolis at night, deep blue-purple towers, cyan and magenta signage, wet streets, elevated highways, rooftops.
5. FOUNDRY — the far north-east: a black-iron and molten-orange industrial hellscape, blast furnaces, slag rivers glowing orange, sparks, lit from below.
Also: the LAB proving ground — a test hall / hangar complex with a flat concrete apron, on the coast right at the start of the Industrial region (the route begins here). And five PLAYGROUNDS, one small practice ground per region, each drawn as a small fenced practice compound near that region's edge.

## Places on the map (code · name · region · state)
Tracks are places; each has a small map icon and a label. Spell every label EXACTLY as written.
- LAB · Physics Test · Industrial coast · always open, no medal.
- P1 Container Yard (Industrial) · P2 Canyon Run (Canyon) · P3 Snow Line (Snow) · P4 Night Circuit (Night City) · P5 Foundry Floor (Foundry) · playgrounds, always open, no medal.
- BEGINNER (Industrial, all cleared): B1 First Ride — GOLD medal — best 0:41.200 / target 1:05.000 — ▶ GHOST. B2 Lean Back — SILVER — 0:47.900 / 1:05.000. B3 Kicker Row — BRONZE — 0:58.100 / 1:05.000.
- EASY (Canyon, all cleared): E1 Uphill Weight — SILVER — 0:52.400 / 1:10.000. E2 Rear Wheel First — BRONZE — 1:06.800 / 1:10.000. E3 Stairway — SILVER — 1:01.300 / 1:10.000 — with a small "PRO" chip (ridden on the Pro bike).
- MEDIUM (open, none cleared): M1 Hop Up (Industrial, at the region's north edge where the road leaves for the Canyon) — THIS IS "UP NEXT", the next track to ride: mark it with an amber "UP NEXT" tag. M2 Drum Roll (Snow). M3 See-Saw (Foundry).
- HARD (LOCKED, rule "MEDAL EVERY MEDIUM TRACK"): H1 Rooftop Wire (Night City) — the NEXT UNLOCK, drawn a little brighter than the other locked places, labelled "NEXT UNLOCK · MEDAL EVERY MEDIUM TRACK". H2 Container Yard (Night City). H3 The Pour (Foundry).
- EXTREME (LOCKED, rule "MEDAL EVERY HARD TRACK"): X1 The Ascent (Snow summit). X2 The Rolling Mill (Foundry). X3 The Stack (Foundry).
- Per region: INDUSTRIAL holds B1 B2 B3 M1 (3 / 4 cleared) · CANYON holds E1 E2 E3 (3 / 3) · SNOW holds M2 X1 (0 / 2) · NIGHT CITY holds H1 H2 (0 / 2, both locked) · FOUNDRY holds M3 H3 X2 X3 (0 / 4).
- Progress state: 6 / 15 cleared. Cleared places show their medal colour (gold #e2b23c, silver #b9c0c9, bronze #b7713d). Open-but-uncleared places (M1 M2 M3) are lit but medal-less. LOCKED places are dimmed with a small padlock, and the LOCKED REGIONS (Night City, Foundry, and the Snow summit around X1) are visibly GATED in the style the direction brief describes (fog of war / hatch / barrier), so it is obvious at a glance where the player may not go yet.
- The ROUTE: one continuous route line joins the places in tier order B1 → B2 → B3 → E1 → E2 → E3 → M1 → M2 → M3 → H1 → H2 → H3 → X1 → X2 → X3 (it doubles back once from E3 to M1 — draw that as a short return leg). It is lit amber and solid on the cleared stretch (B1 … E3), amber-dashed to M1, and faint / grey / under the gating beyond.
- FOCUS: B1 is the focused place in every mockup: an amber focus ring or beacon on it, and its NAME PLATE beside it — a small dark plate with an amber edge reading "B1 · BEGINNER · INDUSTRIAL" small, then "First Ride" large, then "0:41.200 / 1:05.000" in tabular numerals (the best time in green #5ad36a because it beats the target) and a "▶ GHOST" tag. The plate is joined to the place by a thin leader line and never covers the route.
- The player's CURRENT POSITION marker stands at B1 as well: a small blue-and-white trials motorbike icon (or a rider silhouette) on the road — not a photo, a clean map marker.

## Chrome — "Broadcast", kept THIN (the map must own the screen)
- Top-left: a small angled dark badge plate "TRIALS GAUNTLET" with, under it, a tiny grey build stamp "build fb947d4 · 2026-09-17". Next to it, small: "WORLD MAP".
- Top-right: one round-cornered dark pill "‹ MENU" (44 px tall in screen space).
- Bottom-left: "6 / 15 CLEARED" with four small medal dots: ● 0 PLATINUM · ● 1 GOLD · ● 3 SILVER · ● 2 BRONZE — one dark translucent chip, not a bar across the screen.
- Bottom-right: one large amber (#f2a93b) pill "RIDE  FIRST RIDE ▸" — the launch button for the focused place — and beside it one small dark pill "▶ GHOST".
- Nothing else: no ticker, no LIVE chip, no side column, no region list, no page dots, no arrows, no bottom band across the whole width. The chrome is translucent dark charcoal (#0c0e12 at ~80 %) with one thin amber edge; near-white condensed italic display face for headlines, small-caps tracked-out labels, tabular numerals.
- Sponsor text may appear in the ART only, sparingly (a billboard on the Industrial docks, a banner on a Night City tower), and only from this fictional set: IRONWORKS, VORTEX OIL, KESTREL TYRES, APEX SUSPENSION, NORDVIK, BOLT ENERGY. No real brands, no real game logos or characters.

## Framing (same for every mockup)
- Draw a landscape PHONE SCREEN, aspect 19.5:9 (like 932x430): the screen is EXACTLY 1536 x 708 image px, centred vertically, with 158 px of plain black letterbox above and 158 px below. The UI fills 1536 x 708 edge to edge. No phone bezel, no hands, no reflections, no shadow, no device.
- Leave a 34 px (screen-space) safe area on the left and right edges: no text or tappable element inside it.
- Every tappable element is at least 44 x 44 px in screen space (44 screen px = ~73 image px): place icons, the MENU pill, the RIDE pill, the GHOST pill. One-thumb reach: the thumbs rest in the bottom corners — RIDE bottom-right, CLEARED bottom-left.
- The map pans in TWO axes (drag) and zooms (pinch). No scroll bars, no page indicators.
- Crisp, legible, film-grain-free UI text, spelled exactly as given. The map art itself may be as painterly as the direction says.
