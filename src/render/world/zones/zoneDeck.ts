/**
 * ROCKHOP ridden surface per zone (store release round 2): the ground course as a built slab the zone would
 * build — COAST a concrete quay with a rusted steel edge, QUARRY pale packed dust on a wall of cut sandstone
 * courses, ALPINE warm forest dirt with needles and roots on an earth bank with a log edge. SNOWLINE keeps the
 * packed-snow ribbon (deck.ts) and only its near slope changes (zoneKit.zoneGround).
 *
 * The slab follows the ground colliders exactly (pits and all) and the profile between them (under obstacle
 * bodies, which stand on it), so the ridden line is still the collider line (CONTRACT §2.6). Its near side is a
 * face `h` metres tall at z = `edge` (a bank running `run` metres out at its foot) down to the zone's lowered
 * near ground, which is where the foreground dressing stands: below the deck top, so it never reaches the bike.
 * A pit in the ground line reads as a notch in the face (the lip drops to the near ground) with the pit's back
 * wall at z −3. Everything is merged per material into the deck's buckets, chunked per 40 m by the caller.
 * The albedo of the top and the face are small canvas paintings (seeded, no clock) on derived library
 * materials, so they share the deck's shader variant.
 */
import * as THREE from 'three';
import type { BiomeId, ColliderPolyline, CompiledTrack, Vec2 } from '../../../core/types';
import type { MaterialLibrary } from '../../materials/library';
import { profileY, resample, ribbonGeometry } from '../track';
import { canvas, tex } from '../canvasTex';
import { lcg } from './geo';

export interface ZoneFace {
  /** z of the deck's near edge (the face's top). */
  edge: number;
  /** Face height: deck top to the near ground. */
  h: number;
  /** How far out (+z) the face's foot sits from its top (0 = vertical wall, > 0 = a bank). */
  run: number;
}

export const ZONE_FACE: Partial<Record<BiomeId, ZoneFace>> = {
  coast: { edge: 2.0, h: 1.45, run: 0 },
  quarry: { edge: 2.0, h: 1.7, run: 0 },
  alpine: { edge: 2.0, h: 1.0, run: 0.75 },
};

export function zoneFace(id: BiomeId): ZoneFace | null {
  return ZONE_FACE[id] ?? null;
}

/** Top section: the far apron as before (meets the far ground at −0.42), flat to the near edge, a 7 cm arris. */
function topSection(f: ZoneFace, id: BiomeId): [number, number][] {
  // COAST paints a worn yellow safety line 30–50 cm in from the quay edge (rows bound it so it stays crisp).
  const near: [number, number][] = id === 'coast' ? [[1.46, 0], [1.48, 0], [1.66, 0], [1.68, 0]] : [[1.6, 0]];
  return [[-3.0, -0.42], [-2.3, -0.2], [-1.9, -0.02], [-1.6, 0], [-0.9, 0], [-0.3, 0], [0, 0], [0.3, 0], [0.9, 0], ...near, [f.edge - 0.07, 0], [f.edge, -0.07]];
}
const SAFETY_LINE: [number, number] = [1.48, 1.66];

/** The ground colliders in x order with the profile filling the spans between them (under obstacle bodies). */
export function deckLine(track: CompiledTrack): Vec2[] {
  const prof = track.def.profile;
  const grounds = (track.colliders.filter((c) => c.kind === 'polyline' && c.obstacleIndex < 0 && c.points.length >= 2) as ColliderPolyline[])
    .map((c) => (c.points[0]!.x <= c.points[c.points.length - 1]!.x ? [...c.points] : [...c.points].reverse()))
    .sort((a, b) => a[0]!.x - b[0]!.x);
  const out: Vec2[] = [];
  const push = (p: Vec2): void => {
    const l = out[out.length - 1];
    if (l && Math.abs(l.x - p.x) < 1e-4 && Math.abs(l.y - p.y) < 1e-4) return;
    out.push({ x: p.x, y: p.y });
  };
  const fill = (xa: number, xb: number): void => {
    if (xb - xa < 0.05) return;
    push({ x: xa, y: profileY(prof, xa) });
    for (const p of prof) if (p.x > xa + 1e-3 && p.x < xb - 1e-3) push(p);
    push({ x: xb, y: profileY(prof, xb) });
  };
  let cursor = prof[0]!.x;
  for (const g of grounds) {
    if (g[g.length - 1]!.x <= cursor + 1e-3) continue;
    fill(cursor, g[0]!.x);
    for (const p of g) if (p.x >= cursor - 1e-3 || out.length === 0) push(p);
    cursor = Math.max(cursor, g[g.length - 1]!.x);
  }
  fill(cursor, prof[prof.length - 1]!.x);
  return out;
}

