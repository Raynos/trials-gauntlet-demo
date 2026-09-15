/**
 * Hero LOD, colourways and spoke blur (round 13, Rider on Glass G3 / H1 / H2).
 *
 * LOD: the art build ships `public/models/<hero>-lod.glb` next to each hero (≤ 6 k tris, its own
 * 512² atlases, same node names / rig / clips / material names — `assets/blender/README.md`).
 * `low` and `medium` instantiate the LOD document whole (geometry AND its atlases: the LOD uv layout
 * is re-baked, so a geometry-only swap under the full atlas mis-maps every texel); `high` the
 * authored one. The tier swap rebuilds the hero instance through `applyModels`, like a model choice.
 *
 * Colourways: both files carry `KHR_materials_variants` (`rider_rookie` / `rider_pro` on `rider`;
 * `bike_rookie` / `bike_pro` → `bike_body_rookie` / `bike_body_pro` on `frame`, `bodywork`,
 * `fork_upper`). `resolveVariants` pre-resolves every variant material per document at load (the
 * parser's dependency getter is async); `variantMaterialsFor` hands an instance the per-mesh table.
 *
 * Wheels: the spokes are their own child mesh (`<wheel>_spokes` from the art build, or split here
 * from the radius band when a file predates it) so their opacity can fall with the wheel's angular
 * velocity while a blur card (`<wheel>_blur` from the art build, or a painted ring here) fades in —
 * the eye's motion blur of a spoked wheel, driven by `wheels.*.spinVel`, never by a timer.
 */
import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { fogify } from '../lighting/environment';

/** Wheel-local radius band (m) that holds the spokes; tyre + rim lie above, hub below. */
export const SPOKE_BAND = { rIn: 0.045, rOut: 0.275 } as const;

/** A geometry that shares every attribute of `src` and draws `index`. */
function withIndex(src: THREE.BufferGeometry, index: ArrayLike<number>): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  for (const [name, attr] of Object.entries(src.attributes)) g.setAttribute(name, attr);
  const verts = src.getAttribute('position').count;
  g.setIndex(new THREE.BufferAttribute(verts < 65536 ? Uint16Array.from(index) : Uint32Array.from(index), 1));
  g.boundingSphere = src.boundingSphere?.clone() ?? null;
  g.boundingBox = src.boundingBox?.clone() ?? null;
  g.name = src.name;
  return g;
}

/** Split a wheel's triangles into (tyre + rim + hub) and spokes by their radius about the wheel axis (local z). */
export function splitSpokes(g: THREE.BufferGeometry): { body: number[]; spokes: number[] } | null {
  const pos = g.getAttribute('position');
  if (!g.index || !pos) return null;
  const idx = g.index.array;
  const body: number[] = [];
  const spokes: number[] = [];
  for (let t = 0; t < idx.length; t += 3) {
    let rMin = Infinity;
    let rMax = 0;
    for (let k = 0; k < 3; k++) {
      const i = idx[t + k]!;
      const r = Math.hypot(pos.getX(i), pos.getY(i));
      if (r < rMin) rMin = r;
      if (r > rMax) rMax = r;
    }
    (rMin >= SPOKE_BAND.rIn && rMax <= SPOKE_BAND.rOut ? spokes : body).push(idx[t]!, idx[t + 1]!, idx[t + 2]!);
  }
  return spokes.length ? { body, spokes } : null;
}

/** Authored spoke / blur children of a wheel node (art build), or the ones split here. */
export function wheelParts(wheel: THREE.Object3D): { spokes: THREE.Mesh | null; blur: THREE.Mesh | null } {
  const find = (suffixes: string[]): THREE.Mesh | null => {
    for (const c of wheel.children) if ((c as THREE.Mesh).isMesh && suffixes.some((sfx) => c.name === wheel.name + sfx)) return c as THREE.Mesh;
    return null;
  };
  return { spokes: find(['_spokes', ':spokes']), blur: find(['_blur']) };
}

/**
 * Once per parsed document: wheels of a file without an authored `<wheel>_spokes` child are split
 * (the spokes become a child mesh named `<wheel>:spokes`), and the `KHR_materials_variants` table is
 * resolved — per mesh name, variant name → material — so instances can swap synchronously.
 */
