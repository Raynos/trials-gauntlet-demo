/**
 * ROCKHOP zone kit geometry (store release Phase 2, D5 / D20 / D23): every prop the four zones place,
 * built from primitives with the colour baked per vertex (linear RGB) so a zone kit shares a handful of
 * library materials and `buildBatches` bakes each material into one draw per chunk. Unit sizes are real
 * metres; origin at the bottom centre unless a recipe says otherwise. No textures are created here.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type RGB = [number, number, number];

/** sRGB hex → linear RGB (vertex colours are linear in the shader). */
export function rgb(hex: number): RGB {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
}

export function lcg(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Paint every vertex of `g` (optionally through `f(x, y, z) → multiplier`). */
export function paint(g: THREE.BufferGeometry, col: RGB, f?: (x: number, y: number, z: number) => number): THREE.BufferGeometry {
  const p = g.getAttribute('position');
  const c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const k = f ? f(p.getX(i), p.getY(i), p.getZ(i)) : 1;
    c[i * 3] = col[0] * k;
    c[i * 3 + 1] = col[1] * k;
    c[i * 3 + 2] = col[2] * k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}

/** Merge parts, normalising index / attribute sets (primitives are indexed, extrusions are not). */
export function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const indexed = parts.every((g) => !!g.index);
  const list = parts.map((g) => {
    let h = indexed ? g : g.index ? g.toNonIndexed() : g;
    if (!h.getAttribute('color')) h = paint(h, [1, 1, 1]);
    if (!h.getAttribute('uv')) h.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(h.getAttribute('position').count * 2), 2));
    for (const n of Object.keys(h.attributes)) if (n !== 'position' && n !== 'normal' && n !== 'uv' && n !== 'color') h.deleteAttribute(n);
    return h;
  });
  const m = mergeGeometries(list, false);
  if (!m) throw new Error('zone geo: merge failed');
  return m;
}

/** Multiply a vertical ambient-occlusion ramp into the colours: dark at the foot, `h` metres tall. */
export function ao(g: THREE.BufferGeometry, h: number, strength = 0.45, base = 0): THREE.BufferGeometry {
  const p = g.getAttribute('position');
  const c = g.getAttribute('color') as THREE.BufferAttribute | undefined;
  if (!c) return g;
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  const n = g.getAttribute('normal');
  for (let i = 0; i < p.count; i++) {
    const t = Math.min(1, Math.max(0, (p.getY(i) - base) / Math.max(0.05, h)));
    let k = 1 - strength * (1 - t * t * (3 - 2 * t));
    if (n.getY(i) < -0.5) k *= 0.6;
    c.setXYZ(i, c.getX(i) * k, c.getY(i) * k, c.getZ(i) * k);
  }
  return g;
}

export function box(w: number, h: number, d: number, x: number, y: number, z: number, col: RGB, rz = 0, ry = 0, rx = 0): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rx) g.rotateX(rx);
  if (rz) g.rotateZ(rz);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  return paint(g, col);
}

/** Cylinder along `axis`, centred at (x, y, z). */
export function cyl(r0: number, r1: number, h: number, seg: number, x: number, y: number, z: number, col: RGB, axis: 'x' | 'y' | 'z' = 'y', open = false): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r0, r1, h, seg, 1, open);
  if (axis === 'x') g.rotateZ(Math.PI / 2);
  else if (axis === 'z') g.rotateX(Math.PI / 2);
  g.translate(x, y, z);
  return paint(g, col);
}

/** A beam from a to b (square section `s`). */
export function beam(ax: number, ay: number, az: number, bx: number, by: number, bz: number, s: number, col: RGB): THREE.BufferGeometry {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const L = Math.hypot(dx, dy, dz);
  const g = new THREE.BoxGeometry(s, L, s);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx / L, dy / L, dz / L));
  g.applyQuaternion(q);
  g.translate((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
  return paint(g, col);
}

/** A lattice mast `h` tall with `w` square section: four chords + zig-zag bracing on each face. */
export function lattice(w: number, h: number, col: RGB, s = 0.1, bays = Math.max(2, Math.round(h / w))): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const hw = w / 2;
  for (const [x, z] of [[-hw, -hw], [hw, -hw], [hw, hw], [-hw, hw]] as const) parts.push(box(s, h, s, x, h / 2, z, col));
  const bh = h / bays;
  for (let i = 0; i < bays; i++) {
    const y0 = i * bh;
    const y1 = y0 + bh;
    const f = i % 2 ? 1 : -1;
    parts.push(beam(-hw * f, y0, -hw, hw * f, y1, -hw, s * 0.6, col), beam(-hw * f, y0, hw, hw * f, y1, hw, s * 0.6, col));
    parts.push(beam(-hw, y0, -hw * f, -hw, y1, hw * f, s * 0.6, col), beam(hw, y0, -hw * f, hw, y1, hw * f, s * 0.6, col));
    parts.push(box(w, s * 0.7, s * 0.7, 0, y1, -hw, col), box(w, s * 0.7, s * 0.7, 0, y1, hw, col));
  }
  return parts;
}

// ---------------------------------------------------------------------------
// COAST
// ---------------------------------------------------------------------------

/** Ship-to-shore gantry crane (C-ride): four legs on rails, a portal beam, a boom reaching `boom` m out over −z. ~24 m tall. */
export function gantryCraneGeometry(col: number = 0x2e8c8a, boom = 34): THREE.BufferGeometry {
  const c = rgb(col);
  const d = rgb(0x1d5f5e);
  const w = rgb(0xe8e2d0);
  const parts: THREE.BufferGeometry[] = [];
  const H = 20;
  const hx = 7;
  const hz = 6;
  for (const x of [-hx, hx]) {
    for (const z of [-hz, hz]) parts.push(box(1.1, H, 1.1, x, H / 2, z, c));
    parts.push(box(1.0, 0.9, hz * 2 + 1.2, x, 3.2, 0, d)); // sill beam
    parts.push(beam(x, 3.6, -hz, x, H - 1, hz, 0.45, c), beam(x, 3.6, hz, x, H - 1, -hz, 0.45, c));
    parts.push(box(1.6, 0.8, hz * 2 + 2, x, 0.4, 0, rgb(0x3a3a38))); // bogie
  }
  for (const z of [-hz, hz]) parts.push(box(hx * 2 + 1.1, 1.3, 1.2, 0, H + 0.2, z, c));
  // Boom: a box girder at H + 2 running from +hz + 8 (backreach) out to −boom, with the trolley rail.
  const zb0 = hz + 10;
  const zb1 = -boom;
  const len = zb0 - zb1;
  parts.push(box(2.2, 1.8, len, 0, H + 2.2, (zb0 + zb1) / 2, c));
  parts.push(box(2.4, 0.3, len, 0, H + 1.2, (zb0 + zb1) / 2, d));
  // A-frame apex + forestays down to the boom tip and the backreach.
  parts.push(beam(-hx * 0.5, H + 1, 0, 0, H + 11, 0, 0.8, c), beam(hx * 0.5, H + 1, 0, 0, H + 11, 0, 0.8, c));
  parts.push(beam(0, H + 11, 0, 0, H + 3.1, zb1 + 2, 0.22, w), beam(0, H + 11, 0, 0, H + 3.1, zb1 * 0.5, 0.22, w), beam(0, H + 11, 0, 0, H + 3.1, zb0 - 1, 0.25, w));
  // Machinery house and the operator cab under the boom.
  parts.push(box(5, 3.4, 7, 0, H + 4.8, hz + 5, w));
  parts.push(box(2.2, 2.0, 2.2, 1.6, H - 0.6, -hz - 3, w));
  parts.push(box(3.2, 1.2, 3.0, 0, H + 0.8, -hz - 6, d)); // trolley
  return ao(merge(parts), 6, 0.35);
}