// --------------------------------------------------------------------------------------------------------------
// Canvas albedo: every painting is seeded and tiles (u wraps; the face's v spans one face height).
// --------------------------------------------------------------------------------------------------------------

type Painter = (g: CanvasRenderingContext2D, w: number, h: number, r: () => number) => void;

function speckle(g: CanvasRenderingContext2D, w: number, h: number, r: () => number, n: number, cols: string[], size: [number, number]): void {
  for (let i = 0; i < n; i++) {
    g.fillStyle = cols[Math.floor(r() * cols.length)]!;
    const s = size[0] + r() * (size[1] - size[0]);
    g.fillRect(r() * w, r() * h, s, s);
  }
}

/** Soft blotches (stains, damp, oil) wrapping in u. */
function blotches(g: CanvasRenderingContext2D, w: number, h: number, r: () => number, n: number, col: (a: number) => string, rad: [number, number], vBand: [number, number] = [0, 1]): void {
  for (let i = 0; i < n; i++) {
    const x = r() * w;
    const y = (vBand[0] + r() * (vBand[1] - vBand[0])) * h;
    const R = rad[0] + r() * (rad[1] - rad[0]);
    for (const dx of [-w, 0, w]) {
      const gr = g.createRadialGradient(x + dx, y, 0, x + dx, y, R);
      gr.addColorStop(0, col(0.35 + r() * 0.3));
      gr.addColorStop(1, col(0));
      g.fillStyle = gr;
      g.beginPath();
      g.ellipse(x + dx, y, R, R * (0.5 + r() * 0.5), r() * 3, 0, Math.PI * 2);
      g.fill();
    }
  }
}

/** COAST top: poured quay slabs (3 m tile), a joint across and one along, oil and rust stains, pale aggregate. */
const coastTop: Painter = (g, w, h, r) => {
  g.fillStyle = '#8e897e';
  g.fillRect(0, 0, w, h);
  speckle(g, w, h, r, 9000, ['#9c978b', '#7e796f', '#888377', '#aaa497', '#716c63'], [1, 3]);
  blotches(g, w, h, r, 14, (a) => `rgba(70,64,56,${a * 0.35})`, [30, 90]);
  blotches(g, w, h, r, 5, (a) => `rgba(20,18,16,${a * 0.45})`, [14, 40]); // oil
  blotches(g, w, h, r, 6, (a) => `rgba(140,70,30,${a * 0.35})`, [16, 50], [0.55, 0.75]); // rust bleeding from the steel edge (z ≈ edge)
  g.fillStyle = 'rgba(40,36,32,0.75)';
  g.fillRect(0, 0, 3, h); // joint across the course (every 3 m)
  g.fillRect(0, Math.round(h * 0.5), w, 3); // joint along (z −1.5 / +1.5)
  g.fillStyle = 'rgba(230,226,216,0.35)';
  g.fillRect(3, 0, 2, h);
  g.fillRect(0, Math.round(h * 0.5) + 3, w, 2);
};

