/**
 * Instanced prop kit + geometry helpers shared by the biome builders.
 * Every prop type is one InstancedMesh; placement is seeded from the track.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { fogify } from '../lighting/environment';
import { canvas, tex } from './canvasTex';

export class PropBatch {
  private readonly items: { m: THREE.Matrix4; c: THREE.Color | null }[] = [];
  constructor(
    readonly name: string,
    readonly geometry: THREE.BufferGeometry,
    readonly material: THREE.Material,
    readonly shadows = true,
  ) {
    fogify(material);
    // Every batch material takes vertex colours (AO bakes); geometry without a
    // colour attribute falls back to white, so this costs nothing and keeps the
    // instanced program variants to two (with / without instance colour).
    const std = material as THREE.MeshStandardMaterial;
    if (std.isMeshStandardMaterial && !std.vertexColors) {
      std.vertexColors = true;
      std.needsUpdate = true;
    }
  }

  add(x: number, y: number, z: number, ry = 0, scale = 1, color: THREE.Color | number | null = null, rz = 0, sy = scale, sz = scale): void {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, rz));
    m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(scale, sy, sz));
    this.items.push({ m, c: color === null ? null : color instanceof THREE.Color ? color : new THREE.Color(color) });
  }

  get count(): number {
    return this.items.length;
  }

  /**
   * Round 11 (foundry warm read): bake up-light into the per-instance colour of every item
   * within `radius` of a source — a stand-in for GI from the melt. `warm` is the full-strength
   * tint multiplier at the source; it eases to 1 at the radius. Items with no colour start white.
   */
  tintNear(sources: { x: number; y: number; z: number }[], radius: number, warm: [number, number, number], strength = 1): void {
    if (!sources.length) return;
    const r2 = radius * radius;
    for (const it of this.items) {
      const e = it.m.elements;
      let best = 0;
      for (const s of sources) {
        const dx = e[12]! - s.x;
        const dy = e[13]! - s.y;
        const dz = e[14]! - s.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= r2) continue;
        const t = 1 - Math.sqrt(d2 / r2);
        if (t > best) best = t;
      }
      if (best <= 0) continue;
      const k = best * best * (3 - 2 * best) * strength;
      const c = it.c ?? (it.c = new THREE.Color(0xffffff));
      c.r *= 1 + (warm[0] - 1) * k;
      c.g *= 1 + (warm[1] - 1) * k;
      c.b *= 1 + (warm[2] - 1) * k;
    }
  }

  /** World-x extent of one instanced chunk (round 9): frustum culling works per chunk, so a
   *  600 m track draws (and shadows) only the ≈ 100 m in view instead of every instance. */
  static readonly CHUNK_M = 40;

  /**
   * One `InstancedMesh` per 40 m of x, each with a computed bounding sphere and frustum
   * culling on, under one group named `props:<name>`. (Round 8 drew one unculled mesh per
   * batch: a 600 m course's supports / drums / catwalk were drawn in full every frame, twice
   * with the shadow pass — b1 read 1.05 M tris.)
   */
  build(): THREE.Group | null {
    if (this.items.length === 0) return null;
    const group = new THREE.Group();
    group.name = `props:${this.name}`;
    // Round 11: every chunk carries instanceColor (white when unused). three's program key
    // includes `instancingColor`, so one library material shared by a coloured batch and an
    // uncoloured one used to compile twice (b1: darkSteel, barrelRed).
    const anyColor = true;
    // A vertex-coloured material on a geometry without a `color` attribute reads whatever generic
    // attribute GL last held (round 11: black rings of edge rock along every canyon ribbon) —
    // give such geometries a white colour attribute so the instance / material colour carries.
    if (!this.geometry.getAttribute('color') && (this.material as THREE.MeshStandardMaterial).vertexColors) {
      const n = this.geometry.getAttribute('position').count;
      const white = new Float32Array(n * 3).fill(1);
      this.geometry.setAttribute('color', new THREE.BufferAttribute(white, 3));
    }
    const chunks = new Map<number, { m: THREE.Matrix4; c: THREE.Color | null }[]>();
    for (const it of this.items) {
      const k = Math.floor(it.m.elements[12]! / PropBatch.CHUNK_M);
      let list = chunks.get(k);
      if (!list) chunks.set(k, (list = []));
      list.push(it);
    }
    const white = new THREE.Color(0xffffff);
    for (const [k, items] of [...chunks.entries()].sort((a, b) => a[0] - b[0])) {
      const mesh = new THREE.InstancedMesh(this.geometry, this.material, items.length);
      mesh.name = `props:${this.name}:${k}`;
      items.forEach((it, i) => {
        mesh.setMatrixAt(i, it.m);
        if (anyColor) mesh.setColorAt(i, it.c ?? white);
      });
      if (anyColor) mesh.instanceColor!.needsUpdate = true;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = this.shadows;
      mesh.receiveShadow = this.shadows;
      mesh.computeBoundingSphere();
      mesh.frustumCulled = true;
      group.add(mesh);
    }
    return group;
  }
}

/** Triangles in a geometry. */
export function triCount(g: THREE.BufferGeometry): number {
  return (g.index ? g.index.count : g.getAttribute('position').count) / 3;
}

// ---------------------------------------------------------------------------
// Geometry recipes (unit-ish sizes; scale per instance)
// ---------------------------------------------------------------------------

