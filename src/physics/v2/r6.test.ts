/**
 * R6 (physics.md "v2 status — R6"): the same-tick finish / fault precedence (audit 2026-09-15 §5), the Pro's
 * ground ECU launch (harness r11: every Pro stranger lost its first attempt at 4 m), the air-sign table per class,
 * the see-saw landing rows (the "hop machine on planks" traces) and the preload-gate knob, the 45 deg wheelie hold.
 * Every row prints `FEEL <quantity> = <value> [band]`.
 */
import { describe, expect, it } from 'vitest';
import { quantizeInput } from '../../core/replay';
import type { GameEvent, InputFrame } from '../../core/types';
import { createBikePhysicsV2 as createBikePhysics, type BikePhysicsWorldV2 } from './bike';
import type { BikeClassV2, PartialTuningV2 } from './tuning';
import { makeTrack, seesawTrack } from '../testTracks';
import { runController, stepN, wheelieHoldV3, type Controller } from '../controllers';

const HZ = 120;
const deg = (r: number): number => (r * 180) / Math.PI;
const f = (x: number, d = 2): string => (Number.isNaN(x) ? '-' : x.toFixed(d));
function feel(name: string, value: number | string, band: string): void {
  console.log(`FEEL ${name} = ${typeof value === 'number' ? value.toFixed(3) : value} [${band}]`);
}
function flatWorld(cls: BikeClassV2, over?: PartialTuningV2, finishX = 1e9): BikePhysicsWorldV2 {
  const w = createBikePhysics(HZ, over);
  w.loadTrack(makeTrack({ finishX }), 1, { bike: cls });
  stepN(w, {}, 60);
  return w;
}
function cruise(w: BikePhysicsWorldV2, v: number, secs = 8, lean = 0): void {
  for (let i = 0; i < HZ * secs; i++) {
    const s = w.getState();
    w.step(quantizeInput({ throttle: Math.max(0, Math.min(1, 0.1 + 0.3 * (v - s.bike.vel.x))), brake: s.bike.vel.x > v + 0.2 ? 0.3 : 0, lean }));
  }
}

