// Every generation prompt for the Trials art pack. `node assets/art/prompts.mjs > jobs.json` emits the job list
// consumed by generate.mjs. Names double as asset ids in public/art/manifest.json.

const CINE = 'Cinematic photoreal video-game key art, grounded and moody, physically plausible lighting with volumetric dust and haze, sharp detail, natural film grade. No text, no lettering, no logos, no watermark, no cartoon or illustration style, no UI.';
const BIKE = 'a trials motorcycle (small light frame, no seat, long-travel forks, knobbly tyres) with a rider in dark armoured gear and full-face helmet standing on the footpegs';

export const BIOME_LOOK = {
  industrial: 'inside a vast old industrial warehouse: stacked rusted shipping containers, plywood kickers, pallets and oil drums, gantry crane rails and hook blocks overhead, riveted steel trusses, amber sodium high-bay lamps, shafts of dusty late light through a big bank of high windows, wet stained concrete floor',
  canyon: 'a red sandstone canyon at sunset: layered mesa silhouettes in peach haze, low blown-out sun, long shadows, hay bales, stacked tyres and weathered timber obstacles on dry dirt, dust hanging in the light',
  snow: 'a snowbound timber yard at blue dusk: dense blue-white fog, snow-capped pines, warm yellow lamp posts, snow-lidded crates and log stacks, falling snow, blue moonlight against warm lamp light',
  nightCity: 'a rain-wet city street at night: neon glow in magenta, cyan and yellow reflected in wet asphalt, street lights with soft cones, fire barrels, steam from grates, dark towers with scattered lit windows behind, grey-green night grade',
  foundry: 'inside a working foundry at night: molten metal channels and glowing pillars under-lighting everything orange-red, black steel walkways and grates, ladles and pipe runs, floating embers, heavy heat haze, the only dark shapes are steel and the bike',
};

const TIER_BIOME = { beginner: 'industrial', easy: 'canyon', medium: 'snow', hard: 'nightCity', extreme: 'foundry' };

export const TRACKS = [
  { id: 'b1-first-ride', name: 'First Ride', tier: 'beginner', biome: 'industrial', scene: 'a long gentle dirt-and-plank descent along a warehouse floor into a small speed hump and a low flat plateau of pallets, empty and inviting, calm amber light' },
  { id: 'b2-lean-back', name: 'Lean Back', tier: 'beginner', biome: 'industrial', scene: 'a 1.8 metre drop off the end of a rusted shipping container onto a downslope of plywood sheets, seen from the side, the lip of the drop lit by a hanging high-bay lamp' },
  { id: 'b3-kicker-row', name: 'Kicker Row', tier: 'beginner', biome: 'industrial', scene: 'a row of plywood kicker ramps with gaps between them running down the warehouse floor, dust drifting through amber light shafts, tyre marks on the plywood' },
  { id: 'e1-uphill-weight', name: 'Uphill Weight', tier: 'easy', biome: 'canyon', scene: 'a steep 48 degree timber plank ramp climbing onto a sandstone shelf, then a long ramp descending on the far side, golden hour, dust' },
  { id: 'e2-rear-wheel-first', name: 'Rear Wheel First', tier: 'easy', biome: 'canyon', scene: 'a long timber box platform standing in the canyon with a gap before it and a kicker ramp on top launching to a second gap, low sun behind, hay bales at the base' },
  { id: 'e3-stairway', name: 'Stairway', tier: 'easy', biome: 'canyon', scene: 'a flight of seven steep railway-sleeper steps climbing a sandstone face and a longer flight descending the other side toward a gap, raking sunset light across the treads' },
  { id: 'm1-hop-up', name: 'Hop Up', tier: 'medium', biome: 'industrial', scene: 'a staircase of tall concrete blocks and steel ledges about a metre high each with a gap between the last two, under hanging chains and hook tyres, dusty amber light' },
  { id: 'm2-drum-roll', name: 'Drum Roll', tier: 'medium', biome: 'snow', scene: 'huge rusted steel drums lying on their sides on a snowy shelf next to a three-row pyramid of snow-dusted logs and a timber box, lamp posts glowing in fog' },
  { id: 'm3-see-saw', name: 'See-Saw', tier: 'medium', biome: 'foundry', scene: 'a long steel see-saw plank on a pivot spanning a gap between narrow plank landings and steel boxes over a molten channel, orange glow from below' },
  { id: 'h1-wheelie-wire', name: 'Wheelie Wire', tier: 'hard', biome: 'nightCity', scene: 'a steep 1.4 metre lip climb straight into a row of five thin steel rails over a gap, wet with rain, neon reflections on the rails, street lights behind' },
  { id: 'h2-gap-chain', name: 'Gap Chain', tier: 'hard', biome: 'nightCity', scene: 'a chain of seven small kicker platforms separated by gaps running down a rain-wet street, the last a see-saw, neon colour pooling in every puddle' },
  { id: 'h3-fire-line', name: 'Fire Line', tier: 'hard', biome: 'foundry', scene: 'six oil barrels burning in a line along a black steel walkway after a kicker ramp and a gap, embers streaming up, a kerb step at the far end' },
  { id: 'x1-vertical-limit', name: 'Vertical Limit', tier: 'extreme', biome: 'snow', scene: 'a near-vertical 60 degree wooden wall rising from a snowy run-in, beyond it three tall wooden poles with tiny flat caps standing 4.5 metres high, then a downhill plank, blizzard, blue dusk' },
  { id: 'x2-pipe-dream', name: 'Pipe Dream', tier: 'extreme', biome: 'foundry', scene: 'a see-saw dropping onto a shelf of huge spinning steel pipe drums separated by gaps over molten metal, chains and pipe runs above, hellish orange heat' },
  { id: 'x3-gauntlet', name: 'The Gauntlet', tier: 'extreme', biome: 'foundry', scene: 'a monstrous obstacle course receding into the fire-lit distance: kicker, steep plank, stairs, spinning drums, see-saw, tall poles, burning barrels and thin rails, all in one line, the whole foundry roaring behind' },
];

