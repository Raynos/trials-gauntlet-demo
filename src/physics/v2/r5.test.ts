/**
 * R5 rows (physics.md "v2 status - R5"): the Rookie's airborne target-rate limit (`rider.airRate*`). With both wheels
 * off the ground the pose target's travel rate falls from 5 m/s to 0.8 m/s (blended over 0.1 s, gated by the R3 intent
 * so a throw that began on the ground carries through); the Pro (gain 0) is raw. Every row prints `FEEL <quantity> =
 * <value> [band]`.
 */
import { describe, expect, it } from 'vitest';
import { createBikePhysicsV2 as createBikePhysics, type BikePhysicsWorldV2 } from './bike';
import { BIKE_CLASSES_V2, type BikeClassV2, type PartialTuningV2 } from './tuning';
import { makeTrack } from '../testTracks';
import { stepN } from '../controllers';
import { quantizeInput } from '../../core/replay';

const HZ = 120;
const DEG = 180 / Math.PI;
const f = (x: number, d = 1): string => (Number.isNaN(x) ? 'nan' : x.toFixed(d));
function feel(name: string, value: number | string, band: string): void {
  console.log(`FEEL ${name} = ${typeof value === 'number' ? value.toFixed(3) : value} [${band}]`);
}
type In = Partial<{ throttle: number; brake: number; lean: number }>;

/** The R5 limit off: the R4 (raw) Rookie. */
const AIR_RAW: PartialTuningV2 = { rider: { airRateGain: 0 } };

/** R4's free-air bench: level at 10 m/s, 6 m up, `pre` for 0.2 s, then `post` for 0.5 s. */
function air(cls: BikeClassV2, pre: In, post: In, over?: PartialTuningV2): { peakRate: number; peakStep: number; ang03: number; ang05: number; rate05: number; limMax: number; limMin: number } {
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
  let ang03 = 0;
  let tk = 0;
  let limMax = 0;
  let limMin = 1;
  const s = stepN(w, post, 60, (st) => {
    tk++;
    const r = st.bike.angVel * DEG;
    if (Math.abs(r) > Math.abs(peakRate)) peakRate = r;
    if (Math.abs(r - prev) > Math.abs(peakStep)) peakStep = r - prev;
    prev = r;
    if (tk === 36) ang03 = (st.bike.angle - a0) * DEG;
    const lim = w.debug().rider.airLimited;
    limMax = Math.max(limMax, lim);
    limMin = Math.min(limMin, lim);
  });
  return { peakRate, peakStep, ang03, ang05: (s.bike.angle - a0) * DEG, rate05: s.bike.angVel * DEG, limMax, limMin };
}

function flatWorld(cls: BikeClassV2, over?: PartialTuningV2): BikePhysicsWorldV2 {
  const w = createBikePhysics(HZ, over);
  w.loadTrack(makeTrack({ finishX: 1e9 }), 1, { bike: cls });
  stepN(w, {}, 60);
  return w;
}

/** The R3 hop (0.3 s preload at `preLean`, the lean ramping to +1 at `snapRate` units/s and held `snapS`, 0.1 s tuck): rear apex. */
function hopApex(cls: BikeClassV2, preLean: number, snapRate: number, over?: PartialTuningV2): number {
  const P = 0.3;
  const snapS = snapRate === Infinity ? 0.22 : Math.max(0.22, 2 / snapRate);
  const w = flatWorld(cls, over);
  const ry0 = w.getState().wheels.rear.pos.y;
  let apex = 0;
  let lean = preLean;
  for (let i = 0; i < HZ * 3; i++) {
    const t = i / HZ;
    let inp: In;
    if (t < P) inp = { throttle: 0.3, lean: preLean };
    else if (t < P + snapS) {
      lean = Math.min(1, lean + snapRate / HZ);
      inp = { throttle: 0.3, lean };
    } else if (t < P + snapS + 0.1) inp = { throttle: 0.2, lean: -1 };
    else inp = { throttle: 0.2, lean: 0 };
    w.step(quantizeInput(inp));
    apex = Math.max(apex, w.getState().wheels.rear.pos.y - ry0);
  }
  return apex;
}

