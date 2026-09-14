/**
 * Round 11: the two bikes (Rookie = the round-10 tuning, Pro = real CdA / no governor / no wheelie
 * control), the Rookie wheelie control on crests and lips, the one-way plank straddle and the
 * per-class golden hashes. `FEEL` lines print the numbers physics.md 12 quotes.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createBikePhysics, type BikePhysicsWorld } from './bike';
import { BIKE_CLASSES, type BikeClass } from './tuning';
import { climber, cruise, hopper, ledgeHopper, runController, stepN, wheeliePD } from './controllers';
import { ledgeTrack, makeTrack, plankTrack } from './testTracks';
import { compileTrack, getTrack } from '../tracks';
import { decodeJSON, expandFrames } from '../core/replay';
import { hashPhysicsState } from '../core/hash';
import type { Collider, Vec2 } from '../core/types';

const HZ = 120;
const R = 0.34;
const deg = (r: number): number => (r * 180) / Math.PI;
const rad = (d: number): number => (d * Math.PI) / 180;
const feel = (name: string, value: number | string, band: string): void => {
  console.log(`FEEL ${name} = ${typeof value === 'number' ? value.toFixed(3) : value} [${band}]`);
};
const world = (cls: BikeClass, track = makeTrack(), settle = 60): BikePhysicsWorld => {
  const w = createBikePhysics(HZ);
  w.loadTrack(track, 1, { bike: cls });
  if (settle) stepN(w, {}, settle);
  return w;
};

function constant(cls: BikeClass, thr: number, lean: number): { top: number; faultAt: number; maxPitch: number; t16: number; finish: number | null } {
  const w = createBikePhysics(HZ);
  w.loadTrack(makeTrack({ finishX: 120 }), 1, { bike: cls });
  let top = 0;
  let faultAt = -1;
  let maxPitch = -999;
  let t16 = -1;
  stepN(w, { throttle: thr, lean }, HZ * 15, (s) => {
    top = Math.max(top, s.bike.vel.x);
    if (t16 < 0 && s.bike.vel.x >= 16) t16 = s.time;
    if (s.faulted && faultAt < 0) faultAt = s.time;
    if (!s.faulted) maxPitch = Math.max(maxPitch, deg(s.bike.angle));
  });
  return { top, faultAt, maxPitch, t16, finish: w.getState().finishTime };
}

function climb(cls: BikeClass, angle: number): { top: boolean; time: number; maxY: number; fault: string | null } {
  const len = 4;
  const w = world(cls, plankTrack(angle, len, 20));
  w.teleport({ pos: { x: 12, y: R }, angle: 0, vel: { x: 5, y: 0 } });
  const topX = 20 + len * Math.cos(rad(angle)) + 0.3;
  let maxY = 0;
  let top = false;
  let tStart = -1;
  let tTop = -1;
  runController(w, climber(angle, 20, { topX: topX - 0.3 }), {
    ticks: HZ * 8,
    onTick: (s) => {
      if (tStart < 0 && s.wheels.rear.pos.x > 20.3) tStart = s.time;
      maxY = Math.max(maxY, s.wheels.rear.pos.y - R);
      if (!top && s.wheels.rear.pos.x > topX) {
        top = true;
        tTop = s.time;
      }
    },
    stopWhen: (s) => s.faulted !== null || (top && s.time > tTop + 1),
  });
  return { top, time: top ? tTop - tStart : -1, maxY, fault: w.getState().faulted };
}

function pdHold(cls: BikeClass, target: number, kp: number, kd: number): { held: number; vAtDrop: number } {
  const w = world(cls, makeTrack({ finishX: 1000, profile: [{ x: -30, y: 0 }, { x: 1200, y: 0 }] }));
  w.teleport({ pos: { x: 0, y: R }, angle: rad(target), vel: { x: 4, y: 0 } });
  let held = 0;
  let vAtDrop = 0;
  runController(w, wheeliePD(target, 4, kp, kd), {
    ticks: HZ * 12,
    decisionHz: 60,
    latencyMs: 100,
    onTick: (s) => {
      if (!s.wheels.front.grounded && !s.faulted) held++;
      vAtDrop = s.bike.vel.x;
    },
    stopWhen: (s) => s.faulted !== null || (s.wheels.front.grounded && s.time > 1),
  });
  return { held: held / HZ, vAtDrop };
}

describe('two bikes (round 11): Rookie is the round-10 tuning, Pro the honest one', () => {
  it('BIKE_CLASSES, loadTrack opts and the tuning table swap; default is rookie', () => {
    expect(BIKE_CLASSES).toEqual(['rookie', 'pro']);
    const w = createBikePhysics(HZ);
    expect(w.bike).toBe('rookie');
    w.loadTrack(makeTrack(), 1, { bike: 'pro' });
    expect(w.bike).toBe('pro');
    expect(w.tuning.aero.dragCoef).toBe(0.45);
    expect(w.tuning.engine.wheelieControl.enabled).toBe(false);
    w.loadTrack(makeTrack(), 1);
    expect(w.bike).toBe('rookie');
    expect(w.tuning.aero.dragCoef).toBe(4.2);
  });

  it('Pro: 0 -> 16 <= 3.0 s, limiter-bound top ~22 m/s; lean >= 0.4 at full gas never loops; lean 0 loops after >= 1.2 s (no wheelie control: that is the skill); partial throttle has no governor', () => {
    const l0 = constant('pro', 1, 0);
    const l4 = constant('pro', 1, 0.4);
    const l2 = constant('pro', 1, 0.2);
    const l1 = constant('pro', 1, 1);
    const p3 = constant('pro', 0.3, 0.5);
    feel('pro.thr1.lean0.loopAt', l0.faultAt, '>= 1.2 s (Rookie: never, 38 deg wheelie)');
    feel('pro.thr1.lean0.4.maxPitchDeg', l4.maxPitch, '< 15, finishes');
    feel('pro.thr1.lean0.4.t16', l4.t16, '<= 3.0 s');
    feel('pro.thr1.lean0.4.top', l4.top, '21-23 m/s (limiter at 22.0)');
    feel('pro.thr1.lean0.2.maxPitchDeg', l2.maxPitch, 'info');
    feel('pro.thr1.lean1.top', l1.top, 'info');
    feel('pro.thr0.3.top', p3.top, 'no governor: reaches the limiter (Rookie 11 m/s)');
    expect(l0.faultAt).toBeGreaterThanOrEqual(1.2);
    expect(l4.finish).not.toBeNull();
    expect(l4.maxPitch).toBeLessThan(15);
    expect(l4.t16).toBeLessThanOrEqual(3.0);
    expect(l4.top).toBeGreaterThan(21);
    expect(l4.top).toBeLessThan(23);
    expect(p3.top).toBeGreaterThan(20);
  });

  it('Pro: 55 / 60 deg planks climb as on Rookie, 65 stalls; stationary hop 0.6-0.7 m; the 0.9 m ledge at 5 m/s', () => {
    const c55 = climb('pro', 55);
    const c60 = climb('pro', 60);
    const c65 = climb('pro', 65);
    feel('pro.climb.55', `${c55.top} ${c55.time.toFixed(2)} s`, 'top (Rookie 1.77 s)');
    feel('pro.climb.60', `${c60.top} ${c60.time.toFixed(2)} s`, 'top (Rookie 2.91 s)');
    feel('pro.climb.65', `${c65.top} maxY ${c65.maxY.toFixed(2)}`, 'stalls');
    expect(c55.top && c55.fault === null).toBe(true);
    expect(c60.top && c60.fault === null).toBe(true);
    expect(c65.top).toBe(false);
    const w = world('pro');
    const y0 = w.getState().wheels.rear.pos.y;
    let apex = 0;
    runController(w, hopper(1, 0.3), { ticks: HZ * 4, onTick: (s) => (apex = Math.max(apex, s.wheels.rear.pos.y - y0)) });
    feel('pro.hop.rearApex', apex, '0.6-0.7 m (Rookie 0.676)');
    expect(apex).toBeGreaterThan(0.6);
    expect(apex).toBeLessThan(0.75);
    const l = world('pro', ledgeTrack(0.9, 20));
    l.teleport({ pos: { x: 0, y: R }, angle: 0, vel: { x: 5, y: 0 } });
    let made = false;
    runController(l, ledgeHopper(20, 5, 8, 1.3, 50), { ticks: HZ * 8, onTick: (s) => { if (s.wheels.rear.pos.x > 22 && s.wheels.rear.pos.y > 0.9 && !s.faulted) made = true; }, stopWhen: (s) => s.faulted !== null });
    feel('pro.ledge0.9', made ? 'made' : 'no', 'made (10 of 36 hopper combos; Rookie 12 of 36)');
    expect(made).toBe(true);
  });

  it('wheelie PD hold: the throttle-only PD (60 Hz, 100 ms) balances by accelerating - Rookie 12 s to the drag limit at 11 m/s, Pro until the limiter cuts at 22 m/s (>= 3.5 s); neither holds 10 s at a held speed (12.4 (0))', () => {
    const r = pdHold('rookie', 44, 0.1, 0.03);
    const p = pdHold('pro', 44, 0.1, 0.03);
    feel('pd.rookie.held', `${r.held.toFixed(1)} s at ${r.vAtDrop.toFixed(1)} m/s`, '>= 10 s');
    feel('pd.pro.held', `${p.held.toFixed(1)} s at ${p.vAtDrop.toFixed(1)} m/s`, '>= 3.5 s, drops at the limiter (~22 m/s)');
    expect(r.held).toBeGreaterThanOrEqual(10);
    expect(p.held).toBeGreaterThanOrEqual(3.5);
    expect(p.vAtDrop).toBeGreaterThan(20);
  });
});

describe('Rookie wheelie control on crests, bumps and lips (round 11, strangers on b1/b2/b3)', () => {
  function crestTrack(x0 = 30, len = 20, h = 2): ReturnType<typeof makeTrack> {
    const pts: Vec2[] = [{ x: -30, y: 0 }, { x: x0, y: 0 }];
    for (let i = 1; i <= 40; i++) {
      const u = i / 40;
      pts.push({ x: x0 + len * u, y: (h / 2) * (1 - Math.cos(2 * Math.PI * u)) });
    }
    pts.push({ x: 400, y: 0 });
    return makeTrack({ id: 'crest', profile: pts, finishX: 200 });
  }
  function kickerTrack(x0 = 30, len = 4, h = 0.8): ReturnType<typeof makeTrack> {
    return makeTrack({ id: 'kicker', profile: [{ x: -30, y: 0 }, { x: x0, y: 0 }, { x: x0 + len, y: h }, { x: x0 + len, y: 0 }, { x: 400, y: 0 }], finishX: 200 });
  }
  function drumRow(x0: number, n = 4, pitch = 6, r = 0.5, proud = 0.3): ReturnType<typeof makeTrack> {
    const extra: Collider[] = [];
    for (let i = 0; i < n; i++) extra.push({ kind: 'circle', id: 0, surface: 'metal', obstacleIndex: i, center: { x: x0 + i * pitch, y: r - (2 * r - proud) }, radius: r, rolls: false });
    return makeTrack({ id: 'drums', extra, finishX: 200 });
  }
  const fullGas = (cls: BikeClass, track: ReturnType<typeof makeTrack>, entry?: number): { maxPitch: number; fault: string | null; minPitch: number } => {
    const w = world(cls, track);
    if (entry !== undefined) w.teleport({ pos: { x: 5, y: R }, angle: 0, vel: { x: entry, y: 0 } });
    let maxPitch = -999;
    let minPitch = 999;
    runController(w, (o) => (entry !== undefined && o.state.bike.pos.x < 30 ? cruise(entry, 0)(o) : { throttle: 1, lean: 0 }), {
      ticks: HZ * 10,
      onTick: (s) => {
        if (!s.faulted) {
          maxPitch = Math.max(maxPitch, deg(s.bike.angle));
          minPitch = Math.min(minPitch, deg(s.bike.angle));
        }
      },
    });
    return { maxPitch, minPitch, fault: w.getState().faulted };
  };
  it('full gas at lean 0 over a 20 x 2 m cosine crest: Rookie stays under 45 deg and never faults; Pro loops (the skill)', () => {
    const r = fullGas('rookie', crestTrack());
    const p = fullGas('pro', crestTrack());
    feel('crest.rookie.maxPitchDeg', r.maxPitch, '<= 45, no fault (round 10: 43 with the front memory, 60-120 on b1 per the strangers)');
    feel('crest.pro', `${p.fault} max ${p.maxPitch.toFixed(0)}`, 'loops');
    expect(r.fault).toBeNull();
    expect(r.maxPitch).toBeLessThanOrEqual(45);
    expect(p.fault).toBe('crash');
  });
  it('full gas at lean 0 off a 4 x 0.8 kicker at 8 and 11 m/s: Rookie lands and rides away (round 10 looped at 128 deg: the lip read as a 90 deg climb and the rear spun to the limiter in the air); Pro loops', () => {
    for (const v of [8, 11]) {
      const r = fullGas('rookie', kickerTrack(), v);
      const p = fullGas('pro', kickerTrack(), v);
      feel(`kicker4x0.8.${v}.rookie`, `${r.fault ?? 'rides away'} max ${r.maxPitch.toFixed(0)}`, 'no fault (the 50-65 deg peak is the ballistic launch attitude; the asked <= 45 is open)');
      feel(`kicker4x0.8.${v}.pro`, `${p.fault ?? 'rides away'} max ${p.maxPitch.toFixed(0)}`, 'loops');
      expect(r.fault).toBeNull();
      expect(p.fault).toBe('crash');
    }
  });
  it('full gas at lean 0 from rest into a row of 0.3 m-proud r 0.5 drums: reports (both builds nose over at 13-17 m/s: a bump launch, not a wheelie-control case)', () => {
    for (const x0 of [12, 30]) {
      const r = fullGas('rookie', drumRow(x0));
      feel(`drumRow@${x0}.rookie`, `${r.fault ?? 'rides away'} pitch ${r.minPitch.toFixed(0)}..${r.maxPitch.toFixed(0)}`, 'info (round 10: the same)');
      expect(r.maxPitch).toBeLessThan(45);
    }
  });
});

describe('one-way plank straddle (round 11, tracks.md 6.1: the m3 wedge)', () => {
  const END = 23;
  const plankOverPit = (): ReturnType<typeof makeTrack> =>
    makeTrack({
      id: 'wedge',
      profile: [{ x: -30, y: 0 }, { x: 20, y: 0 }, { x: 20, y: -8 }, { x: 40, y: -8 }, { x: 40, y: 0 }, { x: 400, y: 0 }],
      extra: [{ kind: 'polyline', id: 0, surface: 'wood', obstacleIndex: 0, oneWay: true, points: [{ x: END, y: 0 }, { x: 40, y: 0 }] }],
    });
  it('a 9 m/s arrival with the rear wheel anywhere from 0.7 m below to level with a one-way plank (front on top) lands on it or falls past it, never hangs (round 10: 9 of 45 hung with the rear wheel through the board)', () => {
    let hangs = 0;
    let on = 0;
    let fell = 0;
    for (let yr = 0.4; yr >= -0.3; yr -= 0.05) {
      for (const back of [0.6, 0.9, 1.2]) {
        const w = world('rookie', plankOverPit());
        const dx = Math.sqrt(1.3 * 1.3 - Math.min(1.69, (R + 0.02 - yr) ** 2));
        w.teleport({ pos: { x: END - back, y: yr }, angle: Math.atan2(R + 0.02 - yr, dx), vel: { x: 9, y: 0 } });
        const s = stepN(w, { throttle: 0.5, lean: 0.5 }, HZ * 4);
        if (s.faulted) fell++;
        else if (s.wheels.rear.pos.x > END + 2 && Math.abs(s.wheels.rear.pos.y - R) < 0.05) on++;
        else hangs++;
      }
    }
    feel('wedge.9ms', `on ${on} fell ${fell} hang ${hangs} of 45`, 'hang 0');
    expect(hangs).toBe(0);
  });
});

describe('golden hashes per class (round 11): flat-test bot-3 replayed straight through the physics', () => {
  const GOLDEN: Record<BikeClass, string> = { rookie: 'd2b082502561bc00', pro: '32a467457c497e2c' };
  for (const cls of BIKE_CLASSES) {
    it(`${cls}: flat-test/bot-3.json hash is pinned (${GOLDEN[cls]})`, () => {
      const rec = decodeJSON(fs.readFileSync(path.join(process.cwd(), 'harness/inputs/flat-test/bot-3.json'), 'utf8'));
      const w = createBikePhysics(rec.header.physicsHz);
      w.loadTrack(compileTrack(getTrack('flat-test')!), rec.header.seed >>> 0, { bike: cls });
      for (const f of expandFrames(rec)) w.step(f);
      const s = w.getState();
      const h = hashPhysicsState(s);
      feel(`golden.${cls}.flat-test.bot-3`, `${h} finish ${s.finishTime} fault ${s.faulted}`, GOLDEN[cls]);
      expect(h).toBe(GOLDEN[cls]);
    });
  }
});