const jobs = [];
const add = (name, size, prompt, tags = {}) => jobs.push({ name, size, prompt, ...tags });

// ---- 1. Title / menus --------------------------------------------------------------------------
add('keyart-industrial', '1536x1024', `${CINE} Low angle ${BIOME_LOOK.industrial}. Hero shot: ${BIKE}, mid-air over a gap between two stacked containers, bike pitched slightly nose-up, rear wheel trailing a plume of dust, rider silhouetted against a blown-out window bank, a hook block hanging in the haze above. Bike occupies about a third of the frame, left of centre, lots of room on the right.`, { kind: 'keyart', biome: 'industrial' });
add('keyart-canyon', '1536x1024', `${CINE} ${BIOME_LOOK.canyon}. Hero shot: ${BIKE}, dropping off a tall sandstone ledge straight toward camera-left, silhouetted against the setting sun with a bright rim light, dust pouring off the ledge, three receding mesa planes fading pinker into the haze, a small checkered finish banner far below. Wide cinematic composition, rider in the upper right third.`, { kind: 'keyart', biome: 'canyon' });
add('keyart-nightcity', '1536x1024', `${CINE} ${BIOME_LOOK.nightCity}. Hero shot: ${BIKE}, holding a high wheelie along a wet street, front wheel raised, magenta and cyan neon shapes (abstract glowing tubes, no readable words) reflected in the asphalt under the bike, a fire barrel throwing sparks to the left, steam catching the light, low camera almost at road level. Rider in the left third moving right.`, { kind: 'keyart', biome: 'nightCity' });
add('wordmark-plate', '1536x1024', `${CINE} A dark abstract background plate for a game title logo to sit on: near-black scuffed steel sheet and stained concrete with subtle rust grime and faint scratches, one soft amber sodium light falling off from the top-left corner into shadow, thin haze, heavy vignette, nothing recognisable, no objects, completely empty centre.`, { kind: 'plate-menu' });
add('loading-plate', '1536x1024', `${CINE} ${BIOME_LOOK.industrial}. A single parked trials motorcycle seen side-on as a dark silhouette in the haze under one hanging amber lamp, far away and small in the middle of a huge empty warehouse floor, everything else falling into darkness, the lower third of the frame plain dark floor with nothing in it.`, { kind: 'plate-menu' });