export async function prepareHero(gltf: GLTF): Promise<void> {
  const root = gltf.scene;
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
  });
  for (const mesh of meshes) {
    if (!/^wheel_(front|rear)$/.test(mesh.name) || wheelParts(mesh).spokes) continue;
    const split = splitSpokes(mesh.geometry);
    if (!split) continue;
    const spokes = new THREE.Mesh(withIndex(mesh.geometry, split.spokes), mesh.material);
    spokes.name = `${mesh.name}:spokes`;
    spokes.frustumCulled = false;
    mesh.add(spokes);
    mesh.geometry = withIndex(mesh.geometry, split.body);
  }
  await resolveVariants(gltf);
}

type VariantExt = { variants?: { name: string }[] };
type MappingExt = { mappings?: { material: number; variants: number[] }[] };
/** Per document: mesh name → variant name → resolved material. */
const variantTable = new WeakMap<GLTF, Map<string, Map<string, THREE.Material>>>();

async function resolveVariants(gltf: GLTF): Promise<void> {
  const ext = (gltf.userData as { gltfExtensions?: { KHR_materials_variants?: VariantExt } }).gltfExtensions?.KHR_materials_variants;
  const names = ext?.variants?.map((v) => v.name) ?? [];
  const table = new Map<string, Map<string, THREE.Material>>();
  variantTable.set(gltf, table);
  if (!names.length) return;
  const jobs: Promise<void>[] = [];
  gltf.scene.traverse((o) => {
    const m = o as THREE.Mesh;
    const mappings = (m.userData as { gltfExtensions?: { KHR_materials_variants?: MappingExt } }).gltfExtensions?.KHR_materials_variants?.mappings;
    if (!m.isMesh || !mappings) return;
    const row = new Map<string, THREE.Material>();
    table.set(m.name, row);
    for (const mp of mappings) {
      jobs.push(
        (gltf.parser.getDependency('material', mp.material) as Promise<THREE.Material>).then((mat) => {
          for (const vi of mp.variants) {
            const n = names[vi];
            if (n) row.set(n, mat);
          }
        }),
      );
    }
  });
  await Promise.all(jobs);
}

/** The document's variant table for `mesh.name` (empty when the file has no variants). */
export function variantMaterialsFor(gltf: GLTF, meshName: string): Map<string, THREE.Material> {
  return variantTable.get(gltf)?.get(meshName) ?? new Map();
}

/**
 * Which document a tier instantiates: `high` the authored file, `low` / `medium` the LOD twin.
 * Round 14: the rider LOD is gated (`riderLodEnabled`, default off) after the phone showed the
 * `medium` rider with rigid bind-pose arms. The cause was the renderer's program prune, not the
 * asset (`rider-lod.glb` carries the same 19-joint skeleton, bind pose, inverse bind matrices and
 * clips as `rider.glb`, and the hands-on-grips probe holds ≤ 0.5 cm on it at low and medium), but
 * the LOD returns to the phone tiers only once a device report confirms the fix; the bike LOD has
 * no skin and stays on. `ThreeRenderer.setRiderLod(true)` (or `?riderlod=1` through the app) turns it on.
 */
export function lodChoice(tier: 'low' | 'medium' | 'high', kind: 'bike' | 'rider' = 'bike'): 'full' | 'lod' {
  if (tier === 'high') return 'full';
  return kind === 'rider' && !riderLodEnabled ? 'full' : 'lod';
}

let riderLodEnabled = false;
/** Gate for the rider LOD on `low` / `medium` (see `lodChoice`). */
export function setRiderLodEnabled(on: boolean): void {
  riderLodEnabled = on;
}
export function isRiderLodEnabled(): boolean {
  return riderLodEnabled;
}

// ---------------------------------------------------------------------------
// Spoke blur
// ---------------------------------------------------------------------------

/** Deterministic LCG for the painted textures (no Math.random: the bitmap must match across sessions). */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

