/**
 * Built ride surfaces: what the collider says you ride on, constructed the way
 * the biome would build it (CONTRACT §2.6 — the surface is exactly the
 * collider polyline).
 *
 *   wood      individual boards across the track on edge boards (all biomes)
 *   dirt      industrial: a contained dirt bed with a worn line, plywood edge
 *             boards; canyon: packed dirt with rock edging; else plain ribbon
 *   concrete  slab + painted edge lines (nightCity asphalt look)
 *   metal     steel plate + angle-iron edges (foundry)
 *   snow      packed snow with dark edges
 *   stone/grate/rubber  plain ribbon
 *
 * Interior biomes also get the supporting structure wherever the ground
 * profile sits above the hall floor: pallet stacks (< 1.3 m), steel frames
 * (1.3–2.5 m) or container stacks (≥ 2.5 m), so the deck never floats.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Rng } from '../../core/rng';
import type { ColliderPolyline, CompiledTrack, SurfaceKind } from '../../core/types';
import type { Biome } from '../biomes';
import { SURFACE_MATERIAL, type MaterialLibrary } from '../materials/library';
import { fogify } from '../lighting/environment';
import { PropBatch, bakeAO, containerGeometry, palletLowGeometry, palletStackGeometry, rockGeometry, triCount } from './props';
import { groundFloorY, profileY, ribbonGeometry, resample, type TrackMeshes } from './track';
import { canvas, tex } from './canvasTex';

const DECK_W = 3.0;
const BOARD_W = 0.22;
const BOARD_GAP = 0.02;
const BOARD_T = 0.045;

const WIDE_SECTION: [number, number][] = [
  [-3.0, -0.42], [-1.75, -0.16], [-1.5, 0], [-0.9, 0], [0, 0], [0.9, 0], [1.5, 0], [1.75, -0.16], [3.0, -0.42],
];
/** Contained bed: flat top, tiny lip, no apron (edges are boards/kerbs). */
const BED_SECTION: [number, number][] = [
  [-1.62, -0.08], [-1.5, 0], [-0.3, 0], [0, -0.015], [0.3, 0], [1.5, 0], [1.62, -0.08],
];
/** Canyon dirt: ruts at z ±0.4 sunk 3 cm, crown between. */
const RUT_SECTION: [number, number][] = [
  [-3.0, -0.42], [-1.75, -0.16], [-1.5, 0], [-0.9, 0], [-0.56, 0], [-0.4, -0.03], [-0.24, 0], [0, 0.005], [0.24, 0], [0.4, -0.03], [0.56, 0], [0.9, 0], [1.5, 0], [1.75, -0.16], [3.0, -0.42],
];
const OBSTACLE_SECTION: [number, number][] = [[-1.5, -0.05], [-1.42, 0], [0, 0], [1.42, 0], [1.5, -0.05]];

const TILE: Record<SurfaceKind, number> = { dirt: 2.5, wood: 1.5, metal: 1.5, concrete: 3, rubber: 1, grate: 1, stone: 2.5, snow: 3 };

type Bucket = Map<string, THREE.BufferGeometry[]>;
function push(b: Bucket, mat: string, g: THREE.BufferGeometry): void {
  const l = b.get(mat) ?? [];
  l.push(g);
  b.set(mat, l);
}

const M = new THREE.Matrix4();
const Q = new THREE.Quaternion();
const P = new THREE.Vector3();
const S = new THREE.Vector3(1, 1, 1);
const ZAX = new THREE.Vector3(0, 0, 1);

/** Box placed at (x, y, z) rotated about z by `rz`, with optional per-vertex colour and custom uv. */
function box(w: number, h: number, d: number, x: number, y: number, z: number, rz: number, color?: THREE.Color, uv?: (px: number, py: number, pz: number) => [number, number], shade?: (px: number, py: number, pz: number) => number, segZ = 1): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d, 1, 1, segZ);
  if (uv) {
    const pos = g.getAttribute('position');
    const uva = g.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const [u, v] = uv(pos.getX(i), pos.getY(i), pos.getZ(i));
      uva.setXY(i, u, v);
    }
  }
  if (color) {
    const pos = g.getAttribute('position');
    const n = pos.count;
    const c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const k = shade ? shade(pos.getX(i), pos.getY(i), pos.getZ(i)) : 1;
      c[i * 3] = color.r * k;
      c[i * 3 + 1] = color.g * k;
      c[i * 3 + 2] = color.b * k;
    }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  }
  Q.setFromAxisAngle(ZAX, rz);
  M.compose(P.set(x, y, z), Q, S.set(1, 1, 1));
  g.applyMatrix4(M);
  return g;
}