/** Rusted hull side (the beached coaster): `L` m along x, ~8 m tall, 9 m beam in z, bow at +x. */
export function hullGeometry(seed = 1, L = 36): THREE.BufferGeometry {
  const rnd = lcg(seed);
  const parts: THREE.BufferGeometry[] = [];
  const H = 7.5;
  const shape = new THREE.Shape();
  shape.moveTo(-L / 2, H);
  shape.lineTo(L / 2 + 2.5, H + 1.2); // sheer rising to the bow
  shape.lineTo(L / 2 - 1.5, 1.0);
  shape.quadraticCurveTo(L / 2 - 5, 0, L / 2 - 9, 0);
  shape.lineTo(-L / 2 + 3, 0);
  shape.quadraticCurveTo(-L / 2, 0.3, -L / 2, 2.5);
  shape.lineTo(-L / 2, H);
  const body = new THREE.ExtrudeGeometry(shape, { depth: 9, bevelEnabled: true, bevelSize: 0.9, bevelThickness: 1.6, bevelSegments: 2, steps: 1, curveSegments: 6 });
  body.translate(0, 0, -4.5);
  const rust = rgb(0x8a4a2c);
  const rust2 = rgb(0x5e3424);
  const band = rgb(0x2a4e56);
  paint(body, [1, 1, 1]);
  {
    const p = body.getAttribute('position');
    const c = body.getAttribute('color') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const streak = 0.62 + 0.38 * Math.abs(Math.sin(x * 1.3 + Math.sin(x * 0.37) * 3)) * (0.7 + 0.3 * Math.sin(y * 2.1));
      const base = y < 1.6 ? band : y < 2.0 ? rgb(0xd8d0c0) : y > H - 1.2 ? rust2 : rust;
      const k = streak * (0.8 + 0.2 * Math.min(1, y / H));
      c.setXYZ(i, base[0] * k, base[1] * k, base[2] * k);
    }
  }
  parts.push(body);
  // Superstructure aft: bridge block, wheelhouse, funnel, mast.
  const white = rgb(0xcfc6b4);
  parts.push(box(8, 5, 8, -L / 2 + 6, H + 2.5, 0, white));
  parts.push(box(6, 2.4, 9.4, -L / 2 + 6.5, H + 6.2, 0, white));
  for (let i = 0; i < 5; i++) parts.push(box(0.9, 0.9, 0.1, -L / 2 + 3.9 + i * 1.3, H + 6.3, 4.72, rgb(0x1a2428)));
  parts.push(cyl(0.9, 1.1, 4, 8, -L / 2 + 3.5, H + 8.5, 0, rgb(0x6a2a1e)));
  parts.push(cyl(0.12, 0.16, 9, 5, L / 4, H + 4.5, 0, rust2));
  parts.push(box(0.14, 0.14, 5, L / 4, H + 7, 0, rust2));
  for (let i = 0; i < 9; i++) parts.push(cyl(0.28, 0.28, 0.1, 8, -L / 2 + 10 + i * 2.6, H - 2.2, 5.6, rgb(0x1a2226), 'z'));
  // Hatch coamings on deck.
  for (let i = 0; i < 3; i++) parts.push(box(5 + rnd() * 2, 0.9, 6.5, -L / 2 + 15 + i * 7, H + 0.45, 0, rust2));
  return merge(parts);
}

/** Lighthouse (red / white bands) on its own plinth; ~18 m tall. */
export function lighthouseGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const white = rgb(0xf2eee6);
  const red = rgb(0xc43a2c);
  const n = 6;
  for (let i = 0; i < n; i++) {
    const y0 = 1.2 + i * 2.4;
    const r0 = 2.2 - i * 0.18;
    parts.push(cyl(r0 - 0.18, r0, 2.4, 14, 0, y0 + 1.2, 0, i % 2 ? red : white));
  }
  const top = 1.2 + n * 2.4;
  parts.push(cyl(1.7, 1.7, 0.3, 14, 0, top + 0.15, 0, rgb(0x2a2c30)));
  parts.push(cyl(1.0, 1.0, 1.6, 10, 0, top + 1.1, 0, rgb(0xfff2c8)));
  parts.push(cyl(0.2, 1.25, 1.0, 10, 0, top + 2.4, 0, red));
  parts.push(cyl(3, 3.4, 1.2, 12, 0, 0.6, 0, rgb(0xb8b0a0)));
  return merge(parts);
}

/** Navigation buoy: banded teal body, yellow bands, a lattice cage and a light; `h` m tall (default 2.6 scatter, 6 for the gate). */
export function buoyGeometry(h = 2.6): THREE.BufferGeometry {
  const teal = rgb(0x1f7c80);
  const yel = rgb(0xf0c030);
  const dark = rgb(0x24302f);
  const parts: THREE.BufferGeometry[] = [];
  const r = h * 0.2;
  const bh = h * 0.62;
  parts.push(cyl(r * 0.78, r, bh * 0.35, 14, 0, bh * 0.175, 0, teal));
  parts.push(cyl(r * 0.7, r * 0.78, bh * 0.14, 14, 0, bh * 0.42, 0, yel));
  parts.push(cyl(r * 0.6, r * 0.7, bh * 0.28, 14, 0, bh * 0.63, 0, teal));
  parts.push(cyl(r * 0.52, r * 0.6, bh * 0.1, 14, 0, bh * 0.82, 0, yel));
  parts.push(cyl(r * 0.5, r * 0.52, bh * 0.1, 14, 0, bh * 0.95, 0, teal));
  parts.push(cyl(r * 1.05, r * 1.05, bh * 0.05, 14, 0, bh * 0.02, 0, dark));
  // Cage: four legs to a top ring + light.
  const cr = r * 0.45;
  const ch = h - bh;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    parts.push(beam(Math.cos(a) * cr, bh, Math.sin(a) * cr, Math.cos(a) * cr * 0.5, h - 0.2, Math.sin(a) * cr * 0.5, r * 0.06, yel));
  }
  parts.push(cyl(cr * 0.55, cr * 0.55, r * 0.06, 10, 0, bh + ch * 0.45, 0, yel, 'y', false));
  parts.push(cyl(cr * 0.5, cr * 0.5, r * 0.08, 10, 0, h - 0.2, 0, yel));
  parts.push(cyl(r * 0.12, r * 0.16, r * 0.3, 8, 0, h - 0.05, 0, rgb(0xd8c090)));
  return ao(merge(parts), h * 0.4, 0.3);
}