for (const [tier, biome] of Object.entries(TIER_BIOME)) {
  const mood = {
    beginner: `A calm welcoming moment: ${BIKE}, stopped at the top of a low plywood kicker, one foot down, looking down the empty course, warm late light through the windows, dust motes.`,
    easy: `A confident moment: ${BIKE}, cresting a steep timber plank onto a sandstone shelf in golden light, dust trailing, big open sky above, low sun to the side.`,
    medium: `A tense balancing moment: ${BIKE}, balanced on the top of a huge rusted steel drum on a snowy log stack, fog swallowing the yard behind, snow falling through warm lamp light.`,
    hard: `A committed moment: ${BIKE}, mid-wheelie riding along thin steel rails over a gap between rain-wet platforms at night, neon reflections in every puddle, a fire barrel below.`,
    extreme: `A threatening moment: ${BIKE}, climbing a near-vertical steel plank over spinning drums and burning barrels, molten metal glowing below, embers streaming up, heat haze, the rider a black shape against the fire.`,
  }[tier];
  add(`tier-${tier}`, '1024x1536', `${CINE} Tall portrait composition. ${BIOME_LOOK[biome]}. ${mood} The rider sits in the upper half of the frame, the lower quarter is quieter and darker.`, { kind: 'tier-card', tier, biome });
}

for (const t of TRACKS) {
  add(`track-${t.id}`, '1536x1024', `${CINE} An empty obstacle set-piece for a trials motorcycle course, no rider, no bike, seen from the side at rider height so the course reads left to right. ${BIOME_LOOK[t.biome]}. The set-piece: ${t.scene}.`, { kind: 'track-card', track: t.id, tier: t.tier, biome: t.biome });
}

for (const [medal, look] of Object.entries({
  bronze: 'warm dark bronze with copper highlights and a slightly worn patina',
  silver: 'bright brushed silver with cool white highlights',
  gold: 'rich polished gold with deep warm reflections',
  platinum: 'pale icy platinum with a faint blue-white sheen and a jewelled rim',
})) {
  add(`medal-${medal}`, '1024x1024', `A single round racing medal, ${look}, embossed with a motorcycle wheel with knobbly tyre in the centre surrounded by a laurel wreath, a thin beaded rim, viewed straight on and perfectly centred, filling about 80 percent of the frame, no ribbon, no text, no numbers, studio product lighting with soft reflections, photoreal, isolated on a flat pure solid black background with no gradient, no glow and no shadow outside the medal.`, { kind: 'medal', medal });
}

for (const [biome, look] of Object.entries(BIOME_LOOK)) {
  add(`results-${biome}`, '1536x1024', `${CINE} ${look}. The finish area of a trials course: a simple checkered finish banner on two posts (no words), stacked tyres and a couple of hay bales, deserted after the race, calm and dim, slightly soft focus, the left half of the frame is dark near-empty negative space for a results panel, the point of interest sits in the right third.`, { kind: 'results-bg', biome });
}

// ---- 2. World decals ---------------------------------------------------------------------------
const STENCIL = 'A flat graphic in pure white on a flat pure black background, no grey, no shading, no perspective, no colour, worn spray-stencil edges with a little paint spatter, nothing else in the frame.';
[
  ['stencil-hkr', `shipping-container owner markings: a blocky industrial stencil monogram "HKR" above the serial "HKRU 448 213 7" and a size code "22G1"`],
  ['stencil-nordvik', `shipping-container owner markings: the word "NORDVIK" in tall condensed stencil capitals with a small stylised wave mark, serial "NVKU 205 771 3" beneath`],
  ['stencil-taro', `shipping-container owner markings: "TARO FREIGHT" in two lines of bold stencil letters inside a thin rounded rectangle, serial "TRFU 913 004 8" below`],
  ['stencil-apex', `shipping-container owner markings: a triangle-and-chevron emblem with the word "APEX MARINE" below it in stencil letters, small serial "APXU 331 620 5"`],
  ['stencil-weights', `a container weight table in stencil letters: rows reading "MAX GROSS 30480 KG", "TARE 2250 KG", "NET 28230 KG", "CU CAP 33.2 CBM", left aligned, monospaced industrial font`],
  ['stencil-hazard', `a hazard diamond with a small flame pictogram and the number "3" at the bottom, next to a "DO NOT STACK" pictogram of crossed-out boxes and a "THIS WAY UP" pair of arrows`],
  ['stencil-serial', `one very large container serial "OCTU 771 902 4" in two lines of heavy stencil digits with a small boxed check digit, plus a small "ISO 668" tag`],
  ['stencil-arrows', `a tall stack of forklift-pocket pictograms: two hollow chevron arrows pointing down, a "LIFT HERE" hook symbol, and a row of four small tie-down anchor icons`],
].forEach(([n, p]) => add(n, '1024x1024', `${STENCIL} Content: ${p}.`, { kind: 'stencil' }));

