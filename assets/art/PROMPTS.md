# Trials art pack — prompts and selection

Generated 2026-09-14 with OpenAI image generation through the Codex CLI
(`assets/art/generate.mjs`, one image per call, concurrency 8, ~60–130 s each). Every prompt below is
the exact text sent (the runner prepends "Use your image generation tool to generate one WxH image:" and
appends the save instruction). Optimisation and keying are in `assets/art/build.mjs`; which candidate
each shipped asset uses is in `assets/art/selection.json`. Raw PNGs of every accepted candidate are in
`assets/art/raw/`; rejects are kept as 512 px JPEG proofs in `assets/art/raw/rejected/`.

Art direction: the proven key-art test (moody sodium-lit warehouse, dust, container stacks, rider mid-air).
Shared prefixes: CINE (cinematic photoreal, grounded, no text/logos/cartoon), BIKE (trials bike: no seat,
rider standing on the pegs), one BIOME_LOOK paragraph per biome, and flat-graphic prefixes for stencils,
masks, signs, graffiti, banners, crowd sheets and panoramas — see `prompts.mjs`.

## Round 1: 78 images, all generated first try. Rejected after review: 7.
## Round 2: 6 regenerations (stencil-apex-v2, stencil-taro-v2, tyremark-straight-v2, mask-rivet-drips-v2, mask-rust-streaks-v2, tyremark-straight-v3).

## Round 3 (art round 2, 2026-09-14): 15 images + 3 icon candidates (3b), all first try. Rejected: 4 (all icon candidates but `icon-b-wheelie`).

Garage (two bike hero renders + 3/4 alternates, an empty bay plate, two rider-kit swatches), the PWA
icon set, two more results plates (garage, credits) and ribboned medal masters (512 + 256). Same
runner and prefixes; the new `GARAGE`, `KIT` and `ICON` prefixes are in `prompts.mjs`.

Not generated (real renders / composed):
- `art/thumbs/<track>.webp` - 15 track thumbnails captured from the game by `npx tsx assets/art/thumbs.mts`
  (best skill-3 recording under `harness/inputs/<track>/`, first tick past the set-piece x in `THUMB_X`,
  `setQuality('high')`, 1280x720 -> 768x432 WebP <= 60 KB; 1280x720 PNG proofs in `assets/art/raw/thumbs/`).
- `art/og.jpg` - 1200x630 Open Graph card by `npx tsx assets/art/og.mts`: mirrored industrial key art +
  the game's own `.wordmark` CSS and Barlow Condensed woff2 rendered in headless Chromium.

Weight pass (`build.mjs` `webpCapped`): graffiti <= 40 KB (512 -> 384 -> 320 px, alpha), posters and
signs <= 40 KB (posters 384x576), banners <= 60 KB, kits <= 60 KB, masks 768 px q70.

| candidate | why rejected |
|---|---|
| `app-icon` | Helmet-over-wheel emblem: the wheel spokes turn to mush at 60 px and the helmet reads as a blob. Spare. |
| `app-icon-v2` | Helmet-in-tyre badge: the boldest mass at 60 px, but it could be any moto / gear app. Kept as a spare emblem. |
| `icon-a-helmet-wheel` | Round 3b (a): helmet over front wheel with a radial glow: one orange blob at 60 px, the glow muddies the edge on a dark wallpaper. |
| `icon-c-monogram` | Round 3b (c): "TG" on a tread band: legible at 60 px but says nothing about the game; the tread band vanishes. |

**Home-screen icon pick (round 3b): `icon-b-wheelie`** - the rider-mid-wheelie silhouette in amber on the dark gradient.
Judged side by side at 256 px and 60 px behind an iOS-style rounded mask on a dark ground
(scratch `sheet-icons.png`): the wheelie is the only candidate that says *trials bike* instantly at 60 px
while keeping a clean edge. Export (`build.mjs`, amber-keyed silhouette re-composited on the icon's own
sampled top/bottom gradient, opaque, square corners): `art/icons/icon-{1024,512,192}.png`,
`icon-maskable-{512,192}.png` (art at 80 %, +10 % safe padding each side), `apple-touch-icon.png` (180),
`favicon-{32,16}.png`, `favicon.svg` (128 px raster in a rounded clip), `emblem-512.png` (alpha silhouette for UI).

## Rejected candidates and why

| candidate | why |
|---|---|
| `keyart-nightcity` | Strong image but the busiest of the three (no negative space for menu UI) and the bike reads as a seated motocross bike rather than a trials bike. Kept in assets/art/raw as a spare. |
| `stencil-apex` | Lettering collapsed into a solid white triangle blob; no readable words. |
| `stencil-taro` | Rounded-rectangle frame smeared over the letters; TARO barely legible, FREIGHT lost. |
| `tyremark-straight` | Track rendered as a 40 px zipper down the middle; unusable as a decal. |
| `tyremark-straight-v2` | Still a thin zipper and the background came out mid-grey instead of black. |
| `mask-rivet-drips` | Rivets and drips too small (about 12 px at 1024) to read on a container side. |
| `mask-rust-streaks` | Solid pure-white full-height stalactites with no tonal variation; would tint as hard stripes. |

Everything else was accepted on the first generation; the sheets reviewed were 2–7 images at a time at
about 640 px wide, with the medals, crowd sheets and every keyed/tiled output re-checked at delivery size.

## All prompts

### keyart-industrial (1536x1024, keyart, industrial)
shipped as `art/menu/keyart-industrial-960.webp`

> Cinematic photoreal video-game key art, grounded and moody, physically plausible lighting with volumetric dust and haze, sharp detail, natural film grade. No text, no lettering, no logos, no watermark, no cartoon or illustration style, no UI. Low angle inside a vast old industrial warehouse: stacked rusted shipping containers, plywood kickers, pallets and oil drums, gantry crane rails and hook blocks overhead, riveted steel trusses, amber sodium high-bay lamps, shafts of dusty late light through a big bank of high windows, wet stained concrete floor. Hero shot: a trials motorcycle (small light frame, no seat, long-travel forks, knobbly tyres) with a rider in dark armoured gear and full-face helmet standing on the footpegs, mid-air over a gap between two stacked containers, bike pitched slightly nose-up, rear wheel trailing a plume of dust, rider silhouetted against a blown-out window bank, a hook block hanging in the haze above. Bike occupies about a third of the frame, left of centre, lots of room on the right.

### keyart-canyon (1536x1024, keyart, canyon)
shipped as `art/menu/keyart-canyon-960.webp`

> Cinematic photoreal video-game key art, grounded and moody, physically plausible lighting with volumetric dust and haze, sharp detail, natural film grade. No text, no lettering, no logos, no watermark, no cartoon or illustration style, no UI. a red sandstone canyon at sunset: layered mesa silhouettes in peach haze, low blown-out sun, long shadows, hay bales, stacked tyres and weathered timber obstacles on dry dirt, dust hanging in the light. Hero shot: a trials motorcycle (small light frame, no seat, long-travel forks, knobbly tyres) with a rider in dark armoured gear and full-face helmet standing on the footpegs, dropping off a tall sandstone ledge straight toward camera-left, silhouetted against the setting sun with a bright rim light, dust pouring off the ledge, three receding mesa planes fading pinker into the haze, a small checkered finish banner far below. Wide cinematic composition, rider in the upper right third.

### keyart-nightcity (1536x1024, keyart, nightCity)
**rejected** — Strong image but the busiest of the three (no negative space for menu UI) and the bike reads as a seated motocross bike rather than a trials bike. Kept in assets/art/raw as a spare.

> Cinematic photoreal video-game key art, grounded and moody, physically plausible lighting with volumetric dust and haze, sharp detail, natural film grade. No text, no lettering, no logos, no watermark, no cartoon or illustration style, no UI. a rain-wet city street at night: neon glow in magenta, cyan and yellow reflected in wet asphalt, street lights with soft cones, fire barrels, steam from grates, dark towers with scattered lit windows behind, grey-green night grade. Hero shot: a trials motorcycle (small light frame, no seat, long-travel forks, knobbly tyres) with a rider in dark armoured gear and full-face helmet standing on the footpegs, holding a high wheelie along a wet street, front wheel raised, magenta and cyan neon shapes (abstract glowing tubes, no readable words) reflected in the asphalt under the bike, a fire barrel throwing sparks to the left, steam catching the light, low camera almost at road level. Rider in the left third moving right.

### wordmark-plate (1536x1024, plate-menu)
shipped as `art/menu/wordmark-plate.webp`

> Cinematic photoreal video-game key art, grounded and moody, physically plausible lighting with volumetric dust and haze, sharp detail, natural film grade. No text, no lettering, no logos, no watermark, no cartoon or illustration style, no UI. A dark abstract background plate for a game title logo to sit on: near-black scuffed steel sheet and stained concrete with subtle rust grime and faint scratches, one soft amber sodium light falling off from the top-left corner into shadow, thin haze, heavy vignette, nothing recognisable, no objects, completely empty centre.