/** 20 ft shipping container: 6.06 × 2.59 × 2.44, origin at bottom centre. */
export function containerGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const body = new THREE.BoxGeometry(6.06, 2.59, 2.44);
  body.translate(0, 2.59 / 2, 0);
  parts.push(body);
  // Corner posts & top/bottom rails read as steel edges.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const post = new THREE.BoxGeometry(0.18, 2.62, 0.18);
      post.translate(sx * 2.98, 2.59 / 2, sz * 1.18);
      parts.push(post);
    }
    const railT = new THREE.BoxGeometry(6.1, 0.12, 0.14);
    railT.translate(0, 2.56, sx * 1.2);
    parts.push(railT);
    const railB = new THREE.BoxGeometry(6.1, 0.12, 0.14);
    railB.translate(0, 0.06, sx * 1.2);
    parts.push(railB);
  }
  const g = mergeGeometries(parts, false)!;
  // UVs: scale so the corrugation ribs repeat ~every 0.25 m along x.
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2.0, uv.getY(i) * 1.0);
  return g;
}

/** Euro pallet 1.2 × 0.144 × 0.8, origin bottom centre. */
export function palletGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 5; i++) {
    const b = new THREE.BoxGeometry(1.2, 0.022, 0.1);
    b.translate(0, 0.133, -0.35 + i * 0.175);
    parts.push(b);
  }
  for (const x of [-0.5, 0, 0.5]) {
    const s = new THREE.BoxGeometry(0.145, 0.078, 0.8);
    s.translate(x, 0.083, 0);
    parts.push(s);
    for (const z of [-0.3, 0.3]) {
      const blk = new THREE.BoxGeometry(0.145, 0.044, 0.145);
      blk.translate(x, 0.022, z);
      parts.push(blk);
    }
  }
  return mergeGeometries(parts, false)!;
}

/** Low-poly single pallet (3 boards + 2 stringers), 1.2 × 0.144 × 0.8, origin bottom centre. */
export function palletLowGeometry(): THREE.BufferGeometry {
  return palletStackGeometry(1);
}

/** Low-poly 3-high pallet stack for deck supports: 3 boards + 2 stringers per layer, origin bottom centre. */
export function palletStackGeometry(layers = 3): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let l = 0; l < layers; l++) {
    const y0 = l * 0.144;
    for (const z of [-0.33, 0, 0.33]) {
      const b = new THREE.BoxGeometry(1.2, 0.022, 0.12);
      b.translate(0, y0 + 0.133, z);
      parts.push(b);
    }
    for (const x of [-0.5, 0.5]) {
      const s = new THREE.BoxGeometry(0.1, 0.122, 0.8);
      s.translate(x, y0 + 0.061, 0);
      parts.push(s);
    }
  }
  return mergeGeometries(parts, false)!;
}

/** 200 l oil drum, origin bottom centre. */
export function drumGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // Round 9 (tri budget): 12 segments, 3-sided ribs — 168 tris (was 280) for a 0.6 m prop.
  const body = new THREE.CylinderGeometry(0.29, 0.29, 0.88, 12, 1, false);
  body.translate(0, 0.44, 0);
  parts.push(body);
  for (const y of [0.3, 0.58]) {
    const rib = new THREE.TorusGeometry(0.295, 0.016, 3, 12);
    rib.rotateX(Math.PI / 2);
    rib.translate(0, y, 0);
    parts.push(rib);
  }
  return mergeGeometries(parts, false)!;
}

/** Stack of 4 tyres, origin bottom centre. */
export function tyreStackGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) {
    const t = new THREE.TorusGeometry(0.26, 0.1, 6, 14);
    t.rotateX(Math.PI / 2);
    t.translate(0, 0.1 + i * 0.2, 0);
    parts.push(t);
  }
  return mergeGeometries(parts, false)!;
}

/** Steel I-column: web + two flanges, height 1 (scale y), origin bottom centre. */
export function columnGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const web = new THREE.BoxGeometry(0.03, 1, 0.34);
  web.translate(0, 0.5, 0);
  parts.push(web);
  for (const x of [-0.18, 0.18]) {
    const f = new THREE.BoxGeometry(0.03, 1, 0.4);
    f.translate(x, 0.5, 0);
    parts.push(f);
  }
  const cap = new THREE.BoxGeometry(0.42, 0.06, 0.42);
  cap.translate(0, 0.03, 0);
  parts.push(cap);
  return mergeGeometries(parts, false)!;
}

/**
 * Bake a cheap ambient-occlusion term into a vertex colour attribute: darker
 * toward the base (contact with the floor), darker on downward-facing faces
 * (undersides), full brightness on top faces. Multiplies any instance colour.
 */