const MASK = 'A grayscale texture mask on a flat pure black background: white where the effect is, black where it is not, soft grey only at the feathered edges, no colour, no perspective, no objects, seamless edge to edge.';
add('mask-rust-streaks', '1024x1024', `${MASK} Content: long vertical rust streaks running down from the top edge, thick at the top thinning into drips, uneven spacing, some streaks reaching the bottom.`, { kind: 'mask' });
add('mask-rivet-drips', '1024x1024', `${MASK} Content: a horizontal row of small round rivet stains near the top, each with a short tapering drip running downward, a faint spatter halo around each rivet.`, { kind: 'mask' });
add('mask-grime-spatter', '1024x1024', `${MASK} Content: scattered mud and oil spatter, dense clusters of small blobs and a few large splats with fine droplets around them, denser toward the bottom edge.`, { kind: 'mask' });
add('mask-edge-grime', '1024x1024', `${MASK} Content: dirt gathered in the corners and along all four edges of the square, fading to black in the middle, with cracked-paint flakes along the edges.`, { kind: 'mask' });

const SIGN = 'A flat front-on photograph of a printed sign filling the whole frame edge to edge, no border of wall visible, evenly lit, slightly weathered with scratches and a little rust bleed, photoreal.';
add('sign-hard-hat', '1024x1024', `${SIGN} A yellow-and-black industrial safety sign: a helmet pictogram with the words "HARD HAT AREA" and smaller "AUTHORISED PERSONNEL ONLY".`, { kind: 'sign' });
add('sign-overhead-crane', '1024x1024', `${SIGN} A red-and-white industrial warning sign: a crane hook pictogram with the words "DANGER OVERHEAD CRANE" and a smaller line "KEEP CLEAR OF LOADS".`, { kind: 'sign' });
add('sign-forklift', '1024x1024', `${SIGN} A yellow warning sign: a forklift pictogram inside a black triangle with the words "FORKLIFT TRAFFIC" and "LOOK BOTH WAYS".`, { kind: 'sign' });
add('sign-exit', '1024x1024', `${SIGN} A green emergency exit sign: running-figure pictogram, a door, an arrow pointing right, and the word "EXIT", scuffed acrylic.`, { kind: 'sign' });
add('poster-trials-night', '1024x1536', `${SIGN} A torn weathered event poster pasted on a wall: a dark dramatic photo of a trials motorcycle wheelie with orange headline lettering "TRIALS NIGHT" and smaller lines "HALL 4 - GATES 7PM" and "FREE ENTRY", halftone print texture, corners peeling.`, { kind: 'sign' });
add('poster-tyres', '1024x1536', `${SIGN} A faded vintage advertising poster for a fictional tyre brand "KESTREL TYRES" with a bold bird emblem and a knobbly motorcycle tyre, cream and dark red palette, sun-bleached and water-stained, halftone print texture.`, { kind: 'sign' });

const GRAF = 'A single graffiti piece painted in spray paint, isolated on a flat pure black background with nothing else, viewed straight on, photoreal paint texture with drips and overspray, the piece fills most of the frame.';
add('graffiti-rise', '1024x1024', `${GRAF} A wildstyle piece reading "RISE" in orange and cream with dark outlines and a cyan 3D shadow.`, { kind: 'graffiti' });
add('graffiti-grind', '1024x1024', `${GRAF} A chunky bubble-letter throw-up reading "GRIND" in silver chrome fill with a black outline and a red drop shadow.`, { kind: 'graffiti' });
add('graffiti-nofear', '1024x1024', `${GRAF} A tall blocky piece reading "NO FEAR" in two lines, hot pink and yellow fill with white highlights and heavy drips.`, { kind: 'graffiti' });
add('graffiti-skull', '1024x1024', `${GRAF} A stencilled character piece: a grinning skull wearing a motocross helmet, black and white with a splash of red, sharp stencil edges.`, { kind: 'graffiti' });
add('graffiti-tag-wall', '1024x1024', `${GRAF} A cluster of overlapping hand-style marker and spray tags in white, silver and red, illegible scrawls, a few small arrows and stars.`, { kind: 'graffiti' });
add('graffiti-wheel', '1024x1024', `${GRAF} A round crew emblem piece: a stylised spoked motorcycle wheel with flames, teal and orange, with the crew name "HKR CREW" curved around the top.`, { kind: 'graffiti' });

