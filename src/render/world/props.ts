/**
 * Instanced prop kit + geometry helpers shared by the biome builders.
 * Every prop type is one InstancedMesh; placement is seeded from the track.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { fogify } from '../lighting/environment';

export class PropBatch {
  private readonly items: { m: THREE.Matrix4; c: THREE.Color | null }[] = [];
  constructor(
    readonly name: string,
    readonly geometry: THREE.BufferGeometry,
    readonly material: THREE.Material,
    readonly shadows = true,
  ) {
    fogify(material);
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

  build(): THREE.InstancedMesh | null {
    if (this.items.length === 0) return null;
    const mesh = new THREE.InstancedMesh(this.geometry, this.material, this.items.length);
    mesh.name = `props:${this.name}`;
    let anyColor = false;
    this.items.forEach((it, i) => {
      mesh.setMatrixAt(i, it.m);
      if (it.c) {
        mesh.setColorAt(i, it.c);
        anyColor = true;
      }
    });
    if (anyColor) {
      this.items.forEach((it, i) => {
        if (!it.c) mesh.setColorAt(i, new THREE.Color(0xffffff));
      });
      mesh.instanceColor!.needsUpdate = true;
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = this.shadows;
    mesh.receiveShadow = this.shadows;
    mesh.frustumCulled = false;
    return mesh;
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
  const body = new THREE.CylinderGeometry(0.29, 0.29, 0.88, 20, 1, false);
  body.translate(0, 0.44, 0);
  parts.push(body);
  for (const y of [0.3, 0.58]) {
    const rib = new THREE.TorusGeometry(0.295, 0.016, 6, 20);
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
    const t = new THREE.TorusGeometry(0.26, 0.1, 8, 20);
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

/** Roof truss segment 12 m long: top/bottom chords + diagonals, centred. */
export function trussGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const L = 12;
  const H = 1.1;
  for (const y of [0, H]) {
    const c = new THREE.BoxGeometry(L, 0.1, 0.1);
    c.translate(0, y, 0);
    parts.push(c);
  }
  const n = 10;
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

/** Sodium lamp: conical shade + bright disc, hanging from a 1 m cable, origin at cable top. */
export function lampGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const cable = new THREE.CylinderGeometry(0.01, 0.01, 1.0, 5);
  cable.translate(0, -0.5, 0);
  parts.push(cable);
  const shade = new THREE.ConeGeometry(0.45, 0.35, 16, 1, true);
  shade.translate(0, -1.15, 0);
  parts.push(shade);
  return mergeGeometries(parts, false)!;
}

export function lampBulbGeometry(): THREE.BufferGeometry {
  const disc = new THREE.CylinderGeometry(0.28, 0.28, 0.04, 16);
  disc.translate(0, -1.31, 0);
  return disc;
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
export function rockGeometry(seed: number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, 2);
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
