/**
 * Bike liveries (round 11, CONTRACT §2.7 `setBikeClass`): two colourways that read as two bikes
 * at riding distance — Rookie is the round-6 metallic-blue hero with a white plate and a black
 * number; Pro is darker and raw (charcoal plastics, gunmetal frame, brushed-alloy cradle) with a
 * yellow plate and a red number. Everything here is deterministic and shares the library's
 * standard program (the plate map goes through `lib.complete`, so no new shader variant).
 */
import * as THREE from 'three';
import type { BikeClass } from '../../core/types';

export interface Livery {
  /** Frame spars (metallic paint). */
  frame: number;
  frameRough: number;
  frameMetal: number;
  /** Lower cradle / bash plate. */
  frameLow: number;
  /** Tank, seat base, fenders, shrouds, guards. */
  body: number;
  bodyRough: number;
  bodyMetal: number;
  /** Number plates. */
  plate: number;
  plateInk: number;
  number: string;
  /** glTF hero: multipliers on the atlas albedo for the `bodywork` / `frame` meshes (1 = as authored). */
  gltfBody: [number, number, number];
  gltfFrame: [number, number, number];
  gltfBodyRough: number;
}

export const LIVERIES: Record<BikeClass, Livery> = {
  rookie: {
    frame: 0x1d4fd8,
    frameRough: 0.38,
    frameMetal: 0.55,
    frameLow: 0x2f4a9a,
    body: 0x2158e0,
    bodyRough: 0.32,
    bodyMetal: 0.08,
    plate: 0xfafafa,
    plateInk: 0x141416,
    number: '7',
    gltfBody: [1, 1, 1],
    gltfFrame: [1, 1, 1],
    gltfBodyRough: 1,
  },
  pro: {
    frame: 0x33363c, // gunmetal, lightly metallic
    frameRough: 0.42,
    frameMetal: 0.7,
    frameLow: 0x8a8d93, // raw brushed alloy cradle
    body: 0x1f2024, // charcoal plastics, satin
    bodyRough: 0.55,
    bodyMetal: 0.05,
    plate: 0xf2c21a, // yellow plate
    plateInk: 0xc8281e, // red number
    number: '1',
    // The atlas paints the plastics blue: multiply the blue down to charcoal (blue channel most).
    gltfBody: [0.7, 0.4, 0.06],
    gltfFrame: [0.5, 0.36, 0.08], // the atlas blue lives mostly on the frame mesh: → dark gunmetal
    gltfBodyRough: 1.35,
  },
};

const plateCache = new Map<string, THREE.CanvasTexture>();

/** 128² plate face: background + a bold centred number (both proc plates and the glTF add-on plates use it). */
export function plateTexture(cls: BikeClass): THREE.CanvasTexture {
  const L = LIVERIES[cls];
  const key: string = cls;
  let tex = plateCache.get(key);
  if (tex) return tex;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#' + L.plate.toString(16).padStart(6, '0');
  g.fillRect(0, 0, 128, 128);
  // Light grime ring towards the edges so the plate is not a flat card.
  const grad = g.createRadialGradient(64, 64, 30, 64, 64, 90);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.18)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#' + L.plateInk.toString(16).padStart(6, '0');
  g.font = 'bold 84px Arial Narrow, Arial, Helvetica, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(L.number, 64, 70);
  tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  plateCache.set(key, tex);
  return tex;
}

/** Apply a class to a plate material (map swap + colour reset; the map carries the colour). */
export function applyPlate(m: THREE.MeshStandardMaterial, cls: BikeClass): void {
  m.map = plateTexture(cls);
  m.color.setHex(0xffffff);
  m.roughness = 0.5;
  m.metalness = 0;
  // Double-sided like the glTF atlas material → the plates share the hero's program variant
  // instead of adding a single-sided standard one (round 11 census: −1 program).
  m.side = THREE.DoubleSide;
  m.needsUpdate = true;
}