/** Add a constant vertex colour attribute to a geometry that has none. */
function tint(g: THREE.BufferGeometry, r: number, gg: number, b: number): THREE.BufferGeometry {
  if (g.getAttribute('color')) return g;
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

/** Individual boards across the track along a polyline, plus two lengthwise edge boards. */
function boards(pl: ColliderPolyline, rng: Rng, out: Bucket, width = DECK_W): void {
  const pts = resample(pl.points, 0.5);
  const pitch = BOARD_W + BOARD_GAP;
  const col = new THREE.Color();
  // Walk the arc length and drop a board every `pitch`.
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const segLen = Math.hypot(b.x - a.x, b.y - a.y);
    if (segLen < 1e-4) continue;
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    const nx = -Math.sin(ang);
    const ny = Math.cos(ang);
    let s = carry;
    while (s + BOARD_W <= segLen + 1e-6) {
      const t = (s + BOARD_W / 2) / segLen;
      const cx = a.x + (b.x - a.x) * t - nx * BOARD_T * 0.5;
      const cy = a.y + (b.y - a.y) * t - ny * BOARD_T * 0.5;
      const seed = rng.next();
      const lum = 0.78 + rng.next() * 0.4;
      col.setRGB(lum, lum * (0.94 + seed * 0.08), lum * (0.86 + seed * 0.1));
      // Boards run across the track: grain (u) along z; v picks a plank slice per board.
      const v0 = seed * 0.9;
      const wear = rng.next() < 0.12 ? 0.75 : 1;
      col.multiplyScalar(wear);
      // Round 10 (recipe: edge wear on every plank): both ends of every board darken — grime
      // and split ends where boots and tyres leave the deck — by a per-end random amount, and
      // the worn line down the middle is a touch paler where the tyres polish the grain.
      const endA = 0.5 + rng.next() * 0.35;
      const endB = 0.5 + rng.next() * 0.35;
      const half = (width - 0.25) / 2;
      const endShade = (_px: number, _py: number, pz: number): number => {
        const e = Math.abs(pz) > half - 0.01 ? (pz < 0 ? endA : endB) : 1;
        const mid = Math.abs(pz) < 0.4 ? 1.06 : 1;
        return e * mid;
      };
      push(out, 'plank', box(BOARD_W, BOARD_T, width - 0.25, cx, cy, 0, ang, col, (px, py, pz) => [pz / 1.5 + seed * 3, v0 + (px + py) * 0.15], endShade, 4));
      s += pitch;
    }
    carry = s - segLen;
  }
  // Edge boards (lengthwise), slightly proud of the deck, on each side.
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1e-4) continue;
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    for (const side of [-1, 1]) {
      const c = new THREE.Color(0.7, 0.62, 0.5);
      push(out, 'plywood', box(len + 0.02, 0.09, 0.12, mx - Math.sin(ang) * 0.005, my + Math.cos(ang) * 0.005, side * (width / 2 - 0.06), ang, c, (px) => [px / 1.5, 0.35]));
    }
    // Joists under the boards every segment (dark steel), visible from the side.
    push(out, 'darkSteel', tint(box(len + 0.02, 0.1, width - 0.3, mx + Math.sin(ang) * 0.1, my - Math.cos(ang) * 0.1, 0, ang), 0.6, 0.6, 0.6));
  }
}

/** Painted lines / kerbs / edging along a polyline. */
function edging(pl: ColliderPolyline, mat: string, w: number, h: number, zOff: number, lift: number, r: number, g: number, b: number, out: Bucket): void {
  const pts = resample(pl.points, 1.0);
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const bb = pts[i]!;
    const len = Math.hypot(bb.x - a.x, bb.y - a.y);
    if (len < 1e-4) continue;
    const ang = Math.atan2(bb.y - a.y, bb.x - a.x);
    const mx = (a.x + bb.x) / 2 - Math.sin(ang) * lift;
    const my = (a.y + bb.y) / 2 + Math.cos(ang) * lift;
    for (const side of [-1, 1]) push(out, mat, tint(box(len + 0.02, h, w, mx, my, side * zOff, ang), r, g, b));
  }
}

