/**
 * R4 rows (physics.md "v2 status - R4"): the round-8 "air-throttle kick" and "on-ramp front lift" re-measured on the
 * solver, the Rookie's declared wheelie control (ECU thrust trim: `engine.wheelieControl`) and the Pro's raw response.
 * Every row prints `FEEL <quantity> = <value> [band]`.
 */
import { describe, expect, it } from 'vitest';
import { createBikePhysicsV2 as createBikePhysics, type BikePhysicsWorldV2 } from './bike';
import { BIKE_CLASSES_V2, type BikeClassV2, type PartialTuningV2 } from './tuning';
import { makeTrack } from '../testTracks';
import { stepN } from '../controllers';

const HZ = 120;
const DEG = 180 / Math.PI;
const f = (x: number, d = 1): string => (Number.isNaN(x) ? 'nan' : x.toFixed(d));
function feel(name: string, value: number | string, band: string): void {
  console.log(`FEEL ${name} = ${typeof value === 'number' ? value.toFixed(3) : value} [${band}]`);
}
type In = Partial<{ throttle: number; brake: number; lean: number }>;

/** Level bike 6 m up at 10 m/s, the rider settled on `pre`; then `post` for 0.5 s: the pitch-rate response. */
function air(cls: BikeClassV2, pre: In, post: In, over?: PartialTuningV2): { peakRate: number; peakStep: number; ang05: number; rate05: number } {
  const w = createBikePhysics(HZ, over);
  w.loadTrack(makeTrack({ finishX: 1e9 }), 1, { bike: cls });
  stepN(w, {}, 60);
  w.teleport({ pos: { x: 10, y: 6 }, angle: 0, vel: { x: 10, y: 0 } });
  stepN(w, {}, 6);
  stepN(w, pre, 24);
  const a0 = w.getState().bike.angle;
  let prev = w.getState().bike.angVel * DEG;
  let peakRate = 0;
  let peakStep = 0;
  const s = stepN(w, post, 60, (st) => {
    const r = st.bike.angVel * DEG;
    if (Math.abs(r) > Math.abs(peakRate)) peakRate = r;
    if (Math.abs(r - prev) > Math.abs(peakStep)) peakStep = r - prev;
    prev = r;
  });
  return { peakRate, peakStep, ang05: (s.bike.angle - a0) * DEG, rate05: s.bike.angVel * DEG };
}

/** Flat run-in at `v`, a `len` m kicker at `angleDeg`, then a drop: the pitch on the ramp and at the lip under `thr` at `lean`. */
function ramp(cls: BikeClassV2, angleDeg: number, v: number, lean: number, thr = 1, len = 6, over?: PartialTuningV2): { overSlope: number; lipPitch: number; lipRate: number; lipV: number; assistMax: number } {
  const x0 = 30;
  const a = (angleDeg * Math.PI) / 180;
  const w = createBikePhysics(HZ, over);
  const lipX = x0 + len * Math.cos(a);
  const lipY = len * Math.sin(a);
  w.loadTrack(makeTrack({ profile: [{ x: -30, y: 0 }, { x: x0, y: 0 }, { x: lipX, y: lipY }, { x: lipX + 40, y: lipY - 8 }, { x: 400, y: -8 }], finishX: 1e9 }), 1, { bike: cls });
  stepN(w, {}, 60);
  w.teleport({ pos: { x: 5, y: 0.34 }, angle: 0, vel: { x: v, y: 0 } });
  let st = w.getState();
  while (st.wheels.rear.pos.x < x0 - 0.5) st = stepN(w, { throttle: st.bike.vel.x < v ? 1 : 0, lean: 0.3 }, 1);
  const o = { overSlope: -99, lipPitch: NaN, lipRate: NaN, lipV: NaN, assistMax: 0 };
  stepN(w, { throttle: thr, lean }, HZ * 1.5, (q) => {
    const p = q.bike.angle * DEG;
    const rx = q.wheels.rear.pos.x;
    o.assistMax = Math.max(o.assistMax, w.debug().engine.assist);
    // the ramp proper: past the base transition (the first 1.5 m is the geometric 150 deg/s rotation onto the slope)
    if (rx > x0 + 1.5 && rx < lipX && q.wheels.rear.grounded) o.overSlope = Math.max(o.overSlope, p - angleDeg);
    if (Number.isNaN(o.lipPitch) && rx >= lipX) {
      o.lipPitch = p;
      o.lipRate = q.bike.angVel * DEG;
      o.lipV = Math.hypot(q.bike.vel.x, q.bike.vel.y);
    }
  });
  return o;
}