### loading-plate (1536x1024, plate-menu)
shipped as `art/menu/loading-plate.webp`

> Cinematic photoreal video-game key art, grounded and moody, physically plausible lighting with volumetric dust and haze, sharp detail, natural film grade. No text, no lettering, no logos, no watermark, no cartoon or illustration style, no UI. inside a vast old industrial warehouse: stacked rusted shipping containers, plywood kickers, pallets and oil drums, gantry crane rails and hook blocks overhead, riveted steel trusses, amber sodium high-bay lamps, shafts of dusty late light through a big bank of high windows, wet stained concrete floor. A single parked trials motorcycle seen side-on as a dark silhouette in the haze under one hanging amber lamp, far away and small in the middle of a huge empty warehouse floor, everything else falling into darkness, the lower third of the frame plain dark floor with nothing in it.

### tier-beginner (1024x1536, tier-card, industrial, beginner)
shipped as `art/menu/tier-beginner.webp`

> Cinematic photoreal video-game key art, grounded and moody, physically plausible lighting with volumetric dust and haze, sharp detail, natural film grade. No text, no lettering, no logos, no watermark, no cartoon or illustration style, no UI. Tall portrait composition. inside a vast old industrial warehouse: stacked rusted shipping containers, plywood kickers, pallets and oil drums, gantry crane rails and hook blocks overhead, riveted steel trusses, amber sodium high-bay lamps, shafts of dusty late light through a big bank of high windows, wet stained concrete floor. A calm welcoming moment: a trials motorcycle (small light frame, no seat, long-travel forks, knobbly tyres) with a rider in dark armoured gear and full-face helmet standing on the footpegs, stopped at the top of a low plywood kicker, one foot down, looking down the empty course, warm late light through the windows, dust motes. The rider sits in the upper half of the frame, the lower quarter is quieter and darker.

### tier-easy (1024x1536, tier-card, canyon, easy)
shipped as `art/menu/tier-easy.webp`

> Cinematic photoreal video-game key art, grounded and moody, physically plausible lighting with volumetric dust and haze, sharp detail, natural film grade. No text, no lettering, no logos, no watermark, no cartoon or illustration style, no UI. Tall portrait composition. a red sandstone canyon at sunset: layered mesa silhouettes in peach haze, low blown-out sun, long shadows, hay bales, stacked tyres and weathered timber obstacles on dry dirt, dust hanging in the light. A confident moment: a trials motorcycle (small light frame, no seat, long-travel forks, knobbly tyres) with a rider in dark armoured gear and full-face helmet standing on the footpegs, cresting a steep timber plank onto a sandstone shelf in golden light, dust trailing, big open sky above, low sun to the side. The rider sits in the upper half of the frame, the lower quarter is quieter and darker.

### tier-medium (1024x1536, tier-card, snow, medium)
shipped as `art/menu/tier-medium.webp`

> Cinematic photoreal video-game key art, grounded and moody, physically plausible lighting with volumetric dust and haze, sharp detail, natural film grade. No text, no lettering, no logos, no watermark, no cartoon or illustration style, no UI. Tall portrait composition. a snowbound timber yard at blue dusk: dense blue-white fog, snow-capped pines, warm yellow lamp posts, snow-lidded crates and log stacks, falling snow, blue moonlight against warm lamp light. A tense balancing moment: a trials motorcycle (small light frame, no seat, long-travel forks, knobbly tyres) with a rider in dark armoured gear and full-face helmet standing on the footpegs, balanced on the top of a huge rusted steel drum on a snowy log stack, fog swallowing the yard behind, snow falling through warm lamp light. The rider sits in the upper half of the frame, the lower quarter is quieter and darker.

### tier-hard (1024x1536, tier-card, nightCity, hard)
shipped as `art/menu/tier-hard.webp`

> Cinematic photoreal video-game key art, grounded and moody, physically plausible lighting with volumetric dust and haze, sharp detail, natural film grade. No text, no lettering, no logos, no watermark, no cartoon or illustration style, no UI. Tall portrait composition. a rain-wet city street at night: neon glow in magenta, cyan and yellow reflected in wet asphalt, street lights with soft cones, fire barrels, steam from grates, dark towers with scattered lit windows behind, grey-green night grade. A committed moment: a trials motorcycle (small light frame, no seat, long-travel forks, knobbly tyres) with a rider in dark armoured gear and full-face helmet standing on the footpegs, mid-wheelie riding along thin steel rails over a gap between rain-wet platforms at night, neon reflections in every puddle, a fire barrel below. The rider sits in the upper half of the frame, the lower quarter is quieter and darker.

### tier-extreme (1024x1536, tier-card, foundry, extreme)
shipped as `art/menu/tier-extreme.webp`

> Cinematic photoreal video-game key art, grounded and moody, physically plausible lighting with volumetric dust and haze, sharp detail, natural film grade. No text, no lettering, no logos, no watermark, no cartoon or illustration style, no UI. Tall portrait composition. inside a working foundry at night: molten metal channels and glowing pillars under-lighting everything orange-red, black steel walkways and grates, ladles and pipe runs, floating embers, heavy heat haze, the only dark shapes are steel and the bike. A threatening moment: a trials motorcycle (small light frame, no seat, long-travel forks, knobbly tyres) with a rider in dark armoured gear and full-face helmet standing on the footpegs, climbing a near-vertical steel plank over spinning drums and burning barrels, molten metal glowing below, embers streaming up, heat haze, the rider a black shape against the fire. The rider sits in the upper half of the frame, the lower quarter is quieter and darker.

### track-b1-first-ride (1536x1024, track-card, industrial, b1-first-ride, beginner)
shipped as `art/menu/track-b1-first-ride.webp`

> Cinematic photoreal video-game key art, grounded and moody, physically plausible lighting with volumetric dust and haze, sharp detail, natural film grade. No text, no lettering, no logos, no watermark, no cartoon or illustration style, no UI. An empty obstacle set-piece for a trials motorcycle course, no rider, no bike, seen from the side at rider height so the course reads left to right. inside a vast old industrial warehouse: stacked rusted shipping containers, plywood kickers, pallets and oil drums, gantry crane rails and hook blocks overhead, riveted steel trusses, amber sodium high-bay lamps, shafts of dusty late light through a big bank of high windows, wet stained concrete floor. The set-piece: a long gentle dirt-and-plank descent along a warehouse floor into a small speed hump and a low flat plateau of pallets, empty and inviting, calm amber light.

### track-b2-lean-back (1536x1024, track-card, industrial, b2-lean-back, beginner)
shipped as `art/menu/track-b2-lean-back.webp`

> Cinematic photoreal video-game key art, grounded and moody, physically plausible lighting with volumetric dust and haze, sharp detail, natural film grade. No text, no lettering, no logos, no watermark, no cartoon or illustration style, no UI. An empty obstacle set-piece for a trials motorcycle course, no rider, no bike, seen from the side at rider height so the course reads left to right. inside a vast old industrial warehouse: stacked rusted shipping containers, plywood kickers, pallets and oil drums, gantry crane rails and hook blocks overhead, riveted steel trusses, amber sodium high-bay lamps, shafts of dusty late light through a big bank of high windows, wet stained concrete floor. The set-piece: a 1.8 metre drop off the end of a rusted shipping container onto a downslope of plywood sheets, seen from the side, the lip of the drop lit by a hanging high-bay lamp.

### track-b3-kicker-row (1536x1024, track-card, industrial, b3-kicker-row, beginner)
shipped as `art/menu/track-b3-kicker-row.webp`

> Cinematic photoreal video-game key art, grounded and moody, physically plausible lighting with volumetric dust and haze, sharp detail, natural film grade. No text, no lettering, no logos, no watermark, no cartoon or illustration style, no UI. An empty obstacle set-piece for a trials motorcycle course, no rider, no bike, seen from the side at rider height so the course reads left to right. inside a vast old industrial warehouse: stacked rusted shipping containers, plywood kickers, pallets and oil drums, gantry crane rails and hook blocks overhead, riveted steel trusses, amber sodium high-bay lamps, shafts of dusty late light through a big bank of high windows, wet stained concrete floor. The set-piece: a row of plywood kicker ramps with gaps between them running down the warehouse floor, dust drifting through amber light shafts, tyre marks on the plywood.

### track-e1-uphill-weight (1536x1024, track-card, canyon, e1-uphill-weight, easy)
shipped as `art/menu/track-e1-uphill-weight.webp`

> Cinematic photoreal video-game key art, grounded and moody, physically plausible lighting with volumetric dust and haze, sharp detail, natural film grade. No text, no lettering, no logos, no watermark, no cartoon or illustration style, no UI. An empty obstacle set-piece for a trials motorcycle course, no rider, no bike, seen from the side at rider height so the course reads left to right. a red sandstone canyon at sunset: layered mesa silhouettes in peach haze, low blown-out sun, long shadows, hay bales, stacked tyres and weathered timber obstacles on dry dirt, dust hanging in the light. The set-piece: a steep 48 degree timber plank ramp climbing onto a sandstone shelf, then a long ramp descending on the far side, golden hour, dust.