/** Mooring bollard (0.8 m). */
export function bollardGeometry(): THREE.BufferGeometry {
  const c = rgb(0x2c3234);
  return merge([cyl(0.22, 0.26, 0.6, 10, 0, 0.3, 0, c), cyl(0.34, 0.34, 0.12, 10, 0, 0.66, 0, c), box(0.9, 0.12, 0.9, 0, 0.06, 0, rgb(0x5a5a56))]);
}

/** Coil of mooring rope (tan), 0.9 m across. */
export function ropeCoilGeometry(): THREE.BufferGeometry {
  const c = rgb(0x8a6a44);
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) {
    const t = new THREE.TorusGeometry(0.36 - i * 0.02, 0.055, 5, 14).rotateX(Math.PI / 2).translate(0, 0.055 + i * 0.1, 0);
    parts.push(paint(t, c, () => 0.85 + 0.05 * i));
  }
  return merge(parts);
}

/** Heap of fishing net / tarp: a lumpy flattened blob, teal-green; 2.2 × 0.7 × 1.6. */
export function netPileGeometry(seed = 3): THREE.BufferGeometry {
  const rnd = lcg(seed);
  const g = new THREE.IcosahedronGeometry(1, 2);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const k = 0.8 + rnd() * 0.35;
    p.setXYZ(i, x * 1.1 * k, Math.max(-0.1, y) * 0.4 * k, z * 0.8 * k);
  }
  g.computeVertexNormals();
  g.translate(0, 0.08, 0);
  return paint(g, rgb(0x2e5a4e), (x, y) => 0.7 + 0.3 * Math.sin(x * 9) * Math.sin(y * 13 + x * 3) + 0.3);
}

/** Twisted scrap: rusted beams and plates in a heap, ~3 × 1.4 × 2 m. */
export function scrapHeapGeometry(seed = 5): THREE.BufferGeometry {
  const rnd = lcg(seed);
  const parts: THREE.BufferGeometry[] = [];
  const cols = [rgb(0xb0643a), rgb(0x8a4a2c), rgb(0xb88a5a), rgb(0x6a7a7a)];
  for (let i = 0; i < 9; i++) {
    const c = cols[i % cols.length]!;
    const w = 0.6 + rnd() * 2.2;
    const plate = rnd() < 0.4;
    const g = box(w, plate ? 0.05 : 0.14, plate ? 0.8 + rnd() * 0.6 : 0.14, (rnd() - 0.5) * 2, 0.2 + rnd() * 0.9, (rnd() - 0.5) * 1.4, c, (rnd() - 0.5) * 1.6, rnd() * 3, (rnd() - 0.5) * 0.8);
    parts.push(g);
  }
  return ao(merge(parts), 1.2, 0.4);
}

/** A tyre lying flat (truck tyre, 1.1 m). */
export function tyreFlatGeometry(): THREE.BufferGeometry {
  return paint(new THREE.TorusGeometry(0.42, 0.16, 6, 16).rotateX(Math.PI / 2).translate(0, 0.16, 0), rgb(0x2a2a2a));
}

/** Concrete quay block with a dark waterline, `1` m wide unit (scale x), 3 m tall, 6 m deep. */
export function quayGeometry(): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(1, 3, 6, 1, 3, 1).translate(0, 1.5, 0);
  return paint(g, rgb(0xa8a296), (_x, y) => (y < 0.9 ? 0.55 : 0.9 + 0.1 * Math.min(1, y / 3)));
}

/** Timber pier pile (unit height, scale y). */
export function pileGeometry(): THREE.BufferGeometry {
  return paint(new THREE.CylinderGeometry(0.2, 0.22, 1, 7).translate(0, 0.5, 0), rgb(0x5a4632), (_x, y) => (y < 0.35 ? 0.55 : 1));
}

/** Gull: two swept wings (the renderer's zone shader flaps them), 1 m span. */
export function gullGeometry(): THREE.BufferGeometry {
  const pos = new Float32Array([
    // left wing
    0, 0, 0, -0.5, 0.06, 0.1, -0.12, 0, 0.14,
    // right wing
    0, 0, 0, 0.12, 0, 0.14, 0.5, 0.06, 0.1,
    // body
    0, -0.02, -0.14, -0.05, 0, 0.18, 0.05, 0, 0.18,
  ]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.computeVertexNormals();
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(pos.length / 3 * 2), 2));
  return paint(g, [0.95, 0.95, 0.95]);
}

// ---------------------------------------------------------------------------
// ALPINE
// ---------------------------------------------------------------------------

/**
 * Spruce: a trunk and whorls of drooping branch lobes, dark at the core and lighter / warmer at the tips and on
 * the sunward (−x, +z) side, with an optional snow load on each lobe. `detail` 1 = near (7 whorls × 6 lobes,
 * ~450 tris), 0 = far (4 whorls × 5 lobes, ~170 tris). ~10 m tall, origin at the foot.
 */
