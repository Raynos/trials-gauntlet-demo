/**
 * Track compiler: TrackDef -> CompiledTrack (CONTRACT.md §2.2). Pure and
 * deterministic: same def -> same colliders, ids and hash, in node and in
 * every browser (all output coordinates are quantised to 1e-6 m so ulp
 * differences in transcendental functions cannot leak into the hash).
 *
 * Output order (ids are sequential in this order):
 *   1. ground polylines (obstacleIndex -1), by min x
 *   2. per obstacle, in def order: merged solid outlines, open chains (plank
 *      tops, lips), then circles / boxes / seesaws in the order the kind emitted them
 * Hazards are numbered in obstacle order.
 */
import type { Collider, CompiledTrack, HazardZone, PlacedObstacle, TrackDef, Vec2 } from '../core/types';
import { StateHasher } from '../core/hash';
import { chainEdges, mergeSolids, polygonEdges, quantize, quantizeVec, type OwnedEdge } from './geometry';
import {
  GAP_WALL_LEAN,
  compileKind,
  isObstacleKind,
  resolveParams,
  type GroundQuery,
  type KindGeometry,
  type ParamRecord,
} from './kinds';

export class TrackCompileError extends Error {
  constructor(
    readonly trackId: string,
    message: string,
  ) {
    super(`[${trackId}] ${message}`);
  }
}

/** Authored profile lookup (before gap pits). */
export function profileQuery(profile: readonly Vec2[]): GroundQuery {
  const y = (x: number): number => {
    const first = profile[0] as Vec2;
    const last = profile[profile.length - 1] as Vec2;
    if (x <= first.x) return first.y;
    if (x >= last.x) return last.y;
    let lo = 0;
    let hi = profile.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if ((profile[mid] as Vec2).x <= x) lo = mid;
      else hi = mid;
    }
    const a = profile[lo] as Vec2;
    const b = profile[hi] as Vec2;
    if (b.x === a.x) return a.y;
    const t = (x - a.x) / (b.x - a.x);
    return a.y + (b.y - a.y) * t;
  };
  const chain = (x0: number, x1: number): Vec2[] => {
    const pts: Vec2[] = [{ x: x0, y: y(x0) }];
    for (const p of profile) {
      if (p.x > x0 + 1e-9 && p.x < x1 - 1e-9) pts.push({ x: p.x, y: p.y });
    }
    pts.push({ x: x1, y: y(x1) });
    return pts;
  };
  return { y, chain };
}

interface GapCut {
  x0: number;
  x1: number;
  depth: number;
  lipY: number;
}

/** Ground chain with gap pits punched in. Near-vertical walls keep x monotone. */
function groundWithGaps(profile: readonly Vec2[], gaps: readonly GapCut[]): Vec2[] {
  const sorted = [...gaps].sort((a, b) => a.x0 - b.x0);
  const out: Vec2[] = [];
  let gi = 0;
  const pushPit = (g: GapCut): void => {
    out.push({ x: g.x0, y: g.lipY });
    out.push({ x: g.x0 + GAP_WALL_LEAN, y: g.lipY - g.depth });
    out.push({ x: g.x1 - GAP_WALL_LEAN, y: g.lipY - g.depth });
    out.push({ x: g.x1, y: g.lipY });
  };
  for (const p of profile) {
    while (gi < sorted.length && (sorted[gi] as GapCut).x1 <= p.x + 1e-9) {
      pushPit(sorted[gi] as GapCut);
      gi++;
    }
    const g = sorted[gi];
    if (g && p.x > g.x0 - 1e-9 && p.x < g.x1 + 1e-9) continue; // point inside a pit footprint
    out.push({ x: p.x, y: p.y });
  }
  while (gi < sorted.length) pushPit(sorted[gi++] as GapCut);
  // dedupe consecutive equal points
  return out.filter((p, i) => i === 0 || Math.abs(p.x - (out[i - 1] as Vec2).x) > 1e-9 || Math.abs(p.y - (out[i - 1] as Vec2).y) > 1e-9);
}