### track-e2-rear-wheel-first (1536x1024, track-card, canyon, e2-rear-wheel-first, easy)
shipped as `art/menu/track-e2-rear-wheel-first.webp`

> Cinematic photoreal video-game key art, grounded and moody, physically plausible lighting with volumetric dust and haze, sharp detail, natural film grade. No text, no lettering, no logos, no watermark, no cartoon or illustration style, no UI. An empty obstacle set-piece for a trials motorcycle course, no rider, no bike, seen from the side at rider height so the course reads left to right. a red sandstone canyon at sunset: layered mesa silhouettes in peach haze, low blown-out sun, long shadows, hay bales, stacked tyres and weathered timber obstacles on dry dirt, dust hanging in the light. The set-piece: a long timber box platform standing in the canyon with a gap before it and a kicker ramp on top launching to a second gap, low sun behind, hay bales at the base.

### track-e3-stairway (1536x1024, track-card, canyon, e3-stairway, easy)
shipped as `art/menu/track-e3-stairway.webp`

> Cinematic photoreal video-game key art, grounded and moody, physically plausible lighting with volumetric dust and haze, sharp detail, natural film grade. No text, no lettering, no logos, no watermark, no cartoon or illustration style, no UI. An empty obstacle set-piece for a trials motorcycle course, no rider, no bike, seen from the side at rider height so the course reads left to right. a red sandstone canyon at sunset: layered mesa silhouettes in peach haze, low blown-out sun, long shadows, hay bales, stacked tyres and weathered timber obstacles on dry dirt, dust hanging in the light. The set-piece: a flight of seven steep railway-sleeper steps climbing a sandstone face and a longer flight descending the other side toward a gap, raking sunset light across the treads.

### track-m1-hop-up (1536x1024, track-card, industrial, m1-hop-up, medium)
shipped as `art/menu/track-m1-hop-up.webp`

> Cinematic photoreal video-game key art, grounded and moody, physically plausible lighting with volumetric dust and haze, sharp detail, natural film grade. No text, no lettering, no logos, no watermark, no cartoon or illustration style, no UI. An empty obstacle set-piece for a trials motorcycle course, no rider, no bike, seen from the side at rider height so the course reads left to right. inside a vast old industrial warehouse: stacked rusted shipping containers, plywood kickers, pallets and oil drums, gantry crane rails and hook blocks overhead, riveted steel trusses, amber sodium high-bay lamps, shafts of dusty late light through a big bank of high windows, wet stained concrete floor. The set-piece: a staircase of tall concrete blocks and steel ledges about a metre high each with a gap between the last two, under hanging chains and hook tyres, dusty amber light.

### track-m2-drum-roll (1536x1024, track-card, snow, m2-drum-roll, medium)
shipped as `art/menu/track-m2-drum-roll.webp`

> Cinematic photoreal video-game key art, grounded and moody, physically plausible lighting with volumetric dust and haze, sharp detail, natural film grade. No text, no lettering, no logos, no watermark, no cartoon or illustration style, no UI. An empty obstacle set-piece for a trials motorcycle course, no rider, no bike, seen from the side at rider height so the course reads left to right. a snowbound timber yard at blue dusk: dense blue-white fog, snow-capped pines, warm yellow lamp posts, snow-lidded crates and log stacks, falling snow, blue moonlight against warm lamp light. The set-piece: huge rusted steel drums lying on their sides on a snowy shelf next to a three-row pyramid of snow-dusted logs and a timber box, lamp posts glowing in fog.

### track-m3-see-saw (1536x1024, track-card, foundry, m3-see-saw, medium)
shipped as `art/menu/track-m3-see-saw.webp`

> Cinematic photoreal video-game key art, grounded and moody, physically plausible lighting with volumetric dust and haze, sharp detail, natural film grade. No text, no lettering, no logos, no watermark, no cartoon or illustration style, no UI. An empty obstacle set-piece for a trials motorcycle course, no rider, no bike, seen from the side at rider height so the course reads left to right. inside a working foundry at night: molten metal channels and glowing pillars under-lighting everything orange-red, black steel walkways and grates, ladles and pipe runs, floating embers, heavy heat haze, the only dark shapes are steel and the bike. The set-piece: a long steel see-saw plank on a pivot spanning a gap between narrow plank landings and steel boxes over a molten channel, orange glow from below.

### track-h1-wheelie-wire (1536x1024, track-card, nightCity, h1-wheelie-wire, hard)
shipped as `art/menu/track-h1-wheelie-wire.webp`

> Cinematic photoreal video-game key art, grounded and moody, physically plausible lighting with volumetric dust and haze, sharp detail, natural film grade. No text, no lettering, no logos, no watermark, no cartoon or illustration style, no UI. An empty obstacle set-piece for a trials motorcycle course, no rider, no bike, seen from the side at rider height so the course reads left to right. a rain-wet city street at night: neon glow in magenta, cyan and yellow reflected in wet asphalt, street lights with soft cones, fire barrels, steam from grates, dark towers with scattered lit windows behind, grey-green night grade. The set-piece: a steep 1.4 metre lip climb straight into a row of five thin steel rails over a gap, wet with rain, neon reflections on the rails, street lights behind.

### track-h2-gap-chain (1536x1024, track-card, nightCity, h2-gap-chain, hard)
shipped as `art/menu/track-h2-gap-chain.webp`

> Cinematic photoreal video-game key art, grounded and moody, physically plausible lighting with volumetric dust and haze, sharp detail, natural film grade. No text, no lettering, no logos, no watermark, no cartoon or illustration style, no UI. An empty obstacle set-piece for a trials motorcycle course, no rider, no bike, seen from the side at rider height so the course reads left to right. a rain-wet city street at night: neon glow in magenta, cyan and yellow reflected in wet asphalt, street lights with soft cones, fire barrels, steam from grates, dark towers with scattered lit windows behind, grey-green night grade. The set-piece: a chain of seven small kicker platforms separated by gaps running down a rain-wet street, the last a see-saw, neon colour pooling in every puddle.

### track-h3-fire-line (1536x1024, track-card, foundry, h3-fire-line, hard)
shipped as `art/menu/track-h3-fire-line.webp`

> Cinematic photoreal video-game key art, grounded and moody, physically plausible lighting with volumetric dust and haze, sharp detail, natural film grade. No text, no lettering, no logos, no watermark, no cartoon or illustration style, no UI. An empty obstacle set-piece for a trials motorcycle course, no rider, no bike, seen from the side at rider height so the course reads left to right. inside a working foundry at night: molten metal channels and glowing pillars under-lighting everything orange-red, black steel walkways and grates, ladles and pipe runs, floating embers, heavy heat haze, the only dark shapes are steel and the bike. The set-piece: six oil barrels burning in a line along a black steel walkway after a kicker ramp and a gap, embers streaming up, a kerb step at the far end.

### track-x1-vertical-limit (1536x1024, track-card, snow, x1-vertical-limit, extreme)
shipped as `art/menu/track-x1-vertical-limit.webp`

> Cinematic photoreal video-game key art, grounded and moody, physically plausible lighting with volumetric dust and haze, sharp detail, natural film grade. No text, no lettering, no logos, no watermark, no cartoon or illustration style, no UI. An empty obstacle set-piece for a trials motorcycle course, no rider, no bike, seen from the side at rider height so the course reads left to right. a snowbound timber yard at blue dusk: dense blue-white fog, snow-capped pines, warm yellow lamp posts, snow-lidded crates and log stacks, falling snow, blue moonlight against warm lamp light. The set-piece: a near-vertical 60 degree wooden wall rising from a snowy run-in, beyond it three tall wooden poles with tiny flat caps standing 4.5 metres high, then a downhill plank, blizzard, blue dusk.

### track-x2-pipe-dream (1536x1024, track-card, foundry, x2-pipe-dream, extreme)
shipped as `art/menu/track-x2-pipe-dream.webp`

> Cinematic photoreal video-game key art, grounded and moody, physically plausible lighting with volumetric dust and haze, sharp detail, natural film grade. No text, no lettering, no logos, no watermark, no cartoon or illustration style, no UI. An empty obstacle set-piece for a trials motorcycle course, no rider, no bike, seen from the side at rider height so the course reads left to right. inside a working foundry at night: molten metal channels and glowing pillars under-lighting everything orange-red, black steel walkways and grates, ladles and pipe runs, floating embers, heavy heat haze, the only dark shapes are steel and the bike. The set-piece: a see-saw dropping onto a shelf of huge spinning steel pipe drums separated by gaps over molten metal, chains and pipe runs above, hellish orange heat.

### track-x3-gauntlet (1536x1024, track-card, foundry, x3-gauntlet, extreme)
shipped as `art/menu/track-x3-gauntlet.webp`