export function pineGeometry(seed: number, detail: 0 | 1, snow = false): { tree: THREE.BufferGeometry; snow: THREE.BufferGeometry | null } {
  const rnd = lcg(seed);
  const tree: THREE.BufferGeometry[] = [];
  const caps: THREE.BufferGeometry[] = [];
  const H = 10;
  tree.push(paint(new THREE.CylinderGeometry(0.09, 0.3, H * 0.92, 6).translate(0, H * 0.46, 0), rgb(0x4a3424), (_x, y) => 0.5 + 0.5 * Math.min(1, y / 3)));
  const core = rgb(snow ? 0x0e1e16 : 0x0f2014);
  const tip = rgb(snow ? 0x2e4e36 : 0x3a5a2a);
  const whorls = detail ? 8 : 5;
  for (let k = 0; k < whorls; k++) {
    const t = k / (whorls - 1);
    const y = 1.4 + t * (H * 0.8 - 1.4);
    const R = (2.3 * (1 - t) + 0.45) * (0.85 + rnd() * 0.3);
    const n = detail ? (k < whorls - 2 ? 8 : 6) : 7;
    const a0 = rnd() * 6.28;
    for (let i = 0; i < n; i++) {
      const a = a0 + (i / n) * Math.PI * 2 + (rnd() - 0.5) * 0.5;
      const L = R * (0.8 + rnd() * 0.35);
      const rl = (0.42 + 0.34 * (1 - t)) * (detail ? 1 : 1.5);
      const droop = -0.28 - rnd() * 0.3;
      const lobe = new THREE.ConeGeometry(rl, L, 5, 1, true).rotateZ(-Math.PI / 2).translate(L / 2 + 0.05, 0, 0).rotateZ(droop).rotateY(a).translate(0, y, 0);
      const shade = 0.8 + rnd() * 0.3;
      const p = lobe.getAttribute('position');
      const c = new Float32Array(p.count * 3);
      for (let v = 0; v < p.count; v++) {
        const x = p.getX(v);
        const z = p.getZ(v);
        const d = Math.min(1, Math.hypot(x, z) / Math.max(0.01, L));
        const sun = Math.max(0, (-x * 0.6 + z * 0.8) / Math.max(0.01, Math.hypot(x, z)));
        const s = Math.min(1, d * (0.55 + 0.45 * sun)) * shade;
        c[v * 3] = core[0] + (tip[0] - core[0]) * s;
        c[v * 3 + 1] = core[1] + (tip[1] - core[1]) * s;
        c[v * 3 + 2] = core[2] + (tip[2] - core[2]) * s;
      }
      lobe.setAttribute('color', new THREE.BufferAttribute(c, 3));
      tree.push(lobe);
      if (snow) {
        const cap = new THREE.ConeGeometry(rl * 0.95, L * 0.9, 5, 1, true).rotateZ(-Math.PI / 2).scale(1, 0.45, 1).translate(L / 2 + 0.05, rl * 0.62, 0).rotateZ(droop).rotateY(a).translate(0, y, 0);
        caps.push(paint(cap, rgb(0xf2f6fc), (x, _y, z) => 0.82 + 0.18 * Math.min(1, Math.hypot(x, z) / L)));
      }
    }
  }
  tree.push(paint(new THREE.ConeGeometry(0.32, 1.6, 5).translate(0, H * 0.8 + 0.7, 0), tip, () => 0.7));
  if (snow) caps.push(paint(new THREE.ConeGeometry(0.22, 0.7, 5).translate(0, H * 0.8 + 1.2, 0), rgb(0xf4f8ff)));
  return { tree: merge(tree), snow: caps.length ? merge(caps) : null };
}

/** Sawmill: a timber mill house (log walls, shingle roof, loading door), a flume on trestles and a water wheel. Origin at the wheel side foot; ~11 × 8 × 8. */
export function sawmillGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const wood = rgb(0x8a6440);
  const woodD = rgb(0x5e4028);
  const roof = rgb(0x5a5a58);
  // Log walls: horizontal logs on the camera face and the ends.
  for (let i = 0; i < 12; i++) {
    const y = 0.8 + i * 0.36;
    parts.push(cyl(0.18, 0.18, 10.4, 6, 0, y, 3.4, i % 2 ? wood : woodD, 'x'));
    parts.push(cyl(0.18, 0.18, 7.2, 6, -5, y, 0, i % 2 ? woodD : wood, 'z'));
    parts.push(cyl(0.18, 0.18, 7.2, 6, 5, y, 0, i % 2 ? woodD : wood, 'z'));
  }
  parts.push(box(10, 4.3, 6.6, 0, 2.95, -0.1, woodD)); // core
  parts.push(box(10.6, 0.8, 7.6, 0, 0.4, 0, rgb(0x6a6a64))); // stone footing
  // Gable roof.
  const r = new THREE.Shape();
  r.moveTo(-4.3, 0);
  r.lineTo(0, 3.2);
  r.lineTo(4.3, 0);
  r.lineTo(-4.3, 0);
  const gable = new THREE.ExtrudeGeometry(r, { depth: 10, bevelEnabled: false }).rotateY(Math.PI / 2).translate(-5, 5.0, 0);
  parts.push(paint(gable, woodD));
  for (const s of [-1, 1]) parts.push(box(11.4, 0.22, 5.6, 0, 6.55, s * 2.05, roof, 0, 0, s * -0.64));
  // Door + windows on the camera face.
  parts.push(box(2.2, 2.6, 0.1, -2, 2.1, 3.62, rgb(0x2a1e14)));
  for (const x of [1.4, 3.4]) parts.push(box(1.1, 0.9, 0.1, x, 3.1, 3.62, rgb(0x1a1c1c)));
  // Flume on trestles from the back to above the wheel.
  parts.push(box(0.9, 0.5, 9, 6.6, 6.2, -2.5, wood));
  for (const z of [-6, -2]) parts.push(box(0.2, 6, 0.2, 6.6, 3, z, woodD));
  return ao(merge(parts), 2.5, 0.4);
}

/** Water wheel, axis along z, radius 3.2 (centre at y = 3.4 from its foot). */
export function waterWheelGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const wood = rgb(0x7a5838);
  const R = 3.2;
  for (const z of [-0.6, 0.6]) parts.push(paint(new THREE.TorusGeometry(R, 0.12, 5, 20).translate(0, 3.4, z), wood));
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    parts.push(box(0.9, 0.08, 1.3, Math.cos(a) * (R - 0.3), 3.4 + Math.sin(a) * (R - 0.3), 0, wood, a + Math.PI / 2));
    if (i % 2 === 0) parts.push(box(R * 2, 0.12, 0.12, 0, 3.4, 0, wood, a));
  }
  parts.push(cyl(0.3, 0.3, 1.8, 8, 0, 3.4, 0, rgb(0x3a3a3a), 'z'));
  return merge(parts);
}