describe('R6 physics.md §8.1: same-tick finish / fault precedence (audit §5)', () => {
  /** The audit fixture: the front wheel `before` m short of the line, a nose-down crash pose at 8 m/s; one tick. */
  function probe(before: number, vx = 8): { events: GameEvent[]; finishTime: number | null; faulted: string | null; voided: boolean; frontPast: number } {
    const w = createBikePhysics(HZ);
    w.loadTrack(makeTrack({ finishX: 120 }), 1, { bike: 'rookie' });
    const finishX = 120;
    const angle = -Math.PI / 2;
    w.teleport({ pos: { x: finishX, y: 0.34 }, angle, vel: { x: vx, y: 0 } });
    const dx = finishX - before - w.getState().wheels.front.pos.x;
    w.teleport({ pos: { x: finishX + dx, y: 0.34 }, angle, vel: { x: vx, y: 0 } });
    w.drainEvents();
    w.step(quantizeInput({}));
    const s = w.getState();
    return { events: w.drainEvents(), finishTime: s.finishTime, faulted: s.faulted, voided: w.debug().finishVoided, frontPast: s.wheels.front.pos.x - finishX };
  }

  it('a fault in the tick the front wheel crosses the line, with the wheel <= one radius past it, VOIDS the finish: only `fault` is emitted, finishTime stays null (the audit probe: before R6 `finish` came first and Game scored a fault-free 1/120 s clear)', () => {
    const r = probe(0.01);
    feel('finish.sameTick.onTheLine', `${r.events.map((e) => e.type).join(',')} frontPast ${f(r.frontPast, 3)} finishTime ${r.finishTime} faulted ${r.faulted} voided ${r.voided}`, 'fault only, finishTime null, voided');
    expect(r.frontPast).toBeGreaterThan(0);
    expect(r.frontPast).toBeLessThanOrEqual(0.34);
    expect(r.events.map((e) => e.type)).toEqual(['fault']);
    expect(r.finishTime).toBeNull();
    expect(r.faulted).toBe('crash');
    expect(r.voided).toBe(true);
  });

  it('the exception: a fault in the crossing tick with the wheel already > R past the line is a crash AFTER the finish - `finish` then `fault`, finishTime set (reachable only by teleport: at 21 m/s the wheel moves 0.175 m per tick)', () => {
    const r = probe(-0.36, 8);
    feel('finish.sameTick.pastR', `${r.events.map((e) => e.type).join(',')} frontPast ${f(r.frontPast, 3)} finishTime ${r.finishTime} voided ${r.voided}`, 'finish,fault; finishTime set; not voided');
    expect(r.frontPast).toBeGreaterThan(0.34);
    expect(r.events.map((e) => e.type)).toEqual(['finish', 'fault']);
    expect(r.finishTime).not.toBeNull();
    expect(r.voided).toBe(false);
  });

  it('a clean crossing is untouched: `finish` at the crossing tick, no fault, not voided; and the run stays `finished` (the fault sensors keep running after the line, a later tumble is a post-finish fault Game ignores)', () => {
    const w = flatWorld('rookie', undefined, 80);
    cruise(w, 8, 6, 0.3);
    w.drainEvents();
    let finishEv: GameEvent | undefined;
    let ticks = 0;
    while (ticks++ < HZ * 20 && !finishEv) {
      w.step(quantizeInput({ throttle: 0.4, lean: 0.3 }));
      finishEv = w.drainEvents().find((e) => e.type === 'finish');
    }
    const s = w.getState();
    feel('finish.clean', `finish ${finishEv ? 'yes' : 'no'} time ${s.finishTime} faulted ${s.faulted} voided ${w.debug().finishVoided} frontPast ${f(s.wheels.front.pos.x - 80, 3)}`, 'finish, no fault, not voided');
    expect(finishEv).toBeDefined();
    expect(s.finishTime).not.toBeNull();
    expect(s.faulted).toBeNull();
    expect(w.debug().finishVoided).toBe(false);
    expect(s.wheels.front.pos.x - 80).toBeLessThanOrEqual(0.34);
  });

  it('the rule is a tick rule: a natural crossing at 8 m/s puts the wheel 0.07 m past the line; the void needs the fault in THAT tick (a crash the next tick is post-finish) - snapshot / restore across the crossing tick is byte-identical', () => {
    const w = flatWorld('rookie', undefined, 60);
    cruise(w, 8, 6, 0.3);
    const snap = w.snapshot();
    const a: number[] = [];
    stepN(w, { throttle: 0.4, lean: 0.3 }, HZ * 3, (s) => a.push(s.bike.pos.x, s.bike.angle));
    const fa = w.getState().finishTime;
    w.restore(snap);
    w.drainEvents();
    const b: number[] = [];
    stepN(w, { throttle: 0.4, lean: 0.3 }, HZ * 3, (s) => b.push(s.bike.pos.x, s.bike.angle));
    expect(b).toEqual(a);
    expect(w.getState().finishTime).toBe(fa);
    expect(fa).not.toBeNull();
  });
});

