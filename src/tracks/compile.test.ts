import { describe, expect, it } from 'vitest';
import type { ColliderPolyline, ColliderSeesaw, TrackDef, Vec2 } from '../core/types';
import { auditCheckpoints, course, FEEL, setPiecesOf, validateFinishRunout } from './author';
import { compileTrack, hashColliders, profileQuery } from './compile';
import { describeAhead, describeTrack } from './describe';
import { DECOR_KINDS, KIND_DEFAULTS, OBSTACLE_KINDS, footprint, isDecorKind, isObstacleKind, isTrackKind, resolveParams } from './kinds';

const meta = { biome: 'industrial', technique: 't' } as const;

function polys(def: TrackDef): ColliderPolyline[] {
  return compileTrack(def).colliders.filter((c): c is ColliderPolyline => c.kind === 'polyline');
}

describe('kinds', () => {
  it('has defaults for all 12 kinds and no loop', () => {
    expect(OBSTACLE_KINDS).toHaveLength(12);
    for (const k of OBSTACLE_KINDS) expect(KIND_DEFAULTS[k]).toBeDefined();
    expect((OBSTACLE_KINDS as readonly string[]).includes('loop')).toBe(false);
  });

  it('fills defaults and keeps overrides', () => {
    const p = resolveParams('ramp', { height: 2 });
    expect(p).toEqual({ length: 4, height: 2, curve: 0, direction: 'up', surface: 'wood', variant: 0 });
    expect(footprint('plank', { length: 4, angleDeg: 60 })).toBeCloseTo(2, 6);
    expect(footprint('pole', { count: 3, spacing: 2 })).toBeCloseTo(4.5, 6);
  });
});