/** Concrete kerb stones (0.9 m blocks, per-block tint) along both edges of a road polyline. */
function kerbs(pl: ColliderPolyline, rng: Rng, out: Bucket): void {
  const pts = resample(pl.points, 0.9);
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1e-4) continue;
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    for (const side of [-1, 1]) {
      const t = 0.78 + rng.next() * 0.2;
      push(out, 'concrete', tint(box(len - 0.02, 0.12, 0.28, mx - Math.sin(ang) * 0.02, my + Math.cos(ang) * 0.02, side * 1.6, ang), t, t, t * 0.98));
    }
  }
}

/** Split logs laid end to end along both edges of a snow trail (dark bark, snow on top is the ribbon lip). */
function logs(pl: ColliderPolyline, rng: Rng, out: Bucket): void {
  const pts = resample(pl.points, 2.2);
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1e-4) continue;
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    for (const side of [-1, 1]) {
      if (rng.next() < 0.15) continue;
      const g = new THREE.CylinderGeometry(0.13, 0.15, len - 0.1, 8).rotateZ(Math.PI / 2);
      const t = 0.3 + rng.next() * 0.15;
      tint(g, t, t * 0.8, t * 0.65);
      Q.setFromAxisAngle(ZAX, ang);
      M.compose(P.set(mx - Math.sin(ang) * 0.02, my + Math.cos(ang) * 0.02, side * 1.72), Q, S.set(1, 1, 1));
      g.applyMatrix4(M);
      push(out, 'pallet', g);
    }
  }
}

function ribbonWithShade(pl: ColliderPolyline, section: [number, number][], tile: number, lift: number, shade: (z: number, drop: number) => number): THREE.BufferGeometry {
  const g = ribbonGeometry(pl.points, section, tile, lift);
  const pos = g.getAttribute('position');
  const col = g.getAttribute('color') as THREE.BufferAttribute;
  // Re-shade by cross-track z (position.z) – drop is not stored, approximate from the section.
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i);
    let drop = 0;
    for (const [sz, sd] of section) if (Math.abs(sz - z) < 1e-3) drop = sd;
    const s = shade(z, drop);
    col.setXYZ(i, s, s, s);
  }
  return g;
}

/**
 * Top of the support-container ledge under the deck at slot `x` (interior biomes): the deck
 * rides on cross-wise containers that stick out 1.5 m each side, so their roof is a shelf at
 * `floorY + n·2.59`. Null where the deck is too low for a container (frame / crate / pallets).
 * Shared with the hall kit, which dresses the ledge (round 10).
 */
export function supportLedgeY(profile: { x: number; y: number }[], floorY: number, x: number): number | null {
  const y = Math.min(profileY(profile, x - 1.2), profileY(profile, x), profileY(profile, x + 1.2));
  const h = y - 0.12 - floorY;
  if (h < 2.5) return null;
  const n = Math.floor(h / 2.59);
  return n >= 1 ? floorY + n * 2.59 : null;
}
/** Support slots are every 2.5 m from the first profile point + 1.25 (same walk as the builder). */
export const SUPPORT_SLOT = 2.5;

export interface DeckResult extends TrackMeshes {
  /** Extra instanced structure (supports, edging rocks) — counted in track budget. */
  supports: THREE.Group;
}