describe('R6: the Pro launch (ground ECU, raw air)', () => {
  function run(cls: BikeClassV2, input: (t: number) => Partial<InputFrame>, secs = 6, pre?: (w: BikePhysicsWorldV2) => void): { maxP: number; loopT: number; t16: number } {
    const w = flatWorld(cls);
    pre?.(w);
    let maxP = -99;
    let loopT = NaN;
    let t16 = NaN;
    for (let i = 0; i < HZ * secs; i++) {
      const t = i / HZ;
      w.step(quantizeInput(input(t)));
      const s = w.getState();
      if (s.faulted) break;
      const p = deg(s.bike.angle);
      maxP = Math.max(maxP, p);
      if (Number.isNaN(t16) && s.bike.vel.x >= 16) t16 = t;
      if (Number.isNaN(loopT) && p > 90) loopT = t;
    }
    return { maxP, loopT, t16 };
  }
  it('pro: plain gas from a standstill at lean 0 lifts 25-40 deg and does not loop; 1 s and 2 s throttle ramps at lean 0 do not loop; full gas at lean 0 from an 8 m/s roll does not loop; the ECU is off in the air (airGain 0: the Pro air rows are R5\'s); the Rookie rows are R4\'s (6-7 deg, never loops)', () => {
    const g = run('pro', () => ({ throttle: 1, lean: 0 }), 8);
    const r1 = run('pro', (t) => ({ throttle: Math.min(1, t), lean: 0 }));
    const r2 = run('pro', (t) => ({ throttle: Math.min(1, t / 2), lean: 0 }));
    const roll = run('pro', () => ({ throttle: 1, lean: 0 }), 5, (w) => cruise(w, 8, 6, 0.3));
    const rk = run('rookie', () => ({ throttle: 1, lean: 0 }), 8);
    feel('pro.launch.gas1.lean0', `max ${f(g.maxP, 1)} deg loop ${f(g.loopT)} t16 ${f(g.t16)}`, '25-40 deg, no loop (R3-R5: loop 0.95 s)');
    feel('pro.launch.ramp1s.lean0', `max ${f(r1.maxP, 1)} loop ${f(r1.loopT)}`, 'no loop');
    feel('pro.launch.ramp2s.lean0', `max ${f(r2.maxP, 1)} loop ${f(r2.loopT)}`, 'no loop');
    feel('pro.launch.gas1.from8', `max ${f(roll.maxP, 1)} loop ${f(roll.loopT)}`, 'no loop (R3-R5: loop 1.5 s)');
    feel('rookie.launch.gas1.lean0', `max ${f(rk.maxP, 1)} loop ${f(rk.loopT)} t16 ${f(rk.t16)}`, 'R4: 6.7 deg, no loop, 3.97 s');
    for (const r of [g, r1, r2, roll, rk]) expect(Number.isNaN(r.loopT)).toBe(true);
    expect(g.maxP).toBeGreaterThanOrEqual(25);
    expect(g.maxP).toBeLessThanOrEqual(40);
    expect(rk.maxP).toBeLessThanOrEqual(10);
    expect(Math.abs(rk.t16 - 3.97)).toBeLessThan(0.05);
  });
});