describe('compileTrack merge', () => {
  it('ramp -> box -> ramp share no faces: only the exposed outline survives', () => {
    const def = course('t-tabletop', 't', 'beginner').meta(meta).flat(10).tabletop(4, 6, 1.2, 4).flat(10).finish(10, { checkpointRule: false, catch: false });
    const ps = polys(def);
    const ramp = ps.find((p) => p.obstacleIndex === 0) as ColliderPolyline;
    const box = ps.find((p) => p.obstacleIndex === 1) as ColliderPolyline;
    const down = ps.find((p) => p.obstacleIndex === 2) as ColliderPolyline;
    expect(ramp.points).toEqual([
      { x: 10, y: 0 },
      { x: 14, y: 1.2 },
    ]);
    expect(box.points).toEqual([
      { x: 14, y: 1.2 },
      { x: 20, y: 1.2 },
    ]);
    expect(down.points).toEqual([
      { x: 20, y: 1.2 },
      { x: 24, y: 0 },
    ]);
    // ground is split around the solids
    const ground = ps.filter((p) => p.obstacleIndex === -1);
    expect(ground).toHaveLength(2);
    expect(ground[0]?.points[ground[0].points.length - 1]).toEqual({ x: 10, y: 0 });
    expect(ground[1]?.points[0]).toEqual({ x: 24, y: 0 });
  });

  it('a lower box after a taller ramp leaves exactly the step between them', () => {
    const def = course('t-step', 't', 'beginner').meta(meta).flat(10).ramp({ length: 4, height: 1.2 }).box({ width: 4, height: 1.0 }).flat(10).finish(10, { checkpointRule: false, catch: false });
    const ramp = polys(def).find((p) => p.obstacleIndex === 0) as ColliderPolyline;
    expect(ramp.points).toEqual([
      { x: 10, y: 0 },
      { x: 14, y: 1.2 },
      { x: 14, y: 1.0 },
    ]);
  });

  it('a box on a slope follows the ground exactly', () => {
    const def = course('t-slope', 't', 'beginner').meta(meta).flat(10).slope(10, 1).flat(4).box({ width: 4, height: 1 }).flat(10).finish(10, { checkpointRule: false, catch: false });
    const ps = polys(def);
    const box = ps.find((p) => p.obstacleIndex === 0) as ColliderPolyline;
    expect(box.points).toEqual([
      { x: 24, y: 1 },
      { x: 24, y: 2 },
      { x: 28, y: 2 },
      { x: 28, y: 1 },
    ]);
    const ground = ps.filter((p) => p.obstacleIndex === -1);
    expect(ground).toHaveLength(2);
  });

  it('stacked ramp (base) launches from the platform top and its near face cancels', () => {
    const def = course('t-base', 't', 'beginner').meta(meta).flat(10).box({ width: 6, height: 0.6 }).ramp({ length: 3, height: 1 }, { base: 0.6 }).flat(10).finish(10, { checkpointRule: false, catch: false });
    const ramp = polys(def).find((p) => p.obstacleIndex === 1) as ColliderPolyline;
    expect(ramp.points).toEqual([
      { x: 16, y: 0.6 },
      { x: 19, y: 1.6 },
      { x: 19, y: 0 },
    ]);
  });

  it('gap punches a pit into the ground and fills it with a hazard', () => {
    const def = course('t-gap', 't', 'beginner').meta(meta).flat(10).gap({ width: 3, depth: 2 }).flat(10).finish(10, { checkpointRule: false, catch: false });
    const c = compileTrack(def);
    const ground = c.colliders[0] as ColliderPolyline;
    expect(ground.points.slice(1, 5)).toEqual([
      { x: 10, y: 0 },
      { x: 10.05, y: -2 },
      { x: 12.95, y: -2 },
      { x: 13, y: 0 },
    ]);
    expect(c.hazards).toEqual([{ id: 0, kind: 'water', min: { x: 10, y: -2 }, max: { x: 13, y: -0.6 } }]);
    expect(c.oobY).toBe(-8);
  });

  it('plank is a one-way top surface; wall lip is a one-way overhang', () => {
    const def = course('t-plank', 't', 'beginner').meta(meta).flat(10).plank({ angleDeg: 30, rise: 2 }).box({ width: 4, height: 2 }).flat(4).wall({ height: 1, width: 2, lip: 0.2 }).flat(10).finish(10, { checkpointRule: false, catch: false });
    const ps = polys(def);
    const plank = ps.find((p) => p.obstacleIndex === 0) as ColliderPolyline;
    expect(plank.oneWay).toBe(true);
    expect(plank.points[1]?.y).toBeCloseTo(2, 6);
    const lip = ps.filter((p) => p.obstacleIndex === 2).find((p) => p.oneWay) as ColliderPolyline;
    const wallX = def.obstacles[2]?.pos.x as number;
    expect(lip.points[0]?.x).toBeCloseTo(wallX - 0.2, 6);
    expect(lip.points[1]).toEqual({ x: wallX, y: 1 });
    expect(lip.points[0]?.y).toBe(1);
  });

  it('steepPlank puts a concave fillet under the plank foot and the plank starts on its top', () => {
    const def = course('t-fillet', 't', 'beginner').meta(meta).flat(10).steepPlank({ angleDeg: 60, rise: 4.5 }).box({ width: 3, height: 4.5 }).flat(10).finish(10, { checkpointRule: false, catch: false });
    const ps = polys(def);
    const fillet = ps.find((p) => p.obstacleIndex === 0) as ColliderPolyline;
    const plank = ps.find((p) => p.obstacleIndex === 1) as ColliderPolyline;
    expect(def.obstacles[0]).toMatchObject({ kind: 'ramp', params: { length: 1.2, height: 0.35, curve: 0.8 } });
    expect(fillet.points.length).toBeGreaterThan(4); // curved
    const filletTop = fillet.points.reduce((a, b) => (b.y > a.y ? b : a));
    expect(plank.points[0]).toEqual(filletTop);
    expect(plank.points[1]?.y).toBeCloseTo(4.5, 6);
    // concave: the fillet surface stays below its chord
    const a = fillet.points[0] as Vec2;
    for (const p of fillet.points.slice(1, -1)) expect(p.y).toBeLessThanOrEqual(a.y + ((p.x - a.x) / 1.2) * 0.35 + 1e-9);
  });

  it('every kind resolves variant=0 and drums carry a visual width', () => {
    for (const k of OBSTACLE_KINDS) expect(resolveParams(k, undefined)).toMatchObject({ variant: 0 });
    expect(resolveParams('drum', undefined).width).toBe(1.2);
    const def = course('t-variant', 't', 'beginner').meta(meta).flat(10).box({ width: 4, height: 1, variant: 2 }).flat(10).finish(10, { checkpointRule: false, catch: false });
    const c = compileTrack(def);
    expect(c.placed[0]?.params).toMatchObject({ variant: 2, width: 4, height: 1, surface: 'metal' });
  });

  it('lab pit (physics-v2 §15): hazard none is dry, floor rubber is the gap\'s own polyline, rise lifts the far lip', () => {
    const def = course('t-lab-pit', 't', 'beginner').meta(meta).flat(10).gap({ width: 3, depth: 1.5, rise: 1.6, hazard: 'none', floor: 'rubber' }).flat(10).finish(10, { checkpointRule: false, catch: false });
    expect(def.profile).toEqual([
      { x: -10, y: 0 },
      { x: 10, y: 0 },
      { x: 13, y: 1.6 },
      { x: 53, y: 1.6 },
      { x: 58.712592, y: 5.6 },
    ]);
    const c = compileTrack(def);
    expect(c.hazards).toEqual([]);
    expect(c.colliders.map((k) => [k.obstacleIndex, k.surface])).toEqual([
      [-1, 'dirt'],
      [-1, 'dirt'],
      [0, 'rubber'],
    ]);
    expect((c.colliders[0] as ColliderPolyline).points).toEqual([
      { x: -10, y: 0 },
      { x: 10, y: 0 },
      { x: 10.05, y: -1.5 },
    ]);
    expect((c.colliders[2] as ColliderPolyline).points).toEqual([
      { x: 10.05, y: -1.5 },
      { x: 12.95, y: -1.5 },
    ]);
    expect((c.colliders[1] as ColliderPolyline).points.slice(0, 3)).toEqual([
      { x: 12.95, y: -1.5 },
      { x: 13, y: 1.6 },
      { x: 53, y: 1.6 },
    ]);
    expect(c.placed[0]?.colliderIds).toEqual([2]);
    expect(c.oobY).toBe(-7.5);
    // the profile must rise exactly `rise` across the pit
    const bad = { ...def, obstacles: def.obstacles.map((o) => ({ ...o, params: { ...o.params, rise: 1.0 } })) };
    expect(() => compileTrack(bad)).toThrow(/rises 1.600 m across the gap, params.rise is 1/);
    // a dirt floor with a hazard is unchanged: one ground chain, one hazard (every curriculum golden stands)
    const plain = compileTrack(course('t-gap2', 't', 'beginner').meta(meta).flat(10).gap({ width: 3, depth: 2 }).flat(10).finish(10, { checkpointRule: false, catch: false }));
    expect(plain.colliders).toHaveLength(1);
    expect(plain.hazards).toHaveLength(1);
  });

  it('burning barrels carry a fire hazard; unlit ones do not', () => {
    const def = course('t-barrel', 't', 'beginner').meta(meta).flat(10).barrel({ count: 2, spacing: 0.8 }).flat(2).barrel({ burning: false }).flat(10).finish(10, { checkpointRule: false, catch: false });
    const c = compileTrack(def);
    expect(c.hazards.map((h) => h.kind)).toEqual(['fire', 'fire']);
    expect(c.hazards[0]).toMatchObject({ min: { x: 10, y: 0.9 }, max: { x: 10.6, y: 1.5 } });
    expect(c.colliders.filter((k) => k.kind === 'box')).toHaveLength(3);
  });

  it('seesaw max angle lets an end touch the ground, capped at 30 deg', () => {
    const def = course('t-seesaw', 't', 'beginner').meta(meta).flat(10).seesaw({ length: 6, height: 1 }).flat(2).seesaw({ length: 6, height: 2.5, angleDeg: 40 }).flat(10).finish(10, { checkpointRule: false, catch: false });
    const ss = compileTrack(def).colliders.filter((c): c is ColliderSeesaw => c.kind === 'seesaw');
    expect(ss[0]?.pivot).toEqual({ x: 13, y: 1 });
    expect(ss[0]?.maxAngle).toBeCloseTo(Math.asin((1 - 0.06) / 3), 5);
    expect(ss[1]?.maxAngle).toBeCloseTo((40 * Math.PI) / 180, 5);
    // the auto angle is capped at 30 deg, so the DSL refuses a resting end that hangs in the air
    expect(() => course('t-s2', 't', 'beginner').meta(meta).flat(10).seesaw({ length: 6, height: 2.5 })).toThrow(/resting end/);
  });

  it('drum rolls flag and logpile pyramid count', () => {
    const def = course('t-drum', 't', 'beginner').meta(meta).flat(10).drum({ radius: 1, rolls: true }).flat(2).logpile({ count: 3, rows: 3 }).flat(10).finish(10, { checkpointRule: false, catch: false });
    const c = compileTrack(def);
    const circles = c.colliders.filter((k) => k.kind === 'circle');
    expect(circles).toHaveLength(1 + 6);
    expect(circles[0]).toMatchObject({ center: { x: 11, y: 1 }, rolls: true });
    expect(circles.slice(1).some((k) => k.kind === 'circle' && k.rolls)).toBe(false);
  });

  it('is pure: same def, same hash; different def, different hash', () => {
    const a = course('t-a', 't', 'beginner').meta(meta).flat(10).box({ width: 4, height: 1 }).flat(10).finish(10, { checkpointRule: false, catch: false });
    const b = course('t-a', 't', 'beginner').meta(meta).flat(10).box({ width: 4, height: 1.01 }).flat(10).finish(10, { checkpointRule: false, catch: false });
    expect(compileTrack(a).hash).toBe(compileTrack(a).hash);
    expect(compileTrack(a).hash).not.toBe(compileTrack(b).hash);
    expect(hashColliders([])).toMatch(/^[0-9a-f]{16}$/);
  });

  it('profileQuery interpolates and chains', () => {
    const q = profileQuery([
      { x: 0, y: 0 },
      { x: 10, y: 2 },
      { x: 20, y: 2 },
    ]);
    expect(q.y(5)).toBe(1);
    expect(q.y(-5)).toBe(0);
    expect(q.y(25)).toBe(2);
    expect(q.chain(5, 15)).toEqual([
      { x: 5, y: 1 },
      { x: 10, y: 2 },
      { x: 15, y: 2 },
    ]);
  });
});