export function buildRideSurfaces(track: CompiledTrack, biome: Biome, lib: MaterialLibrary): DeckResult {
  const group = new THREE.Group();
  group.name = 'deck';
  const supports = new THREE.Group();
  supports.name = 'deck-supports';
  const rng = new Rng((track.def.seed ^ 0xdeadbeef) >>> 0);
  const buckets: Bucket = new Map();
  const interior = biome.interior;
  const floorY = groundFloorY(track.def.profile, interior);

  const rocks = new PropBatch('edge-rock', rockGeometry(track.def.seed ^ 77, 1), lib.get('rock'));
  const pallets = new PropBatch('support-pallet', bakeAO(palletLowGeometry(), 0.144, 0.25), lib.get('pallet'), false);
  const stacks = new PropBatch('support-stack', palletStackGeometry(3), lib.get('pallet'), false);
  // Round 9 (b1 read 1 920 stack instances = 346 k tris: a 2.5 m remainder was 18 pallets high):
  // heights of 0.45–1.3 m get one plywood crate (12 tris), 1.3–2.5 m a steel frame, pallets
  // only for the last < 0.45 m.
  const crates = new PropBatch('support-crate', bakeAO(new THREE.BoxGeometry(2.2, 1, 2.2).translate(0, 0.5, 0), 1, 0.3), lib.get('plywood'), false);
  const containers = new PropBatch('support-container', bakeAO(containerGeometry(), 2.59, 0.4), lib.get('container'));
  const palette = [0x1f5a4a, 0x7a2418, 0x1e3d66, 0x46463e, 0x8a5a1e, 0x2e5a2a];

  for (const c of track.colliders) {
    if (c.kind !== 'polyline' || c.points.length < 2) continue;
    const pl = c;
    const ground = pl.obstacleIndex < 0;
    const surf: SurfaceKind = pl.surface === 'dirt' && biome.id === 'snow' && pl.obstacleIndex < 0 ? 'snow' : pl.surface;
    const tile = TILE[surf] ?? 2;
    if (surf === 'wood') {
      boards(pl, rng, buckets);
      continue;
    }
    if (surf === 'dirt' && interior) {
      // Contained dirt bed: worn line down the middle, plywood edge boards.
      push(buckets, 'dirt', ribbonWithShade(pl, BED_SECTION, tile, 0, (z, drop) => (Math.abs(z) < 0.32 ? 0.62 : 1) * (1 + drop * 1.5)));
      edging(pl, 'plywood', 0.12, 0.16, 1.62, 0.02, 0.75, 0.66, 0.52, buckets);
      continue;
    }
    if (surf === 'dirt') {
      const section = ground ? (biome.id === 'canyon' ? RUT_SECTION : WIDE_SECTION) : OBSTACLE_SECTION;
      const rib = ribbonWithShade(pl, section, tile, ground ? 0 : 0.004, (z, drop) => {
        // Canyon: two tyre ruts (z ±0.4) worn darker, a pale crown between them; elsewhere one worn line.
        const wear = biome.id === 'canyon' ? (Math.abs(Math.abs(z) - 0.4) < 0.16 ? 0.7 : Math.abs(z) < 0.2 ? 1.1 : 1) : Math.abs(z) < 0.3 ? 0.72 : 1;
        return wear * (0.55 + 0.45 * (1 - Math.min(1, -drop * 0.9)));
      });
      if (biome.id === 'canyon') {
        // Warm ochre over the shared dirt maps.
        const col = rib.getAttribute('color') as THREE.BufferAttribute;
        for (let i = 0; i < col.count; i++) col.setXYZ(i, col.getX(i) * 1.25, col.getY(i) * 1.02, col.getZ(i) * 0.8);
      }
      push(buckets, 'dirt', rib);
      if (biome.id === 'canyon' && ground) {
        const pts = resample(pl.points, 2.6);
        for (const p of pts) {
          for (const side of [-1, 1]) {
            if (rng.next() < 0.45) rocks.add(p.x + rng.range(-0.5, 0.5), p.y - 0.12, side * rng.range(1.7, 2.3), rng.range(0, 6), rng.range(0.25, 0.65), null, rng.range(-0.3, 0.3), rng.range(0.2, 0.45), rng.range(0.25, 0.65));
          }
        }
      }
      continue;
    }
    if (surf === 'concrete') {
      push(buckets, biome.id === 'nightCity' ? 'asphaltWet' : 'concrete', ribbonWithShade(pl, ground ? WIDE_SECTION : OBSTACLE_SECTION, tile, ground ? 0 : 0.004, (z, drop) => (Math.abs(z) < 0.3 ? 0.85 : 1) * (0.6 + 0.4 * (1 - Math.min(1, -drop * 0.9)))));
      // Painted edge lines + concrete kerb stones (nightCity).
      edging(pl, 'hazardTape', 0.1, 0.006, 1.32, 0.004, 1, 1, 1, buckets);
      if (biome.id === 'nightCity' && ground) kerbs(pl, rng, buckets);
      continue;
    }
    if (surf === 'metal' || surf === 'grate') {
      push(buckets, SURFACE_MATERIAL[surf], ribbonWithShade(pl, ground ? WIDE_SECTION : OBSTACLE_SECTION, tile, ground ? 0 : 0.004, (_z, drop) => 0.7 + 0.3 * (1 - Math.min(1, -drop))));
      edging(pl, 'darkSteel', 0.08, 0.08, 1.52, 0.03, 0.6, 0.6, 0.6, buckets);
      // Foundry: grating strips along both edges of the plate (z 0.95–1.45), lifted 1 cm.
      if (biome.id === 'foundry' && ground) edging(pl, 'grate', 0.5, 0.03, 1.2, 0.012, 0.8, 0.8, 0.8, buckets);
      continue;
    }
    if (surf === 'snow') {
      push(buckets, 'snow', ribbonWithShade(pl, ground ? WIDE_SECTION : OBSTACLE_SECTION, tile, ground ? 0 : 0.004, (z, drop) => {
        // Packed trail: two faint ruts, dark trodden edges past |z| 1.35, blue-grey apron.
        const a = Math.abs(z);
        const wear = Math.abs(a - 0.38) < 0.14 ? 0.86 : a > 1.35 ? 0.7 : 1;
        return wear * (0.62 + 0.38 * (1 - Math.min(1, -drop * 1.2)));
      }));
      if (ground) {
        // Dark rock/dirt edge under the snow lip and split-log kerbs on both sides.
        edging(pl, 'dirt', 0.5, 0.05, 1.68, -0.1, 0.35, 0.32, 0.3, buckets);
        logs(pl, rng, buckets);
      }
      continue;
    }
    push(buckets, SURFACE_MATERIAL[surf] ?? 'dirt', ribbonWithShade(pl, ground ? WIDE_SECTION : OBSTACLE_SECTION, tile, ground ? 0 : 0.004, (_z, drop) => 0.55 + 0.45 * (1 - Math.min(1, -drop * 0.9))));
  }

  // Supports under the ground profile (interior only): the deck rides on a
  // continuous row of containers (rotated across the track, so they stick out
  // 1.5 m each side as a ledge) topped with pallets to the exact height; where
  // the profile climbs, extra containers stack up; short heights get pallet
  // stacks or a steel frame.
  if (interior) {
    const prof = track.def.profile;
    const deckBottom = 0.12;
    // Fill `h` metres above `base` at slot `x` with the cheapest thing that reads as a support.
    const fill = (x: number, base: number, h: number): void => {
      if (h < 0.1) return;
      if (h >= 1.3) {
        for (const dx of [-0.9, 0.9]) {
          for (const z of [-1.2, 1.2]) push(buckets, 'darkSteel', tint(box(0.08, h, 0.08, x + dx, base + h / 2, z, 0), 0.7, 0.7, 0.7));
          push(buckets, 'darkSteel', tint(box(0.08, 0.08, 2.5, x + dx, base + h - 0.04, 0, 0), 0.7, 0.7, 0.7));
        }
      } else if (h >= 0.45) {
        crates.add(x + rng.range(-0.02, 0.02), base, rng.range(-0.04, 0.04), rng.range(-0.02, 0.02), 1, null, 0, h, 1);
      } else {
        // Two wide (2.05×) pallet stacks, y-scaled to the height.
        const sy = h / (3 * 0.144);
        for (const z of [-0.85, 0.85]) stacks.add(x, base, z, rng.range(-0.02, 0.02), 2.05, null, 0, sy, 1);
      }
    };
    for (let x = prof[0]!.x + 1.25; x < prof[prof.length - 1]!.x; x += 2.5) {
      const y = Math.min(profileY(prof, x - 1.2), profileY(prof, x), profileY(prof, x + 1.2));
      const h = y - deckBottom - floorY;
      if (h < 0.1) continue;
      if (h >= 2.5) {
        const n = Math.floor(h / 2.59);
        for (let k = 0; k < n; k++) containers.add(x + rng.range(-0.02, 0.02), floorY + k * 2.59, rng.range(-0.05, 0.05), Math.PI / 2 + rng.range(-0.01, 0.01), 1, palette[rng.int(0, palette.length - 1)]!);
        fill(x, floorY + n * 2.59, h - n * 2.59);
      } else fill(x, floorY, h);
    }
  }

  // Tyre worn line: a translucent dark strip down the ridden path (reference obs. 19); the dirt bed bakes its own.
  {
    const worn: THREE.BufferGeometry[] = [];
    for (const c of track.colliders) {
      if (c.kind !== 'polyline' || c.points.length < 2 || c.obstacleIndex >= 0) continue;
      if (c.surface === 'dirt' && interior) continue;
      worn.push(ribbonWithShade(c, [[-0.18, 0], [0, 0], [0.18, 0]], 4, 0.008, () => 1));
    }
    if (worn.length) {
      const merged = worn.length === 1 ? worn[0]! : mergeGeometries(worn, false);
      if (merged) {
        const mat = lib.derive('rubberMat');
        mat.color.setHex(0x14100c);
        mat.vertexColors = true;
        mat.transparent = true;
        mat.opacity = 0.22;
        mat.depthWrite = false;
        mat.polygonOffset = true;
        mat.polygonOffsetFactor = -1;
        mat.polygonOffsetUnits = -1;
        fogify(mat);
        const mesh = new THREE.Mesh(merged, mat);
        mesh.receiveShadow = true;
        mesh.renderOrder = 1;
        mesh.name = 'deck:worn';
        group.add(mesh);
      }
    }
  }

  // Contact / AO gradient under the deck edge (interior): a vertical dark gradient
  // ribbon on each side, from the deck bottom 1.4 m down over the container ledge,
  // plus a soft skirt on the ledge itself — the corner the SSAO would darken.
  if (interior) {
    const [c, g] = canvas(4, 64);
    const gr = g.createLinearGradient(0, 0, 0, 64);
    gr.addColorStop(0, 'rgba(0,0,0,0.45)'); // round 10: 0.7 was a black void under the deck at idle now that SSAO + contact decals exist
    gr.addColorStop(0.35, 'rgba(0,0,0,0.18)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 4, 64);
    const aoTex = tex(c, false, false);
    const aoMat = new THREE.MeshBasicMaterial({ map: aoTex, transparent: true, depthWrite: false, color: 0x000000, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    const pts = resample(track.def.profile, 2.0);
    const geos: THREE.BufferGeometry[] = [];
    for (const side of [-1, 1]) {
      for (const [zOff, drop, w] of [[1.66 * side, 1.4, 0.0], [1.68 * side, 0.0, 1.3 * side]] as const) {
        const pos: number[] = [];
        const uv: number[] = [];
        const idx: number[] = [];
        for (let i = 0; i < pts.length; i++) {
          const p = pts[i]!;
          const top = p.y - 0.12;
          pos.push(p.x, top, zOff, p.x, top - drop, zOff + w);
          uv.push(0, 0, 0, 1);
          if (i > 0) idx.push(2 * i - 2, 2 * i - 1, 2 * i, 2 * i, 2 * i - 1, 2 * i + 1);
        }
        const gg = new THREE.BufferGeometry();
        gg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        gg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        gg.setIndex(idx);
        geos.push(gg);
      }
    }
    const merged = mergeGeometries(geos, false);
    if (merged) {
      const m = new THREE.Mesh(merged, aoMat);
      m.renderOrder = 1;
      m.frustumCulled = false;
      m.name = 'deck:ao';
      group.add(m);
    }
  }

  let triangles = 0;
  let drawCalls = 0;
  for (const [matName, geos] of buckets) {
    // Geometries mix colour attributes; make sure every one has colour before merging.
    for (const g of geos) tint(g, 1, 1, 1);
    const merged = geos.length === 1 ? geos[0]! : mergeGeometries(geos, false);
    if (!merged) continue;
    const mat = lib.derive(matName);
    mat.vertexColors = true;
    fogify(mat);
    const mesh = new THREE.Mesh(merged, mat);
    mesh.receiveShadow = true;
    mesh.castShadow = matName !== 'dirt' && matName !== 'concrete' && matName !== 'snow';
    mesh.name = `deck:${matName}`;
    group.add(mesh);
    triangles += triCount(merged);
    drawCalls++;
  }
  for (const b of [rocks, pallets, stacks, crates, containers]) {
    const im = b.build();
    if (!im) continue;
    supports.add(im);
    drawCalls++;
    triangles += triCount(b.geometry) * b.count;
  }
  return { group, supports, triangles, drawCalls };
}