> Cinematic photoreal video-game key art, grounded and moody, physically plausible lighting with volumetric dust and haze, sharp detail, natural film grade. No text, no lettering, no logos, no watermark, no cartoon or illustration style, no UI. An empty obstacle set-piece for a trials motorcycle course, no rider, no bike, seen from the side at rider height so the course reads left to right. inside a working foundry at night: molten metal channels and glowing pillars under-lighting everything orange-red, black steel walkways and grates, ladles and pipe runs, floating embers, heavy heat haze, the only dark shapes are steel and the bike. The set-piece: a monstrous obstacle course receding into the fire-lit distance: kicker, steep plank, stairs, spinning drums, see-saw, tall poles, burning barrels and thin rails, all in one line, the whole foundry roaring behind.

### medal-bronze (1024x1024, medal)
shipped as `art/menu/medal-bronze.png`

> A single round racing medal, warm dark bronze with copper highlights and a slightly worn patina, embossed with a motorcycle wheel with knobbly tyre in the centre surrounded by a laurel wreath, a thin beaded rim, viewed straight on and perfectly centred, filling about 80 percent of the frame, no ribbon, no text, no numbers, studio product lighting with soft reflections, photoreal, isolated on a flat pure solid black background with no gradient, no glow and no shadow outside the medal.

### medal-silver (1024x1024, medal)
shipped as `art/menu/medal-silver.png`

> A single round racing medal, bright brushed silver with cool white highlights, embossed with a motorcycle wheel with knobbly tyre in the centre surrounded by a laurel wreath, a thin beaded rim, viewed straight on and perfectly centred, filling about 80 percent of the frame, no ribbon, no text, no numbers, studio product lighting with soft reflections, photoreal, isolated on a flat pure solid black background with no gradient, no glow and no shadow outside the medal.

### medal-gold (1024x1024, medal)
shipped as `art/menu/medal-gold.png`

> A single round racing medal, rich polished gold with deep warm reflections, embossed with a motorcycle wheel with knobbly tyre in the centre surrounded by a laurel wreath, a thin beaded rim, viewed straight on and perfectly centred, filling about 80 percent of the frame, no ribbon, no text, no numbers, studio product lighting with soft reflections, photoreal, isolated on a flat pure solid black background with no gradient, no glow and no shadow outside the medal.

### medal-platinum (1024x1024, medal)
shipped as `art/menu/medal-platinum.png`

> A single round racing medal, pale icy platinum with a faint blue-white sheen and a jewelled rim, embossed with a motorcycle wheel with knobbly tyre in the centre surrounded by a laurel wreath, a thin beaded rim, viewed straight on and perfectly centred, filling about 80 percent of the frame, no ribbon, no text, no numbers, studio product lighting with soft reflections, photoreal, isolated on a flat pure solid black background with no gradient, no glow and no shadow outside the medal.

### results-industrial (1536x1024, results-bg, industrial)
shipped as `art/menu/results-industrial.webp`

> Cinematic photoreal video-game key art, grounded and moody, physically plausible lighting with volumetric dust and haze, sharp detail, natural film grade. No text, no lettering, no logos, no watermark, no cartoon or illustration style, no UI. inside a vast old industrial warehouse: stacked rusted shipping containers, plywood kickers, pallets and oil drums, gantry crane rails and hook blocks overhead, riveted steel trusses, amber sodium high-bay lamps, shafts of dusty late light through a big bank of high windows, wet stained concrete floor. The finish area of a trials course: a simple checkered finish banner on two posts (no words), stacked tyres and a couple of hay bales, deserted after the race, calm and dim, slightly soft focus, the left half of the frame is dark near-empty negative space for a results panel, the point of interest sits in the right third.

### results-canyon (1536x1024, results-bg, canyon)
shipped as `art/menu/results-canyon.webp`

> Cinematic photoreal video-game key art, grounded and moody, physically plausible lighting with volumetric dust and haze, sharp detail, natural film grade. No text, no lettering, no logos, no watermark, no cartoon or illustration style, no UI. a red sandstone canyon at sunset: layered mesa silhouettes in peach haze, low blown-out sun, long shadows, hay bales, stacked tyres and weathered timber obstacles on dry dirt, dust hanging in the light. The finish area of a trials course: a simple checkered finish banner on two posts (no words), stacked tyres and a couple of hay bales, deserted after the race, calm and dim, slightly soft focus, the left half of the frame is dark near-empty negative space for a results panel, the point of interest sits in the right third.

### results-snow (1536x1024, results-bg, snow)
shipped as `art/menu/results-snow.webp`

> Cinematic photoreal video-game key art, grounded and moody, physically plausible lighting with volumetric dust and haze, sharp detail, natural film grade. No text, no lettering, no logos, no watermark, no cartoon or illustration style, no UI. a snowbound timber yard at blue dusk: dense blue-white fog, snow-capped pines, warm yellow lamp posts, snow-lidded crates and log stacks, falling snow, blue moonlight against warm lamp light. The finish area of a trials course: a simple checkered finish banner on two posts (no words), stacked tyres and a couple of hay bales, deserted after the race, calm and dim, slightly soft focus, the left half of the frame is dark near-empty negative space for a results panel, the point of interest sits in the right third.

### results-nightCity (1536x1024, results-bg, nightCity)
shipped as `art/menu/results-nightCity.webp`

> Cinematic photoreal video-game key art, grounded and moody, physically plausible lighting with volumetric dust and haze, sharp detail, natural film grade. No text, no lettering, no logos, no watermark, no cartoon or illustration style, no UI. a rain-wet city street at night: neon glow in magenta, cyan and yellow reflected in wet asphalt, street lights with soft cones, fire barrels, steam from grates, dark towers with scattered lit windows behind, grey-green night grade. The finish area of a trials course: a simple checkered finish banner on two posts (no words), stacked tyres and a couple of hay bales, deserted after the race, calm and dim, slightly soft focus, the left half of the frame is dark near-empty negative space for a results panel, the point of interest sits in the right third.

### results-foundry (1536x1024, results-bg, foundry)
shipped as `art/menu/results-foundry.webp`

> Cinematic photoreal video-game key art, grounded and moody, physically plausible lighting with volumetric dust and haze, sharp detail, natural film grade. No text, no lettering, no logos, no watermark, no cartoon or illustration style, no UI. inside a working foundry at night: molten metal channels and glowing pillars under-lighting everything orange-red, black steel walkways and grates, ladles and pipe runs, floating embers, heavy heat haze, the only dark shapes are steel and the bike. The finish area of a trials course: a simple checkered finish banner on two posts (no words), stacked tyres and a couple of hay bales, deserted after the race, calm and dim, slightly soft focus, the left half of the frame is dark near-empty negative space for a results panel, the point of interest sits in the right third.

### stencil-hkr (1024x1024, stencil)
shipped as `art/world/stencil-hkr.webp`

> A flat graphic in pure white on a flat pure black background, no grey, no shading, no perspective, no colour, worn spray-stencil edges with a little paint spatter, nothing else in the frame. Content: shipping-container owner markings: a blocky industrial stencil monogram "HKR" above the serial "HKRU 448 213 7" and a size code "22G1".

### stencil-nordvik (1024x1024, stencil)
shipped as `art/world/stencil-nordvik.webp`

> A flat graphic in pure white on a flat pure black background, no grey, no shading, no perspective, no colour, worn spray-stencil edges with a little paint spatter, nothing else in the frame. Content: shipping-container owner markings: the word "NORDVIK" in tall condensed stencil capitals with a small stylised wave mark, serial "NVKU 205 771 3" beneath.

### stencil-taro (1024x1024, stencil)
**rejected** — Rounded-rectangle frame smeared over the letters; TARO barely legible, FREIGHT lost.

> A flat graphic in pure white on a flat pure black background, no grey, no shading, no perspective, no colour, worn spray-stencil edges with a little paint spatter, nothing else in the frame. Content: shipping-container owner markings: "TARO FREIGHT" in two lines of bold stencil letters inside a thin rounded rectangle, serial "TRFU 913 004 8" below.

### stencil-apex (1024x1024, stencil)
**rejected** — Lettering collapsed into a solid white triangle blob; no readable words.

> A flat graphic in pure white on a flat pure black background, no grey, no shading, no perspective, no colour, worn spray-stencil edges with a little paint spatter, nothing else in the frame. Content: shipping-container owner markings: a triangle-and-chevron emblem with the word "APEX MARINE" below it in stencil letters, small serial "APXU 331 620 5".

### stencil-weights (1024x1024, stencil)
shipped as `art/world/stencil-weights.webp`

> A flat graphic in pure white on a flat pure black background, no grey, no shading, no perspective, no colour, worn spray-stencil edges with a little paint spatter, nothing else in the frame. Content: a container weight table in stencil letters: rows reading "MAX GROSS 30480 KG", "TARE 2250 KG", "NET 28230 KG", "CU CAP 33.2 CBM", left aligned, monospaced industrial font.