const BANNER = 'A flat front-on photograph of a printed vinyl sponsor banner filling the whole frame edge to edge, eyelets along the top edge, slight creases and dirt, evenly lit, photoreal, fictional brand.';
add('banner-vortex-oil', '1536x1024', `${BANNER} Dark navy banner with a bold white swirl emblem and the words "VORTEX OIL" in heavy italic capitals, a thin orange stripe along the bottom.`, { kind: 'banner' });
add('banner-kestrel-tyres', '1536x1024', `${BANNER} Cream banner with a dark red bird-of-prey emblem and "KESTREL TYRES" in bold condensed letters, small "GRIP EVERYTHING" tagline.`, { kind: 'banner' });
add('banner-nordvik', '1536x1024', `${BANNER} Cool grey banner with a stylised blue wave and "NORDVIK" in tall clean capitals, a smaller "SHIPPING AND FREIGHT" line.`, { kind: 'banner' });
add('banner-apex-suspension', '1536x1024', `${BANNER} Black banner with a yellow triangle emblem and "APEX SUSPENSION" in angular capitals, a thin yellow chevron pattern along both ends.`, { kind: 'banner' });
add('banner-bolt-energy', '1536x1024', `${BANNER} Electric green banner with a white lightning bolt and "BOLT ENERGY" in punchy rounded capitals, with a repeated small bolt pattern.`, { kind: 'banner' });
add('banner-ironworks-series', '1536x1024', `${BANNER} Rust-orange banner with a black cog-and-wheel emblem and "IRONWORKS TRIALS SERIES" in industrial stencil capitals, with a checkered strip along the bottom.`, { kind: 'banner' });

add('tyremark-straight', '1024x1024', `${MASK} Content: a single straight knobbly motorcycle tyre skid mark running from the bottom edge to the top edge, a repeating block tread pattern visible, darker and broken at the ends, slight wobble.`, { kind: 'mask' });
add('tyremark-arc', '1024x1024', `${MASK} Content: a curving motorcycle burnout arc sweeping from the bottom-left to the right edge, heavy smeared rubber in the middle of the arc with tread blocks visible at the ends.`, { kind: 'mask' });

const CROWD = 'A row of exactly eight adult spectators standing shoulder to shoulder in one line, full body from feet to head, all facing the camera, photographed straight on at chest height with an even flat light, evenly spaced and not overlapping, feet on the bottom edge, on a completely flat uniform bright green chroma-key background with no floor line, no shadows on the background, photoreal.';
add('crowd-day', '1536x1024', `${CROWD} Daytime motorsport fans: caps, sunglasses, t-shirts and hoodies, one holding a small plain checkered flag, one clapping, one holding up a phone, one with arms crossed, mixed ages and builds. No green clothing.`, { kind: 'crowd', time: 'day' });
add('crowd-night', '1536x1024', `${CROWD} Night-time motorsport fans in jackets and beanies, lit warm from the front as if by floodlights, one holding a glowing orange flare, one with a raised fist, one holding a plain foam finger, one filming with a phone, mixed ages and builds. No green clothing.`, { kind: 'crowd', time: 'night' });

// ---- 3. Parallax plates ------------------------------------------------------------------------
const PANO = 'A seamless horizontal panorama that tiles left to right (the far left edge continues into the far right edge), painted for use as a distant parallax backdrop behind a side-scrolling game. Composed as a wide strip: every silhouette and point of interest sits in the horizontal middle band of the frame, the top third is plain sky gradient and the bottom third is plain flat atmospheric haze with no ground detail. Atmospheric perspective in three depth tiers, no foreground objects, no text, photoreal matte-painting quality.';
add('plate-canyon', '1536x1024', `${PANO} Content: layered red sandstone mesas and buttes at sunset, three tiers fading pinker and paler into peach haze, a low sun glow on the horizon, a few distant saguaro cacti as tiny silhouettes.`, { kind: 'plate-far', biome: 'canyon' });
add('plate-snow', '1536x1024', `${PANO} Content: a ridgeline of snow-capped pines and rounded snowy hills in dense blue-white fog at dusk, a few tiny warm yellow window lights of a distant village, three depth tiers.`, { kind: 'plate-far', biome: 'snow' });
add('plate-nightcity', '1536x1024', `${PANO} Content: a night city skyline, dark towers with scattered lit windows, magenta and cyan neon glow bleeding into low cloud, water towers and cranes on rooftops, three depth tiers, no readable signs.`, { kind: 'plate-far', biome: 'nightCity' });
add('plate-foundry', '1536x1024', `${PANO} Content: the far end of a foundry at night, tall chimneys and blast-furnace towers as black silhouettes against an orange-red glow, sparks and smoke plumes lit from below, pipe bridges, three depth tiers of heat haze.`, { kind: 'plate-far', biome: 'foundry' });
add('plate-industrial', '1536x1024', `${PANO} Content: the distant interior bays of a huge old warehouse: rows of riveted steel columns and roof trusses receding, stacks of shipping containers, a far window bank glowing amber through dust haze, hanging lamps, three depth tiers of haze.`, { kind: 'plate-far', biome: 'industrial' });