/** Log stack: `rows` rows of barked logs along z (the camera sees the cut ends), 4 m long. */
export function logStackGeometry(seed = 7, rows = 3, width = 5): THREE.BufferGeometry {
  const rnd = lcg(seed);
  const bark = rgb(0x5a4030);
  const end = rgb(0xd8b484);
  const parts: THREE.BufferGeometry[] = [];
  for (let r = 0; r < rows; r++) {
    const n = Math.max(1, Math.round(width / 0.62) - r);
    for (let i = 0; i < n; i++) {
      const R = 0.26 + rnd() * 0.06;
      const x = (i - (n - 1) / 2) * 0.6;
      const y = R + r * 0.5;
      const L = 3.6 + rnd() * 0.6;
      const g = new THREE.CylinderGeometry(R, R, L, 9, 1, false).rotateX(Math.PI / 2).translate(x, y, (rnd() - 0.5) * 0.3);
      // End caps (|z| = L/2) take the sawn colour, with rings darker toward the centre.
      paint(g, [1, 1, 1]);
      const p = g.getAttribute('position');
      const c = g.getAttribute('color') as THREE.BufferAttribute;
      for (let k = 0; k < p.count; k++) {
        const isEnd = Math.abs(Math.abs(p.getZ(k) - 0) - L / 2) < 0.2 && Math.hypot(p.getX(k) - x, p.getY(k) - y) < R * 0.98;
        const col = isEnd ? end : bark;
        const s = isEnd ? 0.85 + 0.15 * rnd() : 0.8 + 0.2 * rnd();
        c.setXYZ(k, col[0] * s, col[1] * s, col[2] * s);
      }
      parts.push(g);
    }
  }
  // Two chain stakes.
  for (const s of [-1, 1]) parts.push(box(0.14, rows * 0.5 + 0.5, 0.14, s * (width / 2 + 0.1), (rows * 0.5 + 0.5) / 2, 1.4, rgb(0x4a3a2a)));
  return ao(merge(parts), rows * 0.5, 0.35);
}

/** Logging truck: cab (red), chassis, trailer bolsters with a log load; 14 m long along x, cab at +x. */
export function loggingTruckGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const red = rgb(0xa8321f);
  const dark = rgb(0x222426);
  const chrome = rgb(0xb0b4b8);
  parts.push(box(13, 0.4, 1.4, 0, 1.1, 0, dark));
  parts.push(box(2.6, 2.2, 2.5, 5.6, 2.4, 0, red));
  parts.push(box(1.6, 1.2, 2.4, 6.9, 1.9, 0, red));
  parts.push(box(1.2, 0.9, 2.52, 5.8, 3.0, 0, rgb(0x2a3a44)));
  parts.push(box(0.2, 1.0, 2.2, 7.75, 1.7, 0, chrome));
  parts.push(cyl(0.12, 0.12, 2.2, 6, 4.2, 3.4, 1.0, chrome));
  for (const x of [-5.2, -3.9, 1.2, 2.5, 6.6]) {
    for (const z of [-1.05, 1.05]) parts.push(cyl(0.52, 0.52, 0.42, 12, x, 0.52, z, rgb(0x1c1c1c), 'z'));
  }
  for (const x of [-5.5, -1.5, 2.5]) {
    parts.push(box(0.25, 0.3, 2.6, x, 1.45, 0, dark));
    for (const z of [-1.2, 1.2]) parts.push(box(0.16, 2.2, 0.16, x, 2.55, z, dark));
  }
  const bark = rgb(0x5a4030);
  const end = rgb(0xd8b484);
  const logs: [number, number][] = [[-0.8, 0], [0, 0], [0.8, 0], [-0.4, 0.7], [0.4, 0.7], [0, 1.35]];
  for (const [z, y] of logs) {
    const g = new THREE.CylinderGeometry(0.38, 0.38, 10, 9).rotateZ(Math.PI / 2).translate(-1.6, 2.0 + y, z);
    paint(g, bark, () => 1);
    const p = g.getAttribute('position');
    const c = g.getAttribute('color') as THREE.BufferAttribute;
    for (let k = 0; k < p.count; k++) if (Math.abs(Math.abs(p.getX(k) + 1.6) - 5) < 0.05 && Math.hypot(p.getY(k) - 2.0 - y, p.getZ(k) - z) < 0.36) c.setXYZ(k, end[0], end[1], end[2]);
    parts.push(g);
  }
  return merge(parts);
}

/** Tree stump with a pale ringed top (0.5 m tall, 0.9 m across). */
export function stumpGeometry(): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(0.4, 0.5, 0.55, 9).translate(0, 0.275, 0);
  const bark = rgb(0x5a4030);
  const top = rgb(0xcaa478);
  return paint(g, [1, 1, 1], () => 1) && (() => {
    const p = g.getAttribute('position');
    const c = g.getAttribute('color') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const isTop = p.getY(i) > 0.54 && Math.hypot(p.getX(i), p.getZ(i)) < 0.39;
      const col = isTop ? top : bark;
      c.setXYZ(i, col[0], col[1], col[2]);
    }
    return g;
  })();
}

/** Grass tuft: crossed blades (4 tapered quads), 0.6 m. */
export function grassTuftGeometry(seed = 11, col = 0x5a8a36): THREE.BufferGeometry {
  const rnd = lcg(seed);
  const parts: THREE.BufferGeometry[] = [];
  const c = rgb(col);
  for (let i = 0; i < 6; i++) {
    const g = new THREE.PlaneGeometry(0.12, 0.6, 1, 2);
    const p = g.getAttribute('position');
    for (let k = 0; k < p.count; k++) {
      const y = p.getY(k) + 0.3;
      p.setXYZ(k, p.getX(k) * (1 - y / 0.7), y, y * y * 0.4);
    }
    g.rotateY(rnd() * Math.PI * 2).translate((rnd() - 0.5) * 0.3, 0, (rnd() - 0.5) * 0.3);
    parts.push(paint(g, c, (_x, y) => 0.45 + 0.8 * y));
  }
  return merge(parts);
}

/** Lupin spikes (purple / cream flowers on stalks) in a clump, 0.7 m. */
export function flowerClumpGeometry(seed = 13, col = 0x7a5ac8): THREE.BufferGeometry {
  const rnd = lcg(seed);
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 5; i++) {
    const x = (rnd() - 0.5) * 0.5;
    const z = (rnd() - 0.5) * 0.5;
    const h = 0.4 + rnd() * 0.35;
    parts.push(cyl(0.012, 0.015, h, 3, x, h / 2, z, rgb(0x3a6a2a)));
    parts.push(paint(new THREE.ConeGeometry(0.06, h * 0.45, 5).translate(x, h + h * 0.1, z), rgb(col), (_x, y) => 0.8 + 0.4 * ((y - h) / h)));
  }
  parts.push(paint(new THREE.IcosahedronGeometry(0.22, 0).scale(1.2, 0.5, 1.2).translate(0, 0.08, 0), rgb(0x3e6a2c)));
  return merge(parts);
}

/** Low bush / shrub (0.9 m), vertex colour green or dry. */
export function bushGeometry(seed = 17, col = 0x3e6a2c): THREE.BufferGeometry {
  const rnd = lcg(seed);
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) {
    const r = 0.3 + rnd() * 0.25;
    const g = new THREE.IcosahedronGeometry(r, 0).translate((rnd() - 0.5) * 0.7, r * 0.8, (rnd() - 0.5) * 0.5);
    parts.push(paint(g, rgb(col), (_x, y) => 0.6 + 0.5 * y));
  }
  return merge(parts);
}