export function bakeAO(g: THREE.BufferGeometry, height: number, strength = 0.45): THREE.BufferGeometry {
  const pos = g.getAttribute('position');
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  const nrm = g.getAttribute('normal');
  const n = pos.count;
  const c = new Float32Array(n * 3);
  const h = Math.max(0.05, height * 0.4);
  for (let i = 0; i < n; i++) {
    const t = Math.min(1, Math.max(0, pos.getY(i) / h));
    let ao = 1 - strength * (1 - t * t * (3 - 2 * t));
    const ny = nrm.getY(i);
    if (ny < -0.5) ao *= 0.55;
    else if (ny > 0.5) ao = Math.min(1, ao + 0.15);
    c[i * 3] = ao;
    c[i * 3 + 1] = ao;
    c[i * 3 + 2] = ao;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}

/** Roof truss `L` m long along x: top/bottom chords + diagonals, centred. */
export function trussGeometry(L = 12): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const H = 1.1;
  for (const y of [0, H]) {
    const c = new THREE.BoxGeometry(L, 0.1, 0.1);
    c.translate(0, y, 0);
    parts.push(c);
  }
  const n = Math.max(4, Math.round(L / 2.4));
  for (let i = 0; i < n; i++) {
    const x0 = -L / 2 + (i * L) / n;
    const x1 = x0 + L / n;
    const d = new THREE.BoxGeometry(Math.hypot(x1 - x0, H), 0.06, 0.06);
    d.rotateZ(Math.atan2(H, x1 - x0) * (i % 2 === 0 ? 1 : -1));
    d.translate((x0 + x1) / 2, H / 2, 0);
    parts.push(d);
  }
  return mergeGeometries(parts, false)!;
}

/** Industrial high-bay lamp: conical shade + short stem, origin at the stem top (the chain hangs above). */
export function lampGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const stem = new THREE.CylinderGeometry(0.03, 0.03, 0.3, 6);
  stem.translate(0, -0.15, 0);
  parts.push(stem);
  const shade = new THREE.ConeGeometry(0.55, 0.42, 18, 1, true);
  shade.translate(0, -0.5, 0);
  parts.push(shade);
  const ring = new THREE.TorusGeometry(0.55, 0.03, 6, 18);
  ring.rotateX(Math.PI / 2);
  ring.translate(0, -0.7, 0);
  parts.push(ring);
  return mergeGeometries(parts, false)!;
}

export function lampBulbGeometry(): THREE.BufferGeometry {
  const disc = new THREE.CylinderGeometry(0.36, 0.36, 0.05, 18);
  disc.translate(0, -0.68, 0);
  return disc;
}

/** Hanging chain link run: unit height along -y from the origin (scale y to the drop). */
export function chainGeometry(): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(0.025, 0.025, 1, 6);
  g.translate(0, -0.5, 0);
  return g;
}

/** Crane hook block: sheave housing + hook, origin at the cable end. */
export function hookBlockGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const block = new THREE.BoxGeometry(0.5, 0.6, 0.3);
  block.translate(0, -0.3, 0);
  parts.push(block);
  const hook = new THREE.TorusGeometry(0.22, 0.05, 6, 12, Math.PI * 1.4);
  hook.rotateZ(Math.PI * 0.8);
  hook.translate(0, -0.85, 0);
  parts.push(hook);
  return mergeGeometries(parts, false)!;
}

/** Steel I-beam along x, length 1 (scale x), origin centre. */
export function beamGeometry(w = 0.3, h = 0.5): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const web = new THREE.BoxGeometry(1, h - 0.06, 0.03);
  parts.push(web);
  for (const y of [-h / 2 + 0.03, h / 2 - 0.03]) {
    const f = new THREE.BoxGeometry(1, 0.06, w);
    f.translate(0, y, 0);
    parts.push(f);
  }
  return mergeGeometries(parts, false)!;
}

/** Shelving rack bay 2.7 m wide, 4 m tall, 1.1 deep: uprights + 3 shelves. */
export function rackGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const x of [-1.3, 1.3]) {
    for (const z of [-0.5, 0.5]) {
      const u = new THREE.BoxGeometry(0.08, 4, 0.08);
      u.translate(x, 2, z);
      parts.push(u);
    }
  }
  for (const y of [1.2, 2.5, 3.8]) {
    const s = new THREE.BoxGeometry(2.7, 0.06, 1.1);
    s.translate(0, y, 0);
    parts.push(s);
    // Boxes on the shelf.
    const b = new THREE.BoxGeometry(2.2, 0.7, 0.9);
    b.translate(0, y + 0.38, 0);
    parts.push(b);
  }
  return mergeGeometries(parts, false)!;
}

/** Chain-link fence panel 3 × 2 m, alpha-cut texture applied by the caller. */
export function fencePanelGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const mesh = new THREE.PlaneGeometry(3, 2);
  mesh.translate(0, 1, 0);
  parts.push(mesh);
  return mergeGeometries(parts, false)!;
}

/** Rock: displaced icosphere, radius 1, origin centre. */
export function rockGeometry(seed: number, detail = 2): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  let s = seed >>> 0 || 7;
  const rnd = (): number => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const n = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    n.set(p.getX(i), p.getY(i), p.getZ(i));
    const k = 0.75 + Math.abs(Math.sin(n.x * 3.1 + n.y * 2.3) * 0.25) + rnd() * 0.12;
    n.multiplyScalar(k);
    p.setXYZ(i, n.x, n.y * 0.7, n.z);
  }
  g.computeVertexNormals();
  return g;
}

/** Pine tree: trunk + 3 cones, height ~8, origin bottom. */
export function pineGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const trunk = new THREE.CylinderGeometry(0.18, 0.28, 2.2, 7);
  trunk.translate(0, 1.1, 0);
  parts.push(trunk);
  for (let i = 0; i < 3; i++) {
    const c = new THREE.ConeGeometry(2.3 - i * 0.55, 3.0, 9);
    c.translate(0, 2.6 + i * 1.7, 0);
    parts.push(c);
  }
  return mergeGeometries(parts, false)!;
}

/** Hay bale (round), axis along z, origin bottom centre. */
export function baleGeometry(): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(0.75, 0.75, 1.2, 18);
  g.rotateX(Math.PI / 2);
  g.translate(0, 0.75, 0);
  return g;
}