const SKY = 'A seamless horizontal panorama of a sky only that tiles left to right (the far left edge continues into the far right edge), no ground, no horizon objects, no buildings, no text, painted for use as the farthest backdrop layer of a game. Photoreal matte-painting quality.';
add('sky-canyon', '1536x1024', `${SKY} Content: a sunset sky, peach and salmon near the bottom rising to dusty violet, thin streaks of lit cirrus, brighter glow low in the frame slightly left of centre.`, { kind: 'sky', biome: 'canyon' });
add('sky-snow', '1536x1024', `${SKY} Content: a flat overcast blue-grey winter dusk sky, soft featureless fog gradient, slightly brighter along the bottom, faint falling snow specks.`, { kind: 'sky', biome: 'snow' });
add('sky-nightcity', '1536x1024', `${SKY} Content: a night sky over a city, low cloud underlit with faint magenta and orange light pollution near the bottom, dark blue-black above, no stars visible.`, { kind: 'sky', biome: 'nightCity' });
add('sky-foundry', '1536x1024', `${SKY} Content: a smoky night sky above a foundry, heavy dark smoke layers underlit orange-red from below fading to black at the top, drifting embers.`, { kind: 'sky', biome: 'foundry' });
add('sky-industrial', '1536x1024', `${SKY} Content: the upper interior of a huge warehouse seen from below: a dark riveted roof with skylight strips glowing amber through dust haze, roof trusses in silhouette, no walls, uniform across the width.`, { kind: 'sky', biome: 'industrial' });

// ---- Round 2: regenerations of rejected candidates (see PROMPTS.md for why) ----------------------
add('stencil-apex-v2', '1024x1024', `${STENCIL} Content: shipping-container owner markings laid out in three clear rows with generous spacing: top row a simple hollow triangle outline with a single chevron inside it; middle row the words "APEX MARINE" in large bold stencil capitals, crisp and fully legible; bottom row the smaller serial "APXU 331 620 5". Clean stencil lettering with only light wear, never smudged.`, { kind: 'stencil' });
add('stencil-taro-v2', '1024x1024', `${STENCIL} Content: shipping-container owner markings: the words "TARO" on one line and "FREIGHT" on the line below in very large bold stencil capitals, crisp and fully legible, no box or frame around them, then the smaller serial "TRFU 913 004 8" underneath. Clean stencil lettering with only light wear, never smudged.`, { kind: 'stencil' });
add('tyremark-straight-v2', '1024x1024', `${MASK} Content: one straight motocross knobbly-tyre track running vertically from the bottom edge to the top edge, about one fifth of the frame wide, made of a regular repeating pattern of rectangular tread-block prints (two staggered columns of blocks), the prints fading and breaking up toward both ends, a light smear of grey rubber between the blocks.`, { kind: 'mask' });
add('mask-rivet-drips-v2', '1024x1024', `${MASK} Content: a horizontal row of six large round rivet rust stains near the top edge, each about one twelfth of the frame wide, and from each a long bold tapering rust drip running two thirds of the way down the frame in soft grey, with a faint spatter halo around each rivet.`, { kind: 'mask' });
add('mask-rust-streaks-v2', '1024x1024', `${MASK} Content: rain-washed rust streaking running down from the top edge in many thin uneven vertical streaks of varied grey intensity, mostly soft mid-grey and semi-transparent looking, only a few bright white cores, thick and bright at the top thinning and fading before the bottom, with fine drip tails, like weathered painted steel.`, { kind: 'mask' });
add('tyremark-straight-v3', '1024x1024', `A black-and-white texture mask seen from directly above: a single straight dirt-bike tyre print pressed into mud, running vertically through the whole frame from the bottom edge to the top edge and about one third of the frame wide. The tread-block prints are pure white, everything else is flat pure black, no grey background, no perspective. The knobbly tread is a bold repeating pattern of big rectangular blocks in staggered rows, the print fading and breaking up near the top and bottom edges.`, { kind: 'mask' });