/** Timber ramp on log cribbing (decor): planks over two cribs, 6 m long, rising 1.4 m to +x. */
export function timberRampGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const wood = rgb(0x9a7a52);
  const log = rgb(0x6a4c32);
  const ang = Math.atan2(1.4, 6);
  for (let i = 0; i < 12; i++) {
    const x = -2.8 + i * 0.5;
    parts.push(box(0.46, 0.08, 2.6, x, 0.2 + ((x + 3) / 6) * 1.4, 0, i % 3 ? wood : rgb(0x8a6a44), ang));
  }
  for (const [x, n] of [[0, 2], [2.4, 4]] as const) {
    for (let k = 0; k < n; k++) {
      parts.push(cyl(0.14, 0.14, 2.8, 6, x, 0.14 + k * 0.26, 0, log, 'z'));
      parts.push(cyl(0.13, 0.13, 1.4, 6, x + (k % 2 ? 0.5 : -0.5), 0.27 + k * 0.26, 0, log, 'x'));
    }
  }
  return ao(merge(parts), 1, 0.35);
}

/** Split-rail fence section (2.6 m), weathered grey timber. */
export function railFenceGeometry(col = 0x8a7a64): THREE.BufferGeometry {
  const c = rgb(col);
  return ao(merge([box(0.12, 1.2, 0.12, -1.3, 0.6, 0, c), box(2.7, 0.1, 0.08, 0, 0.95, 0, c, 0.03), box(2.7, 0.1, 0.08, 0, 0.55, 0, c, -0.02)]), 1, 0.3);
}

// ---------------------------------------------------------------------------
// QUARRY
// ---------------------------------------------------------------------------

/** Quarry stone palette (Q2): cream, ochre, rose, pale sand. */
export const STONE = [0xefe0c2, 0xe6c898, 0xd8a47a, 0xe8d2b0, 0xcf9a78, 0xf2e6cc].map(rgb);

/** Cut sandstone block, unit cube-ish (1 × 1 × 1, bottom centre) with chipped, jittered corners and drill scars. */
export function cutBlockGeometry(seed = 19): THREE.BufferGeometry {
  const rnd = lcg(seed);
  const g = new THREE.BoxGeometry(1, 1, 1, 2, 2, 2).translate(0, 0.5, 0);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const corner = Math.abs(x) > 0.45 && Math.abs(z) > 0.45 ? 0.04 : 0.015;
    p.setXYZ(i, x + (rnd() - 0.5) * corner * 2, y + (y > 0.95 ? (rnd() - 0.5) * 0.04 : 0), z + (rnd() - 0.5) * corner * 2);
  }
  g.computeVertexNormals();
  return paint(g, [1, 1, 1], (x, y, z) => 0.82 + 0.1 * Math.sin(y * 21 + x * 3) + 0.08 * Math.sin(z * 17 + x * 11));
}

/**
 * Terrace bench: a long stepped face of stone, `1` wide along x (scale x), `1` tall (scale y), 1 deep (scale z),
 * back-top at y = 1; the face has horizontal strata bands and vertical drill lines baked in its vertex colours.
 */
export function benchGeometry(seed = 23): THREE.BufferGeometry {
  const rnd = lcg(seed);
  const g = new THREE.BoxGeometry(1, 1, 1, 24, 8, 2).translate(0, 0.5, 0);
  const p = g.getAttribute('position');
  const phase = rnd() * 10;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    // Break the front face with shallow ledges so it is not a plane.
    const dz = z > 0.45 ? -0.04 * Math.abs(Math.sin(x * 11 + phase)) - 0.03 * Math.sin(y * 7) : 0;
    p.setXYZ(i, x, y, z + dz);
  }
  g.computeVertexNormals();
  const c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const band = STONE[Math.floor((y * 3.3 + phase) % STONE.length)]!;
    const drill = 0.9 + 0.1 * Math.cos(x * 90);
    const top = y > 0.98 ? 1.08 : 1;
    const k = drill * top * (0.86 + 0.14 * Math.sin(x * 7 + y * 3 + phase));
    c[i * 3] = band[0] * k;
    c[i * 3 + 1] = band[1] * k;
    c[i * 3 + 2] = band[2] * k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}

/** Mine headframe (Q2): an A-frame lattice tower with sheave wheels on top and a hoist house at its foot; ~17 m. */
export function headframeGeometry(): THREE.BufferGeometry {
  const rust = rgb(0x8a4e2e);
  const dark = rgb(0x5a3422);
  const parts: THREE.BufferGeometry[] = [];
  parts.push(...lattice(3.2, 15, rust, 0.22, 6));
  // Back legs (the A): two raking struts.
  for (const z of [-1.6, 1.6]) parts.push(beam(-7, 0, z, -1.6, 13.5, z, 0.35, dark));
  parts.push(box(4.6, 0.5, 4.2, 0, 15.2, 0, dark));
  for (const z of [-0.8, 0.8]) parts.push(paint(new THREE.TorusGeometry(1.4, 0.12, 5, 16).translate(0, 16.4, z), rust));
  for (const z of [-0.8, 0.8]) for (let i = 0; i < 4; i++) parts.push(box(2.8, 0.08, 0.08, 0, 16.4, z, rust, (i / 4) * Math.PI));
  parts.push(box(7, 3.6, 5, -9, 1.8, 0, rgb(0x9a7a5a)));
  parts.push(box(7.4, 0.3, 5.6, -9, 3.75, 0, rgb(0x6a3a24), 0.05));
  return ao(merge(parts), 4, 0.35);
}

/**
 * Inclined belt conveyor on a lattice truss (Q1 / Q2): `L` m long along x, rising `rise` m, legs every 7 m,
 * a head chute at the top end; origin at the low end's foot.
 */