/** Flat drop of `h` m at `v` m/s, level, `lean` held from release through the landing (R3's `drop`). */
function drop(cls: BikeClassV2, h: number, v: number, lean: number, over?: PartialTuningV2, seconds = 3): { maxRear: number; minPitch: number; maxPitch: number; fault: string | null; rebound: number; limAtLand: number; limTrace: number[] } {
  const w = flatWorld(cls, over);
  const s0 = w.getState();
  w.teleport({ pos: { x: s0.wheels.rear.pos.x, y: s0.wheels.rear.pos.y + h }, angle: (5 * Math.PI) / 180, vel: { x: v, y: 0 } });
  let maxRear = 0;
  let minPitch = 99;
  let maxPitch = -99;
  let landed = false;
  let rebound = 0;
  let y0 = NaN;
  let limAtLand = NaN;
  const limTrace: number[] = [];
  const s = stepN(w, { throttle: 0.2, lean }, Math.round(HZ * seconds), (st) => {
    const g = st.wheels.rear.grounded || st.wheels.front.grounded;
    const lim = w.debug().rider.airLimited;
    limTrace.push(lim);
    if (g && !landed) {
      landed = true;
      limAtLand = lim;
    }
    if (landed) {
      maxRear = Math.max(maxRear, st.wheels.rear.compression);
      minPitch = Math.min(minPitch, st.bike.angle * DEG);
      maxPitch = Math.max(maxPitch, st.bike.angle * DEG);
      if (Number.isNaN(y0)) y0 = st.wheels.rear.pos.y;
      rebound = Math.max(rebound, st.wheels.rear.pos.y - y0);
    }
  });
  return { maxRear, minPitch, maxPitch, fault: s.faulted, rebound, limAtLand, limTrace };
}