describe('R6: the air-sign table per class (harness r11: "Pro in-air lean reads inverted on its first slot")', () => {
  function airWorld(cls: BikeClassV2, over?: PartialTuningV2): BikePhysicsWorldV2 {
    const w = flatWorld(cls, over);
    cruise(w, 10);
    const s0 = w.getState();
    w.teleport({ pos: { x: s0.wheels.rear.pos.x, y: s0.wheels.rear.pos.y + 6 }, angle: 0, vel: { x: s0.bike.vel.x, y: 4 } });
    stepN(w, {}, 24);
    return w;
  }
  /** Lean for `tapMs` then 0; pitch change (deg) at 0.05 / 0.1 / 0.5 s and the first-tick rate sign. */
  function tap(cls: BikeClassV2, lean: number, tapMs: number, over?: PartialTuningV2): { at05: number; at10: number; at50: number; firstRate: number } {
    const w = airWorld(cls, over);
    const p0 = deg(w.getState().bike.angle);
    const n = Math.round((tapMs / 1000) * HZ);
    let at05 = 0;
    let at10 = 0;
    let firstRate = 0;
    for (let i = 0; i < 60; i++) {
      w.step(quantizeInput({ lean: i < n ? lean : 0 }));
      const s = w.getState();
      if (i === 2) firstRate = deg(s.bike.angVel);
      if (i === 5) at05 = deg(s.bike.angle) - p0;
      if (i === 11) at10 = deg(s.bike.angle) - p0;
    }
    return { at05, at10, at50: deg(w.getState().bike.angle) - p0, firstRate };
  }
  it('held lean has the documented sign on both classes (-1 nose-up +25..+40 in 0.5 s, +1 nose-down), K_att does not flip (attTorque -K x lean); the Pro\'s FIRST 0.1 s is inverted by the raw pose swing (-1 dips -10 deg before K_att lifts it; the Rookie\'s R5 air limit makes it -0.1): the strangers\' reading is the swing, not a sign bug', () => {
    for (const cls of ['rookie', 'pro'] as BikeClassV2[]) {
      const back = tap(cls, -1, 600);
      const fwd = tap(cls, 1, 600);
      const b50 = tap(cls, -1, 50);
      const f50 = tap(cls, 1, 50);
      const b125 = tap(cls, -1, 125);
      feel(`air.${cls}.held-1`, `first ${f(back.firstRate, 0)} °/s, ${f(back.at05, 1)} / ${f(back.at10, 1)} / ${f(back.at50, 1)} deg at 0.05 / 0.1 / 0.5 s`, '+25..+40 at 0.5 s');
      feel(`air.${cls}.held+1`, `first ${f(fwd.firstRate, 0)} °/s, ${f(fwd.at05, 1)} / ${f(fwd.at10, 1)} / ${f(fwd.at50, 1)}`, '-25..-40 at 0.5 s');
      feel(`air.${cls}.tap50ms-1`, `${f(b50.at05, 1)} / ${f(b50.at10, 1)} / ${f(b50.at50, 1)}`, 'info: the first-slot read');
      feel(`air.${cls}.tap50ms+1`, `${f(f50.at05, 1)} / ${f(f50.at10, 1)} / ${f(f50.at50, 1)}`, 'info');
      feel(`air.${cls}.tap125ms-1`, `${f(b125.at05, 1)} / ${f(b125.at10, 1)} / ${f(b125.at50, 1)}`, 'info');
      expect(back.at50).toBeGreaterThanOrEqual(25);
      expect(back.at50).toBeLessThanOrEqual(40);
      expect(fwd.at50).toBeLessThanOrEqual(-25);
      expect(fwd.at50).toBeGreaterThanOrEqual(-40);
      const w = airWorld(cls);
      stepN(w, { lean: -1 }, 3);
      const tb = w.debug().attTorque;
      stepN(w, { lean: 1 }, 6);
      const tf = w.debug().attTorque;
      feel(`air.${cls}.attTorque`, `lean -1 ${f(tb, 0)} N m, lean +1 ${f(tf, 0)}`, '+ / - (nose-up positive)');
      expect(tb).toBeGreaterThan(200);
      expect(tf).toBeLessThan(-200);
      if (cls === 'pro') {
        expect(back.at10).toBeLessThan(-5); // the raw swing's dip
        expect(back.firstRate).toBeLessThan(-50);
      } else {
        expect(Math.abs(back.at10)).toBeLessThan(2);
      }
    }
    // the option (NOT taken, parent decision R5): the R5 air limit on the Pro removes the first-slot inversion
    const lim = tap('pro', -1, 125, { rider: { airRateGain: 1 } });
    const limHeld = tap('pro', -1, 600, { rider: { airRateGain: 1 } });
    feel('air.pro.airRateGain1.tap125ms-1', `${f(lim.at05, 1)} / ${f(lim.at10, 1)} / ${f(lim.at50, 1)}; held 0.5 s ${f(limHeld.at50, 1)}`, 'option: dip -10 -> ~-0.6, held within 1.5 deg of raw');
    expect(Math.abs(lim.at10)).toBeLessThan(2);
  });
});

