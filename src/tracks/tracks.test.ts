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
import type { Collider, ColliderPolyline, CompiledTrack, TrackDef, TrackObstacle, Vec2 } from '../core/types';
import { ALL_TRACKS, CURRICULUM, LAB_FLAT_200, LAB_PHYSICS_TEST, LAB_TRACKS, compileTrack, describeTrack, getTrack, isLabTrackId, listTrackIds } from './index';
import { CHECKPOINT_RULE, FEEL, FINISH_RUNOUT, SPAWN_CLEAR_AHEAD, SPAWN_CLEAR_BEHIND, auditCheckpoints, validateFinishRunout } from './author';
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

/** Ground height at x from the profile (linear between points, clamped at the ends). */
function profileYAt(profile: readonly Vec2[], x: number): number {
  const first = profile[0] as Vec2;
  const last = profile[profile.length - 1] as Vec2;
  if (x <= first.x) return first.y;
  if (x >= last.x) return last.y;
  for (let i = 1; i < profile.length; i++) {
    const b = profile[i] as Vec2;
    if (x <= b.x) {
      const a = profile[i - 1] as Vec2;
      return a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x);
    }
  }
  return last.y;
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
    expect(listTrackIds()).toHaveLength(19);
    for (const id of listTrackIds()) expect(getTrack(id)?.id).toBe(id);
  });

  it('lists the lab tracks last (physics-v2 §15: core-game shows `lab-*` under "Lab")', () => {
    const ids = listTrackIds();
    expect(ids.slice(-2)).toEqual(['lab-physics-test', 'lab-flat-200']);
    expect(ids.filter(isLabTrackId)).toEqual(['lab-physics-test', 'lab-flat-200']);
    expect(LAB_TRACKS.map((t) => t.id)).toEqual(['lab-physics-test', 'lab-flat-200']);
    expect(CURRICULUM.some((t) => isLabTrackId(t.id))).toBe(false);
    for (const t of LAB_TRACKS) expect(t.meta?.hints).toEqual(['physics']);
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
    expect(g.obstacles.filter((o) => o.pos.x < g.finishX).map((o) => o.kind)).toEqual(['ramp', 'gap']);
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

  it('checkpoint rule (round 4): 15 m run-up before the first speed obstacle, no checkpoint within 8 m of a landing', () => {
    // gap-test is a harness fixture with recorded inputs (10 m run-up by design): the rule is a curriculum rule
    if (!CURRICULUM.some((t) => t.id === def.id)) return;
    const { rows, violations } = auditCheckpoints(def);
    expect(violations.map((v) => v.message)).toEqual([]);
    expect(rows).toHaveLength(def.checkpoints.length + 1);
    for (const r of rows) {
      expect(r.ok).toBe(true);
      if (r.runup !== null) expect(r.runup).toBeGreaterThanOrEqual(r.runupNeed as number);
      if (r.afterLanding !== null) expect(r.afterLanding).toBeGreaterThanOrEqual(CHECKPOINT_RULE.afterLanding);
    }
  });

  it('finishX lies beyond the last course obstacle with run-out, and every obstacle is after the start', () => {
    const course = def.obstacles.map((o, i) => ({ o, i })).filter(({ o }) => o.pos.x < def.finishX);
    course.forEach(({ o, i }) => {
      const [lo, hi] = obstacleExtent(def, track, i);
      expect(hi, `${o.kind} #${i} extends past finish`).toBeLessThanOrEqual(def.finishX + 1e-9);
      expect(lo).toBeGreaterThan(def.start.pos.x + FEEL.wheelbase);
    });
    const lastEnd = Math.max(0, ...course.map(({ i }) => obstacleExtent(def, track, i)[1]));
    expect(def.finishX - lastEnd).toBeGreaterThanOrEqual(3);
  });

  it('finish run-out (round 6): 30 m of flat at the finish height past finishX, closed by a ramp into a 2.5 m catch', () => {
    expect(validateFinishRunout(def)).toEqual([]);
    const y0 = profileYAt(def.profile, def.finishX);
    for (let x = def.finishX; x <= def.finishX + FINISH_RUNOUT.flat + 1e-9; x += 0.5) expect(profileYAt(def.profile, x)).toBeCloseTo(y0, 6);
    const after = def.obstacles.filter((o) => o.pos.x >= def.finishX + FINISH_RUNOUT.flat - 1e-9);
    expect(after[0]?.kind).toBe('ramp');
    expect(after[1]?.kind === 'box' || after[1]?.kind === 'wall').toBe(true);
    expect((after[1]?.params as { height: number }).height).toBeGreaterThanOrEqual(FINISH_RUNOUT.catchHeight);
    expect(def.obstacles.some((o) => o.pos.x > def.finishX && o.pos.x < def.finishX + FINISH_RUNOUT.flat - 1e-9)).toBe(false);
    // the catch stands inside the world: bounds cover it and oobY lies under the run-out
    const catchEnd = (after[1] as TrackObstacle).pos.x + ((after[1]?.params as { width?: number }).width ?? 4);
    expect(track.bounds.maxX).toBeGreaterThanOrEqual(catchEnd);
    expect(track.oobY).toBeLessThan(y0 - 5);
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
    const gaps = def.obstacles.filter((o) => o.kind === 'gap' && (o.params?.['hazard'] ?? 'water') !== 'none').length; // a lab pit is dry by design
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

/**
 * Lab tracks (physics-v2 §15, tracks.md "Lab tracks"): the geometry is pinned to the metre here as well as by
 * the golden hash, so a re-author that drifts from the spec fails with a number, not a hash.
 */
describe('lab-physics-test (physics-v2 §15)', () => {
  const def = LAB_PHYSICS_TEST;
  const track = compiled.get(def.id) as CompiledTrack;
  const poly = (i: number): ColliderPolyline => track.colliders[i] as ColliderPolyline;

  it('is the §15 geometry: 40 m run-up, 6 x 1.2 wood take-off + 0.3 m lip, 3 m dry pit on a rubber mattress at -1.5, ledge at +1.6, crest 70-90, finish 100', () => {
    expect(def.finishX).toBe(100);
    expect(def.checkpoints.map((c) => c.x)).toEqual([30, 62]);
    expect(def.meta).toMatchObject({ biome: 'industrial', technique: 'the bunny hop', hints: ['physics'], attemptsBand: [3, 8], targetTimeS: 25 });
    const course = def.obstacles.slice(0, 3).map((o) => [o.kind, o.pos.x, o.pos.y]);
    expect(course).toEqual([
      ['ramp', 40, 0],
      ['box', 46, 0],
      ['gap', 46.3, 0],
    ]);
    // run-up: one flat dirt segment from the start to the take-off foot
    expect(poly(0)).toMatchObject({ surface: 'dirt', obstacleIndex: -1, points: [{ x: -10, y: 0 }, { x: 40, y: 0 }] });
    // take-off: 11.31 deg wood ramp, then the wood lip whose back face drops to the run-up level
    expect(poly(4)).toMatchObject({ surface: 'wood', obstacleIndex: 0, points: [{ x: 40, y: 0 }, { x: 46, y: 1.2 }] });
    expect(Math.atan2(1.2, 6) * (180 / Math.PI)).toBeCloseTo(11.31, 2);
    expect(poly(5)).toMatchObject({ surface: 'wood', obstacleIndex: 1, points: [{ x: 46, y: 1.2 }, { x: 46.3, y: 1.2 }, { x: 46.3, y: 0 }] });
    // pit: near wall continues the lip face down to -1.5; rubber mattress owned by the gap; far wall -1.5 -> +1.6
    expect(poly(1)).toMatchObject({ surface: 'dirt', obstacleIndex: -1, points: [{ x: 46.3, y: 0 }, { x: 46.35, y: -1.5 }] });
    expect(poly(6)).toMatchObject({ surface: 'rubber', obstacleIndex: 2, points: [{ x: 46.35, y: -1.5 }, { x: 49.25, y: -1.5 }] });
    expect(poly(2).points.slice(0, 3)).toEqual([
      { x: 49.25, y: -1.5 },
      { x: 49.3, y: 1.6 },
      { x: 70, y: 1.6 },
    ]);
    expect(track.placed[2]?.colliderIds).toEqual([6]);
    expect(track.hazards).toEqual([]);
    // run-out: flat at +1.6 with the 20 x 0.6 cosine crest at 70-90 (peak 2.2 at 80) and flat to the catch
    const runout = poly(2).points;
    const peak = runout.reduce((a, b) => (b.y > a.y ? b : a));
    expect(peak).toEqual({ x: 80, y: 2.2 });
    expect(runout.filter((p) => p.x > 70 && p.x < 90).every((p) => p.y > 1.6)).toBe(true);
    expect(runout[runout.length - 1]).toEqual({ x: 130, y: 1.6 });
    expect(profileYAt(def.profile, 100)).toBeCloseTo(1.6, 9);
    expect(track.bounds.minY).toBe(-1.5);
    expect(track.oobY).toBe(-7.5);
  });

  it('opts out of the checkpoint rule exactly where §15 fixes the checkpoints: 30 (9.5 m to the take-off) and 62 (6.7 m after the pit landing zone)', () => {
    const { violations } = auditCheckpoints(def);
    expect(violations.map((v) => [v.spawn, v.kind, v.obstacleX])).toEqual([
      ['cp0', 'runup', 46.3],
      ['cp1', 'after-landing', 46.3],
    ]);
    expect(40 - (def.checkpoints[0] as TrackDef['checkpoints'][number]).spawn.pos.x).toBeCloseTo(9.5, 9);
    expect(violations[1]?.have).toBeCloseTo(6.7, 9);
    expect(validateFinishRunout(def)).toEqual([]);
  });
});

describe('lab-flat-200', () => {
  const def = LAB_FLAT_200;
  const track = compiled.get(def.id) as CompiledTrack;
  it('is 200 m of flat dirt with checkpoints every 50 m, nothing on it before the finish', () => {
    expect(def.finishX).toBe(200);
    expect(def.checkpoints.map((c) => c.x)).toEqual([50, 100, 150]);
    expect(def.obstacles.filter((o) => o.pos.x < def.finishX)).toEqual([]);
    expect(track.colliders[0]).toMatchObject({ surface: 'dirt', obstacleIndex: -1, points: [{ x: -10, y: 0 }, { x: 230, y: 0 }] });
    expect(track.hazards).toEqual([]);
    expect(auditCheckpoints(def).violations).toEqual([]);
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