describe('authoring errors', () => {
  it('rejects overlapping solids', () => {
    expect(() =>
      compileTrack({
        ...course('t-x', 't', 'beginner').meta(meta).flat(10).box({ width: 4, height: 1 }).flat(10).finish(10, { checkpointRule: false, catch: false }),
        obstacles: [
          { kind: 'box', pos: { x: 10, y: 0 }, params: { width: 4, height: 1 } },
          { kind: 'box', pos: { x: 12, y: 0 }, params: { width: 4, height: 1 } },
        ],
      }),
    ).toThrow(/solid overlap/);
  });

  it('rejects a gap on sloped ground', () => {
    const base = course('t-x', 't', 'beginner').meta(meta).flat(10).slope(10, 1).flat(10).finish(10, { checkpointRule: false, catch: false });
    expect(() => compileTrack({ ...base, obstacles: [{ kind: 'gap', pos: { x: 12, y: 0.2 }, params: { width: 3 } }] })).toThrow(/not level/);
    // overlapping pits are refused too
    expect(() =>
      compileTrack({ ...base, obstacles: [{ kind: 'gap', pos: { x: 5, y: 0 }, params: { width: 3 } }, { kind: 'gap', pos: { x: 6, y: 0 }, params: { width: 3 } }] }),
    ).toThrow(/gaps overlap/);
  });

  it('rejects a spawn that is not on one flat segment', () => {
    expect(() => course('t-x', 't', 'beginner').meta(meta).flat(10).checkpoint().slope(10, 1).flat(10).finish(10, { checkpointRule: false, catch: false })).toThrow(/single flat/);
    expect(() => course('t-x', 't', 'beginner').meta(meta).flat(10).checkpoint().box({ width: 4, height: 1 }).flat(10).finish(10, { checkpointRule: false, catch: false })).toThrow(/sits on obstacle/);
  });

  it('rejects unknown kinds and a non-monotone profile', () => {
    const base = course('t-x', 't', 'beginner').meta(meta).flat(10).finish(10, { checkpointRule: false, catch: false });
    expect(() => compileTrack({ ...base, obstacles: [{ kind: 'loop', pos: { x: 5, y: 0 } }] })).toThrow(/unknown kind/);
    expect(() => compileTrack({ ...base, profile: [{ x: 0, y: 0 }, { x: 0, y: 1 }] })).toThrow(/strictly increasing/);
  });

  it('requires meta and rejects ground slopes steeper than 40 deg', () => {
    expect(() => course('t-x', 't', 'beginner').flat(10).finish(10, { checkpointRule: false, catch: false })).toThrow(/meta/);
    expect(() => course('t-x', 't', 'beginner').meta(meta).slope(1, 2)).toThrow(/too steep/);
  });
});