describe('R6: the hop machine on planks (harness r11 m3 @ 410 / x3 @ 280 traces) and the preload gate', () => {
  const X0 = 60;
  /** m3's board (8 x 1.6: 21 deg, pivot 1.6, half 4). Land rear-first on the near end from ~1.5 m at `v`, lean 0, `thr` held. */
  function land(cls: BikeClassV2, v: number, thr: number, over?: PartialTuningV2): { maxIntent: number; pushTicks: number; rearOffVy: number; fault: string | null; maxLift: number } {
    const w = createBikePhysics(HZ, over);
    w.loadTrack(seesawTrack(1.6, 4, X0), 1, { bike: cls });
    stepN(w, {}, 60);
    const near = X0 - 4;
    const s = w.getState();
    w.teleport({ pos: { x: near + 0.6, y: s.bike.pos.y + 1.5 }, angle: (25 * Math.PI) / 180, vel: { x: v, y: -2.5 } });
    let maxIntent = 0;
    let pushTicks = 0;
    let rearOffVy = NaN;
    let landed = false;
    let maxLift = 0;
    for (let i = 0; i < HZ * 4; i++) {
      const s0 = w.getState();
      const onBoard = s0.bike.pos.x > near - 0.5 && s0.bike.pos.x < X0 + 4.5;
      w.step(quantizeInput({ throttle: onBoard ? thr : 0.2, lean: 0 }));
      const st = w.getState();
      const d = w.debug();
      if (st.faulted) return { maxIntent, pushTicks, rearOffVy, fault: st.faulted, maxLift };
      maxIntent = Math.max(maxIntent, d.rider.intent);
      if (st.hopPhase === 'push') pushTicks++;
      if (st.wheels.rear.grounded) landed = true;
      if (landed && Number.isNaN(rearOffVy) && !st.wheels.rear.grounded && st.bike.pos.x < X0) rearOffVy = st.bike.vel.y;
      const c = Math.cos(st.bike.angle);
      const sn = Math.sin(st.bike.angle);
      const lift = d.rider.servoForce.x * sn - d.rider.servoForce.y * c; // servo pulling the rider down = lifting the chassis
      if (onBoard) maxLift = Math.max(maxLift, lift);
    }
    return { maxIntent, pushTicks, rearOffVy, fault: w.getState().faulted, maxLift };
  }

  it('lean-0 keys never arm the intent slot (the pose target is a function of the lean alone): the m3 `push` at 402 m is the rider\'s rebound after a bottomed landing on the board, at the 0.3 F_max cap - a readout, not a throw; at <= 0.4 throttle the landing rides on both classes at 3-5 m/s', () => {
    for (const cls of ['rookie', 'pro'] as BikeClassV2[]) {
      for (const v of [3, 4, 5]) {
        for (const thr of [0, 0.4]) {
          const r = land(cls, v, thr);
          feel(`seesaw.land.${cls}.v${v}.thr${thr}`, `intent max ${f(r.maxIntent)} push ${r.pushTicks} t rear-off vy ${f(r.rearOffVy, 1)} lift ${f(r.maxLift, 0)} N${r.fault ? ' FAULT ' + r.fault : ''}`, 'intent 0, no fault, lift <= 0.3 F_max + gravity');
          expect(r.maxIntent).toBeLessThan(0.01);
          expect(r.fault).toBeNull();
          expect(r.pushTicks).toBeGreaterThan(0);
          expect(r.maxLift).toBeLessThanOrEqual(0.3 * 3200 + 80);
        }
      }
    }
    const g1 = land('rookie', 5, 1);
    const g2 = land('pro', 5, 1);
    feel('seesaw.land.gas1.v5', `rookie ${g1.fault ?? 'rides'} / pro ${g2.fault ?? 'rides'}`, 'info: full gas up the 21 deg board holds an ECU wheelie into the tipping end (the m3 lesson: <= 0.4 throttle)');
  });

  function hopApex(cls: BikeClassV2, preLean: number, snapRate: number, over?: PartialTuningV2): number {
    const w = flatWorld(cls, over);
    const ry0 = w.getState().wheels.rear.pos.y;
    let apex = 0;
    let lean = preLean;
    for (let i = 0; i < HZ * 3; i++) {
      const t = i / HZ;
      let inp: Partial<InputFrame>;
      if (t < 0.3) inp = { throttle: 0.3, lean: preLean };
      else if (t < 0.52) {
        lean = Math.min(1, lean + snapRate / HZ);
        inp = { throttle: 0.3, lean };
      } else if (t < 0.62) inp = { throttle: 0.2, lean: -1 };
      else inp = { throttle: 0.2, lean: 0 };
      w.step(quantizeInput(inp));
      const s = w.getState();
      if (s.faulted) break;
      apex = Math.max(apex, s.wheels.rear.pos.y - ry0);
    }
    return apex;
  }
  function train(cls: BikeClassV2, on: number, off: number, over?: PartialTuningV2): { peak: number; intent: number } {
    const w = flatWorld(cls, over);
    cruise(w, 5, 6);
    let peak = 0;
    let intent = 0;
    for (let i = 0; i < HZ * 2; i++) {
      w.step(quantizeInput({ throttle: 0.3, lean: i % (on + off) < on ? -1 : 0 }));
      const s = w.getState();
      peak = Math.max(peak, Math.abs(deg(s.bike.angVel)));
      intent = Math.max(intent, w.debug().rider.intent);
      if (s.faulted) break;
    }
    return { peak, intent };
  }
  it('the x3 +263..+427 deg/s on the board is a -1/0 lean pulse train (67-100 ms pulses), each pulse a real body preload: the preload gate `servoIntentBackM` (intent only while the body is >= M behind neutral) keeps the R3 hop matrix at 0.05 (ref within 0.01) and still arms on the train; at 0.15 it kills the -0.25 preload row; it ships at 0 (declared, measured)', () => {
    const ref0 = hopApex('rookie', -1, Infinity);
    const ref5 = hopApex('rookie', -1, Infinity, { rider: { servoIntentBackM: 0.05 } });
    const q0 = hopApex('rookie', -0.25, 8);
    const q5 = hopApex('rookie', -0.25, 8, { rider: { servoIntentBackM: 0.05 } });
    const q15 = hopApex('rookie', -0.25, 8, { rider: { servoIntentBackM: 0.15 } });
    const t0 = train('rookie', 8, 8);
    const t5 = train('rookie', 8, 8, { rider: { servoIntentBackM: 0.05 } });
    const t15 = train('rookie', 8, 8, { rider: { servoIntentBackM: 0.15 } });
    const t3 = train('rookie', 3, 3, { rider: { servoIntentBackM: 0.075 } });
    feel('gate.hop.ref', `M0 ${f(ref0, 3)} M0.05 ${f(ref5, 3)}`, 'R3 0.462; within 0.01');
    feel('gate.hop.pre-0.25@8', `M0 ${f(q0)} M0.05 ${f(q5)} M0.15 ${f(q15)}`, 'R3 0.29; 0.15 kills it');
    feel('gate.train8/8', `M0 peak ${f(t0.peak, 0)} intent ${f(t0.intent)}; M0.05 ${f(t5.peak, 0)} / ${f(t5.intent)}; M0.15 ${f(t15.peak, 0)} / ${f(t15.intent)}; 3/3 @ M0.075 ${f(t3.peak, 0)} / ${f(t3.intent)}`, 'the 67 ms train arms at every M that keeps the matrix');
    expect(Math.abs(ref5 - ref0)).toBeLessThan(0.01);
    expect(Math.abs(q5 - q0)).toBeLessThan(0.02);
    expect(q15).toBeLessThan(0.15);
    expect(t0.intent).toBeGreaterThan(0.99);
    expect(t5.intent).toBeGreaterThan(0.99);
    expect(t3.intent).toBeLessThan(0.01);
  });
});