/** Traffic cone. */
export function coneGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const base = new THREE.BoxGeometry(0.42, 0.03, 0.42);
  base.translate(0, 0.015, 0);
  parts.push(base);
  const c = new THREE.ConeGeometry(0.16, 0.7, 12);
  c.translate(0, 0.38, 0);
  parts.push(c);
  return mergeGeometries(parts, false)!;
}

/** City block: box with origin at bottom centre; UVs in metres for the window texture. */
export function buildingGeometry(): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(1, 1, 1);
  g.translate(0, 0.5, 0);
  return g;
}

/** Foundry pipe run: 8 m horizontal pipe with two flanges. */
export function pipeGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const p = new THREE.CylinderGeometry(0.35, 0.35, 8, 14);
  p.rotateZ(Math.PI / 2);
  parts.push(p);
  for (const x of [-2.5, 2.5]) {
    const f = new THREE.CylinderGeometry(0.45, 0.45, 0.12, 14);
    f.rotateZ(Math.PI / 2);
    f.translate(x, 0, 0);
    parts.push(f);
  }
  return mergeGeometries(parts, false)!;
}

// ---------------------------------------------------------------------------
// Shared by the hall and the city kit (round 8: the high-bay lamps reuse the street-light cone).

export function setColors(g: THREE.BufferGeometry, f: (x: number, y: number, z: number, i: number) => [number, number, number]): THREE.BufferGeometry {
  const p = g.getAttribute('position');
  const c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const [r, gg, b] = f(p.getX(i), p.getY(i), p.getZ(i), i);
    c[i * 3] = r;
    c[i * 3 + 1] = gg;
    c[i * 3 + 2] = b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}

/** Additive light cone: apex at the origin, opening downward to radius 1.6 at y = −1 (scale y to the drop). */
export function lightConeGeometry(): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(1.6, 1, 18, 1, true).translate(0, -0.5, 0);
  return setColors(g, (_x, y) => {
    const t = Math.min(1, Math.max(0, -y));
    const a = Math.pow(1 - t, 1.6) * 0.9 + 0.02;
    return [a, a, a];
  });
}

/** Wet-road reflection mask: luminance = alpha, strong at v = 1 (the light's foot), fading toward v = 0 and to the sides. */
export function reflectionMaskTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  const img = g.createImageData(256, 256);
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      const v = 1 - y / 255; // canvas row 0 = v 1
      const u = x / 255;
      const side = Math.pow(Math.sin(u * Math.PI), 0.7);
      const along = Math.pow(v, 1.8);
      const ripple = 0.8 + 0.2 * Math.sin(y * 0.9 + Math.sin(x * 0.2) * 3);
      const a = Math.min(1, side * along * ripple) * 255;
      const k = (y * 256 + x) * 4;
      img.data[k] = img.data[k + 1] = img.data[k + 2] = a;
      img.data[k + 3] = a;
    }
  }
  g.putImageData(img, 0, 0);
  return tex(c, false, false);
}

// ---------------------------------------------------------------------------
// Round 11 exterior kit (canyon / snow): geometry recipes, all origin bottom centre unless noted,
// cheap boxes / lathes / low-poly cones so they instance in the hundreds under the tri budget.

function lcgExt(seed: number): () => number {
  let st = seed >>> 0 || 7;
  return () => {
    st = (Math.imul(st, 1664525) + 1013904223) >>> 0;
    return st / 4294967296;
  };
}

/** Radial falloff disc (white, alpha = 1 − r^power) for contact shadows / sand patches / ruts. */
export function radialDiscTexture(power = 1.8, size = 128): THREE.CanvasTexture {
  const [c, g] = canvas(size, size);
  const img = g.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5) / size - 0.5;
      const dy = (y + 0.5) / size - 0.5;
      const r = Math.min(1, Math.hypot(dx, dy) * 2);
      const a = Math.pow(1 - r, power);
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(a * 255);
    }
  }
  g.putImageData(img, 0, 0);
  return tex(c, false, false);
}

/**
 * Contact-shadow batch for the exterior kits (the hall keeps its own): a black radial disc a hair
 * above whatever a prop stands on. `map` carries the falloff so the material shares the
 * MeshBasic+map program (no new variant). `opacity` 0.6 for dirt, ~0.35 for snow.
 */
export function contactShadowBatch(name: string, opacity: number, complete?: (m: THREE.MeshStandardMaterial) => void): PropBatch {
  // Exterior kits have no MeshBasic+map program to share, so the disc is a black *standard*
  // material completed with the library's neutral map set: it costs no program at all.
  const mat = new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 1, map: radialDiscTexture(1.8), transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  complete?.(mat);
  return new PropBatch(name, new THREE.CircleGeometry(1, 14).rotateX(-Math.PI / 2), mat, false);
}

/** Dead tree / snag: bare trunk, 3–4 broken branches, seeded; height 1 (scale y ≈ 3–5 m). */
export function snagGeometry(seed: number): THREE.BufferGeometry {
  const rnd = lcgExt(seed);
  const parts: THREE.BufferGeometry[] = [];
  const trunk = new THREE.CylinderGeometry(0.03, 0.09, 1, 6).translate(0, 0.5, 0);
  parts.push(trunk);
  const n = 3 + Math.floor(rnd() * 2);
  for (let i = 0; i < n; i++) {
    const y = 0.35 + rnd() * 0.5;
    const L = 0.25 + rnd() * 0.3;
    const b = new THREE.CylinderGeometry(0.012, 0.035, L, 5).translate(0, L / 2, 0).rotateZ(0.7 + rnd() * 0.6).rotateY(rnd() * 6.28).translate(0, y, 0);
    parts.push(b);
  }
  const g = mergeGeometries(parts, false)!;
  return setColors(g, (_x, y) => {
    const s = 0.6 + 0.4 * Math.min(1, y * 2);
    return [0.36 * s, 0.3 * s, 0.24 * s];
  });
}

