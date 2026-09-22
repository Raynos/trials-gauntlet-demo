/**
 * Biome descriptors: one dominant hue, one accent, sun, sky, fog tiers, grade.
 * Consumed by lighting/environment, world/parallax, world/props, post/chain.
 */
import type { BiomeId } from '../../core/types';

export interface FloorFog {
  h0: number;
  hs: number;
  density: number;
}

export interface Biome {
  id: BiomeId;
  /** Unit vector from the scene toward the sun. */
  sunDir: [number, number, number];
  sunColor: number;
  sunIntensity: number;
  /** Hemisphere sky / ground for the ambient fill. */
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  /** Procedural sky gradient for the env map and background. */
  skyZenith: number;
  skyHorizon: number;
  skyGround: number;
  sunDiscIntensity: number;
  envIntensity: number;
  exposure: number;
  /** Distances (m) at 100 / 50 / 15 % contrast. */
  fogTiers: [number, number, number];
  fogColor: number;
  floorFog?: FloorFog;
  /** Grade: lift (shadows), gamma (mids), gain (highlights) as RGB multipliers. */
  gradeLift: [number, number, number];
  gradeGain: [number, number, number];
  saturation: number;
  /** S-curve contrast around mid grey (1 = none). */
  contrast?: number;
  vignette: number;
  bloomStrength: number;
  /** Default ridden surface when a collider has none we know. */
  groundSurface: 'dirt' | 'concrete' | 'snow' | 'stone' | 'metal';
  /** Ambient particles. */
  ambient: 'motes' | 'snow' | 'embers' | 'dust' | 'none';
  /** Heat-haze shimmer amplitude (screen uv) and the screen height (0 = bottom) where it fades in. */
  heatHaze?: number;
  heatHazeV?: number;
  /** Sky clouds: 0 = none, 1 = a few cumulus near the horizon. */
  clouds?: number;
  /** Floor-fog base height is relative to the ground floor (`groundFloorY`), set per track by the lighting rig. */
  /** Whether the scene is an interior (back wall + roof instead of a sky dome). */
  interior: boolean;
  /**
   * Round 10: real local key pools. The renderer keeps two `SpotLight`s (no shadow) on the two
   * kit lamps nearest the camera target (`BiomeKit.lamps`) — a pure function of state.
   */
  lampLights?: { color: number; intensity: number; distance: number; angle: number; penumbra: number; count?: number };
  /**
   * Round 11: camera-following point lights on the N nearest kit fire / melt sources
   * (`BiomeKit.fountains`) — foundry furnace mouths, canyon / snow barrel fires, city braziers.
   */
  meltLights?: { color: number; intensity: number; distance: number; count: number };
}