describe('feel helpers', () => {
  it('match the CONTRACT envelope with 20 % margin', () => {
    expect(FEEL.speedAfter(FEEL.runupFor(10))).toBeCloseTo(10, 6);
    expect(FEEL.speedAfter(1000)).toBeCloseTo(16, 6); // top speed 20 x 0.8
    expect(FEEL.brakeDistance(10)).toBeCloseTo(100 / 21.4 / 0.8, 6); // 5.84 m: measured 4.66 m plus margin
    expect(FEEL.hopLedge(false)).toBeCloseTo(0.592, 6);
    expect(FEEL.hopLedge(true)).toBeCloseTo(0.72, 6);
    expect(FEEL.climbDeg()).toBe(48);
    expect(FEEL.jumpRange(10, 0, 0)).toBe(0);
    expect(FEEL.jumpRange(10, 45, 0)).toBeCloseTo(100 / 9.81, 3);
  });
});

describe('describeAhead', () => {
  it('lists what is coming in range', () => {
    const def = course('t-d', 't', 'beginner').meta(meta).flat(10).ramp({ length: 4, height: 1 }).gap(3).checkpoint().flat(10).finish(10, { checkpointRule: false, catch: false });
    const c = compileTrack(def);
    expect(describeAhead(c, 5, 20)).toBe('ramp 4x1 in 5.0 m, gap 3x3 in 9.0 m, checkpoint in 12.0 m');
    expect(describeAhead(c, 100, 5)).toBe('flat for 5 m');
  });
});

