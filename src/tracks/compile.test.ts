import { describe, expect, it } from 'vitest';
import type { ColliderPolyline, ColliderSeesaw, TrackDef } from '../core/types';
import { course, FEEL } from './author';
import { compileTrack, hashColliders, profileQuery } from './compile';
import { describeAhead } from './describe';
import { KIND_DEFAULTS, OBSTACLE_KINDS, footprint, resolveParams } from './kinds';

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
    expect(p).toEqual({ length: 4, height: 2, curve: 0, direction: 'up', surface: 'wood' });
    expect(footprint('plank', { length: 4, angleDeg: 60 })).toBeCloseTo(2, 6);
    expect(footprint('pole', { count: 3, spacing: 2 })).toBeCloseTo(4.5, 6);
  });
});

describe('compileTrack merge', () => {
  it('ramp -> box -> ramp share no faces: only the exposed outline survives', () => {
    const def = course('t-tabletop', 't', 'beginner').meta(meta).flat(10).tabletop(4, 6, 1.2).flat(10).finish();
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
    const def = course('t-step', 't', 'beginner').meta(meta).flat(10).ramp({ length: 4, height: 1.2 }).box({ width: 4, height: 1.0 }).flat(10).finish();
    const ramp = polys(def).find((p) => p.obstacleIndex === 0) as ColliderPolyline;
    expect(ramp.points).toEqual([
      { x: 10, y: 0 },
      { x: 14, y: 1.2 },
      { x: 14, y: 1.0 },
    ]);
  });

  it('a box on a slope follows the ground exactly', () => {
    const def = course('t-slope', 't', 'beginner').meta(meta).flat(10).slope(10, 1).flat(4).box({ width: 4, height: 1 }).flat(10).finish();
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
    const def = course('t-base', 't', 'beginner').meta(meta).flat(10).box({ width: 6, height: 0.6 }).ramp({ length: 3, height: 1 }, { base: 0.6 }).flat(10).finish();
    const ramp = polys(def).find((p) => p.obstacleIndex === 1) as ColliderPolyline;
    expect(ramp.points).toEqual([
      { x: 16, y: 0.6 },
      { x: 19, y: 1.6 },
      { x: 19, y: 0 },
    ]);
  });

  it('gap punches a pit into the ground and fills it with a hazard', () => {
    const def = course('t-gap', 't', 'beginner').meta(meta).flat(10).gap({ width: 3, depth: 2 }).flat(10).finish();
    const c = compileTrack(def);
    const ground = c.colliders[0] as ColliderPolyline;
    expect(ground.points.slice(1, 5)).toEqual([
      { x: 10, y: 0 },
      { x: 10.05, y: -2 },
      { x: 12.95, y: -2 },
      { x: 13, y: 0 },
    ]);
    expect(c.hazards).toEqual([{ id: 0, kind: 'water', min: { x: 10, y: -2 }, max: { x: 13, y: -0.3 } }]);
    expect(c.oobY).toBe(-8);
  });

  it('plank is a one-way top surface; wall lip is a one-way overhang', () => {
    const def = course('t-plank', 't', 'beginner').meta(meta).flat(10).plank({ angleDeg: 30, rise: 2 }).box({ width: 4, height: 2 }).flat(4).wall({ height: 1, width: 2, lip: 0.2 }).flat(10).finish();
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

  it('burning barrels carry a fire hazard; unlit ones do not', () => {
    const def = course('t-barrel', 't', 'beginner').meta(meta).flat(10).barrel({ count: 2, spacing: 0.8 }).flat(2).barrel({ burning: false }).flat(10).finish();
    const c = compileTrack(def);
    expect(c.hazards.map((h) => h.kind)).toEqual(['fire', 'fire']);
    expect(c.hazards[0]).toMatchObject({ min: { x: 10, y: 0.9 }, max: { x: 10.6, y: 1.7 } });
    expect(c.colliders.filter((k) => k.kind === 'box')).toHaveLength(3);
  });

  it('seesaw max angle lets an end touch the ground, capped at 30 deg', () => {
    const def = course('t-seesaw', 't', 'beginner').meta(meta).flat(10).seesaw({ length: 6, height: 1 }).flat(2).seesaw({ length: 6, height: 2.5 }).flat(10).finish();
    const ss = compileTrack(def).colliders.filter((c): c is ColliderSeesaw => c.kind === 'seesaw');
    expect(ss[0]?.pivot).toEqual({ x: 13, y: 1 });
    expect(ss[0]?.maxAngle).toBeCloseTo(Math.asin((1 - 0.06) / 3), 5);
    expect(ss[1]?.maxAngle).toBeCloseTo(Math.PI / 6, 5);
  });

  it('drum rolls flag and logpile pyramid count', () => {
    const def = course('t-drum', 't', 'beginner').meta(meta).flat(10).drum({ radius: 1, rolls: true }).flat(2).logpile({ count: 3, rows: 3 }).flat(10).finish();
    const c = compileTrack(def);
    const circles = c.colliders.filter((k) => k.kind === 'circle');
    expect(circles).toHaveLength(1 + 6);
    expect(circles[0]).toMatchObject({ center: { x: 11, y: 1 }, rolls: true });
    expect(circles.slice(1).some((k) => k.kind === 'circle' && k.rolls)).toBe(false);
  });

  it('is pure: same def, same hash; different def, different hash', () => {
    const a = course('t-a', 't', 'beginner').meta(meta).flat(10).box({ width: 4, height: 1 }).flat(10).finish();
    const b = course('t-a', 't', 'beginner').meta(meta).flat(10).box({ width: 4, height: 1.01 }).flat(10).finish();
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
        ...course('t-x', 't', 'beginner').meta(meta).flat(10).box({ width: 4, height: 1 }).flat(10).finish(),
        obstacles: [
          { kind: 'box', pos: { x: 10, y: 0 }, params: { width: 4, height: 1 } },
          { kind: 'box', pos: { x: 12, y: 0 }, params: { width: 4, height: 1 } },
        ],
      }),
    ).toThrow(/solid overlap/);
  });

  it('rejects a gap on sloped ground', () => {
    const base = course('t-x', 't', 'beginner').meta(meta).flat(10).slope(10, 1).flat(10).finish();
    expect(() => compileTrack({ ...base, obstacles: [{ kind: 'gap', pos: { x: 12, y: 0.2 }, params: { width: 3 } }] })).toThrow(/not level/);
    // overlapping pits are refused too
    expect(() =>
      compileTrack({ ...base, obstacles: [{ kind: 'gap', pos: { x: 5, y: 0 }, params: { width: 3 } }, { kind: 'gap', pos: { x: 6, y: 0 }, params: { width: 3 } }] }),
    ).toThrow(/gaps overlap/);
  });

  it('rejects a spawn that is not on one flat segment', () => {
    expect(() => course('t-x', 't', 'beginner').meta(meta).flat(10).checkpoint().slope(10, 1).flat(10).finish()).toThrow(/single flat/);
    expect(() => course('t-x', 't', 'beginner').meta(meta).flat(10).checkpoint().box({ width: 4, height: 1 }).flat(10).finish()).toThrow(/sits on obstacle/);
  });

  it('rejects unknown kinds and a non-monotone profile', () => {
    const base = course('t-x', 't', 'beginner').meta(meta).flat(10).finish();
    expect(() => compileTrack({ ...base, obstacles: [{ kind: 'loop', pos: { x: 5, y: 0 } }] })).toThrow(/unknown kind/);
    expect(() => compileTrack({ ...base, profile: [{ x: 0, y: 0 }, { x: 0, y: 1 }] })).toThrow(/strictly increasing/);
  });

  it('requires meta and rejects ground slopes steeper than 40 deg', () => {
    expect(() => course('t-x', 't', 'beginner').flat(10).finish()).toThrow(/meta/);
    expect(() => course('t-x', 't', 'beginner').meta(meta).slope(1, 2)).toThrow(/too steep/);
  });
});