/** QUARRY top: pale packed dust — cream grain, pebbles, faint drying cracks. */
const quarryTop: Painter = (g, w, h, r) => {
  g.fillStyle = '#d8bc92';
  g.fillRect(0, 0, w, h);
  speckle(g, w, h, r, 12000, ['#e6d0aa', '#c9a87c', '#d2b288', '#bc9a70', '#ecdcbc'], [1, 3]);
  blotches(g, w, h, r, 14, (a) => `rgba(176,128,84,${a * 0.4})`, [30, 100]);
  speckle(g, w, h, r, 260, ['#bfa27a', '#f8f0e0', '#a88a66', '#d8b890'], [3, 7]);
  g.strokeStyle = 'rgba(150,118,84,0.35)';
  g.lineWidth = 1.2;
  for (let i = 0; i < 16; i++) {
    let x = r() * w;
    let y = r() * h;
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < 6; k++) {
      x += (r() - 0.5) * 40;
      y += (r() - 0.5) * 40;
      g.lineTo(x, y);
    }
    g.stroke();
  }
};

/** ALPINE top: warm packed forest dirt with pine needles, twigs, pebbles and roots crossing at the edges. */
const alpineTop: Painter = (g, w, h, r) => {
  g.fillStyle = '#8a6440';
  g.fillRect(0, 0, w, h);
  speckle(g, w, h, r, 9000, ['#9a7248', '#7a5634', '#a47c52', '#6e4c2e', '#b08a5e'], [1, 3]);
  blotches(g, w, h, r, 16, (a) => `rgba(60,38,20,${a * 0.4})`, [24, 80]);
  // Needles: short strokes, rust-brown and dark, denser away from the ridden line (v ≈ 0 and ± the tile).
  for (let i = 0; i < 2600; i++) {
    const y = r() * h;
    const edge = Math.min(Math.abs(y / h - 0.0), Math.abs(y / h - 1)) < 0.25 || r() < 0.35;
    if (!edge) continue;
    const x = r() * w;
    const a = r() * Math.PI;
    const L = 5 + r() * 9;
    g.strokeStyle = r() < 0.6 ? `rgba(150,82,34,${0.5 + r() * 0.4})` : `rgba(48,30,16,${0.5 + r() * 0.4})`;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L);
    g.stroke();
  }
  // Roots: long tapered curves crossing the tread, dark bark with a pale worn top.
  for (let i = 0; i < 5; i++) {
    let x = r() * w;
    let y = r() * h;
    let a = r() * Math.PI * 2;
    const n = 14 + Math.floor(r() * 10);
    for (let k = 0; k < n; k++) {
      const nx = x + Math.cos(a) * 9;
      const ny = y + Math.sin(a) * 9;
      const lw = Math.max(1, 7 * (1 - k / n));
      g.strokeStyle = '#4a3220';
      g.lineWidth = lw;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(nx, ny);
      g.stroke();
      g.strokeStyle = 'rgba(190,150,105,0.55)';
      g.lineWidth = Math.max(0.5, lw * 0.3);
      g.beginPath();
      g.moveTo(x, y - lw * 0.2);
      g.lineTo(nx, ny - lw * 0.2);
      g.stroke();
      x = nx;
      y = ny;
      a += (r() - 0.5) * 0.6;
    }
  }
  speckle(g, w, h, r, 180, ['#8a8680', '#a8a49c', '#6a6660'], [3, 7]);
};

