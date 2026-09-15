/**
 * glTF hero assets (round 8): `public/models/{bike,rider}.glb` built by assets/blender
 * (meshopt-compressed; see assets/blender/README.md for the node / bone contract).
 * One loader, one parsed document per file, cloned per instance (live + ghost).
 * `?rider=gltf&bike=gltf` (or the settings menu) selects them through `setModels`.
 */
import type * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { prepareHero } from './lod';
import { fogify } from '../lighting/environment';
import { HERO_URLS, lodUrl } from './urls';
import type { ByteProgress } from '../../boot/plan';

export { HERO_URLS, lodUrl };

export type ModelChoice = 'proc' | 'gltf';
export interface ModelChoices {
  riderModel: ModelChoice;
  bikeModel: ModelChoice;
}

const cache = new Map<string, Promise<GLTF | null>>();

/**
 * Load + parse once; a failed load resolves null (the caller keeps the procedural model, or — for a
 * `-lod.glb` — the authored file on every tier). Round 13: `prepareHero` (spoke split for files
 * without `<wheel>_spokes`, `KHR_materials_variants` table) runs before anyone clones the document.
 */
export function loadGltf(url: string, quiet = false, bytes?: ByteProgress): Promise<GLTF | null> {
  let p = cache.get(url);
  if (!p) {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    // Boot plan (docs/tasks/loading-progress-invariant.md): the reader — three's FileLoader — reports its own
    // bytes, forwarded as deltas; nothing observes the network after the fact.
    let reported = 0;
    p = new Promise<GLTF | null>((resolve) => {
      loader.load(
        url,
        (g) => {
          shrinkTextures(g.scene);
          prepareHero(g)
            .catch((err: unknown) => console.warn(`[render] hero prepare for ${url} failed:`, err))
            .then(() => resolve(g));
        },
        bytes
          ? (e) => {
              if (e.loaded > reported) {
                bytes.add(e.loaded - reported);
                reported = e.loaded;
              }
            }
          : undefined,
        (err) => {
          if (!quiet) console.warn(`[render] glTF ${url} failed:`, err);
          resolve(null);
        },
      );
    });
    cache.set(url, p);
  }
  return p;
}

/**
 * Round 10 (texture budget): the hero ships 2048² albedo + 1024² normal / ORM sets (bike 32 MB,
 * rider 16 MB at RGBA8 + mips — half the 96 MB cap for a hero that is ≈ 180 px tall at the
 * riding zoom). Albedo is capped at 1024², normal / ORM at 512², by a canvas downsample at load
 * (deterministic; the same bitmap in every session). ≈ 48 MB → ≈ 16 MB.
 */
export function shrinkTextures(root: THREE.Object3D, albedoMax = 1024, otherMax = 512): void {
  const done = new Set<THREE.Texture>();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of mats) {
      const std = mat as THREE.MeshStandardMaterial;
      // Round 12: also the basic-material maps (the far backdrop plates, decal quads).
      if (!std.isMeshStandardMaterial && !(mat as THREE.MeshBasicMaterial).isMeshBasicMaterial) continue;
      for (const key of ['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'alphaMap'] as const) {
        const t = std[key] as THREE.Texture | null | undefined;
        if (!t || done.has(t)) continue;
        done.add(t);
        const img = t.image as { width?: number; height?: number; data?: unknown } | undefined;
        if (!img || img.data) continue; // DataTextures (procedural 512² sets) are not canvas-drawable
        const w = img.width ?? 0;
        const h = img.height ?? 0;
        const max = key === 'map' || key === 'emissiveMap' ? albedoMax : otherMax;
        if (!w || !h || Math.max(w, h) <= max) continue;
        const k = max / Math.max(w, h);
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(w * k));
        c.height = Math.max(1, Math.round(h * k));
        const g = c.getContext('2d');
        if (!g) continue;
        g.imageSmoothingEnabled = true;
        g.imageSmoothingQuality = 'high';
        g.drawImage(t.image as CanvasImageSource, 0, 0, c.width, c.height);
        t.image = c;
        t.needsUpdate = true;
      }
    }
  });
}

/** Every mesh casts + receives; materials get the library's neutral map set so they share the standard program. */
export function prepareHeroMaterials(root: THREE.Object3D, complete: (m: THREE.MeshStandardMaterial) => void): THREE.MeshStandardMaterial[] {
  const out: THREE.MeshStandardMaterial[] = [];
  const seen = new Set<THREE.Material>();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.castShadow = true;
    m.receiveShadow = false;
    m.frustumCulled = false;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats) {
      if (seen.has(mat)) continue;
      seen.add(mat);
      const std = mat as THREE.MeshStandardMaterial;
      if (std.isMeshStandardMaterial) {
        complete(std);
        // Round 13: the biome grade uniforms (`fogify`) — without them the direct-to-canvas tier
        // graded the hero with neutral deltas while the world got the biome's gain / lift, which
        // blew the hero out to white on the canyon's low tier (r12 stills show it too).
        fogify(std);
        std.envMapIntensity = 0.8;
        out.push(std);
      }
    }
  });
  return out;
}

/** Triangle count of a subtree. */
export function countTriangles(root: THREE.Object3D): number {
  let tris = 0;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const g = m.geometry;
    tris += (g.index ? g.index.count : g.getAttribute('position').count) / 3;
  });
  return Math.round(tris);
}