let blurTex: THREE.CanvasTexture | null = null;
/** The blurred-spokes ring: a soft dark annulus with faint radial streaks, alpha peaking mid-radius. */
function blurTexture(): THREE.CanvasTexture {
  if (blurTex) return blurTex;
  const N = 128;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(N, N);
  const rnd = lcg(0x5f0c3);
  const streaks: number[] = [];
  for (let i = 0; i < 48; i++) streaks.push(rnd() * Math.PI * 2);
  const rIn = SPOKE_BAND.rIn / SPOKE_BAND.rOut;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const u = (x + 0.5) / N - 0.5;
      const v = (y + 0.5) / N - 0.5;
      const r = Math.hypot(u, v) * 2; // 0..1 at the card edge
      const ang = Math.atan2(v, u);
      let a = 0;
      if (r > rIn * 0.9 && r < 0.98) {
        // Spoke density falls with radius (spokes converge at the hub) — the ring is darkest inside.
        const density = 0.42 * (1 - 0.55 * (r - rIn) / (1 - rIn));
        let streak = 0;
        for (const s of streaks) {
          let d = Math.abs(((ang - s + Math.PI) % (Math.PI * 2)) - Math.PI);
          d = Math.min(d, Math.PI * 2 - d);
          streak += Math.max(0, 1 - d / 0.07) * 0.12;
        }
        const edge = Math.min(1, (r - rIn * 0.9) / (rIn * 0.35)) * Math.min(1, (0.98 - r) / 0.08);
        a = Math.min(1, density + streak) * edge;
      }
      const k = (y * N + x) * 4;
      img.data[k] = 34;
      img.data[k + 1] = 34;
      img.data[k + 2] = 38;
      img.data[k + 3] = Math.round(a * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  blurTex = new THREE.CanvasTexture(c);
  blurTex.colorSpace = THREE.SRGBColorSpace;
  blurTex.anisotropy = 1;
  return blurTex;
}

/** |ω| (rad/s) → blur weight 0..1: nothing below 8 rad/s (2.7 m/s), full at 32 (11 m/s) — the art contract puts the card on the wheel above ~6 rad/s. */
export function spokeBlurWeight(omega: number): number {
  const w = Math.abs(omega);
  const t = Math.min(1, Math.max(0, (w - 8) / 24));
  return t * t * (3 - 2 * t);
}

/**
 * One wheel's blur: the spoke sub-mesh gets a transparent clone of its material whose opacity is
 * `1 − k(ω)`, and the blur card — the art build's `<wheel>_blur` (a radial-streak alpha card in the
 * wheel plane) or, for a file without one, a two-sided painted ring — fades in with `k(ω)`. Both are
 * children of the wheel node, so they turn with it (the streaks are rotationally uniform, so that is
 * invisible). The card never casts a shadow and never writes depth.
 */
export class SpokeBlur {
  readonly disc: THREE.Mesh;
  private readonly discMat: THREE.Material & { opacity: number };
  private readonly spokeMat: THREE.MeshStandardMaterial | null;
  readonly spokes: THREE.Mesh | null;
  private readonly ownDisc: boolean;
  private lastK = -1;

  constructor(wheel: THREE.Object3D, materials: THREE.MeshStandardMaterial[]) {
    const parts = wheelParts(wheel);
    this.spokes = parts.spokes;
    this.spokeMat = null;
    if (this.spokes) {
      const src = this.spokes.material as THREE.MeshStandardMaterial;
      if (src.isMeshStandardMaterial) {
        const m = fogify(src.clone());
        m.transparent = true;
        m.depthWrite = true;
        this.spokes.material = m;
        this.spokeMat = m;
        materials.push(m);
      }
    }
    if (parts.blur) {
      this.disc = parts.blur;
      this.ownDisc = false;
      const src = this.disc.material as THREE.MeshStandardMaterial;
      const m = fogify(src.clone());
      m.transparent = true;
      m.depthWrite = false;
      m.side = THREE.DoubleSide;
      this.disc.material = m;
      this.discMat = m;
      if (m.isMeshStandardMaterial) materials.push(m);
    } else {
      this.ownDisc = true;
      const m = fogify(new THREE.MeshBasicMaterial({ map: blurTexture(), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
      this.discMat = m;
      this.disc = new THREE.Mesh(new THREE.PlaneGeometry(SPOKE_BAND.rOut * 2, SPOKE_BAND.rOut * 2), m);
      this.disc.name = `${wheel.name}:blur`;
      this.disc.frustumCulled = false;
      wheel.add(this.disc);
    }
    this.disc.castShadow = false;
    this.disc.receiveShadow = false;
    this.disc.renderOrder = 1;
    this.disc.visible = false;
  }

  /** Drive from the wheel's angular velocity (rad/s). */
  update(omega: number): void {
    const k = spokeBlurWeight(omega);
    if (k === this.lastK) return;
    this.lastK = k;
    this.disc.visible = k > 0.01;
    this.discMat.opacity = 0.9 * k;
    if (this.spokeMat && this.spokes) {
      this.spokeMat.opacity = 1 - k;
      this.spokes.visible = k < 0.985;
    }
  }

  dispose(): void {
    this.discMat.dispose();
    if (this.ownDisc) this.disc.geometry.dispose();
  }
}