/** Split-rail fence panel: two posts 2.4 m apart, two rails; origin at the panel centre on the ground. */
export function splitRailGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const x of [-1.2, 1.2]) parts.push(new THREE.BoxGeometry(0.12, 1.1, 0.12).translate(x, 0.55, 0));
  for (const y of [0.45, 0.95]) parts.push(new THREE.BoxGeometry(2.5, 0.09, 0.09).translate(0, y, 0).rotateY(0.03));
  return bakeAO(mergeGeometries(parts, false)!, 1.1, 0.35);
}

/** Cable spool: two discs and a core, lying on its rim (axis along z), radius 0.6. */
export function spoolGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const z of [-0.32, 0.32]) parts.push(new THREE.CylinderGeometry(0.6, 0.6, 0.08, 14).rotateX(Math.PI / 2).translate(0, 0.6, z));
  parts.push(new THREE.CylinderGeometry(0.3, 0.3, 0.6, 12).rotateX(Math.PI / 2).translate(0, 0.6, 0));
  return bakeAO(mergeGeometries(parts, false)!, 1.2, 0.35);
}

/** Tyre wall: a 3 m run of tyres two high, staggered (canyon track edge). */
export function tyreWallGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 5; i++) {
    parts.push(new THREE.TorusGeometry(0.3, 0.11, 6, 12).rotateX(Math.PI / 2).translate(-1.2 + i * 0.6, 0.11, 0));
    if (i < 4) parts.push(new THREE.TorusGeometry(0.3, 0.11, 6, 12).rotateX(Math.PI / 2).translate(-0.9 + i * 0.6, 0.33, 0));
  }
  return mergeGeometries(parts, false)!;
}

/** Water tower: four legs with cross braces, a riveted tank and a conical roof; 12 m tall. */
export function waterTowerGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(new THREE.CylinderGeometry(0.09, 0.12, 8, 6).translate(sx * 1.6, 4, sz * 1.6).rotateZ(-sx * 0.06).rotateX(sz * 0.06));
  for (const y of [2.5, 5.5]) {
    for (const s of [-1, 1]) {
      parts.push(new THREE.BoxGeometry(3.2, 0.08, 0.08).translate(0, y, s * 1.55));
      parts.push(new THREE.BoxGeometry(0.08, 0.08, 3.2).translate(s * 1.55, y, 0));
    }
  }
  parts.push(new THREE.CylinderGeometry(2.1, 2.1, 0.25, 16).translate(0, 8.1, 0));
  parts.push(new THREE.CylinderGeometry(2.0, 2.0, 3.0, 16).translate(0, 9.7, 0));
  for (const y of [8.6, 10.2, 11.0]) parts.push(new THREE.TorusGeometry(2.02, 0.05, 5, 16).rotateX(Math.PI / 2).translate(0, y, 0));
  parts.push(new THREE.ConeGeometry(2.3, 1.2, 16).translate(0, 11.8, 0));
  parts.push(new THREE.CylinderGeometry(0.1, 0.1, 9, 6).translate(2.3, 4.5, 0));
  return mergeGeometries(parts, false)!;
}

/** Windmill: lattice tower, hub, 12 blades and a tail vane; 9 m tall. */
export function windmillGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(new THREE.CylinderGeometry(0.05, 0.07, 8, 5).translate(sx * 0.4, 4, sz * 0.4).rotateZ(-sx * 0.09).rotateX(sz * 0.09));
  for (const y of [2, 4, 6]) for (const s of [-1, 1]) {
    parts.push(new THREE.BoxGeometry(1.7 - y * 0.12, 0.05, 0.05).translate(0, y, s * (0.85 - y * 0.06)));
    parts.push(new THREE.BoxGeometry(0.05, 0.05, 1.7 - y * 0.12).translate(s * (0.85 - y * 0.06), y, 0));
  }
  const hub = new THREE.CylinderGeometry(0.25, 0.25, 0.3, 10).rotateX(Math.PI / 2).translate(0, 8.2, 0.6);
  parts.push(hub);
  for (let i = 0; i < 12; i++) {
    const b = new THREE.BoxGeometry(0.36, 1.6, 0.03).translate(0, 1.0, 0).rotateY(0.35).rotateZ((i / 12) * Math.PI * 2).translate(0, 8.2, 0.7);
    parts.push(b);
  }
  parts.push(new THREE.BoxGeometry(0.05, 0.05, 2.4).translate(0, 8.2, -1.2));
  parts.push(new THREE.BoxGeometry(0.04, 1.0, 1.0).translate(0, 8.2, -2.3));
  return mergeGeometries(parts, false)!;
}