/** Airborne over a 20 deg ramp, pitched `pitchOver` deg above the slope, the rear descending onto it at `vn` m/s: the contact's pitch-rate step. */
function touchdown(cls: BikeClassV2, vn: number, thr: number, pitchOver = 20): { peakStep: number; peakN: number } {
  const a = (20 * Math.PI) / 180;
  const w = createBikePhysics(HZ);
  w.loadTrack(makeTrack({ profile: [{ x: -30, y: -20 }, { x: 0, y: -20 }, { x: 0, y: 0 }, { x: 40 * Math.cos(a), y: 40 * Math.sin(a) }, { x: 400, y: 40 * Math.sin(a) }], finishX: 1e9 }), 1, { bike: cls });
  stepN(w, {}, 60);
  const rx = 20;
  const ry = rx * Math.tan(a) + 0.34 + 0.6;
  const along = 10;
  w.teleport({ pos: { x: rx, y: ry }, angle: a + (pitchOver * Math.PI) / 180, vel: { x: along * Math.cos(a) + vn * Math.sin(a), y: along * Math.sin(a) - vn * Math.cos(a) } });
  stepN(w, { throttle: thr }, 12);
  let prev = w.getState().bike.angVel * DEG;
  const o = { peakStep: 0, peakN: 0 };
  stepN(w, { throttle: thr }, 60, (st) => {
    const r = st.bike.angVel * DEG;
    if (Math.abs(r - prev) > Math.abs(o.peakStep)) o.peakStep = r - prev;
    prev = r;
    for (const c of w.debug().contacts) if (c.body === 'rearWheel') o.peakN = Math.max(o.peakN, c.lambdaN * HZ);
  });
  return o;
}

function launch(cls: BikeClassV2, lean: number): { maxPitch: number; loopT: number } {
  const w = createBikePhysics(HZ);
  w.loadTrack(makeTrack({ finishX: 1e9 }), 1, { bike: cls });
  stepN(w, {}, 60);
  let maxPitch = -99;
  let loopT = NaN;
  stepN(w, { throttle: 1, lean }, HZ * 5, (st) => {
    const p = st.bike.angle * DEG;
    maxPitch = Math.max(maxPitch, p);
    if (Number.isNaN(loopT) && p > 90) loopT = st.time - 0.5;
  });
  return { maxPitch, loopT };
}

const RAW: PartialTuningV2 = { engine: { wheelieControl: { gain: 0, rate0: 0.5, rate1: 1.2, topOut: 0.03, margin0: 0.2, margin1: 0.4, leanFull: 0.2, leanOff: 0.5, leanFwdFull: 0.6, leanFwdOff: 0.9 } } };
/** R5: the Rookie's airborne target-rate limit off (the R4 measurement of the raw swing). */
const AIR_RAW: PartialTuningV2 = { rider: { airRateGain: 0 } };