export const BIOMES: Record<BiomeId, Biome> = {
  industrial: {
    id: 'industrial',
    // Round 10 recipe ("industrial to the bar"): the skylight sun is the one shadow-casting key;
    // the sodium high-bay lamps add real warm pools (two camera-following spots, `lampLights`);
    // the skylight fill is cool and LOW so the pools read; lift 0; dark warm-grey air.
    sunDir: [-0.4, 0.8, 0.42], // round 10: from the camera side, like the light shafts already were — the faces that face the camera (bike, rider, container fronts) are the lit ones, shadows fall behind
    sunColor: 0xffe2c4, // warm key, not orange
    sunIntensity: 3.0,
    hemiSky: 0x8cb0e4, // cool skylight fill (round 8 key-art match: the lamps are the warm source, the roof light is cold)
    hemiGround: 0x524c44, // round 11: the support wall under the deck faces the camera and sees only hemi
    hemiIntensity: 1.0, // round 11: the high camera (pitch 21°) frames the under-deck steel and support wall in the bottom third — they see only hemi; 0.8 left 26 % of the frame under 0.08. round 10: 1.05 flattened the hall — the lamps must be the second source; 0.62 crushed 17 % of the frame under 0.08 (reference 2 %)
    skyZenith: 0x6f7f96,
    skyHorizon: 0xd8c8a8,
    skyGround: 0x1a1512,
    sunDiscIntensity: 30,
    envIntensity: 0.4,
    exposure: 1.5,
    fogTiers: [22, 68, 130], // round 11 (18/56/110 still read the z −5 row as a milky wash): the high camera sits 18 m out, so the mid tier is 25–35 m off and read as one flat wash at 14/44/96; a 60 m deep hall: the far wall (≈ 42 m from the riding camera) sits at 50 % haze; near ledge / mid stacks / far wall are the three tiers
    fogColor: 0x50565e, // round 11: lifted grey-blue haze (0x585e66 washed the mid tier milky: p99 0.57, sat 0.18) (the reference's blacks are a lifted haze, p1 0.015); was 0x45494e dark cool-grey air (the reference hall haze is grey-blue; the sodium pools and the warm key stay the only warm things) (round 10: 0x6a625a read as a grey wash over the far wall; neutral so the sodium pools stay the only warm thing)
    floorFog: { h0: 0.3, hs: 2.8, density: 0.085 }, // the dark pixels are all in the bottom third (under-deck steel + support wall in the deck's shadow): the floor haze is the tool that lifts only that band // round 11: 0.035 left 7–21 % of the frame under 0.08 (reference 2 %) — the under-deck void and the hall floor; a thicker, taller floor haze lifts them without a grade lift
    gradeLift: [0.007, 0.0075, 0.008], // round 11 (0.01 + the lifted fog read 0.3 % under 0.08 against the reference 2.4 %, 0.005 read 10 %): a cool 0.01 lift (the cap the render owner set) — the reference floor is a haze, not black
    gradeGain: [1.02, 1.0, 0.98],
    saturation: 0.9, // round 11 (0.84 + lift 0.0075 read 0.234 vs 0.279; 0.76 with the lifted fog read 0.18; high camera: the container palette fills the lower half — b1 0.340 vs 0.279 at 0.84): b1 riding 0.270 vs 0.279 (01 c5), b3 0.249 vs 0.217 (07 c9) at 0.88 — 0.84 lands both within ±0.03
    contrast: 1.1, // 1.2 + lift 0 crushed the floor; the reference's p1 is 0.015, not 0
    vignette: 0.16, // round 11: 0.28 blacked the bottom corners of the high riding frame; 0.4 blacked out the under-deck corners
    bloomStrength: 0.55, // sodium lamps bloom (threshold 1.6 HDR: only bulbs, sun, sparks)
    groundSurface: 'concrete',
    ambient: 'motes',
    interior: true,
    lampLights: { color: 0xffb257, intensity: 340, distance: 26, angle: 0.5, penumbra: 0.7, count: 3 }, // round 11: a third spot so the lamp hung in front of the container row always has a pool
  },
  canyon: {
    id: 'canyon',
    // Round 11 (recipe propagated): one low warm key from the camera side (sunset over the
    // rider's shoulder — the faces toward the camera are lit, long shadows fall behind), cool
    // low sky fill so the shadows read blue, peach haze in three tiers each carrying content
    // (near kit at deck level / mesa shoulders / strata silhouettes), light towers at the gates
    // as real follow spots, fire barrels as camera-following point lights.
    sunDir: [-0.74, 0.56, 0.32],
    sunColor: 0xffc890,
    sunIntensity: 3.6,
    hemiSky: 0x9fb4de,
    hemiGround: 0x8a5a40,
    hemiIntensity: 0.7,
    skyZenith: 0x5a80b8,
    skyHorizon: 0xf4d8c0,
    skyGround: 0x6b4630,
    sunDiscIntensity: 40,
    envIntensity: 0.9,
    exposure: 1.05,
    fogTiers: [50, 130, 300], // near kit full contrast, mesa shoulders (z −14…−36) 70–85 %, far strata planes (z −95 / −150) in the haze
    fogColor: 0xd9b59c,
    gradeLift: [0.006, 0.004, 0.002],
    gradeGain: [1.04, 0.99, 0.93],
    saturation: 0.88,
    contrast: 1.08,
    vignette: 0.3,
    bloomStrength: 0.6,
    groundSurface: 'dirt',
    ambient: 'dust',
    heatHaze: 0.0022,
    heatHazeV: 0.38,
    clouds: 1,
    interior: false,
    lampLights: { color: 0xfff0d8, intensity: 300, distance: 28, angle: 0.55, penumbra: 0.6 },
    meltLights: { color: 0xff9a40, intensity: 70, distance: 16, count: 2 },
  },
  snow: {
    id: 'snow',
    // Round 11: pale low key from the camera side, blue fill low so the lantern / window pools
    // read, dense blue-grey air in three tiers (reference 15: p50 ≈ 0.47, everything past 40 m
    // is a silhouette; the glowing windows are the depth cue), warm lanterns as follow spots,
    // braziers as point lights.
    sunDir: [-0.32, 0.4, 0.62],
    sunColor: 0xe6eeff,
    sunIntensity: 1.5,
    hemiSky: 0xa8bcd8,
    hemiGround: 0x5e6a80,
    hemiIntensity: 0.75,
    skyZenith: 0x6c819c,
    skyHorizon: 0xb4c2d2,
    skyGround: 0x98a4b4,
    sunDiscIntensity: 6,
    envIntensity: 0.7,
    exposure: 0.8,
    fogTiers: [13, 36, 72],
    fogColor: 0x8298b6,
    floorFog: { h0: 0.2, hs: 2.0, density: 0.22 },
    gradeLift: [0.0, 0.008, 0.03],
    gradeGain: [0.88, 0.95, 1.08],
    saturation: 0.9,
    contrast: 1.04,
    vignette: 0.32,
    bloomStrength: 0.6,
    groundSurface: 'snow',
    ambient: 'snow',
    clouds: 0.6,
    interior: false,
    lampLights: { color: 0xffb860, intensity: 32, distance: 12, angle: 0.75, penumbra: 0.8 }, // snow albedo ≈ 0.9: 160 cd blew the pool and the cage to white
    meltLights: { color: 0xff9a40, intensity: 40, distance: 14, count: 2 },
  },
  nightCity: {
    id: 'nightCity',
    // Round 11 recipe: the moon is the one shadow-casting key — cool, LOW, from the camera side
    // (reference visuals 04/05: blue moonlight against orange fires); the sodium street lamps are
    // real camera-following spots (`lampLights`, four heads), the fire barrels real point lights
    // (`meltLights`); the sky fill is dropped so the pools and the shop windows carry the frame.
    sunDir: [0.42, 0.46, 0.78],
    sunColor: 0x86a8ee,
    sunIntensity: 4.4, // the wet asphalt is 3 % albedo: at 1.3 the whole deck and apron sat under 0.08
    hemiSky: 0x4a6cb0, // saturated moonlight blue (05: ambient ≈ #3a5a8a, p50 0.29, sat 0.64 — the night floor is navy, never black)
    hemiGround: 0x1c2438,
    hemiIntensity: 1.25,
    skyZenith: 0x0c1430,
    skyHorizon: 0x34507a,
    skyGround: 0x0a0a0a,
    sunDiscIntensity: 6,
    envIntensity: 0.4,
    exposure: 1.35,
    fogTiers: [24, 70, 170], // near = street props + facades (z −4…−13), mid = second row + viaduct (z −30…−50), far = the lit silhouette (z −85) and the plate
    fogColor: 0x243656, // cool grey-blue air, not neutral black: the far tier reads as haze with structure
    gradeLift: [0.002, 0.006, 0.02], // measured vs 05 c6: lift 0.05 put p1 at 0.12 against the reference 0.007 — the navy comes from the blue key + fill, not the lift // blue-lifted blacks (04/05: the night floor is navy, not black)
    gradeGain: [0.95, 1.0, 1.06],
    saturation: 0.95,
    contrast: 1.06,
    vignette: 0.4,
    bloomStrength: 0.75,
    groundSurface: 'concrete',
    ambient: 'embers',
    interior: false,
    lampLights: { color: 0xffb257, intensity: 240, distance: 24, angle: 0.62, penumbra: 0.65, count: 4 },
    meltLights: { color: 0xff7a22, intensity: 40, distance: 11, count: 2 },
  },
  foundry: {
    id: 'foundry',
    // Round 7: the melt is the key. A steep orange sun (deep shadows under everything),
    // near-black neutral fill, dark neutral fog instead of the red wash; the emissive
    // channels, pours and furnace mouths carry the colour.
    sunDir: [0.3, 0.8, 0.52],
    sunColor: 0xffa860,
    sunIntensity: 2.2,
    // Round 11 (12-foundry-fire c5: lum p50 0.106, p99 0.78, 27 % under 0.08, sat 0.70; ours read
    // 0.070 / 0.44 / 65 % / 0.96): the hall reads as a warm red-orange PLACE, not a black box
    // with orange dots — a real warm fill, four melt lights, baked up-light near every source
    // (hall.ts tintNear), saturation pulled back so the reds stay readable rust, not neon.
    hemiSky: 0x7a5648, // warm soot-lit roof
    hemiGround: 0x9a4020, // the melt's up-light on every underside (no GI)
    hemiIntensity: 2.4,
    skyZenith: 0x0a0806,
    skyHorizon: 0x3a1a0c,
    skyGround: 0x120806,
    sunDiscIntensity: 8,
    envIntensity: 0.45,
    exposure: 1.7,
    fogTiers: [18, 55, 120],
    fogColor: 0x401c12, // lit smoke: the far bays read as a warm haze with structure in it, not black
    floorFog: { h0: 0.2, hs: 2.0, density: 0.1 },
    gradeLift: [0.012, 0.004, 0.0],
    gradeGain: [1.03, 0.98, 0.94],
    saturation: 0.7, // 0.82 read 0.81, 0.74 read 0.77 vs the reference 0.70
    contrast: 1.1, // 1.14 pushed 34 % of the frame under 0.08 (reference 27 %)
    vignette: 0.4,
    bloomStrength: 0.8,
    groundSurface: 'metal',
    ambient: 'embers',
    heatHaze: 0.0032,
    heatHazeV: 0.42,
    interior: true,
    meltLights: { color: 0xff7a22, intensity: 140, distance: 34, count: 4 },
  },
};

export function biomeFor(id: BiomeId | undefined): Biome {
  return BIOMES[id ?? 'industrial'] ?? BIOMES.industrial;
}