/** Rusted pickup: cab, bed, wheels, no glass; 5 m long along x, origin bottom centre. */
export function pickupGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(new THREE.BoxGeometry(4.9, 0.55, 1.9).translate(0, 0.65, 0));
  parts.push(new THREE.BoxGeometry(1.7, 0.9, 1.8).translate(-0.4, 1.35, 0));
  parts.push(new THREE.BoxGeometry(1.4, 0.2, 1.7).translate(1.6, 1.0, 0));
  for (const z of [-0.95, 0.95]) parts.push(new THREE.BoxGeometry(2.2, 0.55, 0.06).translate(1.35, 1.15, z));
  parts.push(new THREE.BoxGeometry(0.06, 0.55, 1.9).translate(2.45, 1.15, 0));
  for (const x of [-1.5, 1.5]) for (const z of [-0.85, 0.85]) parts.push(new THREE.CylinderGeometry(0.4, 0.4, 0.25, 12).rotateX(Math.PI / 2).translate(x, 0.4, z));
  return bakeAO(mergeGeometries(parts, false)!, 2.2, 0.4);
}

/** Mine portal: heavy timber frame (two posts, lintel, bracing) with a dark stack of sleepers behind it; 3.2 m tall. */
export function minePortalGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const x of [-1.5, 1.5]) parts.push(new THREE.BoxGeometry(0.36, 3.0, 0.36).translate(x, 1.5, 0));
  parts.push(new THREE.BoxGeometry(3.7, 0.4, 0.4).translate(0, 3.1, 0));
  for (const x of [-1.5, 1.5]) parts.push(new THREE.BoxGeometry(0.3, 2.9, 0.3).translate(x, 1.45, -1.3));
  parts.push(new THREE.BoxGeometry(3.5, 0.36, 0.36).translate(0, 3.0, -1.3));
  for (const x of [-1.5, 1.5]) parts.push(new THREE.BoxGeometry(0.18, 0.18, 1.5).translate(x, 3.05, -0.65));
  parts.push(new THREE.BoxGeometry(2.6, 2.8, 0.2).translate(0, 1.4, -1.55));
  return bakeAO(mergeGeometries(parts, false)!, 3, 0.35);
}

/** Light tower: mast on a wheeled base, cross arm with four heads; 7 m tall (heads at y 6.6). */
export function lightTowerGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(new THREE.BoxGeometry(1.6, 0.9, 1.1).translate(0, 0.5, 0));
  for (const x of [-0.6, 0.6]) parts.push(new THREE.CylinderGeometry(0.22, 0.22, 0.2, 10).rotateX(Math.PI / 2).translate(x, 0.22, 0.6));
  parts.push(new THREE.CylinderGeometry(0.07, 0.1, 6.0, 8).translate(0, 3.9, 0));
  parts.push(new THREE.BoxGeometry(1.5, 0.08, 0.08).translate(0, 6.6, 0));
  for (const x of [-0.6, -0.2, 0.2, 0.6]) parts.push(new THREE.BoxGeometry(0.3, 0.3, 0.2).translate(x, 6.6, 0.15).rotateX(0.5));
  return bakeAO(mergeGeometries(parts, false)!, 1.2, 0.35);
}

/** Light tower head glass: four 0.26 m squares on the cross arm, emissive (separate batch). */
export function lightTowerHeadsGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const x of [-0.6, -0.2, 0.2, 0.6]) parts.push(new THREE.PlaneGeometry(0.26, 0.26).translate(x, 6.6, 0.26).rotateX(-0.5));
  return mergeGeometries(parts, false)!;
}

/** Log cabin: unit box body (scale to w × h × d); the roof / snow / windows are separate batches. */
export function cabinBodyGeometry(): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  return bakeAO(g, 1, 0.35);
}

/** Gable roof prism over a unit footprint (ridge along x, 45° slopes, height 0.5), origin at the eaves. */
export function gableGeometry(): THREE.BufferGeometry {
  const pos: number[] = [];
  const tri = (a: number[], b: number[], c: number[]): void => {
    pos.push(...a, ...b, ...c);
  };
  const o = 0.06; // eaves overhang
  const A = [-0.5 - o, 0, 0.5 + o];
  const B = [0.5 + o, 0, 0.5 + o];
  const C = [0.5 + o, 0.5, 0];
  const D = [-0.5 - o, 0.5, 0];
  const E = [-0.5 - o, 0, -0.5 - o];
  const F = [0.5 + o, 0, -0.5 - o];
  tri(A, B, C);
  tri(A, C, D);
  tri(F, E, D);
  tri(F, D, C);
  // end gables (inset to the wall line)
  tri([-0.5, 0, 0.5], [-0.5, 0.5, 0], [-0.5, 0, -0.5]);
  tri([0.5, 0, -0.5], [0.5, 0.5, 0], [0.5, 0, 0.5]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const uv: number[] = [];
  for (let i = 0; i < pos.length; i += 3) uv.push(pos[i]! * 3, pos[i + 2]! * 3);
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/** Snow load on a gable roof: two slabs on the slopes plus a ridge cap; matches `gableGeometry`. */
export function gableSnowGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) parts.push(new THREE.BoxGeometry(1.1, 0.07, 0.62).rotateX(s * Math.PI / 4).translate(0, 0.25 + 0.05, s * 0.28));
  parts.push(new THREE.BoxGeometry(1.12, 0.1, 0.16).translate(0, 0.53, 0));
  return mergeGeometries(parts, false)!;
}

/** Stacked firewood: 9 logs in a pyramid, 1.4 m wide, logs along z. */
export function logPileGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const rows = [4, 3, 2];
  rows.forEach((n, r) => {
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * 0.34;
      parts.push(new THREE.CylinderGeometry(0.16, 0.16, 1.1, 7).rotateX(Math.PI / 2).translate(x, 0.16 + r * 0.29, 0));
    }
  });
  return bakeAO(mergeGeometries(parts, false)!, 0.9, 0.4);
}