export function conveyorGeometry(L = 30, rise = 9): THREE.BufferGeometry {
  const rust = rgb(0x7a4a2c);
  const belt = rgb(0x2a2826);
  const parts: THREE.BufferGeometry[] = [];
  const ang = Math.atan2(rise, L);
  const len = Math.hypot(L, rise);
  const n = Math.max(3, Math.round(len / 2.4));
  for (const z of [-0.7, 0.7]) {
    parts.push(beam(0, 1.2, z, L, 1.2 + rise, z, 0.14, rust));
    parts.push(beam(0, 0.2, z, L, 0.2 + rise, z, 0.12, rust));
    for (let i = 0; i < n; i++) {
      const t0 = i / n;
      const t1 = (i + 1) / n;
      parts.push(beam(L * t0, 0.2 + rise * t0 + (i % 2 ? 1 : 0), z, L * t1, 0.2 + rise * t1 + (i % 2 ? 0 : 1), z, 0.07, rust));
    }
  }
  const b = new THREE.BoxGeometry(len, 0.08, 1.2).rotateZ(ang).translate(L / 2, 1.3 + rise / 2, 0);
  parts.push(paint(b, belt));
  // Rubble on the belt.
  const rnd = lcg(29);
  for (let i = 0; i < n * 2; i++) {
    const t = rnd();
    parts.push(paint(new THREE.IcosahedronGeometry(0.16 + rnd() * 0.12, 0).translate(L * t, 1.42 + rise * t, (rnd() - 0.5) * 0.7), STONE[i % STONE.length]!));
  }
  for (let x = 4; x < L - 1; x += 7) {
    const y = 0.2 + rise * (x / L);
    for (const z of [-0.8, 0.8]) parts.push(box(0.2, y, 0.2, x, y / 2, z, rust));
    parts.push(beam(x, 0, -0.8, x, y, 0.8, 0.08, rust));
  }
  parts.push(box(1.6, 2.2, 1.6, L + 0.5, rise + 0.3, 0, rust)); // head chute
  return merge(parts);
}

/** Ore cart: a rusted tub on four wheels with a rubble load; 1.8 × 1.4 × 1.2, origin at the rail head. */
export function oreCartGeometry(): THREE.BufferGeometry {
  const rust = rgb(0x7a4028);
  const dark = rgb(0x3a2a22);
  const parts: THREE.BufferGeometry[] = [];
  const tub = new THREE.CylinderGeometry(0.85, 0.7, 0.9, 4, 1, false).rotateY(Math.PI / 4).scale(1.1, 1, 0.8).translate(0, 0.9, 0);
  parts.push(paint(tub, rust, (_x, y) => 0.75 + 0.3 * Math.min(1, (y - 0.45) / 0.9)));
  for (const x of [-0.72, 0.72]) parts.push(box(0.1, 0.1, 1.28, x, 1.32, 0, dark));
  for (const x of [-0.5, 0.5]) for (const z of [-0.44, 0.44]) parts.push(cyl(0.22, 0.22, 0.1, 10, x, 0.22, z, dark, 'z'));
  parts.push(box(1.3, 0.12, 0.9, 0, 0.42, 0, dark));
  const rnd = lcg(31);
  for (let i = 0; i < 9; i++) parts.push(paint(new THREE.IcosahedronGeometry(0.18 + rnd() * 0.12, 0).translate((rnd() - 0.5) * 1.1, 1.36 + rnd() * 0.12, (rnd() - 0.5) * 0.7), STONE[i % STONE.length]!, () => 0.9));
  return merge(parts);
}

/** Rail track section (sleepers + two rails), 1 m along x (scale x), origin at the sleeper foot. */
export function railGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const wood = rgb(0x5a4632);
  const steel = rgb(0x5a4a40);
  for (let i = 0; i < 2; i++) parts.push(box(0.2, 0.12, 1.5, -0.25 + i * 0.5, 0.06, 0, wood));
  for (const z of [-0.44, 0.44]) parts.push(box(1, 0.1, 0.07, 0, 0.17, z, steel));
  return merge(parts);
}

/** Survey pole: red / white banded, 3 m. */
export function surveyPoleGeometry(h = 3): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const n = Math.round(h / 0.5);
  for (let i = 0; i < n; i++) parts.push(cyl(0.05, 0.05, h / n, 8, 0, (i + 0.5) * (h / n), 0, rgb(i % 2 ? 0xf2eee6 : 0xd23a2a)));
  return merge(parts);
}

/** Corrugated site hut (Q1 back): 4 × 2.8 × 3, rust roof. */
export function hutGeometry(): THREE.BufferGeometry {
  return ao(merge([box(4, 2.6, 3, 0, 1.3, 0, rgb(0xb8a07a)), box(4.4, 0.16, 3.4, 0, 2.7, 0, rgb(0x8a4a2e), 0.06), box(0.9, 1.9, 0.06, -0.9, 0.95, 1.53, rgb(0x3a2a22)), box(1.0, 0.7, 0.06, 1, 1.6, 1.53, rgb(0x2a3438))]), 1.2, 0.35);
}

/** Haul truck (Q1), mustard; 9 × 5 × 5, origin bottom centre. */
export function haulTruckGeometry(): THREE.BufferGeometry {
  const y = rgb(0xd6a030);
  const dark = rgb(0x262626);
  const parts: THREE.BufferGeometry[] = [];
  for (const x of [-3, 2.8]) for (const z of [-1.9, 1.9]) parts.push(cyl(1.25, 1.25, 1.1, 14, x, 1.25, z, dark, 'z'));
  parts.push(box(8, 0.8, 3.4, 0, 2.0, 0, dark));
  const bed = new THREE.BoxGeometry(6, 2.2, 4.6).translate(-1.2, 3.6, 0);
  parts.push(paint(bed, y));
  parts.push(box(2.2, 2.2, 3.2, 3.6, 3.5, 0, y));
  parts.push(box(1.0, 1.0, 3.3, 3.9, 4.0, 0, rgb(0x2a3440)));
  return ao(merge(parts), 2.5, 0.3);
}

/** Dry desert scrub (0.8 m): wiry dark-olive crown. */
export function scrubGeometry(seed = 37): THREE.BufferGeometry {
  return bushGeometry(seed, 0x7a7a4a);
}

/** Plank-and-rope bridge span (decor), `L` m along x, 2 m wide, hand ropes on posts. */
export function ropeBridgeGeometry(L = 10): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const wood = rgb(0x8a6a48);
  const rope = rgb(0xb09060);
  const n = Math.round(L / 0.36);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const sag = -Math.sin(t * Math.PI) * L * 0.04;
    parts.push(box(0.28, 0.06, 2.0, -L / 2 + t * L, sag, 0, i % 3 ? wood : rgb(0x6a5236)));
  }
  for (const z of [-1.05, 1.05]) {
    for (let i = 0; i < 12; i++) {
      const t0 = i / 12;
      const t1 = (i + 1) / 12;
      parts.push(beam(-L / 2 + t0 * L, 1.1 - Math.sin(t0 * Math.PI) * L * 0.03, z, -L / 2 + t1 * L, 1.1 - Math.sin(t1 * Math.PI) * L * 0.03, z, 0.04, rope));
    }
    for (const x of [-L / 2, L / 2]) parts.push(box(0.16, 1.4, 0.16, x, 0.5, z, rgb(0x5a4632)));
  }
  return merge(parts);
}