### stencil-hazard (1024x1024, stencil)
shipped as `art/world/stencil-hazard.webp`

> A flat graphic in pure white on a flat pure black background, no grey, no shading, no perspective, no colour, worn spray-stencil edges with a little paint spatter, nothing else in the frame. Content: a hazard diamond with a small flame pictogram and the number "3" at the bottom, next to a "DO NOT STACK" pictogram of crossed-out boxes and a "THIS WAY UP" pair of arrows.

### stencil-serial (1024x1024, stencil)
shipped as `art/world/stencil-serial.webp`

> A flat graphic in pure white on a flat pure black background, no grey, no shading, no perspective, no colour, worn spray-stencil edges with a little paint spatter, nothing else in the frame. Content: one very large container serial "OCTU 771 902 4" in two lines of heavy stencil digits with a small boxed check digit, plus a small "ISO 668" tag.

### stencil-arrows (1024x1024, stencil)
shipped as `art/world/stencil-arrows.webp`

> A flat graphic in pure white on a flat pure black background, no grey, no shading, no perspective, no colour, worn spray-stencil edges with a little paint spatter, nothing else in the frame. Content: a tall stack of forklift-pocket pictograms: two hollow chevron arrows pointing down, a "LIFT HERE" hook symbol, and a row of four small tie-down anchor icons.

### mask-rust-streaks (1024x1024, mask)
**rejected** — Solid pure-white full-height stalactites with no tonal variation; would tint as hard stripes.

> A grayscale texture mask on a flat pure black background: white where the effect is, black where it is not, soft grey only at the feathered edges, no colour, no perspective, no objects, seamless edge to edge. Content: long vertical rust streaks running down from the top edge, thick at the top thinning into drips, uneven spacing, some streaks reaching the bottom.

### mask-rivet-drips (1024x1024, mask)
**rejected** — Rivets and drips too small (about 12 px at 1024) to read on a container side.

> A grayscale texture mask on a flat pure black background: white where the effect is, black where it is not, soft grey only at the feathered edges, no colour, no perspective, no objects, seamless edge to edge. Content: a horizontal row of small round rivet stains near the top, each with a short tapering drip running downward, a faint spatter halo around each rivet.

### mask-grime-spatter (1024x1024, mask)
shipped as `art/world/mask-grime-spatter.webp`

> A grayscale texture mask on a flat pure black background: white where the effect is, black where it is not, soft grey only at the feathered edges, no colour, no perspective, no objects, seamless edge to edge. Content: scattered mud and oil spatter, dense clusters of small blobs and a few large splats with fine droplets around them, denser toward the bottom edge.

### mask-edge-grime (1024x1024, mask)
shipped as `art/world/mask-edge-grime.webp`

> A grayscale texture mask on a flat pure black background: white where the effect is, black where it is not, soft grey only at the feathered edges, no colour, no perspective, no objects, seamless edge to edge. Content: dirt gathered in the corners and along all four edges of the square, fading to black in the middle, with cracked-paint flakes along the edges.

### sign-hard-hat (1024x1024, sign)
shipped as `art/world/sign-hard-hat.webp`

> A flat front-on photograph of a printed sign filling the whole frame edge to edge, no border of wall visible, evenly lit, slightly weathered with scratches and a little rust bleed, photoreal. A yellow-and-black industrial safety sign: a helmet pictogram with the words "HARD HAT AREA" and smaller "AUTHORISED PERSONNEL ONLY".

### sign-overhead-crane (1024x1024, sign)
shipped as `art/world/sign-overhead-crane.webp`

> A flat front-on photograph of a printed sign filling the whole frame edge to edge, no border of wall visible, evenly lit, slightly weathered with scratches and a little rust bleed, photoreal. A red-and-white industrial warning sign: a crane hook pictogram with the words "DANGER OVERHEAD CRANE" and a smaller line "KEEP CLEAR OF LOADS".

### sign-forklift (1024x1024, sign)
shipped as `art/world/sign-forklift.webp`

> A flat front-on photograph of a printed sign filling the whole frame edge to edge, no border of wall visible, evenly lit, slightly weathered with scratches and a little rust bleed, photoreal. A yellow warning sign: a forklift pictogram inside a black triangle with the words "FORKLIFT TRAFFIC" and "LOOK BOTH WAYS".

### sign-exit (1024x1024, sign)
shipped as `art/world/sign-exit.webp`

> A flat front-on photograph of a printed sign filling the whole frame edge to edge, no border of wall visible, evenly lit, slightly weathered with scratches and a little rust bleed, photoreal. A green emergency exit sign: running-figure pictogram, a door, an arrow pointing right, and the word "EXIT", scuffed acrylic.

### poster-trials-night (1024x1536, sign)
shipped as `art/world/poster-trials-night.webp`

> A flat front-on photograph of a printed sign filling the whole frame edge to edge, no border of wall visible, evenly lit, slightly weathered with scratches and a little rust bleed, photoreal. A torn weathered event poster pasted on a wall: a dark dramatic photo of a trials motorcycle wheelie with orange headline lettering "TRIALS NIGHT" and smaller lines "HALL 4 - GATES 7PM" and "FREE ENTRY", halftone print texture, corners peeling.

### poster-tyres (1024x1536, sign)
shipped as `art/world/poster-tyres.webp`

> A flat front-on photograph of a printed sign filling the whole frame edge to edge, no border of wall visible, evenly lit, slightly weathered with scratches and a little rust bleed, photoreal. A faded vintage advertising poster for a fictional tyre brand "KESTREL TYRES" with a bold bird emblem and a knobbly motorcycle tyre, cream and dark red palette, sun-bleached and water-stained, halftone print texture.

### graffiti-rise (1024x1024, graffiti)
shipped as `art/world/graffiti-rise.webp`

> A single graffiti piece painted in spray paint, isolated on a flat pure black background with nothing else, viewed straight on, photoreal paint texture with drips and overspray, the piece fills most of the frame. A wildstyle piece reading "RISE" in orange and cream with dark outlines and a cyan 3D shadow.

### graffiti-grind (1024x1024, graffiti)
shipped as `art/world/graffiti-grind.webp`

> A single graffiti piece painted in spray paint, isolated on a flat pure black background with nothing else, viewed straight on, photoreal paint texture with drips and overspray, the piece fills most of the frame. A chunky bubble-letter throw-up reading "GRIND" in silver chrome fill with a black outline and a red drop shadow.

### graffiti-nofear (1024x1024, graffiti)
shipped as `art/world/graffiti-nofear.webp`

> A single graffiti piece painted in spray paint, isolated on a flat pure black background with nothing else, viewed straight on, photoreal paint texture with drips and overspray, the piece fills most of the frame. A tall blocky piece reading "NO FEAR" in two lines, hot pink and yellow fill with white highlights and heavy drips.

### graffiti-skull (1024x1024, graffiti)
shipped as `art/world/graffiti-skull.webp`

> A single graffiti piece painted in spray paint, isolated on a flat pure black background with nothing else, viewed straight on, photoreal paint texture with drips and overspray, the piece fills most of the frame. A stencilled character piece: a grinning skull wearing a motocross helmet, black and white with a splash of red, sharp stencil edges.

### graffiti-tag-wall (1024x1024, graffiti)
shipped as `art/world/graffiti-tag-wall.webp`

> A single graffiti piece painted in spray paint, isolated on a flat pure black background with nothing else, viewed straight on, photoreal paint texture with drips and overspray, the piece fills most of the frame. A cluster of overlapping hand-style marker and spray tags in white, silver and red, illegible scrawls, a few small arrows and stars.

### graffiti-wheel (1024x1024, graffiti)
shipped as `art/world/graffiti-wheel.webp`

> A single graffiti piece painted in spray paint, isolated on a flat pure black background with nothing else, viewed straight on, photoreal paint texture with drips and overspray, the piece fills most of the frame. A round crew emblem piece: a stylised spoked motorcycle wheel with flames, teal and orange, with the crew name "HKR CREW" curved around the top.

### banner-vortex-oil (1536x1024, banner)
shipped as `art/world/banner-vortex-oil.webp`

> A flat front-on photograph of a printed vinyl sponsor banner filling the whole frame edge to edge, eyelets along the top edge, slight creases and dirt, evenly lit, photoreal, fictional brand. Dark navy banner with a bold white swirl emblem and the words "VORTEX OIL" in heavy italic capitals, a thin orange stripe along the bottom.

### banner-kestrel-tyres (1536x1024, banner)
shipped as `art/world/banner-kestrel-tyres.webp`

> A flat front-on photograph of a printed vinyl sponsor banner filling the whole frame edge to edge, eyelets along the top edge, slight creases and dirt, evenly lit, photoreal, fictional brand. Cream banner with a dark red bird-of-prey emblem and "KESTREL TYRES" in bold condensed letters, small "GRIP EVERYTHING" tagline.