// ---- Round 3: garage, icons, results plates, medal masters (art round 2, see PROMPTS.md) -----------
const GARAGE = 'inside a dark motorcycle workshop bay at night: black rubber floor with faint scuffs, a grey steel roller shutter and pegboard tool wall in shadow behind, one warm amber work lamp overhead and a cool white LED strip low along the floor, faint haze, tool chests and tyre stacks softly out of focus in the background';
add('bike-rookie', '1536x1024', `${CINE} ${GARAGE}. Hero product shot of one parked trials motorcycle (small light frame, no seat, long-travel forks, knobbly tyres) seen side-on from slightly in front of the left, no rider, no stand, resting on both wheels. Livery: glossy royal blue and white two-tone with soft rounded fairing panels, white rims, blue fork guards, friendly trainer look, gentle amber highlights on the tank. Bike centred and large, the lower fifth of the frame quiet floor.`, { kind: 'bike', bike: 'rookie' });
add('bike-rookie-v2', '1536x1024', `${CINE} ${GARAGE}. Hero product shot of one parked trials motorcycle (small light frame, no seat, long-travel forks, knobbly tyres) seen three-quarter front from the left, no rider, no stand. Livery: matte sky blue and white panels, white rims, a thin white stripe along the frame spar, clean and approachable, a trainer bike. Bike centred and large, the lower fifth of the frame quiet floor.`, { kind: 'bike', bike: 'rookie' });
add('bike-pro', '1536x1024', `${CINE} ${GARAGE}. Hero product shot of one parked trials motorcycle (small light frame, no seat, long-travel forks, knobbly tyres) seen side-on from slightly in front of the left, no rider, no stand, resting on both wheels. Livery: dark graphite carbon-look panels with sharp fluorescent orange race trim, black rims with an orange rim stripe, gold-anodised forks, aggressive angular bodywork, a race bike. Bike centred and large, the lower fifth of the frame quiet floor.`, { kind: 'bike', bike: 'pro' });
add('bike-pro-v2', '1536x1024', `${CINE} ${GARAGE}. Hero product shot of one parked trials motorcycle (small light frame, no seat, long-travel forks, knobbly tyres) seen three-quarter front from the left, no rider, no stand. Livery: satin black graphite with a broad orange slash across the tank and fork guards, black rims, titanium exhaust, taut and mean, a race bike. Bike centred and large, the lower fifth of the frame quiet floor.`, { kind: 'bike', bike: 'pro' });
add('garage-plate', '1536x1024', `${CINE} ${GARAGE}. Wide empty establishing shot of the bay with no motorcycle in it: a clear rubber floor in the centre lit by the overhead work lamp, a workbench with tools and a tyre stack on the left, a tool chest and a hanging helmet on the right, a roller shutter and pegboard behind, the centre third of the frame empty floor and wall so a bike can be composited there.`, { kind: 'garage-plate' });
const KIT = 'A flat seamless textile pattern swatch filling the whole frame edge to edge, seen straight on with no perspective, no folds, no body, no logos, no text, evenly lit, crisp vector-like print on a matte jersey fabric with a very fine knit texture.';
add('kit-rookie', '1024x1024', `${KIT} Rookie rider kit: royal blue ground with broad diagonal white bands and thin sky-blue pinstripes, a scattering of small white chevrons, clean and friendly.`, { kind: 'kit', bike: 'rookie' });
add('kit-pro', '1024x1024', `${KIT} Pro rider kit: near-black graphite ground with a carbon weave texture, jagged fluorescent orange slashes and thin grey hex-grid lines, aggressive race look.`, { kind: 'kit', bike: 'pro' });
const ICON = 'A flat vector-style app icon emblem, isolated on a flat pure solid black background with no gradient, glow, shadow or texture outside the emblem, no text, no letters, no border, centred, filling about 70 percent of the frame, bold simple shapes readable at a very small size.';
add('app-icon', '1024x1024', `${ICON} The emblem: a single warm amber (#FFB020) silhouette combining a full-face motocross helmet in profile facing right, sitting above and overlapping a spoked motorcycle wheel with a knobbly tyre, two-tone amber and darker burnt orange, thick strokes, no thin lines.`, { kind: 'icon' });
add('app-icon-v2', '1024x1024', `${ICON} The emblem: a bold amber (#FFB020) circle badge in the shape of a knobbly motorcycle tyre with chunky tread blocks around its rim, and inside it a black full-face motocross helmet in profile facing right with an amber visor slot, flat two-colour, thick strokes.`, { kind: 'icon' });
add('results-garage', '1536x1024', `${CINE} ${GARAGE}. The bay after a session: a parked dark trials motorcycle far in the right third of the frame in the lamp light, a helmet and gloves on the bench, the left half of the frame dark near-empty floor and wall as negative space for a menu panel, calm and dim.`, { kind: 'results-bg', biome: 'garage' });
add('results-credits', '1536x1024', `${CINE} ${BIOME_LOOK.industrial}. Long after the race: the empty warehouse course seen from the finish line looking back down it, tyre marks on the plywood, a checkered banner hanging still, a single hanging lamp lit, dust settling, everything else fading to black, the left two thirds of the frame dark negative space for scrolling text.`, { kind: 'results-bg', biome: 'credits' });
for (const [medal, look] of Object.entries({
  bronze: 'warm dark bronze with copper highlights and a slightly worn patina, on a short deep-red and bronze striped ribbon',
  silver: 'bright brushed silver with cool white highlights, on a short navy and silver striped ribbon',
  gold: 'rich polished gold with deep warm reflections, on a short crimson and gold striped ribbon',
  platinum: 'pale icy platinum with a faint blue-white sheen and a jewelled rim, on a short ice-blue and white striped ribbon',
})) {
  add(`medal-${medal}-v2`, '1024x1024', `A single round racing medal, ${look}, embossed with a motorcycle wheel with knobbly tyre in the centre surrounded by a laurel wreath, a thin beaded rim, viewed straight on and perfectly centred. The ribbon is a short folded V of fabric attached to a small ring at the top of the medal, occupying only the top fifth of the frame and never touching the frame edge. The medal disc fills about 65 percent of the frame width. No text, no numbers, studio product lighting with soft reflections, photoreal, isolated on a flat pure solid black background with no gradient, no glow and no shadow outside the medal and ribbon.`, { kind: 'medal', medal });
}