describe('feel helpers', () => {
  it('match the CONTRACT envelope with 20 % margin', () => {
    expect(FEEL.speedAfter(FEEL.runupFor(10))).toBeCloseTo(10, 6);
    expect(FEEL.speedAfter(1000)).toBeCloseTo(16, 6); // top speed 20 x 0.8
    expect(FEEL.brakeDistance(10)).toBeCloseTo(100 / 22 / 0.8, 6);
    expect(FEEL.hopLedge(false)).toBeCloseTo(0.44, 6);
    expect(FEEL.hopLedge(true)).toBeCloseTo(0.72, 6);
    expect(FEEL.climbDeg()).toBe(48);
    expect(FEEL.jumpRange(10, 0, 0)).toBe(0);
    expect(FEEL.jumpRange(10, 45, 0)).toBeCloseTo(100 / 9.81, 3);
  });
});

describe('describeAhead', () => {
  it('lists what is coming in range', () => {
    const def = course('t-d', 't', 'beginner').meta(meta).flat(10).ramp({ length: 4, height: 1 }).gap(3).checkpoint().flat(10).finish();
    const c = compileTrack(def);
    expect(describeAhead(c, 5, 20)).toBe('ramp 4x1 in 5.0 m, gap 3x3 in 9.0 m, checkpoint in 12.0 m');
    expect(describeAhead(c, 100, 5)).toBe('flat for 5 m');
  });
});
