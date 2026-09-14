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
}

export const BIOMES: Record<BiomeId, Biome> = {
  industrial: {
    id: 'industrial',
    sunDir: [-0.45, 0.78, -0.3],
    sunColor: 0xffe2c4, // warm key, not orange
    sunIntensity: 3.2,
    hemiSky: 0x8cb0e4, // cool skylight fill (round 8 key-art match: the lamps are the warm source, the roof light is cold)
    hemiGround: 0x2a2622,
    hemiIntensity: 1.05,
    skyZenith: 0x6f7f96,
    skyHorizon: 0xd8c8a8,
    skyGround: 0x1a1512,
    sunDiscIntensity: 30,
    envIntensity: 0.55,
    exposure: 1.5,
    fogTiers: [16, 55, 110], // a 60 m deep hall: the far wall sits at ≈50 % haze, each container row a step nearer
    fogColor: 0x6a625a, // desaturated warm-grey air; fog must not tint
    floorFog: { h0: 0.3, hs: 1.8, density: 0.035 },
    gradeLift: [0, 0, 0], // round 8: deep blacks under the deck and in the far bays (key art)
    gradeGain: [1.02, 1.0, 0.98],
    saturation: 0.9,
    contrast: 1.15,
    vignette: 0.38,
    bloomStrength: 0.55, // sodium lamps bloom
    groundSurface: 'concrete',
    ambient: 'motes',
    interior: true,
  },
  canyon: {
    id: 'canyon',
    sunDir: [-0.55, 0.42, -0.72],
    sunColor: 0xffe1b8,
    sunIntensity: 3.6,
    hemiSky: 0xb9c8e6,
    hemiGround: 0x7a4a30,
    hemiIntensity: 0.6,
    skyZenith: 0x4c78b8,
    skyHorizon: 0xf0c69a,
    skyGround: 0x6b4630,
    sunDiscIntensity: 40,
    envIntensity: 1.0,
    exposure: 1.0,
    fogTiers: [45, 120, 280],
    fogColor: 0xe9b48c,
    gradeLift: [0.02, 0.012, 0.005],
    gradeGain: [1.04, 0.99, 0.93],
    saturation: 1.0,
    vignette: 0.3,
    bloomStrength: 0.7,
    groundSurface: 'dirt',
    ambient: 'dust',
    heatHaze: 0.0022,
    heatHazeV: 0.38,
    clouds: 1,
    interior: false,
  },
  snow: {
    id: 'snow',
    sunDir: [-0.3, 0.6, 0.74],
    sunColor: 0xe8f0ff,
    sunIntensity: 2.4,
    hemiSky: 0xc9d8ee,
    hemiGround: 0x8a94a8,
    hemiIntensity: 1.25,
    skyZenith: 0x8fa4bf,
    skyHorizon: 0xdde6ef,
    skyGround: 0xb8c0cc,
    sunDiscIntensity: 8,
    envIntensity: 1.0,
    exposure: 1.3,
    fogTiers: [16, 42, 80],
    fogColor: 0xcdd8e4,
    floorFog: { h0: 0.2, hs: 2.0, density: 0.2 },
    gradeLift: [0.0, 0.012, 0.045],
    gradeGain: [0.94, 0.98, 1.06],
    saturation: 0.82,
    vignette: 0.3,
    bloomStrength: 0.6,
    groundSurface: 'snow',
    ambient: 'snow',
    clouds: 0.6,
    interior: false,
  },
  nightCity: {
    id: 'nightCity',
    sunDir: [0.3, 0.7, 0.55],
    sunColor: 0x8fb0e8,
    sunIntensity: 0.9,
    hemiSky: 0x4a5a78,
    hemiGround: 0x1a1810,
    hemiIntensity: 0.5,
    skyZenith: 0x0a0e1a,
    skyHorizon: 0x2a3446,
    skyGround: 0x0a0a0a,
    sunDiscIntensity: 6,
    envIntensity: 0.5,
    exposure: 1.15,
    fogTiers: [30, 90, 200],
    fogColor: 0x14181c,
    gradeLift: [0.0, 0.012, 0.016],
    gradeGain: [0.95, 1.0, 0.97],
    saturation: 0.85,
    vignette: 0.45,
    bloomStrength: 0.8,
    groundSurface: 'concrete',
    ambient: 'embers',
    interior: false,
  },
  foundry: {
    id: 'foundry',
    // Round 7: the melt is the key. A steep orange sun (deep shadows under everything),
    // near-black neutral fill, dark neutral fog instead of the red wash; the emissive
    // channels, pours and furnace mouths carry the colour.
    sunDir: [0.3, 0.8, 0.52],
    sunColor: 0xffa860,
    sunIntensity: 2.2,
    hemiSky: 0x5a4038, // warm soot-lit roof
    hemiGround: 0x7a2c10, // the melt's up-light on every underside (no GI)
    hemiIntensity: 1.6,
    skyZenith: 0x0a0806,
    skyHorizon: 0x3a1a0c,
    skyGround: 0x120806,
    sunDiscIntensity: 8,
    envIntensity: 0.3,
    exposure: 1.45,
    fogTiers: [20, 65, 140],
    fogColor: 0x2a140c,
    floorFog: { h0: 0.2, hs: 1.6, density: 0.08 },
    gradeLift: [0.012, 0.003, 0.0],
    gradeGain: [1.03, 0.98, 0.94],
    saturation: 1.0,
    contrast: 1.18,
    vignette: 0.48,
    bloomStrength: 0.8,
    groundSurface: 'metal',
    ambient: 'embers',
    heatHaze: 0.0032,
    heatHazeV: 0.42,
    interior: true,
  },
};

export function biomeFor(id: BiomeId | undefined): Biome {
  return BIOMES[id ?? 'industrial'] ?? BIOMES.industrial;
}