describe('R4 mechanism 2: the round-8 "air-throttle kick" is the rider pose swing, not the throttle', () => {
  it('throttle in the air is bounded by the wheel spin-up (<= 30 deg/s peak, 4-12 deg in 0.5 s) and brake in the air by the wheels\' spin momentum (-30..-60 deg/s peak) on both classes', () => {
    for (const cls of BIKE_CLASSES_V2) {
      const t = air(cls, {}, { throttle: 1 });
      const b = air(cls, {}, { brake: 1 });
      feel(`air.${cls}.throttleTap`, `peak ${f(t.peakRate, 0)} deg/s step ${f(t.peakStep, 0)} /tick angle ${f(t.ang05)} @0.5s`, 'peak <= 30, 4..12 deg');
      feel(`air.${cls}.brakeTap`, `peak ${f(b.peakRate, 0)} deg/s step ${f(b.peakStep, 0)} /tick angle ${f(b.ang05)} @0.5s`, 'peak -30..-60, -8..-25 deg');
      expect(Math.abs(t.peakRate)).toBeLessThanOrEqual(30);
      expect(t.ang05).toBeGreaterThanOrEqual(4);
      expect(t.ang05).toBeLessThanOrEqual(12);
      expect(b.peakRate).toBeLessThanOrEqual(-30);
      expect(b.peakRate).toBeGreaterThanOrEqual(-60);
      expect(b.ang05).toBeLessThanOrEqual(-8);
      expect(b.ang05).toBeGreaterThanOrEqual(-25);
    }
  });

  it('a full pose swing in the air is the 200-400 deg/s step: releasing lean -1 to 0 kicks +230..260 deg/s within 0.07 s (43 deg/s per tick = F_max x the grip lever / I_chassis), pressing 0 to -1 dips the nose first (-140 deg/s) then K_att lifts it; genuine two-body dynamics, > 8x the throttle tap (raw: the Pro, and the Rookie with the R5 air limit off - r5.test.ts has the limited Rookie)', () => {
    for (const cls of BIKE_CLASSES_V2) {
      const raw = cls === 'rookie' ? AIR_RAW : undefined;
      const rel = air(cls, { lean: -1 }, { lean: 0 }, raw);
      const press = air(cls, {}, { lean: -1 }, raw);
      const both = air(cls, { lean: -1 }, { lean: 0, throttle: 1 }, raw);
      const t = air(cls, {}, { throttle: 1 }, raw);
      feel(`air.${cls}.swing-1to0`, `peak ${f(rel.peakRate, 0)} deg/s step ${f(rel.peakStep, 0)} /tick angle ${f(rel.ang05)} @0.5s`, 'measured: the kick (200-300)');
      feel(`air.${cls}.swing0to-1`, `peak ${f(press.peakRate, 0)} deg/s step ${f(press.peakStep, 0)} /tick angle ${f(press.ang05)} @0.5s rate@0.5 ${f(press.rate05, 0)}`, 'measured: dip then K_att');
      feel(`air.${cls}.swing-1to0+gas`, `peak ${f(both.peakRate, 0)} angle ${f(both.ang05)} @0.5s`, 'measured: swing + 20 of throttle');
      expect(rel.peakRate).toBeGreaterThan(200);
      expect(rel.peakRate).toBeLessThan(300);
      expect(rel.peakRate).toBeGreaterThan(8 * Math.abs(t.peakRate));
      expect(Math.abs(rel.peakStep)).toBeGreaterThan(35);
      expect(both.peakRate - rel.peakRate).toBeLessThan(25);
    }
  });

  it('a rear touchdown pitched 20 deg above a 20 deg ramp passes sin(20) of the normal impulse rigidly through the slider: <= 60 deg/s per tick at 1-2 m/s of approach, gas on or off (genuine, a landing, not a solver spike)', () => {
    for (const cls of BIKE_CLASSES_V2) {
      for (const [vn, thr] of [[1, 1], [2, 1], [1, 0], [2, 0]] as const) {
        const r = touchdown(cls, vn, thr);
        feel(`touchdown.${cls}.vn${vn}.thr${thr}`, `step ${f(r.peakStep, 0)} deg/s per tick, peak N ${f(r.peakN, 0)} N`, '<= 60 per tick');
        expect(Math.abs(r.peakStep)).toBeLessThanOrEqual(60);
      }
    }
  });
});

