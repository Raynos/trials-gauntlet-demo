/**
 * glTF hero assets (round 8): `public/models/{bike,rider}.glb` built by assets/blender
 * (meshopt-compressed; see assets/blender/README.md for the node / bone contract).
 * One loader, one parsed document per file, cloned per instance (live + ghost).
 * `?rider=gltf&bike=gltf` (or the settings menu) selects them through `setModels`.
 */
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

export type ModelChoice = 'proc' | 'gltf';
export interface ModelChoices {
  riderModel: ModelChoice;
  bikeModel: ModelChoice;
}

const cache = new Map<string, Promise<GLTF | null>>();

/** Load + parse once; a failed load resolves null (the caller keeps the procedural model). */
export function loadGltf(url: string): Promise<GLTF | null> {
  let p = cache.get(url);
  if (!p) {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    p = new Promise<GLTF | null>((resolve) => {
      loader.load(
        url,
        (g) => resolve(g),
        undefined,
        (err) => {
          console.warn(`[render] glTF ${url} failed:`, err);
          resolve(null);
        },
      );
    });
    cache.set(url, p);
  }
  return p;
}

export const HERO_URLS = { bike: 'models/bike.glb', rider: 'models/rider.glb' } as const;

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