### banner-nordvik (1536x1024, banner)
shipped as `art/world/banner-nordvik.webp`

> A flat front-on photograph of a printed vinyl sponsor banner filling the whole frame edge to edge, eyelets along the top edge, slight creases and dirt, evenly lit, photoreal, fictional brand. Cool grey banner with a stylised blue wave and "NORDVIK" in tall clean capitals, a smaller "SHIPPING AND FREIGHT" line.

### banner-apex-suspension (1536x1024, banner)
shipped as `art/world/banner-apex-suspension.webp`

> A flat front-on photograph of a printed vinyl sponsor banner filling the whole frame edge to edge, eyelets along the top edge, slight creases and dirt, evenly lit, photoreal, fictional brand. Black banner with a yellow triangle emblem and "APEX SUSPENSION" in angular capitals, a thin yellow chevron pattern along both ends.

### banner-bolt-energy (1536x1024, banner)
shipped as `art/world/banner-bolt-energy.webp`

> A flat front-on photograph of a printed vinyl sponsor banner filling the whole frame edge to edge, eyelets along the top edge, slight creases and dirt, evenly lit, photoreal, fictional brand. Electric green banner with a white lightning bolt and "BOLT ENERGY" in punchy rounded capitals, with a repeated small bolt pattern.

### banner-ironworks-series (1536x1024, banner)
shipped as `art/world/banner-ironworks-series.webp`

> A flat front-on photograph of a printed vinyl sponsor banner filling the whole frame edge to edge, eyelets along the top edge, slight creases and dirt, evenly lit, photoreal, fictional brand. Rust-orange banner with a black cog-and-wheel emblem and "IRONWORKS TRIALS SERIES" in industrial stencil capitals, with a checkered strip along the bottom.

### tyremark-straight (1024x1024, mask)
**rejected** — Track rendered as a 40 px zipper down the middle; unusable as a decal.

> A grayscale texture mask on a flat pure black background: white where the effect is, black where it is not, soft grey only at the feathered edges, no colour, no perspective, no objects, seamless edge to edge. Content: a single straight knobbly motorcycle tyre skid mark running from the bottom edge to the top edge, a repeating block tread pattern visible, darker and broken at the ends, slight wobble.

### tyremark-arc (1024x1024, mask)
shipped as `art/world/tyremark-arc.webp`

> A grayscale texture mask on a flat pure black background: white where the effect is, black where it is not, soft grey only at the feathered edges, no colour, no perspective, no objects, seamless edge to edge. Content: a curving motorcycle burnout arc sweeping from the bottom-left to the right edge, heavy smeared rubber in the middle of the arc with tread blocks visible at the ends.

### crowd-day (1536x1024, crowd)
shipped as `art/world/crowd-day.webp`

> A row of exactly eight adult spectators standing shoulder to shoulder in one line, full body from feet to head, all facing the camera, photographed straight on at chest height with an even flat light, evenly spaced and not overlapping, feet on the bottom edge, on a completely flat uniform bright green chroma-key background with no floor line, no shadows on the background, photoreal. Daytime motorsport fans: caps, sunglasses, t-shirts and hoodies, one holding a small plain checkered flag, one clapping, one holding up a phone, one with arms crossed, mixed ages and builds. No green clothing.

### crowd-night (1536x1024, crowd)
shipped as `art/world/crowd-night.webp`

> A row of exactly eight adult spectators standing shoulder to shoulder in one line, full body from feet to head, all facing the camera, photographed straight on at chest height with an even flat light, evenly spaced and not overlapping, feet on the bottom edge, on a completely flat uniform bright green chroma-key background with no floor line, no shadows on the background, photoreal. Night-time motorsport fans in jackets and beanies, lit warm from the front as if by floodlights, one holding a glowing orange flare, one with a raised fist, one holding a plain foam finger, one filming with a phone, mixed ages and builds. No green clothing.

### plate-canyon (1536x1024, plate-far, canyon)
shipped as `art/plates/plate-canyon.webp`

> A seamless horizontal panorama that tiles left to right (the far left edge continues into the far right edge), painted for use as a distant parallax backdrop behind a side-scrolling game. Composed as a wide strip: every silhouette and point of interest sits in the horizontal middle band of the frame, the top third is plain sky gradient and the bottom third is plain flat atmospheric haze with no ground detail. Atmospheric perspective in three depth tiers, no foreground objects, no text, photoreal matte-painting quality. Content: layered red sandstone mesas and buttes at sunset, three tiers fading pinker and paler into peach haze, a low sun glow on the horizon, a few distant saguaro cacti as tiny silhouettes.

### plate-snow (1536x1024, plate-far, snow)
shipped as `art/plates/plate-snow.webp`

> A seamless horizontal panorama that tiles left to right (the far left edge continues into the far right edge), painted for use as a distant parallax backdrop behind a side-scrolling game. Composed as a wide strip: every silhouette and point of interest sits in the horizontal middle band of the frame, the top third is plain sky gradient and the bottom third is plain flat atmospheric haze with no ground detail. Atmospheric perspective in three depth tiers, no foreground objects, no text, photoreal matte-painting quality. Content: a ridgeline of snow-capped pines and rounded snowy hills in dense blue-white fog at dusk, a few tiny warm yellow window lights of a distant village, three depth tiers.

### plate-nightcity (1536x1024, plate-far, nightCity)
shipped as `art/plates/plate-nightcity.webp`

> A seamless horizontal panorama that tiles left to right (the far left edge continues into the far right edge), painted for use as a distant parallax backdrop behind a side-scrolling game. Composed as a wide strip: every silhouette and point of interest sits in the horizontal middle band of the frame, the top third is plain sky gradient and the bottom third is plain flat atmospheric haze with no ground detail. Atmospheric perspective in three depth tiers, no foreground objects, no text, photoreal matte-painting quality. Content: a night city skyline, dark towers with scattered lit windows, magenta and cyan neon glow bleeding into low cloud, water towers and cranes on rooftops, three depth tiers, no readable signs.

### plate-foundry (1536x1024, plate-far, foundry)
shipped as `art/plates/plate-foundry.webp`

> A seamless horizontal panorama that tiles left to right (the far left edge continues into the far right edge), painted for use as a distant parallax backdrop behind a side-scrolling game. Composed as a wide strip: every silhouette and point of interest sits in the horizontal middle band of the frame, the top third is plain sky gradient and the bottom third is plain flat atmospheric haze with no ground detail. Atmospheric perspective in three depth tiers, no foreground objects, no text, photoreal matte-painting quality. Content: the far end of a foundry at night, tall chimneys and blast-furnace towers as black silhouettes against an orange-red glow, sparks and smoke plumes lit from below, pipe bridges, three depth tiers of heat haze.

### plate-industrial (1536x1024, plate-far, industrial)
shipped as `art/plates/plate-industrial.webp`

> A seamless horizontal panorama that tiles left to right (the far left edge continues into the far right edge), painted for use as a distant parallax backdrop behind a side-scrolling game. Composed as a wide strip: every silhouette and point of interest sits in the horizontal middle band of the frame, the top third is plain sky gradient and the bottom third is plain flat atmospheric haze with no ground detail. Atmospheric perspective in three depth tiers, no foreground objects, no text, photoreal matte-painting quality. Content: the distant interior bays of a huge old warehouse: rows of riveted steel columns and roof trusses receding, stacks of shipping containers, a far window bank glowing amber through dust haze, hanging lamps, three depth tiers of haze.

### sky-canyon (1536x1024, sky, canyon)
shipped as `art/plates/sky-canyon.webp`

> A seamless horizontal panorama of a sky only that tiles left to right (the far left edge continues into the far right edge), no ground, no horizon objects, no buildings, no text, painted for use as the farthest backdrop layer of a game. Photoreal matte-painting quality. Content: a sunset sky, peach and salmon near the bottom rising to dusty violet, thin streaks of lit cirrus, brighter glow low in the frame slightly left of centre.

### sky-snow (1536x1024, sky, snow)
shipped as `art/plates/sky-snow.webp`

> A seamless horizontal panorama of a sky only that tiles left to right (the far left edge continues into the far right edge), no ground, no horizon objects, no buildings, no text, painted for use as the farthest backdrop layer of a game. Photoreal matte-painting quality. Content: a flat overcast blue-grey winter dusk sky, soft featureless fog gradient, slightly brighter along the bottom, faint falling snow specks.

### sky-nightcity (1536x1024, sky, nightCity)
shipped as `art/plates/sky-nightcity.webp`

> A seamless horizontal panorama of a sky only that tiles left to right (the far left edge continues into the far right edge), no ground, no horizon objects, no buildings, no text, painted for use as the farthest backdrop layer of a game. Photoreal matte-painting quality. Content: a night sky over a city, low cloud underlit with faint magenta and orange light pollution near the bottom, dark blue-black above, no stars visible.

### sky-foundry (1536x1024, sky, foundry)
shipped as `art/plates/sky-foundry.webp`

