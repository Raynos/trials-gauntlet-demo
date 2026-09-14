/**
 * Track mesh builder: the exact ridden surfaces from `CompiledTrack.colliders`
 * (what you see is what you ride) as 3 m ribbons with bevelled edges and
 * aprons, merged per surface material so a whole track is a handful of draws.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Collider, ColliderPolyline, CompiledTrack, SurfaceKind, Vec2 } from '../../core/types';
import { SURFACE_MATERIAL, type MaterialLibrary } from '../materials/library';
import { fogify } from '../lighting/environment';

/** Cross-section rows: [z, yDrop]. Full ground profile gets the wide apron. */
const GROUND_SECTION: [number, number][] = [
  [-3.0, -0.42],
  [-1.75, -0.16],
  [-1.5, 0],
  [-0.9, 0],
  [0, 0],
  [0.9, 0],
  [1.5, 0],
  [1.75, -0.16],
  [3.0, -0.42],
];
/** Obstacle surfaces: 3 m board, small chamfer, no apron. */
const OBSTACLE_SECTION: [number, number][] = [
  [-1.5, -0.05],
  [-1.42, 0],
  [0, 0],
  [1.42, 0],
  [1.5, -0.05],
];

/** UV metres per tile per surface. */
const TILE: Record<SurfaceKind, number> = {
  dirt: 2.5,
  wood: 1.5,
  metal: 1.5,
  concrete: 3,
  rubber: 1,
  grate: 1,
  stone: 2.5,
  snow: 3,
};

/** Resample a polyline so no segment exceeds `maxSeg` metres. */
export function resample(points: readonly Vec2[], maxSeg: number): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    if (i > 0) {
      const a = points[i - 1]!;
      const len = Math.hypot(p.x - a.x, p.y - a.y);
      const n = Math.ceil(len / maxSeg);
      for (let k = 1; k < n; k++) {
        const t = k / n;
        out.push({ x: a.x + (p.x - a.x) * t, y: a.y + (p.y - a.y) * t });
      }
    }
    out.push({ x: p.x, y: p.y });
  }
  return out;
}

/** Build a ribbon along a polyline. `bake` darkens vertices near steep slopes (cheap AO). */
export function ribbonGeometry(points: readonly Vec2[], section: readonly [number, number][], tile: number, lift = 0): THREE.BufferGeometry {
  const pts = resample(points, 0.75);
  const rows = section.length;
  const n = pts.length;
  const pos = new Float32Array(n * rows * 3);
  const nor = new Float32Array(n * rows * 3);
  const uv = new Float32Array(n * rows * 2);
  const col = new Float32Array(n * rows * 3);
  const idx: number[] = [];
  let arc = 0;
  for (let i = 0; i < n; i++) {
    const p = pts[i]!;
    if (i > 0) {
      const a = pts[i - 1]!;
      arc += Math.hypot(p.x - a.x, p.y - a.y);
    }
    // Tangent from neighbours → surface normal in XY.
    const a = pts[Math.max(0, i - 1)]!;
    const b = pts[Math.min(n - 1, i + 1)]!;
    let tx = b.x - a.x;
    let ty = b.y - a.y;
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl;
    ty /= tl;
    const nx = -ty;
    const ny = tx;
    const slope = Math.abs(ty); // 0 flat, 1 vertical
    for (let r = 0; r < rows; r++) {
      const [z, drop] = section[r]!;
      const k = (i * rows + r) * 3;
      // Drop along the surface normal so bevels stay bevels on slopes.
      pos[k] = p.x + nx * (drop + lift);
      pos[k + 1] = p.y + ny * (drop + lift);
      pos[k + 2] = z;
      // Normal: blend surface normal toward ±z on the bevel rows.
      const edge = drop < 0 ? Math.sign(z) : 0;
      const bz = edge * Math.min(1, -drop * 3);
      const l = Math.hypot(nx, ny, bz) || 1;
      nor[k] = nx / l;
      nor[k + 1] = ny / l;
      nor[k + 2] = bz / l;
      uv[(i * rows + r) * 2] = arc / tile;
      uv[(i * rows + r) * 2 + 1] = z / tile;
      // Vertex colour: darker in the aprons, slightly darker on steep faces.
      const shade = (1 - Math.min(1, -drop * 0.9)) * (1 - slope * 0.15);
      col[k] = col[k + 1] = col[k + 2] = 0.55 + 0.45 * shade;
      if (i > 0 && r > 0) {
        const c = i * rows + r;
        const pIdx = (i - 1) * rows + r;
        idx.push(pIdx - 1, pIdx, c - 1, c - 1, pIdx, c);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

export interface TrackMeshes {
  group: THREE.Group;
  triangles: number;
  drawCalls: number;
}

/** Interpolated ground profile height under x. */
export function profileY(profile: readonly Vec2[], x: number): number {
  if (profile.length === 0) return 0;
  if (x <= profile[0]!.x) return profile[0]!.y;
  for (let i = 1; i < profile.length; i++) {
    const a = profile[i - 1]!;
    const b = profile[i]!;
    if (x <= b.x) {
      const t = (x - a.x) / (b.x - a.x || 1);
      return a.y + (b.y - a.y) * t;
    }
  }
  return profile[profile.length - 1]!.y;
}

/**
 * All polyline colliders as ribbons, merged per surface. Box/circle/seesaw
 * colliders are bodies and live in obstacles.ts.
 */
export function buildRibbons(track: CompiledTrack, lib: MaterialLibrary): TrackMeshes {
  const group = new THREE.Group();
  group.name = 'ribbons';
  const bySurface = new Map<SurfaceKind, THREE.BufferGeometry[]>();
  let triangles = 0;
  for (const c of track.colliders as Collider[]) {
    if (c.kind !== 'polyline') continue;
    const pl = c as ColliderPolyline;
    if (pl.points.length < 2) continue;
    const isGround = pl.obstacleIndex < 0;
    const geo = ribbonGeometry(pl.points, isGround ? GROUND_SECTION : OBSTACLE_SECTION, TILE[pl.surface] ?? 2, isGround ? 0 : 0.004);
    const list = bySurface.get(pl.surface) ?? [];
    list.push(geo);
    bySurface.set(pl.surface, list);
  }
  let drawCalls = 0;
  for (const [surface, geos] of bySurface) {
    const merged = geos.length === 1 ? geos[0]! : mergeGeometries(geos, false);
    if (!merged) continue;
    const mat = lib.derive(SURFACE_MATERIAL[surface] ?? 'dirt');
    mat.vertexColors = true;
    fogify(mat);
    const mesh = new THREE.Mesh(merged, mat);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.name = `ribbon:${surface}`;
    group.add(mesh);
    triangles += (merged.index?.count ?? 0) / 3;
    drawCalls++;
  }
  return { group, triangles, drawCalls };
}

/**
 * Hall floor height for interior biomes: the track is built up on containers and
 * pallets ≈3 m above the concrete (the reference "elevated in a huge hall" read),
 * so the floor recedes below the deck and the camera looks down into the space.
 * Exterior biomes keep the terrain right under the apron.
 */
export const HALL_DROP = 0.42 + 2.59;
export function groundFloorY(profile: readonly Vec2[], interior: boolean): number {
  let minY = Infinity;
  for (const p of profile) minY = Math.min(minY, p.y);
  return minY - (interior ? HALL_DROP : 0.42);
}