// ---- Round 3b: home-screen icon candidates (iOS composites onto black, masks its own corners: opaque near-black, content inside the inner 80 %) ----
const APPICON = 'A square mobile app icon, opaque, flat near-black (#0a0b0e) background filling the whole frame with no rounded corners, no border, no drop shadow, no text unless asked, all key content inside the central 80 percent, bold simple shapes with thick strokes that stay readable at 60 pixels, flat vector style with at most three colours.';
add('icon-a-helmet-wheel', '1024x1024', `${APPICON} Emblem: a warm amber (#FFB020) full-face motocross helmet in profile facing right, its chin bar sitting on top of a big amber knobbly front wheel whose chunky tread blocks make a saw-toothed circle, a darker burnt-orange (#C9641A) shadow side on both, over a very subtle amber radial glow fading into the black around the emblem.`, { kind: 'icon' });
add('icon-b-wheelie', '1024x1024', `${APPICON} Emblem: the bold silhouette of a trials rider standing on the pegs of a trials motorcycle mid-wheelie, front wheel high, in solid warm amber (#FFB020) on a dark gradient from near-black at the top to deep charcoal-brown at the bottom, one thick amber ground stroke under the rear wheel, no other detail.`, { kind: 'icon' });
add('icon-c-monogram', '1024x1024', `${APPICON} Emblem: a chunky two-letter monogram "TG" in a heavy condensed italic sans-serif (like Barlow Condensed Black Italic), warm amber (#FFB020) letters with a darker burnt-orange (#C9641A) offset shadow, overlapping slightly, sitting on a horizontal band of black knobbly-tyre tread blocks that crosses the icon behind the letters; only the two letters T and G, nothing else.`, { kind: 'icon' });
if (import.meta.url === `file://${process.argv[1]}`) process.stdout.write(JSON.stringify(jobs, null, 1));
export default jobs;