describe('R4 mechanism 1 + the Rookie assist: on-ramp front lift under full gas', () => {
  it('a 20 deg slope lowers the front-lift threshold from ~0.6 g to ~0.22 g: raw (either class with the ECU off; R6: the Pro carries the ground ECU too, so its raw row is the gain-0 override) full gas at lean 0 wheelies 40-55 deg over the slope and leaves a 6 m lip at 65-80 deg nose-up rotating 150+ deg/s; the R6 Pro (ECU on the ground) leaves the same lip <= 25 deg', () => {
    const pro = ramp('pro', 20, 10, 0, 1, 6, RAW);
    const raw = ramp('rookie', 20, 10, 0, 1, 6, RAW);
    const proR6 = ramp('pro', 20, 10, 0);
    feel('ramp20@10.proRaw.lean0', `over slope ${f(pro.overSlope)} lip pitch ${f(pro.lipPitch)} rate ${f(pro.lipRate, 0)} v ${f(pro.lipV)}`, 'raw (R3-R5 Pro): loops off the lip');
    feel('ramp20@10.rookieRaw.lean0', `over slope ${f(raw.overSlope)} lip pitch ${f(raw.lipPitch)} rate ${f(raw.lipRate, 0)} v ${f(raw.lipV)}`, 'R3 Rookie (assist off)');
    feel('ramp20@10.pro.lean0', `over slope ${f(proR6.overSlope)} lip pitch ${f(proR6.lipPitch)} rate ${f(proR6.lipRate, 0)} v ${f(proR6.lipV)} assist max ${f(proR6.assistMax, 2)}`, 'R6 Pro (ground ECU): lip <= 25');
    expect(pro.overSlope).toBeGreaterThan(40);
    expect(pro.lipRate).toBeGreaterThan(150);
    expect(raw.overSlope).toBeGreaterThan(35);
    expect(pro.assistMax).toBe(0);
    expect(raw.assistMax).toBe(0);
    expect(proR6.lipPitch).toBeLessThanOrEqual(25);
    expect(proR6.assistMax).toBeGreaterThan(0.5);
  });

  it('Rookie (wheelie control on): the same ramp at lean 0 lifts <= 15 deg over the slope, leaves the lip <= 25 deg nose-up with the nose already coming down (rate <= 0) and no brake; the lean-forward technique (+1, assist faded out) gives the same picture with 1 m/s more lip speed', () => {
    const r0 = ramp('rookie', 20, 10, 0);
    const r2 = ramp('rookie', 20, 10, 0.2);
    const r4 = ramp('rookie', 20, 10, 0.4);
    const r8 = ramp('rookie', 20, 10, 1);
    for (const [n, r] of [['lean0', r0], ['lean0.2', r2], ['lean0.4', r4], ['lean1', r8]] as const) feel(`ramp20@10.rookie.${n}`, `over slope ${f(r.overSlope)} lip pitch ${f(r.lipPitch)} rate ${f(r.lipRate, 0)} v ${f(r.lipV)} assist max ${f(r.assistMax, 2)}`, 'lean 0: over <= 15, lip <= 25, rate <= 0');
    expect(r0.overSlope).toBeLessThanOrEqual(15);
    expect(r0.lipPitch).toBeLessThanOrEqual(25);
    expect(r0.lipRate).toBeLessThanOrEqual(0);
    expect(r0.assistMax).toBeGreaterThan(0.5);
    expect(r4.lipPitch).toBeLessThanOrEqual(25);
    expect(r8.assistMax).toBe(0);
    expect(r8.overSlope).toBeLessThanOrEqual(10);
    expect(r8.lipV).toBeGreaterThan(r0.lipV);
  });

  it('the assist is a neutral-lean safety, not a governor: it fades out by |lean| 0.5, so the Rookie still loops under gas at lean -0.5 (~0.8 s) and -1, loops slower at -0.25, and the R3 hop / wheelie hold / climb throw rows stand (r3.test.ts)', () => {
    const l0 = launch('rookie', 0);
    const lq = launch('rookie', -0.25);
    const lh = launch('rookie', -0.5);
    feel('launch.rookie.lean0', `max pitch ${f(l0.maxPitch)} loop ${f(l0.loopT, 2)}`, '<= 10 deg, no loop');
    feel('launch.rookie.lean-0.25', `loop ${f(lq.loopT, 2)} s`, 'info (R3: 1.10)');
    feel('launch.rookie.lean-0.5', `loop ${f(lh.loopT, 2)} s`, 'loops (R3: 0.82)');
    expect(l0.maxPitch).toBeLessThanOrEqual(10);
    expect(Number.isNaN(l0.loopT)).toBe(true);
    expect(lh.loopT).toBeLessThan(1.2);
  });

  it('nothing remembered: a snapshot restored mid-ramp with the assist active replays hash-equal to the straight run', () => {
    const run = (): { w: BikePhysicsWorldV2; snapAt: number } => {
      const w = createBikePhysics(HZ);
      const a = (20 * Math.PI) / 180;
      w.loadTrack(makeTrack({ profile: [{ x: -30, y: 0 }, { x: 30, y: 0 }, { x: 30 + 6 * Math.cos(a), y: 6 * Math.sin(a) }, { x: 76, y: -2 }, { x: 400, y: -2 }], finishX: 1e9 }), 1, { bike: 'rookie' });
      stepN(w, {}, 60);
      w.teleport({ pos: { x: 24, y: 0.34 }, angle: 0, vel: { x: 10, y: 0 } });
      return { w, snapAt: 90 };
    };
    const a = run();
    stepN(a.w, { throttle: 1 }, a.snapAt);
    expect(a.w.debug().engine.assist).toBeGreaterThan(0);
    const snap = a.w.snapshot();
    const straight = stepN(a.w, { throttle: 1 }, 120);
    const b = run();
    b.w.restore(snap);
    const restored = stepN(b.w, { throttle: 1 }, 120);
    expect(JSON.stringify(restored.bike)).toBe(JSON.stringify(straight.bike));
    expect(restored.wheels.rear.pos).toEqual(straight.wheels.rear.pos);
  });
});