describe('R5: the Rookie air limit (rider.airRate*) - the pose swing in free air is rate-limited, the throw on the ground is not', () => {
  it('Rookie, free air at 10 m/s: releasing lean -1 -> 0 kicks <= 120 deg/s (R4: +245) in steps <= 15 deg/s per tick (R4: 43); with gas on top <= 125; the limit reads 1 on the HUD. The held-lean rows are K_att\'s and move little (0 -> -1: rate at 0.5 s 171 -> ~153, angle 33 -> ~31)', () => {
    const rel = air('rookie', { lean: -1 }, { lean: 0 });
    const relRaw = air('rookie', { lean: -1 }, { lean: 0 }, AIR_RAW);
    const gas = air('rookie', { lean: -1 }, { lean: 0, throttle: 1 });
    const press = air('rookie', {}, { lean: -1 });
    const pressRaw = air('rookie', {}, { lean: -1 }, AIR_RAW);
    const fwd = air('rookie', {}, { lean: 1 });
    feel('r5.rookie.release-1to0', `peak ${f(rel.peakRate, 0)} deg/s (raw ${f(relRaw.peakRate, 0)}) step ${f(rel.peakStep, 0)}/tick (raw ${f(relRaw.peakStep, 0)}) angle ${f(rel.ang03)} @0.3s (raw ${f(relRaw.ang03)}) ${f(rel.ang05)} @0.5s lim ${f(rel.limMax, 2)}`, 'peak <= 120, step <= 15; angle @0.3 <= 15 asked (K_att momentum: not met)');
    feel('r5.rookie.release+gas', `peak ${f(gas.peakRate, 0)} angle ${f(gas.ang05)} @0.5s`, 'peak <= 125');
    feel('r5.rookie.press0to-1', `peak ${f(press.peakRate, 0)} rate@0.5 ${f(press.rate05, 0)} (raw ${f(pressRaw.rate05, 0)}) angle@0.5 ${f(press.ang05)} (raw ${f(pressRaw.ang05)})`, 'rate <= 110 / angle <= 22 asked (K_att: not met)');
    feel('r5.rookie.press0to+1', `peak ${f(fwd.peakRate, 0)} rate@0.5 ${f(fwd.rate05, 0)} angle@0.5 ${f(fwd.ang05)}`, 'info');
    expect(rel.peakRate).toBeLessThanOrEqual(120);
    expect(rel.peakRate).toBeGreaterThan(60);
    expect(Math.abs(rel.peakStep)).toBeLessThanOrEqual(15);
    expect(relRaw.peakRate).toBeGreaterThan(200);
    expect(gas.peakRate).toBeLessThanOrEqual(125);
    expect(rel.limMax).toBeGreaterThan(0.99);
    expect(rel.limMin).toBeGreaterThan(0.99);
    // the held rows: bounded by K_att, the limit takes ~10 % off
    expect(press.rate05).toBeLessThan(pressRaw.rate05);
    expect(press.rate05).toBeGreaterThan(130);
  });

  it('Pro stays raw: gain 0, the limit reads 0 through the flight, the release kick is R4\'s 200-300 deg/s', () => {
    const rel = air('pro', { lean: -1 }, { lean: 0 });
    feel('r5.pro.release-1to0', `peak ${f(rel.peakRate, 0)} step ${f(rel.peakStep, 0)}/tick lim ${f(rel.limMax, 2)}`, 'raw: 200-300, lim 0');
    expect(rel.peakRate).toBeGreaterThan(200);
    expect(rel.peakRate).toBeLessThan(300);
    expect(rel.limMax).toBe(0);
  });

  it('the throttle / brake air nudges are untouched on both classes (throttle +4..12 deg per 0.5 s, brake -8..-25): the limit is on the rider, not the wheels', () => {
    for (const cls of BIKE_CLASSES_V2) {
      const t = air(cls, {}, { throttle: 1 });
      const b = air(cls, {}, { brake: 1 });
      const tRaw = air(cls, {}, { throttle: 1 }, AIR_RAW);
      const bRaw = air(cls, {}, { brake: 1 }, AIR_RAW);
      feel(`r5.${cls}.nudges`, `throttle ${f(t.ang05)} (raw ${f(tRaw.ang05)}) brake ${f(b.ang05)} (raw ${f(bRaw.ang05)}) @0.5s`, 'identical to raw');
      expect(t.ang05).toBeCloseTo(tRaw.ang05, 3);
      expect(b.ang05).toBeCloseTo(bRaw.ang05, 3);
    }
  });

  it('grounded rows hold: the reference hop (snap ramping past take-off) and the landing table are identical with the limit on and off (the intent gate carries a ground-started throw through the air; a still target at landing keeps the R3 cap)', () => {
    for (const [preLean, rate] of [[-1, Infinity], [-1, 8], [-0.5, 16]] as const) {
      const on = hopApex('rookie', preLean, rate);
      const off = hopApex('rookie', preLean, rate, AIR_RAW);
      feel(`r5.hop.${preLean}@${rate}.on/off`, `${f(on, 3)} / ${f(off, 3)}`, 'equal to 3 decimals (R3 matrix)');
      expect(on).toBeCloseTo(off, 3);
      expect(on).toBeGreaterThanOrEqual(0.38);
    }
    for (const [h, v, lean] of [[1.5, 6, 0], [2, 12, 0], [3, 6, 0.5]] as const) {
      const a = drop('rookie', h, v, lean);
      const b = drop('rookie', h, v, lean, AIR_RAW);
      feel(`r5.land.${h}m@${v}.lean${lean}`, `rear ${f(a.maxRear * 100, 0)}% pitch ${f(a.minPitch, 0)}..${f(a.maxPitch, 0)} rebound ${f(a.rebound, 2)} ${a.fault ?? 'rides'} | raw rear ${f(b.maxRear * 100, 0)}% rebound ${f(b.rebound, 2)}`, 'R3 landing table, identical');
      expect(a.fault).toBeNull();
      expect(a.maxRear).toBeCloseTo(b.maxRear, 2);
      expect(a.rebound).toBeCloseTo(b.rebound, 2);
      expect(Math.abs(a.minPitch - b.minPitch)).toBeLessThan(0.5);
    }
  });

  it('continuous: the limit blends in over 0.1 s of both-wheels-off and out over 0.1 s after the first touch - never a step > dt/0.1 per tick; a lean pressed while airborne is limited from its first tick (no escalation through the travel it allows)', () => {
    // 2 m at 8 m/s, lean -0.5 held: 0.64 s of air, then 0.5 s on the ground (held longer, -0.5 loops the Rookie - R3)
    const d = drop('rookie', 2, 8, -0.5, undefined, 1.2);
    let maxStep = 0;
    for (let i = 1; i < d.limTrace.length; i++) maxStep = Math.max(maxStep, Math.abs(d.limTrace[i]! - d.limTrace[i - 1]!));
    const peak = Math.max(...d.limTrace);
    feel('r5.blend', `peak ${f(peak, 2)} max step/tick ${f(maxStep, 3)} at landing ${f(d.limAtLand, 2)} -> 0 after`, 'step <= 1/12 + eps; peak 1');
    // 0.96, not 1: the tick after a teleport counts as grounded (the air counters are zeroed), so the lean's first
    // 4 cm of travel earns intent 0.83 that decays with the 0.2 s tau through the flight - a bench artefact
    expect(peak).toBeGreaterThan(0.9);
    expect(maxStep).toBeLessThanOrEqual(1 / 12 + 1e-9);
    expect(d.limTrace[d.limTrace.length - 1]).toBe(0);
    // a pose pressed in free air stays limited: peak rate of a 0 -> -1 press with a still target is < the raw dip
    const press = air('rookie', {}, { lean: -1 });
    const raw = air('rookie', {}, { lean: -1 }, AIR_RAW);
    expect(Math.abs(press.peakStep)).toBeLessThan(0.5 * Math.abs(raw.peakStep));
    expect(press.limMin).toBeGreaterThan(0.99);
  });

  it('nothing hidden: a snapshot taken mid-flight with the limit in and a lean change under way replays hash-equal to the straight run through the landing (airLimit is in F; the foreign-snapshot suite covers the rest)', () => {
    const run = (): BikePhysicsWorldV2 => {
      const w = flatWorld('rookie');
      const s0 = w.getState();
      w.teleport({ pos: { x: s0.wheels.rear.pos.x, y: s0.wheels.rear.pos.y + 2.5 }, angle: 0, vel: { x: 8, y: 0 } });
      return w;
    };
    const a = run();
    stepN(a, { lean: -1 }, 30);
    stepN(a, { lean: 0.5 }, 6);
    expect(a.debug().rider.airLimited).toBeGreaterThan(0.5);
    const snap = a.snapshot();
    const straight = stepN(a, { lean: 0.5, throttle: 0.3 }, 180);
    const b = run();
    stepN(b, { lean: 1, throttle: 1 }, 50); // a different history before the restore
    b.restore(snap);
    const restored = stepN(b, { lean: 0.5, throttle: 0.3 }, 180);
    expect(JSON.stringify(restored.bike)).toBe(JSON.stringify(straight.bike));
    expect(restored.wheels.rear.pos).toEqual(straight.wheels.rear.pos);
    expect(restored.faulted).toBe(straight.faulted);
  });

  it('the beginner\'s panic (1.5 m ledge, lean -1 held from the edge through the landing) is NOT the servo\'s: the swing happens with the rear still on the ledge, then K_att holds +300 N m through 0.45 s of air and the rear-first landing at 100 % travel loops - a crash on both classes with the limit on or off; lean -0.5 held rides away (measured for the parent)', () => {
    const ledge = (cls: BikeClassV2, lean: number, v: number, over?: PartialTuningV2): { fault: string | null; landPitch: number; landRate: number; limMax: number } => {
      const w = createBikePhysics(HZ, over);
      const edge = 40;
      w.loadTrack(makeTrack({ profile: [{ x: -30, y: 0 }, { x: edge, y: 0 }, { x: edge + 0.001, y: -1.5 }, { x: 400, y: -1.5 }], finishX: 1e9 }), 1, { bike: cls });
      stepN(w, {}, 60);
      w.teleport({ pos: { x: 20, y: 0.34 }, angle: 0, vel: { x: v, y: 0 } });
      let st = w.getState();
      let guard = 0;
      while (st.wheels.rear.pos.x < edge - 0.3 && guard++ < 2000) st = stepN(w, { throttle: st.bike.vel.x < v ? 0.6 : 0 }, 1);
      let airT = 0;
      let landed = false;
      let landPitch = NaN;
      let landRate = NaN;
      let limMax = 0;
      const s = stepN(w, { throttle: 0.2, lean }, HZ * 3, (q) => {
        const both = !q.wheels.rear.grounded && !q.wheels.front.grounded;
        limMax = Math.max(limMax, w.debug().rider.airLimited);
        if (!landed && both) airT++;
        if (!landed && airT > 6 && !both) {
          landed = true;
          landPitch = q.bike.angle * DEG;
          landRate = q.bike.angVel * DEG;
        }
      });
      return { fault: s.faulted, landPitch, landRate, limMax };
    };
    for (const cls of BIKE_CLASSES_V2) {
      const p = ledge(cls, -1, 10);
      const pRaw = ledge(cls, -1, 10, AIR_RAW);
      const half = ledge(cls, -0.5, 10);
      const zero = ledge(cls, 0, 10);
      feel(`r5.panic.${cls}.lean-1@10`, `lands ${f(p.landPitch, 0)} deg at ${f(p.landRate, 0)} deg/s -> ${p.fault ?? 'rides'} (raw: ${f(pRaw.landPitch, 0)} / ${f(pRaw.landRate, 0)} -> ${pRaw.fault ?? 'rides'}) lim ${f(p.limMax, 2)}`, 'measured: crash either way (K_att), not the servo');
      feel(`r5.panic.${cls}.lean-0.5/0@10`, `${f(half.landPitch, 0)} deg / ${f(half.landRate, 0)} deg/s -> ${half.fault ?? 'rides'} | lean 0: ${f(zero.landPitch, 0)} / ${f(zero.landRate, 0)} -> ${zero.fault ?? 'rides'}`, 'rides away');
      expect(p.fault).toBe(pRaw.fault);
      expect(Math.abs(p.landRate - pRaw.landRate)).toBeLessThan(5);
      expect(half.fault).toBeNull();
      expect(zero.fault).toBeNull();
    }
  });

  it('cost: a limited flight and its landing tick at <= 5 us/tick p50 (node, shared host)', () => {
    const w = flatWorld('rookie');
    const s0 = w.getState();
    w.teleport({ pos: { x: s0.wheels.rear.pos.x, y: s0.wheels.rear.pos.y + 3 }, angle: 0, vel: { x: 8, y: 0 } });
    const times: number[] = [];
    for (let i = 0; i < 360; i++) {
      const t0 = performance.now();
      w.step({ throttle: i > 200 ? 0.5 : 0, brake: 0, lean: i < 40 ? -1 : i < 120 ? 0.5 : 0, restart: false });
      times.push((performance.now() - t0) * 1000);
    }
    times.sort((a, b) => a - b);
    const p50 = times[Math.floor(times.length * 0.5)]!;
    feel('r5.cost.usPerTick.p50', p50, '<= 5');
    expect(p50).toBeLessThanOrEqual(5);
  });
});
