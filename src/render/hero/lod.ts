/**
 * Hero LOD, colourways and spoke blur (round 13, Rider on Glass G3 / H1 / H2).
 *
 * LOD: the art build ships `public/models/<hero>-lod.glb` next to each hero (≤ 6 k tris, its own
 * 512² atlases, same node names / rig / clips / material names — `assets/blender/README.md`).
 * `low` and `medium` instantiate the LOD document whole (geometry AND its atlases: the LOD uv layout
 * is re-baked, so a geometry-only swap under the full atlas mis-maps every texel); `high` the
 * authored one. The tier swap rebuilds the hero instance through `applyModels`, like a model choice.
 *
 * Colourways (ask 43): the outfit and the class are their own files (`urls.ts`); no `KHR_materials_variants`.
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
 * (the spokes become a child mesh named `<wheel>:spokes`).
 *
 * Ask 43 (Astra's files): empty meshes are dropped (the street exports keep a 0-triangle `rider` whose only content
 * is a stale variants table), skinned meshes that share a material, skeleton and bind are merged into one draw
 * (the race rider is 14 meshes on ONE material = 14 draws and 14 mirror twins for nothing; the street rider ≈ 24 on
 * 17), and `MeshPhysicalMaterial`s (`KHR_materials_clearcoat` on a bike fender, `KHR_materials_specular` on the
 * street skin / hair) are flattened to the standard material so the hero stays on the one program variant
 * (docs/design/rendering.md §5) — the clearcoat is a finding for a desktop-high opt-in, not a tier feature yet.
 */
export async function prepareHero(gltf: GLTF): Promise<void> {
  const root = gltf.scene;
  dropEmptyMeshes(root);
  mergeSkinnedByMaterial(root);
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
  flattenPhysicalMaterials(gltf);
  normalizeHeroMaterials(gltf);
}

/**
 * One fragment variant per hero surface (docs/design/rendering.md §5, PERF-BACKLOG #9): Astra's street riders mix
 * front-sided skin, alpha-MASK eyebrows and BLENDED beard cards, and Three keys a program (and its shadow-depth twin)
 * on `side`, `alphaTest` and opacity — measured +10 programs on b1 phone-high for the mustard rider alone. Every
 * hero material is double-sided like the rest of the kit, and a blended card becomes a cut-out at the same
 * threshold (the beard's soft edge is a 120-triangle card seen 180 px tall; the program is worth more than the
 * feather). The only variants left are skinned / static and cut-out / opaque.
 */
function normalizeHeroMaterials(gltf: GLTF): void {
  const seen = new Set<THREE.Material>();
  const fix = (m: THREE.Material): void => {
    if (seen.has(m)) return;
    seen.add(m);
    m.side = THREE.DoubleSide;
    if (m.transparent) {
      m.transparent = false;
      m.depthWrite = true;
      if (!(m.alphaTest > 0)) m.alphaTest = 0.5;
      m.needsUpdate = true;
    }
  };
  gltf.scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || /_blur$/.test(mesh.name)) return; // the spoke blur cards are the one authored blend (SpokeBlur owns them)
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) fix(m);
  });
}

/** Meshes with no vertices draw nothing and still cost a traversal, a mirror twin and a shadow submit. */
function dropEmptyMeshes(root: THREE.Object3D): void {
  const empty: THREE.Mesh[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && (m.geometry.index ? m.geometry.index.count : m.geometry.getAttribute('position')?.count ?? 0) === 0) empty.push(m);
  });
  for (const m of empty) m.removeFromParent();
}

/** The attribute layout a geometry must share to be concatenated: name, item size, array type, normalisation. */
function attributeLayout(g: THREE.BufferGeometry): string {
  return Object.entries(g.attributes)
    .map(([name, a]) => `${name}:${a.itemSize}:${a.array.constructor.name}:${a.normalized ? 1 : 0}`)
    .sort()
    .join('|');
}

/**
 * Skinned meshes sharing a material, skeleton, bind matrix and attribute layout become one `SkinnedMesh` (named after
 * the first, keeping its parent and name — the garage rail and the mirror twin see one hero mesh per material as
 * before). Morph targets and multi-material meshes are left alone. Legacy documents (one skinned mesh) are untouched.
 */