/** Wooden sled: two runners, three slats, a curved front bar; 1.3 m long along x. */
export function sledGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const z of [-0.22, 0.22]) parts.push(new THREE.BoxGeometry(1.3, 0.05, 0.05).translate(0, 0.08, z));
  for (const z of [-0.22, 0.22]) parts.push(new THREE.BoxGeometry(0.05, 0.16, 0.05).translate(-0.4, 0.16, z), new THREE.BoxGeometry(0.05, 0.16, 0.05).translate(0.4, 0.16, z));
  for (const x of [-0.45, -0.15, 0.15, 0.45]) parts.push(new THREE.BoxGeometry(0.2, 0.03, 0.56).translate(x, 0.26, 0));
  parts.push(new THREE.BoxGeometry(0.05, 0.05, 0.5).translate(0.68, 0.28, 0));
  return mergeGeometries(parts, false)!;
}

/** Ski-lift pylon: two legs, cross head with sheave beams; 9 m tall, head at y 8.6, ±1.4 m in z. */
export function liftPylonGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const z of [-0.5, 0.5]) parts.push(new THREE.CylinderGeometry(0.16, 0.22, 8.5, 8).translate(0, 4.25, z));
  parts.push(new THREE.BoxGeometry(0.4, 0.4, 3.4).translate(0, 8.6, 0));
  for (const z of [-1.4, 1.4]) parts.push(new THREE.BoxGeometry(1.6, 0.16, 0.3).translate(0, 8.45, z));
  for (const y of [2.5, 5.5]) parts.push(new THREE.BoxGeometry(0.1, 0.1, 1.2).translate(0, y, 0));
  parts.push(new THREE.BoxGeometry(1.6, 0.5, 1.6).translate(0, 0.25, 0));
  return bakeAO(mergeGeometries(parts, false)!, 1.5, 0.3);
}

/** Lift chair: hanger bar, seat, back and a safety bar; hangs 2.2 m below the origin (the cable). */
export function liftChairGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(new THREE.CylinderGeometry(0.03, 0.03, 1.7, 6).translate(0, -0.85, 0));
  parts.push(new THREE.BoxGeometry(1.4, 0.08, 0.5).translate(0, -1.75, 0.15));
  parts.push(new THREE.BoxGeometry(1.4, 0.55, 0.06).translate(0, -1.45, -0.12));
  parts.push(new THREE.BoxGeometry(1.4, 0.04, 0.04).translate(0, -1.3, 0.45));
  for (const x of [-0.68, 0.68]) parts.push(new THREE.BoxGeometry(0.04, 0.7, 0.5).translate(x, -1.5, 0.15));
  return mergeGeometries(parts, false)!;
}

/** Brazier: a drum with a cut top and a grate of flames (emissive material); origin bottom centre. */
export function brazierGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(new THREE.CylinderGeometry(0.34, 0.3, 0.9, 12, 1, true).translate(0, 0.45, 0));
  for (const y of [0.1, 0.45, 0.8]) parts.push(new THREE.TorusGeometry(0.34, 0.025, 5, 12).rotateX(Math.PI / 2).translate(0, y, 0));
  return mergeGeometries(parts, false)!;
}

/** Brazier fire: a low lumpy lobe sitting in the drum mouth. */
export function brazierFireGeometry(): THREE.BufferGeometry {
  return new THREE.IcosahedronGeometry(0.26, 1).scale(1, 1.4, 1).translate(0, 0.95, 0);
}

/** Lantern head: a small cage with a glass block; hangs from the origin. */
export function lanternGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(new THREE.BoxGeometry(0.34, 0.04, 0.34).translate(0, -0.06, 0));
  parts.push(new THREE.BoxGeometry(0.3, 0.04, 0.3).translate(0, -0.5, 0));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(new THREE.BoxGeometry(0.025, 0.46, 0.025).translate(sx * 0.14, -0.28, sz * 0.14));
  return mergeGeometries(parts, false)!;
}

/** Lantern glass (emissive batch): the block inside the cage. */
export function lanternGlassGeometry(): THREE.BufferGeometry {
  return new THREE.BoxGeometry(0.22, 0.36, 0.22).translate(0, -0.28, 0);
}

/**
 * Round 11 conifer: trunk + 7 tiers of 5–6 tapered branch lobes (open 5-segment cones pointing
 * outward and drooping), each lobe with a flattened snow load on top; seeded lengths / rotations.
 * ≈ 440 tris per tree (tree + snow); height 8 m. Colours: dark green, darker toward the trunk.
 */