describe('decor kinds and set pieces (mega build wave 1)', () => {
  // the same course with and without dressing: colliders, bounds and hash must be identical
  const plain = (): TrackDef =>
    course('t-plain', 't', 'hard').meta(meta).flat(20).checkpoint().flat(16).tabletop(4, 6, 1.2).flat(20).finish(30, { checkpointRule: false });
  const dressed = (): TrackDef =>
    course('t-dressed', 't', 'hard')
      .meta(meta)
      .arch({ style: 'start', span: 8, height: 6 })
      .setPiece('start', 'grid')
      .flat(20)
      .endSetPiece()
      .checkpoint()
      .arch({ style: 'checkpoint' })
      .flat(16)
      .setPiece('air', 'the tabletop')
      .tunnel({ length: 14, height: 5, style: 'scaffold' })
      .tabletop(4, 6, 1.2)
      .setPiece('crowd')
      .flat(20)
      .arch({ style: 'finish' })
      .finish(30, { checkpointRule: false });

  it('vocabulary: decor kinds are track kinds but not obstacle kinds, footprint 0, defaults filled', () => {
    expect(DECOR_KINDS).toEqual(['arch', 'tunnel']);
    expect(isTrackKind('arch') && isTrackKind('tunnel') && isTrackKind('ramp')).toBe(true);
    expect(isObstacleKind('arch') || isDecorKind('ramp')).toBe(false);
    expect(footprint('arch', { span: 12 })).toBe(0);
    expect(footprint('tunnel', { length: 30 })).toBe(0);
    expect(resolveParams('arch', undefined)).toEqual({ span: 6, height: 5, depth: 6, style: 'girder', surface: 'metal', variant: 0 });
    expect(resolveParams('tunnel', { style: 'pipe' })).toMatchObject({ length: 20, height: 5, style: 'pipe', lit: true, variant: 0 });
  });

  it('compile: decor gets a placed entry with no colliders and leaves colliders, bounds and hash untouched', () => {
    const a = compileTrack(plain());
    const b = compileTrack(dressed());
    expect(b.hash).toBe(a.hash);
    expect(b.colliders).toEqual(a.colliders);
    expect(b.bounds).toEqual(a.bounds);
    expect(b.hazards).toEqual(a.hazards);
    const decor = b.placed.filter((p) => isDecorKind(p.kind));
    expect(decor.map((p) => p.kind)).toEqual(['arch', 'arch', 'tunnel', 'arch']);
    for (const d of decor) expect(d.colliderIds).toEqual([]);
    // decor is appended after every rideable obstacle, so obstacleIndex of the real colliders never moves
    const firstDecor = b.placed.findIndex((p) => isDecorKind(p.kind));
    expect(b.placed.slice(0, firstDecor).every((p) => !isDecorKind(p.kind))).toBe(true);
    expect(b.placed.slice(0, firstDecor).map((p) => p.kind)).toEqual(a.placed.map((p) => p.kind));
  });

  it('DSL: arch is centred on the cursor, tunnel starts at it, neither moves the cursor', () => {
    const b = compileTrack(dressed());
    const [startArch, cpArch, tunnel, finishArch] = b.placed.filter((p) => isDecorKind(p.kind));
    expect(startArch?.pos).toEqual({ x: -4, y: 0 }); // span 8 centred on x=0
    expect(cpArch?.pos).toEqual({ x: 20 - 3, y: 0 }); // default span 6 centred on the checkpoint at 20
    expect(tunnel?.pos).toEqual({ x: 36, y: 0 });
    expect(tunnel?.params).toMatchObject({ length: 14, height: 5, style: 'scaffold' });
    expect(finishArch?.pos).toEqual({ x: b.def.finishX - 3, y: 0 });
    expect(b.def.finishX).toBe(plain().finishX);
  });

  it('set pieces land in meta.setPieces with x0 < x1 in course order; the finish run-out still validates with a finish arch', () => {
    const def = dressed();
    expect(setPiecesOf(def)).toEqual([
      { x0: 0, x1: 20, kind: 'start', label: 'grid' },
      { x0: 36, x1: 36 + 4 + 6 + 12, kind: 'air', label: 'the tabletop' },
      { x0: 58, x1: 78, kind: 'crowd' },
    ]);
    expect(setPiecesOf(plain())).toEqual([]);
    expect(validateFinishRunout(def)).toEqual([]);
    expect(describeTrack(compileTrack(def))).toContain('setPieces: start"grid"[0-20], air"the tabletop"[36-58], crowd[58-78]');
    expect(describeTrack(compileTrack(def))).toContain('(decor)');
  });

  it('set piece validation: an empty range or one opened before the previous throws', () => {
    expect(() => course('t-sp', 't', 'hard').meta(meta).flat(20).setPiece('crowd').endSetPiece()).toThrow(/no length/);
    expect(() => course('t-sp', 't', 'hard').meta(meta).setPiece('start').flat(20).arch({ span: 0 })).toThrow(/arch span/);
  });

  it('checkpoint rule ignores decor: a tunnel over a run-up neither blocks nor counts as a feature', () => {
    const withTunnel = course('t-cp', 't', 'hard').meta(meta).flat(28).checkpoint().flat(3).tunnel({ length: 20 }).flat(13).ramp({ length: 4, height: 1 }).gap(3).flat(20).finish();
    const without = course('t-cp2', 't', 'hard').meta(meta).flat(28).checkpoint().flat(3).flat(13).ramp({ length: 4, height: 1 }).gap(3).flat(20).finish();
    expect(auditCheckpoints(withTunnel).rows).toEqual(auditCheckpoints(without).rows);
    expect(auditCheckpoints(withTunnel).violations).toEqual([]);
  });
});
