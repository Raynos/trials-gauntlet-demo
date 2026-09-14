/**
 * Small deterministic 2D helpers for the track compiler.
 *
 * The core operation is `mergeSolids`: given the ground chain and every solid
 * outline (all oriented with the solid on the right), cancel the portions of
 * edges that are shared by two shapes (collinear, overlapping, opposite
 * direction). What survives is exactly the exposed surface, so no face is ever
 * registered twice and no interior seam can catch a wheel. Surviving edge
 * pieces are then linked back into polylines per owner.
 */
import type { SurfaceKind, Vec2 } from '../core/types';

export interface OwnedEdge {
  a: Vec2;
  b: Vec2;
  /** -1 = ground profile, else index into def.obstacles. */
  owner: number;
  surface: SurfaceKind;
}

export interface OwnedChain {
  points: Vec2[];
  owner: number;
  surface: SurfaceKind;
  closed: boolean;
}

export interface MergeResult {
  chains: OwnedChain[];
  /** Same-direction collinear overlaps = two solids share interior: an authoring error. */
  conflicts: { a: OwnedEdge; b: OwnedEdge }[];
}

const EPS = 1e-6;
const KEY_Q = 1e5;

export function quantize(v: number): number {
  const q = Math.round(v * 1e6) / 1e6;
  return q === 0 ? 0 : q; // normalise -0
}

export function quantizeVec(p: Vec2): Vec2 {
  return { x: quantize(p.x), y: quantize(p.y) };
}

function key(p: Vec2): string {
  return `${Math.round(p.x * KEY_Q)}:${Math.round(p.y * KEY_Q)}`;
}

export function polygonEdges(points: readonly Vec2[], owner: number, surface: SurfaceKind): OwnedEdge[] {
  const out: OwnedEdge[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i] as Vec2;
    const b = points[(i + 1) % points.length] as Vec2;
    if (Math.hypot(b.x - a.x, b.y - a.y) < EPS) continue;
    out.push({ a, b, owner, surface });
  }
  return out;
}

export function chainEdges(points: readonly Vec2[], owner: number, surface: SurfaceKind): OwnedEdge[] {
  const out: OwnedEdge[] = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i] as Vec2;
    const b = points[i + 1] as Vec2;
    if (Math.hypot(b.x - a.x, b.y - a.y) < EPS) continue;
    out.push({ a, b, owner, surface });
  }
  return out;
}

interface Interval {
  t0: number;
  t1: number;
}

function subtract(intervals: Interval[], cut: Interval): Interval[] {
  const out: Interval[] = [];
  for (const iv of intervals) {
    if (cut.t1 <= iv.t0 + EPS || cut.t0 >= iv.t1 - EPS) {
      out.push(iv);
      continue;
    }
    if (cut.t0 > iv.t0 + EPS) out.push({ t0: iv.t0, t1: cut.t0 });
    if (cut.t1 < iv.t1 - EPS) out.push({ t0: cut.t1, t1: iv.t1 });
  }
  return out;
}

/**
 * Cancel shared faces. Returns the surviving sub-edges (in input order, each
 * edge's pieces in +t order) and any same-direction overlaps.
 */
export function cancelSharedEdges(edges: readonly OwnedEdge[]): { kept: OwnedEdge[]; conflicts: MergeResult['conflicts'] } {
  const kept: (OwnedEdge & { src: number; t0: number })[] = [];
  const conflicts: MergeResult['conflicts'] = [];
  const n = edges.length;
  // Pre-compute direction and length
  const dir = edges.map((e) => {
    const dx = e.b.x - e.a.x;
    const dy = e.b.y - e.a.y;
    const len = Math.hypot(dx, dy);
    return { dx: dx / len, dy: dy / len, len };
  });
  // Bucket by minX for a cheap broadphase.
  const order = edges.map((_, i) => i).sort((i, j) => minX(edges[i] as OwnedEdge) - minX(edges[j] as OwnedEdge));
  for (let oi = 0; oi < n; oi++) {
    const i = order[oi] as number;
    const e = edges[i] as OwnedEdge;
    const d = dir[i] as { dx: number; dy: number; len: number };
    let intervals: Interval[] = [{ t0: 0, t1: d.len }];
    const eMaxX = maxX(e);
    for (let oj = 0; oj < n && intervals.length > 0; oj++) {
      const j = order[oj] as number;
      if (j === i) continue;
      const f = edges[j] as OwnedEdge;
      if (minX(f) > eMaxX + EPS) break;
      if (maxX(f) < minX(e) - EPS) continue;
      // Collinear?
      const ca = cross(d, { x: f.a.x - e.a.x, y: f.a.y - e.a.y });
      const cb = cross(d, { x: f.b.x - e.a.x, y: f.b.y - e.a.y });
      if (Math.abs(ca) > EPS || Math.abs(cb) > EPS) continue;
      const ta = dot(d, { x: f.a.x - e.a.x, y: f.a.y - e.a.y });
      const tb = dot(d, { x: f.b.x - e.a.x, y: f.b.y - e.a.y });
      const lo = Math.min(ta, tb);
      const hi = Math.max(ta, tb);
      if (hi <= EPS || lo >= d.len - EPS) continue; // no overlap
      const opposite = tb < ta;
      if (!opposite) {
        if (i < j) conflicts.push({ a: e, b: f });
        continue;
      }
      intervals = subtract(intervals, { t0: Math.max(0, lo), t1: Math.min(d.len, hi) });
    }
    for (const iv of intervals) {
      if (iv.t1 - iv.t0 < EPS) continue;
      kept.push({
        a: iv.t0 === 0 ? e.a : { x: e.a.x + d.dx * iv.t0, y: e.a.y + d.dy * iv.t0 },
        b: iv.t1 === d.len ? e.b : { x: e.a.x + d.dx * iv.t1, y: e.a.y + d.dy * iv.t1 },
        owner: e.owner,
        surface: e.surface,
        src: i,
        t0: iv.t0,
      });
    }
  }
  // Restore input order so chaining is deterministic regardless of the broadphase sort.
  kept.sort((p, q) => p.src - q.src || p.t0 - q.t0);
  return { kept: kept.map(({ a, b, owner, surface }) => ({ a, b, owner, surface })), conflicts };
}