export function compileTrack(def: TrackDef): CompiledTrack {
  if (def.profile.length < 2) throw new TrackCompileError(def.id, 'profile needs at least 2 points');
  for (let i = 1; i < def.profile.length; i++) {
    if ((def.profile[i] as Vec2).x <= (def.profile[i - 1] as Vec2).x) {
      throw new TrackCompileError(def.id, `profile x not strictly increasing at index ${i}`);
    }
  }
  const ground = profileQuery(def.profile);

  // 1. Per-obstacle geometry
  const geoms: KindGeometry[] = [];
  const resolved: ParamRecord[] = [];
  const gaps: GapCut[] = [];
  def.obstacles.forEach((o, i) => {
    if (!isObstacleKind(o.kind)) throw new TrackCompileError(def.id, `obstacle ${i}: unknown kind '${o.kind}'`);
    const params = resolveParams(o.kind, o.params) as unknown as ParamRecord;
    resolved.push(params);
    geoms.push(compileKind(o.kind, o.pos, o.params, ground));
    if (o.kind === 'gap') {
      const p = resolveParams('gap', o.params);
      const lipY = ground.y(o.pos.x);
      if (Math.abs(ground.y(o.pos.x + p.width) - lipY) > 1e-6) {
        throw new TrackCompileError(def.id, `gap ${i} at x=${o.pos.x}: ground is not level across the gap`);
      }
      gaps.push({ x0: o.pos.x, x1: o.pos.x + p.width, depth: p.depth, lipY });
    }
  });
  for (let i = 1; i < gaps.length; i++) {
    const a = gaps[i - 1] as GapCut;
    const b = gaps[i] as GapCut;
    if (b.x0 < a.x1 - 1e-9) throw new TrackCompileError(def.id, `gaps overlap at x=${b.x0}`);
  }

  // 2. Merge ground + solids
  const edges: OwnedEdge[] = chainEdges(groundWithGaps(def.profile, gaps), -1, 'dirt');
  geoms.forEach((g, i) => {
    for (const s of g.solids) edges.push(...polygonEdges(s.points, i, s.surface));
  });
  const merged = mergeSolids(edges);
  if (merged.conflicts.length > 0) {
    const c = merged.conflicts[0] as { a: OwnedEdge; b: OwnedEdge };
    throw new TrackCompileError(
      def.id,
      `solid overlap between obstacle ${c.a.owner} and ${c.b.owner} near x=${c.a.a.x.toFixed(2)},y=${c.a.a.y.toFixed(2)}`,
    );
  }

  // 3. Emit colliders in contract order
  const colliders: Collider[] = [];
  const placed: PlacedObstacle[] = def.obstacles.map((o, i) => ({
    kind: o.kind,
    pos: { x: o.pos.x, y: o.pos.y },
    params: resolved[i] as ParamRecord,
    colliderIds: [],
  }));
  const own = (idx: number, c: Collider): void => {
    colliders.push(c);
    if (idx >= 0) (placed[idx] as PlacedObstacle).colliderIds.push(c.id);
  };
  let nextId = 0;
  for (const ch of merged.chains.filter((c) => c.owner === -1)) {
    const pts = ch.points.map(quantizeVec);
    if (ch.closed) pts.push(pts[0] as Vec2);
    own(-1, { kind: 'polyline', id: nextId++, surface: ch.surface, obstacleIndex: -1, points: pts });
  }
  geoms.forEach((g, i) => {
    for (const ch of merged.chains.filter((c) => c.owner === i)) {
      const pts = ch.points.map(quantizeVec);
      if (ch.closed) pts.push(pts[0] as Vec2);
      own(i, { kind: 'polyline', id: nextId++, surface: ch.surface, obstacleIndex: i, points: pts });
    }
    for (const ch of g.chains) {
      const c: Collider = { kind: 'polyline', id: nextId++, surface: ch.surface, obstacleIndex: i, points: ch.points.map(quantizeVec) };
      if (ch.oneWay) c.oneWay = true;
      own(i, c);
    }
    for (const l of g.loose) {
      const id = nextId++;
      switch (l.kind) {
        case 'circle': {
          const c: Collider = { kind: 'circle', id, surface: l.surface, obstacleIndex: i, center: quantizeVec(l.center), radius: quantize(l.radius) };
          if (l.rolls) c.rolls = true;
          own(i, c);
          break;
        }
        case 'box':
          own(i, {
            kind: 'box',
            id,
            surface: l.surface,
            obstacleIndex: i,
            center: quantizeVec(l.center),
            halfW: quantize(l.halfW),
            halfH: quantize(l.halfH),
            angle: quantize(l.angle),
          });
          break;
        case 'seesaw':
          own(i, {
            kind: 'seesaw',
            id,
            surface: l.surface,
            obstacleIndex: i,
            pivot: quantizeVec(l.pivot),
            halfLength: quantize(l.halfLength),
            thickness: quantize(l.thickness),
            maxAngle: quantize(l.maxAngle),
            mass: quantize(l.mass),
          });
          break;
        case 'polyline':
          // kinds never emit loose polylines; chains cover that
          break;
      }
    }
  });

  // 4. Hazards
  const hazards: HazardZone[] = [];
  geoms.forEach((g) => {
    for (const h of g.hazards) hazards.push({ id: hazards.length, kind: h.kind, min: quantizeVec(h.min), max: quantizeVec(h.max) });
  });

  // 5. Bounds over colliders (+ profile so an empty track still has bounds)
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  const grow = (x: number, y: number): void => {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  };
  for (const p of def.profile) grow(p.x, p.y);
  for (const c of colliders) {
    switch (c.kind) {
      case 'polyline':
        for (const p of c.points) grow(p.x, p.y);
        break;
      case 'circle':
        grow(c.center.x - c.radius, c.center.y - c.radius);
        grow(c.center.x + c.radius, c.center.y + c.radius);
        break;
      case 'box': {
        const ex = Math.abs(Math.cos(c.angle)) * c.halfW + Math.abs(Math.sin(c.angle)) * c.halfH;
        const ey = Math.abs(Math.sin(c.angle)) * c.halfW + Math.abs(Math.cos(c.angle)) * c.halfH;
        grow(c.center.x - ex, c.center.y - ey);
        grow(c.center.x + ex, c.center.y + ey);
        break;
      }
      case 'seesaw': {
        const ey = c.halfLength * Math.sin(c.maxAngle) + c.thickness;
        grow(c.pivot.x - c.halfLength, c.pivot.y - ey);
        grow(c.pivot.x + c.halfLength, c.pivot.y + ey);
        break;
      }
    }
  }
  const bounds = { minX: quantize(minX), maxX: quantize(maxX), minY: quantize(minY), maxY: quantize(maxY) };

  return {
    def,
    colliders,
    hazards,
    placed,
    bounds,
    oobY: quantize(bounds.minY - 6),
    hash: hashColliders(colliders),
  };
}

export function hashColliders(colliders: readonly Collider[]): string {
  const h = new StateHasher();
  for (const c of colliders) {
    h.string(c.kind).number(c.id).string(c.surface).number(c.obstacleIndex);
    switch (c.kind) {
      case 'polyline':
        for (const p of c.points) h.number(p.x).number(p.y);
        h.bool(c.oneWay ?? false);
        break;
      case 'circle':
        h.number(c.center.x).number(c.center.y).number(c.radius).bool(c.rolls ?? false);
        break;
      case 'box':
        h.number(c.center.x).number(c.center.y).number(c.halfW).number(c.halfH).number(c.angle);
        break;
      case 'seesaw':
        h.number(c.pivot.x).number(c.pivot.y).number(c.halfLength).number(c.thickness).number(c.maxAngle).number(c.mass);
        break;
    }
  }
  return h.digest();
}