export function coniferGeometry2(seed: number): { tree: THREE.BufferGeometry; snow: THREE.BufferGeometry } {
  const rnd = lcgExt(seed);
  const tree: THREE.BufferGeometry[] = [];
  const snow: THREE.BufferGeometry[] = [];
  const H = 8;
  const trunk = new THREE.CylinderGeometry(0.08, 0.3, H * 0.92, 6).translate(0, H * 0.46, 0);
  setColors(trunk, (_x, y) => {
    const s = 0.45 + 0.55 * Math.min(1, y / 2.5);
    return [0.2 * s, 0.14 * s, 0.1 * s];
  });
  tree.push(trunk);
  const tiers = 7;
  for (let k = 0; k < tiers; k++) {
    const t = k / (tiers - 1);
    const y = 1.5 + t * (H * 0.8 - 1.5);
    const R = 2.4 * (1 - t) + 0.45;
    const n = k < tiers - 2 ? 6 : 5;
    const a0 = rnd() * 6.28;
    for (let i = 0; i < n; i++) {
      const a = a0 + (i / n) * Math.PI * 2 + (rnd() - 0.5) * 0.4;
      const L = R * (0.8 + rnd() * 0.35);
      const rl = 0.22 + 0.22 * (1 - t);
      const droop = -0.22 - rnd() * 0.25;
      const lobe = new THREE.ConeGeometry(rl, L, 5, 1, true).rotateZ(-Math.PI / 2).translate(L / 2 + 0.05, 0, 0).rotateZ(droop).rotateY(a).translate(0, y, 0);
      const shade = 0.75 + rnd() * 0.25;
      setColors(lobe, (x, _y, z) => {
        const d = Math.min(1, Math.hypot(x, z) / L);
        const s = (0.45 + 0.55 * d) * shade;
        return [0.07 * s, 0.16 * s, 0.11 * s];
      });
      tree.push(lobe);
      const cap = new THREE.ConeGeometry(rl * 0.98, L * 0.92, 5, 1, true).rotateZ(-Math.PI / 2).scale(1, 0.5, 1).translate(L / 2 + 0.05, rl * 0.6, 0).rotateZ(droop).rotateY(a).translate(0, y, 0);
      setColors(cap, (x, _y, z) => {
        const d = Math.min(1, Math.hypot(x, z) / L);
        const s = 0.8 + 0.2 * d;
        return [0.86 * s, 0.9 * s, 0.98 * s];
      });
      snow.push(cap);
    }
  }
  const spike = new THREE.ConeGeometry(0.3, 1.5, 5).translate(0, H * 0.8 + 0.6, 0);
  setColors(spike, () => [0.07, 0.15, 0.1]);
  tree.push(spike);
  const spikeSnow = new THREE.ConeGeometry(0.2, 0.7, 5).translate(0, H * 0.8 + 1.1, 0);
  setColors(spikeSnow, () => [0.94, 0.96, 1.0]);
  snow.push(spikeSnow);
  return { tree: mergeGeometries(tree, false)!, snow: mergeGeometries(snow, false)! };
}

/** Frozen waterfall / ice curtain: a tall slab with vertical ribs and a splayed foot; unit height, 1 wide, origin bottom centre. */
export function iceCurtainGeometry(seed: number): THREE.BufferGeometry {
  const rnd = lcgExt(seed);
  const parts: THREE.BufferGeometry[] = [];
  const n = 9;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1) - 0.5) * 0.9;
    const w = 0.09 + rnd() * 0.08;
    const h = 0.75 + rnd() * 0.25;
    const d = 0.12 + rnd() * 0.14;
    parts.push(new THREE.CylinderGeometry(w * 0.6, w, h, 6).translate(x, h / 2, d * 0.5 - 0.1));
  }
  parts.push(new THREE.CylinderGeometry(0.55, 0.62, 0.12, 12).scale(1, 1, 0.5).translate(0, 0.06, 0.05));
  const g = mergeGeometries(parts, false)!;
  return setColors(g, (_x, y) => {
    const s = 0.7 + 0.3 * Math.min(1, y * 1.5);
    return [0.72 * s, 0.86 * s, 0.98 * s];
  });
}

/** Strata band silhouette: a mesa profile with horizontal dark bands drawn in, for the far tiers. */
export function strataSilhouette(rng: { next(): number; range(a: number, b: number): number }): THREE.CanvasTexture {
  const W = 1024;
  const H = 512;
  const [c, g] = canvas(W, H);
  g.clearRect(0, 0, W, H);
  g.fillStyle = '#fff';
  g.beginPath();
  g.moveTo(0, H);
  let x = 0;
  let y = H * 0.62;
  while (x < W) {
    const w = rng.range(90, 320);
    const flat = rng.next() < 0.55;
    if (flat) {
      g.lineTo(x + w, y);
    } else {
      const ny = H * rng.range(0.28, 0.75);
      g.lineTo(x + w * 0.25, ny);
      g.lineTo(x + w, ny + rng.range(-14, 14));
      y = ny;
    }
    x += w;
  }
  g.lineTo(W, H * 0.62);
  g.lineTo(W, H);
  g.closePath();
  g.fill();
  // Bands: only where the mesa is (source-atop keeps the alpha).
  g.globalCompositeOperation = 'source-atop';
  let by = H * 0.26;
  while (by < H) {
    const h = rng.range(6, 30);
    const a = rng.range(0.12, 0.42);
    g.fillStyle = `rgba(60,25,15,${a})`;
    g.fillRect(0, by, W, h);
    g.fillStyle = 'rgba(255,240,220,0.18)';
    g.fillRect(0, by + h, W, 3);
    by += h + rng.range(8, 36);
  }
  // Foot shade and talus.
  const grad = g.createLinearGradient(0, H * 0.7, 0, H);
  grad.addColorStop(0, 'rgba(40,15,10,0)');
  grad.addColorStop(1, 'rgba(40,15,10,0.5)');
  g.fillStyle = grad;
  g.fillRect(0, H * 0.7, W, H * 0.3);
  g.globalCompositeOperation = 'source-over';
  return tex(c);
}