> A seamless horizontal panorama of a sky only that tiles left to right (the far left edge continues into the far right edge), no ground, no horizon objects, no buildings, no text, painted for use as the farthest backdrop layer of a game. Photoreal matte-painting quality. Content: a smoky night sky above a foundry, heavy dark smoke layers underlit orange-red from below fading to black at the top, drifting embers.

### sky-industrial (1536x1024, sky, industrial)
shipped as `art/plates/sky-industrial.webp`

> A seamless horizontal panorama of a sky only that tiles left to right (the far left edge continues into the far right edge), no ground, no horizon objects, no buildings, no text, painted for use as the farthest backdrop layer of a game. Photoreal matte-painting quality. Content: the upper interior of a huge warehouse seen from below: a dark riveted roof with skylight strips glowing amber through dust haze, roof trusses in silhouette, no walls, uniform across the width.

### stencil-apex-v2 (1024x1024, stencil)
shipped as `art/world/stencil-apex.webp`

> A flat graphic in pure white on a flat pure black background, no grey, no shading, no perspective, no colour, worn spray-stencil edges with a little paint spatter, nothing else in the frame. Content: shipping-container owner markings laid out in three clear rows with generous spacing: top row a simple hollow triangle outline with a single chevron inside it; middle row the words "APEX MARINE" in large bold stencil capitals, crisp and fully legible; bottom row the smaller serial "APXU 331 620 5". Clean stencil lettering with only light wear, never smudged.

### stencil-taro-v2 (1024x1024, stencil)
shipped as `art/world/stencil-taro.webp`

> A flat graphic in pure white on a flat pure black background, no grey, no shading, no perspective, no colour, worn spray-stencil edges with a little paint spatter, nothing else in the frame. Content: shipping-container owner markings: the words "TARO" on one line and "FREIGHT" on the line below in very large bold stencil capitals, crisp and fully legible, no box or frame around them, then the smaller serial "TRFU 913 004 8" underneath. Clean stencil lettering with only light wear, never smudged.

### tyremark-straight-v2 (1024x1024, mask)
**rejected** — Still a thin zipper and the background came out mid-grey instead of black.

> A grayscale texture mask on a flat pure black background: white where the effect is, black where it is not, soft grey only at the feathered edges, no colour, no perspective, no objects, seamless edge to edge. Content: one straight motocross knobbly-tyre track running vertically from the bottom edge to the top edge, about one fifth of the frame wide, made of a regular repeating pattern of rectangular tread-block prints (two staggered columns of blocks), the prints fading and breaking up toward both ends, a light smear of grey rubber between the blocks.

### mask-rivet-drips-v2 (1024x1024, mask)
shipped as `art/world/mask-rivet-drips.webp`

> A grayscale texture mask on a flat pure black background: white where the effect is, black where it is not, soft grey only at the feathered edges, no colour, no perspective, no objects, seamless edge to edge. Content: a horizontal row of six large round rivet rust stains near the top edge, each about one twelfth of the frame wide, and from each a long bold tapering rust drip running two thirds of the way down the frame in soft grey, with a faint spatter halo around each rivet.

### mask-rust-streaks-v2 (1024x1024, mask)
shipped as `art/world/mask-rust-streaks.webp`

> A grayscale texture mask on a flat pure black background: white where the effect is, black where it is not, soft grey only at the feathered edges, no colour, no perspective, no objects, seamless edge to edge. Content: rain-washed rust streaking running down from the top edge in many thin uneven vertical streaks of varied grey intensity, mostly soft mid-grey and semi-transparent looking, only a few bright white cores, thick and bright at the top thinning and fading before the bottom, with fine drip tails, like weathered painted steel.

### tyremark-straight-v3 (1024x1024, mask)
shipped as `art/world/tyremark-straight.webp`

> A black-and-white texture mask seen from directly above: a single straight dirt-bike tyre print pressed into mud, running vertically through the whole frame from the bottom edge to the top edge and about one third of the frame wide. The tread-block prints are pure white, everything else is flat pure black, no grey background, no perspective. The knobbly tread is a bold repeating pattern of big rectangular blocks in staggered rows, the print fading and breaking up near the top and bottom edges.

## Round 3 prompts

### bike-rookie (1536x1024, bike, rookie)
shipped as `art/menu/bike-rookie-1536.webp (+ -768)`

> Cinematic photoreal video-game key art, grounded and moody, physically plausible lighting with volumetric dust and haze, sharp detail, natural film grade. No text, no lettering, no logos, no watermark, no cartoon or illustration style, no UI. inside a dark motorcycle workshop bay at night: black rubber floor with faint scuffs, a grey steel roller shutter and pegboard tool wall in shadow behind, one warm amber work lamp overhead and a cool white LED strip low along the floor, faint haze, tool chests and tyre stacks softly out of focus in the background. Hero product shot of one parked trials motorcycle (small light frame, no seat, long-travel forks, knobbly tyres) seen side-on from slightly in front of the left, no rider, no stand, resting on both wheels. Livery: glossy royal blue and white two-tone with soft rounded fairing panels, white rims, blue fork guards, friendly trainer look, gentle amber highlights on the tank. Bike centred and large, the lower fifth of the frame quiet floor.

### bike-rookie-v2 (1536x1024, bike, rookie)
shipped as `art/menu/bike-rookie-alt.webp`

> Cinematic photoreal video-game key art, grounded and moody, physically plausible lighting with volumetric dust and haze, sharp detail, natural film grade. No text, no lettering, no logos, no watermark, no cartoon or illustration style, no UI. inside a dark motorcycle workshop bay at night: black rubber floor with faint scuffs, a grey steel roller shutter and pegboard tool wall in shadow behind, one warm amber work lamp overhead and a cool white LED strip low along the floor, faint haze, tool chests and tyre stacks softly out of focus in the background. Hero product shot of one parked trials motorcycle (small light frame, no seat, long-travel forks, knobbly tyres) seen three-quarter front from the left, no rider, no stand. Livery: matte sky blue and white panels, white rims, a thin white stripe along the frame spar, clean and approachable, a trainer bike. Bike centred and large, the lower fifth of the frame quiet floor.

### bike-pro (1536x1024, bike, pro)
shipped as `art/menu/bike-pro-1536.webp (+ -768)`

> Cinematic photoreal video-game key art, grounded and moody, physically plausible lighting with volumetric dust and haze, sharp detail, natural film grade. No text, no lettering, no logos, no watermark, no cartoon or illustration style, no UI. inside a dark motorcycle workshop bay at night: black rubber floor with faint scuffs, a grey steel roller shutter and pegboard tool wall in shadow behind, one warm amber work lamp overhead and a cool white LED strip low along the floor, faint haze, tool chests and tyre stacks softly out of focus in the background. Hero product shot of one parked trials motorcycle (small light frame, no seat, long-travel forks, knobbly tyres) seen side-on from slightly in front of the left, no rider, no stand, resting on both wheels. Livery: dark graphite carbon-look panels with sharp fluorescent orange race trim, black rims with an orange rim stripe, gold-anodised forks, aggressive angular bodywork, a race bike. Bike centred and large, the lower fifth of the frame quiet floor.

### bike-pro-v2 (1536x1024, bike, pro)
shipped as `art/menu/bike-pro-alt.webp`

> Cinematic photoreal video-game key art, grounded and moody, physically plausible lighting with volumetric dust and haze, sharp detail, natural film grade. No text, no lettering, no logos, no watermark, no cartoon or illustration style, no UI. inside a dark motorcycle workshop bay at night: black rubber floor with faint scuffs, a grey steel roller shutter and pegboard tool wall in shadow behind, one warm amber work lamp overhead and a cool white LED strip low along the floor, faint haze, tool chests and tyre stacks softly out of focus in the background. Hero product shot of one parked trials motorcycle (small light frame, no seat, long-travel forks, knobbly tyres) seen three-quarter front from the left, no rider, no stand. Livery: satin black graphite with a broad orange slash across the tank and fork guards, black rims, titanium exhaust, taut and mean, a race bike. Bike centred and large, the lower fifth of the frame quiet floor.

### garage-plate (1536x1024, garage-plate)
shipped as `art/menu/garage-plate.webp`

> Cinematic photoreal video-game key art, grounded and moody, physically plausible lighting with volumetric dust and haze, sharp detail, natural film grade. No text, no lettering, no logos, no watermark, no cartoon or illustration style, no UI. inside a dark motorcycle workshop bay at night: black rubber floor with faint scuffs, a grey steel roller shutter and pegboard tool wall in shadow behind, one warm amber work lamp overhead and a cool white LED strip low along the floor, faint haze, tool chests and tyre stacks softly out of focus in the background. Wide empty establishing shot of the bay with no motorcycle in it: a clear rubber floor in the centre lit by the overhead work lamp, a workbench with tools and a tyre stack on the left, a tool chest and a hanging helmet on the right, a roller shutter and pegboard behind, the centre third of the frame empty floor and wall so a bike can be composited there.