function minX(e: OwnedEdge): number {
  return Math.min(e.a.x, e.b.x);
}
function maxX(e: OwnedEdge): number {
  return Math.max(e.a.x, e.b.x);
}
function cross(d: { dx: number; dy: number }, v: Vec2): number {
  return d.dx * v.y - d.dy * v.x;
}
function dot(d: { dx: number; dy: number }, v: Vec2): number {
  return d.dx * v.x + d.dy * v.y;
}

/**
 * Link edges of one owner into chains. Open chains start at a vertex with no
 * incoming edge; leftovers are cycles (closed). Output order: by min x, then min y.
 */
export function linkChains(edges: readonly OwnedEdge[]): OwnedChain[] {
  const byOwner = new Map<number, OwnedEdge[]>();
  for (const e of edges) {
    const list = byOwner.get(e.owner) ?? [];
    list.push(e);
    byOwner.set(e.owner, list);
  }
  const owners = [...byOwner.keys()].sort((a, b) => a - b);
  const chains: OwnedChain[] = [];
  for (const owner of owners) {
    const list = byOwner.get(owner) as OwnedEdge[];
    const outgoing = new Map<string, OwnedEdge[]>();
    const incoming = new Map<string, number>();
    for (const e of list) {
      const k = key(e.a);
      const arr = outgoing.get(k) ?? [];
      arr.push(e);
      outgoing.set(k, arr);
      incoming.set(key(e.b), (incoming.get(key(e.b)) ?? 0) + 1);
    }
    const used = new Set<OwnedEdge>();
    const walk = (start: OwnedEdge): OwnedChain => {
      const pts: Vec2[] = [start.a, start.b];
      used.add(start);
      let cur = start;
      let closed = false;
      for (;;) {
        const nexts = (outgoing.get(key(cur.b)) ?? []).filter((n) => !used.has(n));
        const next = nexts[0];
        if (!next) break;
        if (key(next.b) === key(start.a) && nexts.length === 1) {
          used.add(next);
          closed = true;
          break;
        }
        used.add(next);
        pts.push(next.b);
        cur = next;
      }
      return { points: pts, owner, surface: start.surface, closed };
    };
    // open chains first (deterministic: iterate list in input order)
    for (const e of list) {
      if (used.has(e)) continue;
      if ((incoming.get(key(e.a)) ?? 0) === 0) chains.push(walk(e));
    }
    for (const e of list) {
      if (used.has(e)) continue;
      chains.push(walk(e));
    }
  }
  chains.sort((p, q) => {
    if (p.owner !== q.owner) return p.owner - q.owner;
    const px = Math.min(...p.points.map((v) => v.x));
    const qx = Math.min(...q.points.map((v) => v.x));
    if (Math.abs(px - qx) > EPS) return px - qx;
    const py = Math.min(...p.points.map((v) => v.y));
    const qy = Math.min(...q.points.map((v) => v.y));
    return py - qy;
  });
  return chains;
}

export function mergeSolids(edges: readonly OwnedEdge[]): MergeResult {
  const { kept, conflicts } = cancelSharedEdges(edges);
  return { chains: linkChains(kept), conflicts };
}

// ---------------------------------------------------------------------------
// Overlap tests used by the track tests
// ---------------------------------------------------------------------------

/** Proper (interior) crossing of two segments; touching at endpoints does not count. */
export function segmentsCross(a1: Vec2, a2: Vec2, b1: Vec2, b2: Vec2): boolean {
  const d1 = orient(b1, b2, a1);
  const d2 = orient(b1, b2, a2);
  const d3 = orient(a1, a2, b1);
  const d4 = orient(a1, a2, b2);
  return d1 * d2 < -EPS && d3 * d4 < -EPS;
}

function orient(p: Vec2, q: Vec2, r: Vec2): number {
  return (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
}