/** COAST face: a poured quay wall — formwork joints and tie holes, pour lines, rust runs, a damp weed foot. */
const coastFace: Painter = (g, w, h, r) => {
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, '#aaa598');
  gr.addColorStop(0.7, '#9a9588');
  gr.addColorStop(1, '#6e6a5e');
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
  speckle(g, w, h, r, 6000, ['#b8b3a6', '#8e897e', '#a09b8f', '#c6c0b2'], [1, 2.5]);
  g.fillStyle = 'rgba(60,56,50,0.45)';
  for (let x = 0; x < w; x += w / 4) g.fillRect(x, 0, 2, h); // formwork joints every 1 m
  for (const v of [0.34, 0.68]) g.fillRect(0, Math.round(v * h), w, 2); // pour lines
  g.fillStyle = 'rgba(30,28,26,0.7)';
  for (let x = w / 8; x < w; x += w / 4) for (const v of [0.2, 0.52, 0.84]) g.fillRect(x - 2, v * h - 2, 4, 4); // tie holes
  // Rust runs from the steel edge.
  for (let i = 0; i < 26; i++) {
    const x = r() * w;
    const L = (0.15 + r() * 0.55) * h;
    const lg = g.createLinearGradient(0, 0, 0, L);
    lg.addColorStop(0, `rgba(150,72,30,${0.5 + r() * 0.35})`);
    lg.addColorStop(1, 'rgba(150,72,30,0)');
    g.fillStyle = lg;
    g.fillRect(x, 0, 2 + r() * 5, L);
  }
  // Damp foot with weed and barnacles.
  const dg = g.createLinearGradient(0, h * 0.72, 0, h);
  dg.addColorStop(0, 'rgba(40,52,38,0)');
  dg.addColorStop(1, 'rgba(40,52,38,0.75)');
  g.fillStyle = dg;
  g.fillRect(0, h * 0.72, w, h * 0.28);
  for (let i = 0; i < 500; i++) {
    g.fillStyle = r() < 0.5 ? 'rgba(230,226,212,0.7)' : 'rgba(70,96,56,0.7)';
    g.fillRect(r() * w, h * (0.82 + r() * 0.18), 2, 2);
  }
  g.fillStyle = 'rgba(20,18,16,0.5)';
  g.fillRect(0, 0, w, 3);
};

/** QUARRY face: two courses of cut sandstone — per-block tone, dark joints, half drill holes, chisel scores. */
const quarryFace: Painter = (g, w, h, r) => {
  const tones = ['#efdcb8', '#e4c392', '#d9a97c', '#ead0aa', '#d49e78', '#f1e2c4', '#dcb48a'];
  const course = [0, h * 0.5, h];
  for (let c = 0; c < 2; c++) {
    const y0 = course[c]!;
    const y1 = course[c + 1]!;
    let x = c ? -w * 0.12 : 0; // offset bond
    const stop = x + w;
    while (x < stop - 1) {
      let bw = 150 + r() * 110;
      if (stop - (x + bw) < 110) bw = stop - x;
      const tone = tones[Math.floor(r() * tones.length)]!;
      for (const dx of [0, w, -w]) {
        const bx = x + dx;
        if (bx > w || bx + bw < 0) continue;
        g.fillStyle = tone;
        g.fillRect(bx, y0, bw, y1 - y0);
        // Grain and weathering inside the block.
        const gg = g.createLinearGradient(0, y0, 0, y1);
        gg.addColorStop(0, 'rgba(255,248,230,0.25)');
        gg.addColorStop(1, 'rgba(120,80,50,0.22)');
        g.fillStyle = gg;
        g.fillRect(bx, y0, bw, y1 - y0);
      }
      const rr = lcg(Math.floor(r() * 1e9));
      for (const dx of [0, w, -w]) {
        const bx = x + dx;
        if (bx > w || bx + bw < 0) continue;
        const r2 = lcg(Math.floor(rr() * 1e9));
        for (let i = 0; i < 260; i++) {
          g.fillStyle = r2() < 0.5 ? 'rgba(255,245,225,0.35)' : 'rgba(130,95,60,0.3)';
          g.fillRect(bx + r2() * bw, y0 + r2() * (y1 - y0), 1 + r2() * 2, 1 + r2() * 2);
        }
        // Half drill holes along the block's top edge.
        if (r2() < 0.35) for (let px = bx + 10; px < bx + bw - 10; px += 22 + r2() * 8) {
          const L = (y1 - y0) * (0.2 + r2() * 0.3);
          g.fillStyle = 'rgba(120,84,54,0.55)';
          g.fillRect(px, y0 + 3, 3, L);
          g.fillStyle = 'rgba(255,245,225,0.4)';
          g.fillRect(px + 3, y0 + 3, 1, L);
        }
        // Chisel scores.
        g.strokeStyle = 'rgba(120,86,56,0.35)';
        g.lineWidth = 1;
        for (let i = 0; i < 10; i++) {
          const sx = bx + r2() * bw;
          const sy = y0 + r2() * (y1 - y0);
          g.beginPath();
          g.moveTo(sx, sy);
          g.lineTo(sx + 6 + r2() * 8, sy + 8 + r2() * 8);
          g.stroke();
        }
        g.fillStyle = 'rgba(70,48,30,0.8)';
        g.fillRect(bx, y0, 3, y1 - y0); // vertical joint
      }
      x += bw;
    }
    g.fillStyle = 'rgba(70,48,30,0.85)';
    g.fillRect(0, y0, w, 3); // bed joint
  }
  const dg = g.createLinearGradient(0, h * 0.85, 0, h);
  dg.addColorStop(0, 'rgba(150,110,70,0)');
  dg.addColorStop(1, 'rgba(150,110,70,0.55)');
  g.fillStyle = dg;
  g.fillRect(0, h * 0.85, w, h * 0.15);
};

