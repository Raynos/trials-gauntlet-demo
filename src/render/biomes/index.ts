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
  ambient: 'motes' | 'snow' | 'embers' | 'none';
  /** Whether the scene is an interior (back wall + roof instead of a sky dome). */
  interior: boolean;
}

export const BIOMES: Record<BiomeId, Biome> = {
  industrial: {
    id: 'industrial',
    sunDir: [-0.45, 0.78, -0.3],
    sunColor: 0xffe2c4, // warm key, not orange
    sunIntensity: 3.2,
    hemiSky: 0x9cb6d8, // neutral-cool skylight fill
    hemiGround: 0x1a1612,
    hemiIntensity: 0.65,
    skyZenith: 0x6f7f96,
    skyHorizon: 0xd8c8a8,
    skyGround: 0x1a1512,
    sunDiscIntensity: 30,
    envIntensity: 0.4,
    exposure: 1.25,
    fogTiers: [90, 200, 380],
    fogColor: 0x5a5654, // desaturated: fog must not tint
    floorFog: { h0: 0.3, hs: 1.6, density: 0.025 },
    gradeLift: [0.0, 0.0, 0.0],
    gradeGain: [1.02, 1.0, 0.98],
    saturation: 0.95,
    contrast: 1.16,
    vignette: 0.38,
    bloomStrength: 0.45,
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
    gradeLift: [0.02, 0.01, 0.0],
    gradeGain: [1.05, 0.98, 0.9],
    saturation: 1.1,
    vignette: 0.3,
    bloomStrength: 0.7,
    groundSurface: 'dirt',
    ambient: 'none',
    interior: false,
  },
  snow: {
    id: 'snow',
    sunDir: [-0.3, 0.6, 0.74],
    sunColor: 0xe8f0ff,
    sunIntensity: 2.0,
    hemiSky: 0xc9d8ee,
    hemiGround: 0x8a94a8,
    hemiIntensity: 0.9,
    skyZenith: 0xb8c8de,
    skyHorizon: 0xe4ecf4,
    skyGround: 0xb8c0cc,
    sunDiscIntensity: 8,
    envIntensity: 1.0,
    exposure: 1.0,
    fogTiers: [18, 45, 85],
    fogColor: 0xd6e0ec,
    floorFog: { h0: 0.2, hs: 2.0, density: 0.2 },
    gradeLift: [0.0, 0.01, 0.04],
    gradeGain: [0.96, 0.98, 1.05],
    saturation: 0.9,
    vignette: 0.3,
    bloomStrength: 0.6,
    groundSurface: 'snow',
    ambient: 'snow',
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
    fogColor: 0x25302e,
    gradeLift: [0.0, 0.02, 0.02],
    gradeGain: [0.92, 1.0, 0.95],
    saturation: 0.85,
    vignette: 0.45,
    bloomStrength: 0.8,
    groundSurface: 'concrete',
    ambient: 'embers',
    interior: false,
  },
  foundry: {
    id: 'foundry',
    sunDir: [0.2, 0.75, 0.6],
    sunColor: 0xff9a5a,
    sunIntensity: 1.6,
    hemiSky: 0x6a2a18,
    hemiGround: 0x3a0e06,
    hemiIntensity: 0.7,
    skyZenith: 0x1a0806,
    skyHorizon: 0x7a2a12,
    skyGround: 0x2a0a04,
    sunDiscIntensity: 10,
    envIntensity: 0.5,
    exposure: 0.9,
    fogTiers: [45, 110, 220],
    fogColor: 0x4a180c,
    floorFog: { h0: 0.2, hs: 1.2, density: 0.08 },
    gradeLift: [0.04, 0.0, 0.0],
    gradeGain: [1.1, 0.92, 0.82],
    saturation: 1.1,
    vignette: 0.45,
    bloomStrength: 0.7,
    groundSurface: 'metal',
    ambient: 'embers',
    interior: true,
  },
};

export function biomeFor(id: BiomeId | undefined): Biome {
  return BIOMES[id ?? 'industrial'] ?? BIOMES.industrial;
}
