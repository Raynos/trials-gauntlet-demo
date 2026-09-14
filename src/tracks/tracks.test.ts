/**
 * Track suite: every registered track compiles deterministically, obeys the
 * CONTRACT invariants (spawns on flat ground, strictly increasing checkpoints,
 * finish beyond the last obstacle, no overlapping colliders, sane bounds), the
 * whole vocabulary is exercised, and the collider hash matches golden.json.
 *
 * Regenerate goldens deliberately with:  UPDATE_GOLDEN=1 pnpm test src/tracks
 * The suite also prints an obstacle-by-obstacle summary per track (read it with
 * `pnpm vitest run src/tracks/tracks.test.ts --reporter=verbose`).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Collider, ColliderPolyline, CompiledTrack, TrackDef, Vec2 } from '../core/types';
import { ALL_TRACKS, CURRICULUM, compileTrack, describeTrack, getTrack, listTrackIds } from './index';
import { FEEL, SPAWN_CLEAR_AHEAD, SPAWN_CLEAR_BEHIND } from './author';
import { cancelSharedEdges, segmentsCross, type OwnedEdge } from './geometry';
import { OBSTACLE_KINDS, footprint, type ObstacleKind } from './kinds';

const GOLDEN_PATH = fileURLToPath(new URL('./golden.json', import.meta.url));
type Golden = Record<string, { hash: string; colliders: number; hazards: number; obstacles: number; finishX: number }>;

const compiled = new Map<string, CompiledTrack>();
for (const t of ALL_TRACKS) compiled.set(t.id, compileTrack(t));

function polylineEdges(c: ColliderPolyline): OwnedEdge[] {
  const out: OwnedEdge[] = [];
  for (let i = 0; i + 1 < c.points.length; i++) {
    out.push({ a: c.points[i] as Vec2, b: c.points[i + 1] as Vec2, owner: c.id, surface: c.surface });
  }
  return out;
}

function obstacleExtent(def: TrackDef, track: CompiledTrack, i: number): [number, number] {
  const o = def.obstacles[i] as TrackDef['obstacles'][number];
  let lo = o.pos.x;
  let hi = o.pos.x + footprint(o.kind as ObstacleKind, o.params);
  for (const c of track.colliders) {
    if (c.obstacleIndex !== i) continue;
    if (c.kind === 'polyline') {
      for (const p of c.points) {
        lo = Math.min(lo, p.x);
        hi = Math.max(hi, p.x);
      }
    } else if (c.kind === 'circle') {
      lo = Math.min(lo, c.center.x - c.radius);
      hi = Math.max(hi, c.center.x + c.radius);
    } else if (c.kind === 'box') {
      lo = Math.min(lo, c.center.x - c.halfW);
      hi = Math.max(hi, c.center.x + c.halfW);
    } else {
      lo = Math.min(lo, c.pivot.x - c.halfLength);
      hi = Math.max(hi, c.pivot.x + c.halfLength);
    }
  }
  return [lo, hi];
}

describe('registry', () => {
  it('registers the fixtures and the 15-track curriculum with stable ids', () => {
    expect(CURRICULUM.map((t) => t.id)).toEqual([
      'b1-first-ride',
      'b2-lean-back',
      'b3-kicker-row',
      'e1-uphill-weight',
      'e2-rear-wheel-first',
      'e3-stairway',
      'm1-hop-up',
      'm2-drum-roll',
      'm3-see-saw',
      'h1-wheelie-wire',
      'h2-gap-chain',
      'h3-fire-line',
      'x1-vertical-limit',
      'x2-pipe-dream',
      'x3-gauntlet',
    ]);
    expect(listTrackIds()).toContain('flat-test');
    expect(listTrackIds()).toContain('gap-test');
    expect(listTrackIds()).toHaveLength(17);
    for (const id of listTrackIds()) expect(getTrack(id)?.id).toBe(id);
  });

  it('tiers escalate: attempts bands and target times are non-decreasing through the curriculum', () => {
    let lastHi = 0;
    let lastT = 0;
    for (const t of CURRICULUM) {
      const band = t.meta?.attemptsBand as [number, number];
      expect(band[0]).toBeLessThanOrEqual(band[1]);
      expect(band[1]).toBeGreaterThanOrEqual(lastHi);
      expect(t.meta?.targetTimeS as number).toBeGreaterThanOrEqual(lastT);
      lastHi = band[1];
      lastT = t.meta?.targetTimeS as number;
    }
  });

  it('every kind in the vocabulary is exercised by at least one curriculum track', () => {
    const used = new Set(CURRICULUM.flatMap((t) => t.obstacles.map((o) => o.kind)));
    for (const k of OBSTACLE_KINDS) expect(used, `kind ${k} unused`).toContain(k);
    expect(used.has('loop')).toBe(false);
  });

  it('gap-test has exactly one ramp and one gap', () => {
    const g = getTrack('gap-test') as TrackDef;
    expect(g.obstacles.map((o) => o.kind)).toEqual(['ramp', 'gap']);
  });
});

describe.each(ALL_TRACKS.map((t) => [t.id, t] as const))('%s', (id, def) => {
  const track = compiled.get(id) as CompiledTrack;

  it('compiles deterministically', () => {
    const again = compileTrack(def);
    expect(again.hash).toBe(track.hash);
    expect(JSON.stringify(again.colliders)).toBe(JSON.stringify(track.colliders));
    expect(JSON.stringify(again.hazards)).toBe(JSON.stringify(track.hazards));
    expect(track.hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('has sequential stable collider ids and every id owned by placed or ground', () => {
    track.colliders.forEach((c, i) => expect(c.id).toBe(i));
    const owned = new Set(track.placed.flatMap((p) => p.colliderIds));
    for (const c of track.colliders) {
      if (c.obstacleIndex >= 0) expect(owned.has(c.id)).toBe(true);
      else expect(c.kind).toBe('polyline');
    }
    expect(track.placed).toHaveLength(def.obstacles.length);
    track.hazards.forEach((h, i) => {
      expect(h.id).toBe(i);
      expect(h.max.x).toBeGreaterThan(h.min.x);
      expect(h.max.y).toBeGreaterThan(h.min.y);
    });
  });

  it('checkpoints strictly increase between start and finish', () => {
    let last = def.start.pos.x;
    for (const c of def.checkpoints) {
      expect(c.x).toBeGreaterThan(last);
      last = c.x;
    }
    expect(def.finishX).toBeGreaterThan(last);
  });

  it('spawns sit on a single flat ground segment under both wheels (CONTRACT 2.4)', () => {
    const spawns = [def.start, ...def.checkpoints.map((c) => c.spawn)];
    const ground = track.colliders.filter((c): c is ColliderPolyline => c.kind === 'polyline' && c.obstacleIndex === -1);
    for (const s of spawns) {
      expect(s.angle).toBe(0);
      const x0 = s.pos.x - SPAWN_CLEAR_BEHIND;
      const x1 = s.pos.x + FEEL.wheelbase + SPAWN_CLEAR_AHEAD;
      const seg = ground.flatMap(polylineEdges).find((e) => e.a.x <= x0 + 1e-9 && e.b.x >= x1 - 1e-9 && Math.abs(e.a.y - e.b.y) < 1e-9);
      expect(seg, `spawn at x=${s.pos.x} not on one flat ground segment`).toBeDefined();
      expect(Math.abs((seg as OwnedEdge).a.y - s.pos.y)).toBeLessThan(1e-9);
    }
  });

  it('finishX lies beyond the last obstacle with run-out, and every obstacle is after the start', () => {
    def.obstacles.forEach((o, i) => {
      const [lo, hi] = obstacleExtent(def, track, i);
      expect(hi, `${o.kind} #${i} extends past finish`).toBeLessThanOrEqual(def.finishX + 1e-9);
      expect(lo).toBeGreaterThan(def.start.pos.x + FEEL.wheelbase);
    });
    const lastEnd = Math.max(0, ...def.obstacles.map((_, i) => obstacleExtent(def, track, i)[1]));
    expect(def.finishX - lastEnd).toBeGreaterThanOrEqual(3);
  });

  it('has no overlapping colliders', () => {
    // 1. No two polyline segments share a collinear stretch or properly cross.
    const polys = track.colliders.filter((c): c is ColliderPolyline => c.kind === 'polyline');
    const edges = polys.flatMap(polylineEdges);
    const total = edges.reduce((s, e) => s + Math.hypot(e.b.x - e.a.x, e.b.y - e.a.y), 0);
    const { kept, conflicts } = cancelSharedEdges(edges);
    const keptLen = kept.reduce((s, e) => s + Math.hypot(e.b.x - e.a.x, e.b.y - e.a.y), 0);
    expect(conflicts, 'same-direction collinear overlap').toEqual([]);
    expect(Math.abs(keptLen - total), 'opposite-direction collinear overlap (double-registered face)').toBeLessThan(1e-6);
    for (let i = 0; i < edges.length; i++) {
      for (let j = i + 1; j < edges.length; j++) {
        const a = edges[i] as OwnedEdge;
        const b = edges[j] as OwnedEdge;
        if (a.owner === b.owner) continue;
        if (Math.max(a.a.x, a.b.x) < Math.min(b.a.x, b.b.x) || Math.min(a.a.x, a.b.x) > Math.max(b.a.x, b.b.x)) continue;
        expect(segmentsCross(a.a, a.b, b.a, b.b), `colliders ${a.owner} and ${b.owner} cross`).toBe(false);
      }
    }
    // 2. Circles / boxes of different obstacles do not interpenetrate.
    const loose = track.colliders.filter((c) => c.kind === 'circle' || c.kind === 'box');
    for (let i = 0; i < loose.length; i++) {
      for (let j = i + 1; j < loose.length; j++) {
        const a = loose[i] as Collider;
        const b = loose[j] as Collider;
        if (a.obstacleIndex === b.obstacleIndex) continue;
        expect(looseOverlap(a, b), `colliders ${a.id} and ${b.id} overlap`).toBe(false);
      }
    }
  });

  it('bounds are sane and oobY is 6 m under the lowest surface', () => {
    expect(track.bounds.minX).toBeLessThanOrEqual(def.start.pos.x);
    expect(track.bounds.maxX).toBeGreaterThanOrEqual(def.finishX);
    expect(track.bounds.maxY - track.bounds.minY).toBeLessThan(30);
    expect(track.bounds.maxX - track.bounds.minX).toBeLessThan(800);
    expect(track.oobY).toBeCloseTo(track.bounds.minY - 6, 6);
    for (const c of track.colliders) {
      if (c.kind === 'polyline') for (const p of c.points) expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
    }
  });

  it('ground profile is strictly increasing in x and every gap has a hazard', () => {
    for (let i = 1; i < def.profile.length; i++) expect((def.profile[i] as Vec2).x).toBeGreaterThan((def.profile[i - 1] as Vec2).x);
    const gaps = def.obstacles.filter((o) => o.kind === 'gap').length;
    const pits = track.hazards.filter((h) => h.kind === 'water' || h.kind === 'kill').length;
    expect(pits).toBe(gaps);
    const barrels = def.obstacles.filter((o) => o.kind === 'barrel').reduce((n, o) => n + ((o.params?.burning ?? true) ? Number(o.params?.count ?? 1) : 0), 0);
    expect(track.hazards.filter((h) => h.kind === 'fire')).toHaveLength(barrels);
  });

  it('prints the course summary', () => {
    const text = describeTrack(track);
    expect(text).toContain(def.id);
    console.log(text);
  });
});

function looseOverlap(a: Collider, b: Collider): boolean {
  const eps = 1e-6;
  if (a.kind === 'circle' && b.kind === 'circle') {
    return Math.hypot(a.center.x - b.center.x, a.center.y - b.center.y) < a.radius + b.radius - eps;
  }
  const box = a.kind === 'box' ? a : b.kind === 'box' ? b : null;
  const other = box === a ? b : a;
  if (!box || box.kind !== 'box') return false;
  if (other.kind === 'circle') {
    const dx = Math.max(Math.abs(other.center.x - box.center.x) - box.halfW, 0);
    const dy = Math.max(Math.abs(other.center.y - box.center.y) - box.halfH, 0);
    return Math.hypot(dx, dy) < other.radius - eps;
  }
  if (other.kind === 'box') {
    return Math.abs(other.center.x - box.center.x) < other.halfW + box.halfW - eps && Math.abs(other.center.y - box.center.y) < other.halfH + box.halfH - eps;
  }
  return false;
}

describe('golden collider hashes', () => {
  it('match golden.json for every registered track', () => {
    const actual: Golden = {};
    for (const t of ALL_TRACKS) {
      const c = compiled.get(t.id) as CompiledTrack;
      actual[t.id] = { hash: c.hash, colliders: c.colliders.length, hazards: c.hazards.length, obstacles: t.obstacles.length, finishX: t.finishX };
    }
    if (process.env['UPDATE_GOLDEN']) {
      writeFileSync(GOLDEN_PATH, `${JSON.stringify(actual, null, 2)}\n`);
    }
    const golden = JSON.parse(readFileSync(GOLDEN_PATH, 'utf8')) as Golden;
    for (const t of ALL_TRACKS) {
      expect(golden[t.id], `${t.id} missing from golden.json (UPDATE_GOLDEN=1 to add)`).toBeDefined();
      expect(actual[t.id], t.id).toEqual(golden[t.id]);
    }
    expect(Object.keys(golden).sort()).toEqual(Object.keys(actual).sort());
  });
});