/** ALPINE face: an earth bank — grass fringe at the top, roots, embedded stones, darker damp foot. */
const alpineFace: Painter = (g, w, h, r) => {
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, '#7a5634');
  gr.addColorStop(1, '#4a3420');
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
  speckle(g, w, h, r, 7000, ['#8a6440', '#5e4028', '#6e4c2e', '#9a7450'], [1, 3]);
  for (let i = 0; i < 34; i++) {
    const x = r() * w;
    const y = (0.2 + r() * 0.75) * h;
    const R = 3 + r() * 8;
    for (const dx of [0, w, -w]) {
      g.fillStyle = r() < 0.5 ? '#6e6a62' : '#58544e';
      g.beginPath();
      g.ellipse(x + dx, y, R, R * 0.7, r() * 3, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(200,196,186,0.14)';
      g.beginPath();
      g.ellipse(x + dx - R * 0.2, y - R * 0.25, R * 0.5, R * 0.3, 0, 0, Math.PI * 2);
      g.fill();
    }
  }
  for (let i = 0; i < 14; i++) {
    let x = r() * w;
    let y = r() * h * 0.3;
    let a = Math.PI / 2 + (r() - 0.5) * 1.2;
    const n = 10 + Math.floor(r() * 12);
    for (let k = 0; k < n; k++) {
      const nx = x + Math.cos(a) * 8;
      const ny = y + Math.sin(a) * 8;
      g.strokeStyle = r() < 0.7 ? '#3a2616' : '#a88a64';
      g.lineWidth = Math.max(1, 4 * (1 - k / n));
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(nx, ny);
      g.stroke();
      x = nx;
      y = ny;
      a += (r() - 0.5) * 0.7;
    }
  }
  // Grass fringe hanging over the top edge.
  for (let i = 0; i < 900; i++) {
    const x = r() * w;
    const L = 6 + r() * h * 0.16;
    g.strokeStyle = ['#5a7a30', '#6e8e3a', '#46662a', '#8a9a48'][Math.floor(r() * 4)]!;
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x + (r() - 0.5) * 6, L);
    g.stroke();
  }
};

interface ZonePaint {
  top: Painter;
  face: Painter;
  topMat: string;
  faceMat: string;
}
const PAINT: Partial<Record<BiomeId, ZonePaint>> = {
  coast: { top: coastTop, face: coastFace, topMat: 'concrete', faceMat: 'concrete' },
  quarry: { top: quarryTop, face: quarryFace, topMat: 'concrete', faceMat: 'concrete' },
  alpine: { top: alpineTop, face: alpineFace, topMat: 'dirt', faceMat: 'dirt' },
};

/** UV metres per tile of the top painting (u along the course, v across). */
const TOP_TILE: Partial<Record<BiomeId, number>> = { coast: 3, quarry: 3, alpine: 2.5 };
/** The face painting spans 4 m of course. */
const FACE_U = 4;