### kit-rookie (1024x1024, kit, rookie)
shipped as `art/world/kit-rookie.webp`

> A flat seamless textile pattern swatch filling the whole frame edge to edge, seen straight on with no perspective, no folds, no body, no logos, no text, evenly lit, crisp vector-like print on a matte jersey fabric with a very fine knit texture. Rookie rider kit: royal blue ground with broad diagonal white bands and thin sky-blue pinstripes, a scattering of small white chevrons, clean and friendly.

### kit-pro (1024x1024, kit, pro)
shipped as `art/world/kit-pro.webp`

> A flat seamless textile pattern swatch filling the whole frame edge to edge, seen straight on with no perspective, no folds, no body, no logos, no text, evenly lit, crisp vector-like print on a matte jersey fabric with a very fine knit texture. Pro rider kit: near-black graphite ground with a carbon weave texture, jagged fluorescent orange slashes and thin grey hex-grid lines, aggressive race look.

### app-icon (1024x1024, icon)
**rejected** - see the round 3 table above.

> A flat vector-style app icon emblem, isolated on a flat pure solid black background with no gradient, glow, shadow or texture outside the emblem, no text, no letters, no border, centred, filling about 70 percent of the frame, bold simple shapes readable at a very small size. The emblem: a single warm amber (#FFB020) silhouette combining a full-face motocross helmet in profile facing right, sitting above and overlapping a spoked motorcycle wheel with a knobbly tyre, two-tone amber and darker burnt orange, thick strokes, no thin lines.

### app-icon-v2 (1024x1024, icon)
**rejected** - see the round 3 table above (spare emblem).

> A flat vector-style app icon emblem, isolated on a flat pure solid black background with no gradient, glow, shadow or texture outside the emblem, no text, no letters, no border, centred, filling about 70 percent of the frame, bold simple shapes readable at a very small size. The emblem: a bold amber (#FFB020) circle badge in the shape of a knobbly motorcycle tyre with chunky tread blocks around its rim, and inside it a black full-face motocross helmet in profile facing right with an amber visor slot, flat two-colour, thick strokes.

### results-garage (1536x1024, results-bg, garage)
shipped as `art/menu/results-garage.webp`

> Cinematic photoreal video-game key art, grounded and moody, physically plausible lighting with volumetric dust and haze, sharp detail, natural film grade. No text, no lettering, no logos, no watermark, no cartoon or illustration style, no UI. inside a dark motorcycle workshop bay at night: black rubber floor with faint scuffs, a grey steel roller shutter and pegboard tool wall in shadow behind, one warm amber work lamp overhead and a cool white LED strip low along the floor, faint haze, tool chests and tyre stacks softly out of focus in the background. The bay after a session: a parked dark trials motorcycle far in the right third of the frame in the lamp light, a helmet and gloves on the bench, the left half of the frame dark near-empty floor and wall as negative space for a menu panel, calm and dim.

### results-credits (1536x1024, results-bg, credits)
shipped as `art/menu/results-credits.webp`

> Cinematic photoreal video-game key art, grounded and moody, physically plausible lighting with volumetric dust and haze, sharp detail, natural film grade. No text, no lettering, no logos, no watermark, no cartoon or illustration style, no UI. inside a vast old industrial warehouse: stacked rusted shipping containers, plywood kickers, pallets and oil drums, gantry crane rails and hook blocks overhead, riveted steel trusses, amber sodium high-bay lamps, shafts of dusty late light through a big bank of high windows, wet stained concrete floor. Long after the race: the empty warehouse course seen from the finish line looking back down it, tyre marks on the plywood, a checkered banner hanging still, a single hanging lamp lit, dust settling, everything else fading to black, the left two thirds of the frame dark negative space for scrolling text.

### medal-bronze-v2 (1024x1024, medal, bronze)
shipped as `art/menu/medal-bronze-512.png + medal-bronze.png (256)`

> A single round racing medal, warm dark bronze with copper highlights and a slightly worn patina, on a short deep-red and bronze striped ribbon, embossed with a motorcycle wheel with knobbly tyre in the centre surrounded by a laurel wreath, a thin beaded rim, viewed straight on and perfectly centred. The ribbon is a short folded V of fabric attached to a small ring at the top of the medal, occupying only the top fifth of the frame and never touching the frame edge. The medal disc fills about 65 percent of the frame width. No text, no numbers, studio product lighting with soft reflections, photoreal, isolated on a flat pure solid black background with no gradient, no glow and no shadow outside the medal and ribbon.

### medal-silver-v2 (1024x1024, medal, silver)
shipped as `art/menu/medal-silver-512.png + medal-silver.png (256)`

> A single round racing medal, bright brushed silver with cool white highlights, on a short navy and silver striped ribbon, embossed with a motorcycle wheel with knobbly tyre in the centre surrounded by a laurel wreath, a thin beaded rim, viewed straight on and perfectly centred. The ribbon is a short folded V of fabric attached to a small ring at the top of the medal, occupying only the top fifth of the frame and never touching the frame edge. The medal disc fills about 65 percent of the frame width. No text, no numbers, studio product lighting with soft reflections, photoreal, isolated on a flat pure solid black background with no gradient, no glow and no shadow outside the medal and ribbon.

### medal-gold-v2 (1024x1024, medal, gold)
shipped as `art/menu/medal-gold-512.png + medal-gold.png (256)`

> A single round racing medal, rich polished gold with deep warm reflections, on a short crimson and gold striped ribbon, embossed with a motorcycle wheel with knobbly tyre in the centre surrounded by a laurel wreath, a thin beaded rim, viewed straight on and perfectly centred. The ribbon is a short folded V of fabric attached to a small ring at the top of the medal, occupying only the top fifth of the frame and never touching the frame edge. The medal disc fills about 65 percent of the frame width. No text, no numbers, studio product lighting with soft reflections, photoreal, isolated on a flat pure solid black background with no gradient, no glow and no shadow outside the medal and ribbon.

### medal-platinum-v2 (1024x1024, medal, platinum)
shipped as `art/menu/medal-platinum-512.png + medal-platinum.png (256)`

> A single round racing medal, pale icy platinum with a faint blue-white sheen and a jewelled rim, on a short ice-blue and white striped ribbon, embossed with a motorcycle wheel with knobbly tyre in the centre surrounded by a laurel wreath, a thin beaded rim, viewed straight on and perfectly centred. The ribbon is a short folded V of fabric attached to a small ring at the top of the medal, occupying only the top fifth of the frame and never touching the frame edge. The medal disc fills about 65 percent of the frame width. No text, no numbers, studio product lighting with soft reflections, photoreal, isolated on a flat pure solid black background with no gradient, no glow and no shadow outside the medal and ribbon.

## Round 3b prompts (home-screen icon candidates)

### icon-a-helmet-wheel (1024x1024, icon)
**rejected** - see the round 3 table above.

> A square mobile app icon, opaque, flat near-black (#0a0b0e) background filling the whole frame with no rounded corners, no border, no drop shadow, no text unless asked, all key content inside the central 80 percent, bold simple shapes with thick strokes that stay readable at 60 pixels, flat vector style with at most three colours. Emblem: a warm amber (#FFB020) full-face motocross helmet in profile facing right, its chin bar sitting on top of a big amber knobbly front wheel whose chunky tread blocks make a saw-toothed circle, a darker burnt-orange (#C9641A) shadow side on both, over a very subtle amber radial glow fading into the black around the emblem.

### icon-b-wheelie (1024x1024, icon)
shipped as `art/icons/*` (see the round 3b pick above)

> A square mobile app icon, opaque, flat near-black (#0a0b0e) background filling the whole frame with no rounded corners, no border, no drop shadow, no text unless asked, all key content inside the central 80 percent, bold simple shapes with thick strokes that stay readable at 60 pixels, flat vector style with at most three colours. Emblem: the bold silhouette of a trials rider standing on the pegs of a trials motorcycle mid-wheelie, front wheel high, in solid warm amber (#FFB020) on a dark gradient from near-black at the top to deep charcoal-brown at the bottom, one thick amber ground stroke under the rear wheel, no other detail.

### icon-c-monogram (1024x1024, icon)
**rejected** - see the round 3 table above.

> A square mobile app icon, opaque, flat near-black (#0a0b0e) background filling the whole frame with no rounded corners, no border, no drop shadow, no text unless asked, all key content inside the central 80 percent, bold simple shapes with thick strokes that stay readable at 60 pixels, flat vector style with at most three colours. Emblem: a chunky two-letter monogram "TG" in a heavy condensed italic sans-serif (like Barlow Condensed Black Italic), warm amber (#FFB020) letters with a darker burnt-orange (#C9641A) offset shadow, overlapping slightly, sitting on a horizontal band of black knobbly-tyre tread blocks that crosses the icon behind the letters; only the two letters T and G, nothing else.