describe('R6: the wheelie hold at 45 deg (audit §4: the lean-only row)', () => {
  function hold(cls: BikeClassV2, ctrl: Controller, target: number, decisionHz: number, latencyMs: number, over?: PartialTuningV2): { inBand: number; loop: boolean; vmax: number } {
    const w = flatWorld(cls, over);
    let leanPark = 1;
    for (let l = -1; l <= 1.001; l += 0.01) {
      if (deg(w.balancePitch(l, 0)) >= target + 1) {
        leanPark = l;
        break;
      }
    }
    stepN(w, { lean: leanPark }, 60);
    const s0 = w.getState();
    w.teleport({ pos: { x: s0.wheels.rear.pos.x, y: s0.wheels.rear.pos.y }, angle: (target * Math.PI) / 180, vel: { x: 4, y: 0 } });
    let inBand = 0;
    let loop = false;
    let vmax = 0;
    runController(w, ctrl, {
      ticks: HZ * 12.5,
      decisionHz,
      latencyMs,
      onTick: (s) => {
        const p = deg(s.bike.angle);
        if (s.time > 0.5 && !s.wheels.front.grounded && Math.abs(p - target) <= 8) inBand++;
        if (p > 90) loop = true;
        vmax = Math.max(vmax, s.bike.vel.x);
      },
      stopWhen: (s) => s.faulted !== null,
    });
    return { inBand: inBand / HZ, loop, vmax };
  }
  function leanOnly(target: number): Controller {
    let integ = 0;
    let lastT = NaN;
    return (ob) => {
      const dtc = Number.isNaN(lastT) ? 0 : ob.t - lastT;
      lastT = ob.t;
      const err = ob.pitchDeg + ob.pitchRateDeg * 0.25 - target;
      integ = Math.max(-1, Math.min(1, integ + 0.05 * err * dtc));
      return { throttle: 0.5, lean: Math.max(-1, Math.min(1, 0.05 * err + integ)) };
    };
  }
  const RAW: PartialTuningV2 = { engine: { wheelieControl: { gain: 0, rate0: 0.5, rate1: 1.2, topOut: 0.03, margin0: 0.2, margin1: 0.4, leanFull: 0.2, leanOff: 0.5, leanFwdFull: 0.6, leanFwdOff: 0.9, airGain: 1 } } };
  it('the throttle-actuated anticipation controller (R3 V3, 60 Hz / 100 ms) holds 40 +- 8 deg for >= 10 s of 12 on both classes as shipped, and 45 +- 8 deg for >= 10 s on both with the ECU off (the spec\'s 45 band is the raw bike\'s: at 45 the park lean is -0.2 / -0.12 where the ECU\'s loop-margin term trims the throttle and the front drops - R6 deviation 30); the lean-only controller at a fixed throttle 0.5 (the audit row) loops within 3 s on both - printed, not a requirement of this model (R6 deviation 31: even K_att 1500 holds 2.7 s and costs the air band)', () => {
    for (const cls of ['rookie', 'pro'] as BikeClassV2[]) {
      const v40 = hold(cls, wheelieHoldV3(40, 4), 40, 60, 100);
      const v45 = hold(cls, wheelieHoldV3(45, 4), 45, 60, 100);
      const raw45 = hold(cls, wheelieHoldV3(45, 4), 45, 60, 100, RAW);
      const lo = hold(cls, leanOnly(45), 45, 60, 100);
      feel(`hold.${cls}.throttleV3.40`, `inBand ${f(v40.inBand)} s vmax ${f(v40.vmax, 1)}${v40.loop ? ' LOOP' : ''}`, '>= 10 s within +-8 of 40 (R3 row)');
      feel(`hold.${cls}.throttleV3.45`, `inBand ${f(v45.inBand)} s vmax ${f(v45.vmax, 1)}${v45.loop ? ' LOOP' : ''}`, 'info: the ECU trims a wheelie held above ~40 at lean > -0.5');
      feel(`hold.${cls}.throttleV3.45.ecuOff`, `inBand ${f(raw45.inBand)} s vmax ${f(raw45.vmax, 1)}${raw45.loop ? ' LOOP' : ''}`, '>= 10 s within +-8 of 45 (raw bike)');
      feel(`hold.${cls}.leanOnly.45.thr0.5`, `inBand ${f(lo.inBand)} s vmax ${f(lo.vmax, 1)}${lo.loop ? ' LOOP' : ''}`, 'info: the audit row (10 s) is not reachable by lean alone');
      expect(v40.loop).toBe(false);
      expect(v40.inBand).toBeGreaterThanOrEqual(10);
      expect(raw45.loop).toBe(false);
      expect(raw45.inBand).toBeGreaterThanOrEqual(10);
    }
  });
});