const PAINTED = new WeakMap<MaterialLibrary, Map<string, { mat: THREE.MeshStandardMaterial; bytes: number }>>();

/**
 * A zone's painted top / face material, made once per library and zone (the deck, the course's obstacle tops and
 * the quarry's cut-block props share them). `bytes` is reported by the first caller only.
 */
export function zonePaint(lib: MaterialLibrary, id: BiomeId, part: 'top' | 'face'): { mat: THREE.MeshStandardMaterial; bytes: number } | null {
  const paint = PAINT[id];
  if (!paint) return null;
  let m = PAINTED.get(lib);
  if (!m) PAINTED.set(lib, (m = new Map()));
  const key = `${id}:${part}`;
  const hit = m.get(key);
  if (hit) return { mat: hit.mat, bytes: 0 };
  const seed = part === 'top' ? 0x70b : 0xfa ^ 0x3c;
  const made = part === 'top' ? painted(lib, paint.topMat, paint.top, 512, 512, seed) : painted(lib, paint.faceMat, paint.face, 512, 256, seed);
  m.set(key, made);
  return made;
}

function painted(lib: MaterialLibrary, base: string, p: Painter, w: number, h: number, seed: number): { mat: THREE.MeshStandardMaterial; bytes: number } {
  const [c, g] = canvas(w, h);
  p(g, w, h, lcg(seed));
  const t = tex(c, true, true);
  const mat = lib.derive(base);
  mat.map = t;
  mat.color.setHex(0xffffff);
  mat.vertexColors = true;
  mat.needsUpdate = true;
  return { mat, bytes: w * h * 4 * 1.33 };
}

export interface ZoneDeckMeshes {
  meshes: { name: string; geo: THREE.BufferGeometry; mat: THREE.MeshStandardMaterial; castShadow: boolean }[];
  /** Geometry that joins a library bucket of the deck (trim: rusted steel edge, edge logs). */
  bucketed: { mat: string; geo: THREE.BufferGeometry }[];
  textureBytes: number;
}

/** Constant colour attribute. */
function colour(g: THREE.BufferGeometry, r: number, gg: number, b: number): THREE.BufferGeometry {
  const n = g.getAttribute('position').count;
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    c[i * 3] = r;
    c[i * 3 + 1] = gg;
    c[i * 3 + 2] = b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}