// ---------------------------------------------------------------------------
// SNOWLINE
// ---------------------------------------------------------------------------

/** Glacier ice wall: a ribbed, faceted face 1 wide (scale x) × 1 tall (scale y), deep blue at the foot, white rim on top. */
export function iceWallGeometry(seed = 41): THREE.BufferGeometry {
  const rnd = lcg(seed);
  const g = new THREE.BoxGeometry(1, 1, 0.3, 18, 6, 1).translate(0, 0.5, 0);
  const p = g.getAttribute('position');
  const ph = rnd() * 9;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const rib = 0.1 * Math.abs(Math.sin(x * 26 + ph)) + 0.05 * Math.sin(x * 61 + y * 3);
    p.setXYZ(i, x + 0.01 * Math.sin(y * 13 + x * 40), y, z > 0 ? z + rib - 0.08 * (1 - y) : z);
  }
  g.computeVertexNormals();
  const deep = rgb(0x3f8fb8);
  const pale = rgb(0xcfeaf6);
  const top = rgb(0xf6fbff);
  return paint(g, [1, 1, 1], () => 1) && (() => {
    const c = g.getAttribute('color') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      const x = p.getX(i);
      const t = Math.min(1, y * 1.1 + 0.15 * Math.sin(x * 26 + ph));
      const col = y > 0.97 ? top : [deep[0] + (pale[0] - deep[0]) * t, deep[1] + (pale[1] - deep[1]) * t, deep[2] + (pale[2] - deep[2]) * t];
      c.setXYZ(i, col[0]!, col[1]!, col[2]!);
    }
    return g;
  })();
}

/** Ski-lift tower (B-ride-snow): a tapered steel mast, cross-arm with sheave trains; ~11 m, cable at y 10.6, ±2 m in z. */
export function liftTowerGeometry(): THREE.BufferGeometry {
  const grey = rgb(0x6a7078);
  const dark = rgb(0x3a3e44);
  const parts: THREE.BufferGeometry[] = [];
  parts.push(cyl(0.22, 0.34, 10.4, 10, 0, 5.2, 0, grey));
  parts.push(box(0.5, 0.5, 4.6, 0, 10.4, 0, dark));
  for (const z of [-2, 2]) {
    parts.push(box(2.2, 0.22, 0.3, 0, 10.2, z, dark));
    for (const x of [-0.8, -0.27, 0.27, 0.8]) parts.push(cyl(0.12, 0.12, 0.08, 8, x, 10.45, z, grey, 'z'));
  }
  parts.push(box(1.4, 0.4, 1.4, 0, 0.2, 0, rgb(0x8a8a86)));
  for (let y = 1.5; y < 9.5; y += 0.5) parts.push(box(0.36, 0.04, 0.04, 0.34, y, 0, dark));
  return merge(parts);
}

/** Double chair hanging from the cable (origin at the grip). */
export function liftChairGeometryZ(): THREE.BufferGeometry {
  const dark = rgb(0x2a2e34);
  const seat = rgb(0x2a5a9a);
  return merge([
    box(0.06, 1.8, 0.06, 0, -0.9, 0, dark),
    box(1.2, 0.1, 0.5, 0, -1.8, 0.15, seat),
    box(1.2, 0.5, 0.08, 0, -1.5, -0.1, seat),
    box(1.2, 0.04, 0.04, 0, -1.35, 0.45, dark),
    box(0.3, 0.14, 0.14, 0, 0, 0, dark),
  ]);
}

/** Avalanche snow fence (B-ride-snow): vertical timber slats on posts, raked back; 4 m section, 2.4 m tall, snow on top. */
export function avalancheFenceGeometry(): THREE.BufferGeometry {
  const wood = rgb(0x5a4632);
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 16; i++) parts.push(box(0.12, 2.4, 0.05, -1.9 + i * 0.25, 1.2, 0, i % 3 ? wood : rgb(0x4a3a2a), 0, 0, -0.25));
  for (const y of [0.6, 2.0]) parts.push(box(4.2, 0.12, 0.1, 0, y, -0.1 - (y - 1.2) * 0.25, wood, 0, 0, -0.25));
  for (const x of [-2, 2]) parts.push(beam(x, 0, -1.2, x, 2.3, -0.3, 0.12, wood));
  parts.push(box(4.2, 0.14, 0.3, 0, 2.42, -0.3, rgb(0xf2f6fc), 0, 0, -0.25));
  return merge(parts);
}

/** Snow-cat (piste basher): red body, glass cab, black tracks, front blade; 6 × 3 × 3.4, facing +x. */
export function snowcatGeometry(): THREE.BufferGeometry {
  const red = rgb(0xc4321e);
  const dark = rgb(0x1e2022);
  const glass = rgb(0x2a3a4a);
  const parts: THREE.BufferGeometry[] = [];
  for (const z of [-1.3, 1.3]) {
    parts.push(box(4.8, 1.0, 0.9, -0.2, 0.55, z, dark));
    for (const x of [-2.2, 1.8]) parts.push(cyl(0.5, 0.5, 0.92, 10, x, 0.55, z, dark, 'z'));
  }
  parts.push(box(4.4, 0.9, 2.4, -0.2, 1.45, 0, red));
  parts.push(box(2.2, 1.3, 2.3, 0.8, 2.5, 0, red));
  parts.push(box(1.9, 1.0, 2.34, 0.95, 2.55, 0, glass));
  parts.push(box(0.3, 1.4, 3.6, 3.0, 0.9, 0, rgb(0xd8d8d0), 0.2));
  parts.push(box(1.2, 0.8, 2.6, -2.8, 1.2, 0, rgb(0x8a8a84)));
  parts.push(cyl(0.05, 0.05, 1.4, 6, -0.4, 3.6, 0.8, rgb(0xf0a020)));
  return merge(parts);
}

/** Snow bank / drift: a squashed lumpy dome, 1 × ~0.5 × 1. */
export function snowBankGeometryZ(seed = 43): THREE.BufferGeometry {
  const rnd = lcg(seed);
  const g = new THREE.IcosahedronGeometry(0.5, 2);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const k = 0.9 + rnd() * 0.18;
    p.setXYZ(i, p.getX(i) * k, Math.max(-0.02, y) * k, p.getZ(i) * k);
  }
  g.computeVertexNormals();
  return paint(g, rgb(0xf4f8ff), (_x, y) => 0.82 + 0.36 * y);
}

/** Timber post with a snow cap (1 m, scale y). */
export function snowPostGeometry(): THREE.BufferGeometry {
  return merge([box(0.18, 1, 0.18, 0, 0.5, 0, rgb(0x5a4632)), box(0.26, 0.12, 0.26, 0, 1.04, 0, rgb(0xf4f8ff))]);
}