export function mergeSkinnedByMaterial(root: THREE.Object3D): void {
  const groups = new Map<string, THREE.SkinnedMesh[]>();
  const keys = new Map<THREE.SkinnedMesh, string>();
  let skeletons = 0;
  const skeletonIds = new Map<THREE.Skeleton, number>();
  const materialIds = new Map<THREE.Material, number>();
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (!m.isSkinnedMesh || Array.isArray(m.material) || Object.keys(m.geometry.morphAttributes).length) return;
    if (!skeletonIds.has(m.skeleton)) skeletonIds.set(m.skeleton, skeletons++);
    if (!materialIds.has(m.material)) materialIds.set(m.material, materialIds.size);
    // The skinned vertex is bindMatrixInverse · bones · bindMatrix · p, then the node's own world matrix: both must agree.
    const bind = [...m.bindMatrix.elements, ...m.matrixWorld.elements].map((e) => e.toFixed(5)).join(',');
    const key = `${skeletonIds.get(m.skeleton)}/${materialIds.get(m.material)}/${bind}/${attributeLayout(m.geometry)}/${m.geometry.index ? 'i' : 'n'}`;
    keys.set(m, key);
    const list = groups.get(key) ?? [];
    list.push(m);
    groups.set(key, list);
  });
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const first = list[0]!;
    const merged = new THREE.BufferGeometry();
    for (const name of Object.keys(first.geometry.attributes)) {
      const src = first.geometry.getAttribute(name) as THREE.BufferAttribute;
      const total = list.reduce((n, m) => n + m.geometry.getAttribute(name).count, 0);
      const Arr = src.array.constructor as new (n: number) => typeof src.array;
      const out = new THREE.BufferAttribute(new Arr(total * src.itemSize), src.itemSize, src.normalized);
      // Component-wise through the accessors, never `array.set`: a Meshopt-decoded stream keeps its byte stride (the
      // street riders' Int8 normals are 3 of 4 bytes — `InterleavedBufferAttribute`), and `get/setComponent` also
      // carry the normalisation both ways.
      let offset = 0;
      for (const m of list) {
        const a = m.geometry.getAttribute(name);
        for (let i = 0; i < a.count; i++) for (let c = 0; c < a.itemSize; c++) out.setComponent(offset + i, c, a.getComponent(i, c));
        offset += a.count;
      }
      merged.setAttribute(name, out);
    }
    const verts = merged.getAttribute('position').count;
    if (first.geometry.index) {
      const total = list.reduce((n, m) => n + m.geometry.index!.count, 0);
      const out = verts < 65536 ? new Uint16Array(total) : new Uint32Array(total);
      let offset = 0;
      let base = 0;
      for (const m of list) {
        const idx = m.geometry.index!.array;
        for (let i = 0; i < idx.length; i++) out[offset + i] = idx[i]! + base;
        offset += idx.length;
        base += m.geometry.getAttribute('position').count;
      }
      merged.setIndex(new THREE.BufferAttribute(out, 1));
    }
    merged.computeBoundingSphere();
    merged.computeBoundingBox();
    merged.name = first.geometry.name;
    const mesh = new THREE.SkinnedMesh(merged, first.material);
    mesh.name = first.name;
    mesh.userData = first.userData;
    mesh.frustumCulled = first.frustumCulled;
    mesh.castShadow = first.castShadow;
    mesh.receiveShadow = first.receiveShadow;
    mesh.position.copy(first.position);
    mesh.quaternion.copy(first.quaternion);
    mesh.scale.copy(first.scale);
    mesh.bind(first.skeleton, first.bindMatrix);
    first.parent!.add(mesh);
    for (const m of list) {
      m.removeFromParent();
      m.geometry.dispose();
    }
  }
}

/** The standard subset of a physical material, so clearcoat / specular files share the hero's one program. */
export function flattenPhysicalMaterials(gltf: GLTF): void {
  const flat = new Map<THREE.Material, THREE.MeshStandardMaterial>();
  const standard = (m: THREE.Material): THREE.Material => {
    if (!(m as THREE.MeshPhysicalMaterial).isMeshPhysicalMaterial) return m;
    let s = flat.get(m);
    if (!s) {
      s = new THREE.MeshStandardMaterial();
      // `copy` from the physical superset: MeshStandardMaterial.copy reads only the standard fields.
      s.copy(m as THREE.MeshStandardMaterial);
      flat.set(m, s);
    }
    return s;
  };
  gltf.scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.material = Array.isArray(m.material) ? m.material.map(standard) : standard(m.material);
  });
}

/**
 * Which document a tier instantiates: the authored file on `high` and `medium` (phone-high asks as `medium`), the LOD
 * twin on `low` only (ask 60). Round 14 gated the rider LOD off after the phone showed the `medium` rider with rigid
 * bind-pose arms — the renderer's program prune, not the asset; the prune is gone (r15 retirement). Ask 43 round 2
 * turns it back on, measured on Astra's 7.8 k LOD riders (b1 phone-high 185 k → 82 k tris, model 9.5 → 9.1 ms;
 * medium 14.2 → 13.6; low 6.3 → 5.9) with `hero-webkit` hands-on-grips on both engines — IN LEVEL. The garage stage
 * (`garage`) draws the authored rider AND bike on every tier (ask 52: the phone's garage showed the 5.8 k bike-lod
 * and "the new bike isn't in the game"): it is the close-up showcase, its 8.9 ms is inside the 30 fps bar, and the
 * mirror-twin gate (`reflectable()`) already counts the authored triangles. `setRiderLod(false)` (or `?riderlod=0`)
 * is the escape hatch, never the rule.
 */
export function lodChoice(tier: 'low' | 'medium' | 'high', kind: 'bike' | 'rider' = 'bike', garage = false): 'full' | 'lod' {
  // Ask 60 (an outside review of phone gameplay): the authored bike AND rider in level on every tier; the LOD pair
  // only when the governor sits on `low`. Ask 52: the garage is the showcase on every tier.
  if (tier !== 'low' || garage) return 'full';
  if (kind !== 'rider') return 'lod';
  return riderLodEnabled ? 'lod' : 'full';
}

let riderLodEnabled = true;
/** Override for the rider LOD on `low` / `medium` (see `lodChoice`); the default is on. */
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