/** A strip between two lines of points (a, b per station), normal `n`, uv (u, v) per vertex, colour per vertex. */
function strip(rows: { a: THREE.Vector3; b: THREE.Vector3; ua: [number, number]; ub: [number, number]; ca: number; cb: number }[], n: THREE.Vector3): THREE.BufferGeometry | null {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  let k = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    pos.push(r.a.x, r.a.y, r.a.z, r.b.x, r.b.y, r.b.z);
    nor.push(n.x, n.y, n.z, n.x, n.y, n.z);
    uv.push(...r.ua, ...r.ub);
    col.push(r.ca, r.ca, r.ca, r.cb, r.cb, r.cb);
    if (i > 0) {
      const p = rows[i - 1]!;
      const degenerate = Math.abs(p.a.y - p.b.y) < 0.005 && Math.abs(r.a.y - r.b.y) < 0.005;
      if (!degenerate) idx.push(k - 2, k - 1, k, k, k - 1, k + 1);
    }
    k += 2;
  }
  if (!idx.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

export function buildZoneDeck(track: CompiledTrack, id: BiomeId, lib: MaterialLibrary): ZoneDeckMeshes | null {
  const f = zoneFace(id);
  if (!f || !PAINT[id]) return null;
  const prof = track.def.profile;
  const line = deckLine(track);
  if (line.length < 2) return null;
  const seed = (track.def.seed ^ 0x5eed) >>> 0;
  const out: ZoneDeckMeshes = { meshes: [], bucketed: [], textureBytes: 0 };
  const rnd = lcg(seed);

  // --- the top: the ridden line with the zone's tread --------------------------------------------------------
  const topTile = TOP_TILE[id] ?? 3;
  const top = ribbonGeometry(line, topSection(f, id), topTile, 0);
  {
    const pos = top.getAttribute('position');
    const col = top.getAttribute('color') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const z = pos.getZ(i);
      const x = pos.getX(i);
      const az = Math.abs(z);
      // Worn line / ruts, the arris a touch darker, the far apron falling into shade; slow tone drift along x.
      let s = col.getX(i);
      if (id === 'coast') s *= az < 0.35 ? 0.74 : 0.82;
      else if (id === 'quarry') s *= Math.abs(az - 0.4) < 0.16 ? 0.86 : 1.02;
      else s *= Math.abs(az - 0.4) < 0.18 ? 0.8 : az < 0.2 ? 1.06 : 1;
      if (z > f.edge - 0.08) s *= 0.8;
      s *= 0.94 + 0.06 * Math.sin(x * 0.21) * Math.sin(x * 0.047 + 1.3);
      if (id === 'coast' && z >= SAFETY_LINE[0] - 1e-3 && z <= SAFETY_LINE[1] + 1e-3) {
        const worn = 0.75 + 0.25 * Math.abs(Math.sin(x * 1.7) * Math.sin(x * 0.31));
        col.setXYZ(i, s * 1.5 * worn, s * 1.15 * worn, s * 0.3 * worn);
      } else col.setXYZ(i, s, s, s);
    }
  }
  const topPaint = zonePaint(lib, id, 'top')!;
  out.textureBytes += topPaint.bytes;
  out.meshes.push({ name: `zonedeck:top:${id}`, geo: top, mat: topPaint.mat, castShadow: false });

  // --- the face: the near side down to the near ground; pits notch it to the ground and get a back wall -------
  const pts = resample(line, 0.75);
  const rows: Parameters<typeof strip>[0] = [];
  const back: Parameters<typeof strip>[0] = [];
  for (const p of pts) {
    const py = profileY(prof, p.x);
    const topY = p.y - 0.07;
    const foot = py - f.h;
    const hi = Math.max(topY, foot);
    const lo = Math.min(topY, foot) - 0.8;
    const u = p.x / FACE_U;
    const vOf = (y: number): number => (py - y) / f.h;
    const zOf = (y: number): number => f.edge + f.run * Math.min(1, Math.max(0, (hi - y) / Math.max(0.1, hi - foot)));
    rows.push({ a: new THREE.Vector3(p.x, hi, zOf(hi)), b: new THREE.Vector3(p.x, lo, zOf(lo)), ua: [u, vOf(hi)], ub: [u, vOf(lo)], ca: 1, cb: 0.62 });
    // Back wall of a pit at z −3: far ground (py − 0.42) down to the pit floor.
    const farTop = py - 0.42;
    const farLo = Math.min(farTop, p.y - 0.42);
    back.push({ a: new THREE.Vector3(p.x, farTop, -2.99), b: new THREE.Vector3(p.x, farLo, -2.99), ua: [u, vOf(farTop)], ub: [u, vOf(farLo)], ca: 0.9, cb: 0.55 });
  }
  const nFace = new THREE.Vector3(0, f.run, f.h).normalize();
  const face = strip(rows, nFace);
  const backWall = strip(back, new THREE.Vector3(0, 0, 1));
  // End caps where the course starts and ends: the slab's cross-section facing out.
  const caps: THREE.BufferGeometry[] = [];
  for (const [p, sgn] of [[line[0]!, -1], [line[line.length - 1]!, 1]] as const) {
    const py = profileY(prof, p.x);
    const shape = [[-3.0, p.y - 0.42], [-1.9, p.y], [f.edge, p.y], [f.edge + f.run, py - f.h - 0.3], [-3.0, py - f.h - 0.3]] as const;
    const pos: number[] = [];
    for (const [z, y] of shape) pos.push(p.x, y, z);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(shape.flatMap(() => [sgn, 0, 0]), 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(shape.flatMap(([z, y]) => [z / FACE_U, (py - y) / f.h]), 2));
    g.setIndex(sgn > 0 ? [0, 1, 2, 0, 2, 3, 0, 3, 4] : [0, 2, 1, 0, 3, 2, 0, 4, 3]);
    caps.push(colour(g, 0.8, 0.8, 0.8));
  }
  const faceGeos = [face, backWall, ...caps].filter((g): g is THREE.BufferGeometry => !!g);
  const faceGeo = faceGeos.length === 1 ? faceGeos[0]! : mergeAll(faceGeos);
  const facePaint = zonePaint(lib, id, 'face')!;
  out.textureBytes += facePaint.bytes;
  out.meshes.push({ name: `zonedeck:face:${id}`, geo: faceGeo, mat: facePaint.mat, castShadow: false });

  // --- trim along the near edge --------------------------------------------------------------------------------
  const edgePts = resample(line, 1.0);
  const M = new THREE.Matrix4();
  const Q = new THREE.Quaternion();
  const Z = new THREE.Vector3(0, 0, 1);
  const place = (g: THREE.BufferGeometry, x: number, y: number, z: number, rz: number): THREE.BufferGeometry => {
    Q.setFromAxisAngle(Z, rz);
    M.compose(new THREE.Vector3(x, y, z), Q, new THREE.Vector3(1, 1, 1));
    return g.applyMatrix4(M);
  };
  for (let i = 1; i < edgePts.length; i++) {
    const a = edgePts[i - 1]!;
    const b = edgePts[i]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1e-3) continue;
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    if (id === 'coast') {
      // Rusted steel angle on the quay's arris: a cap 1.5 cm proud and its leg down the face.
      const k = 0.55 + rnd() * 0.35;
      out.bucketed.push({ mat: 'rustSteel', geo: colour(place(new THREE.BoxGeometry(len + 0.01, 0.09, 0.12), mx, my - 0.03, f.edge - 0.05, ang), k, k * 0.82, k * 0.7) });
      out.bucketed.push({ mat: 'rustSteel', geo: colour(place(new THREE.BoxGeometry(len + 0.01, 0.24, 0.025), mx, my - 0.12, f.edge + 0.012, ang), k * 0.9, k * 0.72, k * 0.6) });
    } else if (id === 'alpine' && Math.abs(ang) < 0.5 && rnd() < 0.8) {
      // Split logs half sunk along the trail edge (their tops ≤ 8 cm proud).
      const t = 0.32 + rnd() * 0.14;
      const g = new THREE.CylinderGeometry(0.13, 0.14, len - 0.12, 8).rotateZ(Math.PI / 2);
      out.bucketed.push({ mat: 'pallet', geo: colour(place(g, mx, my - 0.06, f.edge - 0.16, ang), t, t * 0.78, t * 0.6) });
    }
  }
  return out;
}

function mergeAll(gs: THREE.BufferGeometry[]): THREE.BufferGeometry {
  // Every part here is indexed with position / normal / uv / color.
  const total = gs.reduce((n, g) => n + g.getAttribute('position').count, 0);
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const uv = new Float32Array(total * 2);
  const col = new Float32Array(total * 3);
  const idx: number[] = [];
  let o = 0;
  for (const g of gs) {
    const n = g.getAttribute('position').count;
    pos.set(g.getAttribute('position').array as Float32Array, o * 3);
    nor.set(g.getAttribute('normal').array as Float32Array, o * 3);
    uv.set(g.getAttribute('uv').array as Float32Array, o * 2);
    col.set(g.getAttribute('color').array as Float32Array, o * 3);
    const ix = g.index!;
    for (let i = 0; i < ix.count; i++) idx.push(ix.getX(i) + o);
    o += n;
  }
  const m = new THREE.BufferGeometry();
  m.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  m.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  m.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  m.setAttribute('color', new THREE.BufferAttribute(col, 3));
  m.setIndex(idx);
  return m;
}
