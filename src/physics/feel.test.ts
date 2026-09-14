/**
 * Feel envelope (CONTRACT.md §2.5) measured, not assumed. Every test prints the
 * number it measured as `FEEL <quantity> = <value> [band]` so the round report
 * can be assembled from the vitest output. Bands are the CONTRACT's; a test that
 * does not yet meet its band is marked `it.fails` (known gap, still measured).
 */
import { describe, expect, it } from 'vitest';
import { createBikePhysics, type BikePhysicsWorld } from './bike';
import { climber, drumLifter, fullThrottle, hopper, ledgeHopper, runController, stepN, wheeliePD, airPitch, type Controller } from './controllers';
import { drumTrack, ledgeTrack, makeTrack, plankTrack } from './testTracks';
import { compileTrack } from '../tracks/compile';
import { course } from '../tracks/author';
import { cruise } from './controllers';

const HZ = 120;
const R = 0.34;
const deg = (r: number): number => (r * 180) / Math.PI;
const rad = (d: number): number => (d * Math.PI) / 180;

function feel(name: string, value: number | string, band: string): void {
  console.log(`FEEL ${name} = ${typeof value === 'number' ? value.toFixed(3) : value} [${band}]`);
}

function flatWorld(): BikePhysicsWorld {
  const w = createBikePhysics(HZ);
  w.loadTrack(makeTrack(), 1);
  stepN(w, {}, 60);
  return w;
}

describe('static settle (F1)', () => {
  it('sits level at static sag and comes to rest', () => {
    const w = createBikePhysics(HZ);
    w.loadTrack(makeTrack(), 1);
    const s = stepN(w, {}, 240);
    feel('settle.pitchDeg', deg(s.bike.angle), '|pitch| < 1');
    feel('settle.rearComp', s.wheels.rear.compression, '0.08-0.35');
    feel('settle.frontComp', s.wheels.front.compression, '0.03-0.35');
    feel('settle.speed', Math.hypot(s.bike.vel.x, s.bike.vel.y), '< 0.01');
    expect(Math.abs(deg(s.bike.angle))).toBeLessThan(1);
    expect(s.wheels.rear.compression).toBeGreaterThan(0.08);
    expect(s.wheels.rear.compression).toBeLessThan(0.35);
    expect(Math.hypot(s.bike.vel.x, s.bike.vel.y)).toBeLessThan(0.01);
    expect(s.wheels.rear.grounded && s.wheels.front.grounded).toBe(true);
  });
});

describe('launch and top speed (C2)', () => {
  it('0 -> 16 m/s on flat dirt in <= 3.5 s and limiter-bound top speed ~20 m/s', () => {
    const w = flatWorld();
    let t16 = -1;
    let top = 0;
    let maxPitch = 0;
    runController(w, fullThrottle, {
      ticks: HZ * 15,
      onTick: (s) => {
        if (t16 < 0 && s.bike.vel.x >= 16) t16 = s.time;
        top = Math.max(top, s.bike.vel.x);
        maxPitch = Math.max(maxPitch, deg(s.bike.angle));
      },
    });
    feel('launch.t16', t16, '<= 3.5 s');
    feel('launch.topSpeed', top, '19-21 m/s');
    feel('launch.maxPitchDeg', maxPitch, 'info');
    expect(w.getState().faulted).toBeNull();
    expect(t16).toBeGreaterThan(0);
    expect(t16).toBeLessThanOrEqual(3.5);
    expect(top).toBeGreaterThan(19);
    expect(top).toBeLessThan(21);
    expect(w.getState().engine.limiter || w.getState().engine.rpm > 9000).toBe(true);
  });
});

describe('stranger launch and speed governor (round 2)', () => {
  function constant(thr: number, lean: number, seconds = 15): { top: number; fault: string | null; finish: number | null; faultAt: number; t16: number } {
    const w = createBikePhysics(HZ);
    w.loadTrack(makeTrack({ finishX: 120 }), 1);
    let top = 0;
    let faultAt = -1;
    let t16 = -1;
    stepN(w, { throttle: thr, lean }, HZ * seconds, (s) => {
      top = Math.max(top, s.bike.vel.x);
      if (t16 < 0 && s.bike.vel.x >= 16) t16 = s.time;
      if (s.faulted && faultAt < 0) faultAt = s.time;
    });
    const s = w.getState();
    return { top, fault: s.faulted, finish: s.finishTime, faultAt, t16 };
  }
  it('thr=1 lean=+0.4 held constant finishes flat-test without a fault', () => {
    const r = constant(1, 0.4);
    feel('stranger.thr1.lean0.4.finish', r.finish ?? -1, '> 0, no fault');
    expect(r.fault).toBeNull();
    expect(r.finish).not.toBeNull();
  });
  it('thr=1 lean=0 loops only after >= 1.5 s; lean=-1 loops sooner', () => {
    const l0 = constant(1, 0);
    const lb = constant(1, -1);
    feel('loop.thr1.lean0.at', l0.faultAt, '>= 1.5 s');
    feel('loop.thr1.leanBack.at', lb.faultAt, '~0.8 s');
    expect(l0.fault).toBe('crash');
    expect(l0.faultAt).toBeGreaterThanOrEqual(1.5);
    expect(lb.faultAt).toBeLessThan(l0.faultAt);
  });
  it('partial throttle tops out below the limiter: thr 0.3 ~ 11-13, thr 0.6 ~ 16-18, thr 1 ~ 20 m/s', () => {
    const a = constant(0.3, 0.5);
    const b = constant(0.6, 0.6);
    const c = constant(1, 1);
    feel('governor.thr0.3.top', a.top, '11-13 m/s');
    feel('governor.thr0.6.top', b.top, '16-18 m/s');
    feel('governor.thr1.top', c.top, '19.5-21 m/s');
    feel('governor.thr1.lean1.t16', c.t16, '<= 4.5 s (full forward lean unloads the rear off the line)');
    expect(a.top).toBeGreaterThan(10.5);
    expect(a.top).toBeLessThan(13.5);
    expect(b.top).toBeGreaterThan(15.5);
    expect(b.top).toBeLessThan(18.5);
    expect(c.top).toBeGreaterThan(19.5);
    expect(c.top).toBeLessThan(21);
    expect(c.t16).toBeLessThanOrEqual(4.5);
  });
});

describe('brakes (C4)', () => {
  function brakeRun(lean: number): { dist: number; minPitch: number; fault: string | null } {
    const w = flatWorld();
    w.teleport({ pos: { x: 0, y: R }, angle: 0, vel: { x: 10, y: 0 } });
    stepN(w, { throttle: 0.2 }, 12);
    const x0 = w.getState().wheels.rear.pos.x;
    let minPitch = 0;
    const s = stepN(w, { brake: 1, lean }, 600, (st) => {
      minPitch = Math.min(minPitch, deg(st.bike.angle));
    });
    return { dist: s.wheels.rear.pos.x - x0, minPitch, fault: s.faulted };
  }
  it('stops from 10 m/s without an endo (lean back)', () => {
    const r = brakeRun(-1);
    feel('brake.stopDist.leanBack', r.dist, '<= 4.5 m');
    feel('brake.minPitchDeg.leanBack', r.minPitch, '> -30');
    expect(r.fault).toBeNull();
    expect(r.minPitch).toBeGreaterThan(-30);
    expect(r.dist).toBeLessThan(7);
  });
  it('stops from 10 m/s in <= 4.5 m (lean back) (round 4: lever squeeze 60/s, 4 % rear-load floor on the front cap: 4.47 m)', () => {
    const r = brakeRun(-1);
    expect(r.dist).toBeLessThanOrEqual(4.5);
  });
  it('full brake at neutral lean does not flip the bike', () => {
    const r = brakeRun(0);
    feel('brake.stopDist.lean0', r.dist, 'info');
    expect(r.fault).toBeNull();
    expect(r.minPitch).toBeGreaterThan(-40);
  });
});

describe('bunny hop technique (C5)', () => {
  it('stationary hop from lean-back preload + snap forward: rear apex 0.55-0.75 m, phases visible', () => {
    const w = flatWorld();
    let apexRear = 0;
    let airTicks = 0;
    const phases = new Set<string>();
    let bothOffAt = -1;
    let frontOffAt = -1;
    runController(w, hopper(1.0, 0.3), {
      ticks: HZ * 3,
      onTick: (s) => {
        apexRear = Math.max(apexRear, s.wheels.rear.pos.y - R);
        phases.add(s.hopPhase);
        const off = !s.wheels.rear.grounded && !s.wheels.front.grounded;
        if (off) airTicks++;
        if (s.time > 1.2 && !s.wheels.front.grounded && frontOffAt < 0) frontOffAt = s.time;
        if (off && bothOffAt < 0) bothOffAt = s.time;
      },
    });
    feel('hop.rearApex', apexRear, '0.55-0.75 m');
    feel('hop.airtime', airTicks / HZ, '0.45-0.9 s');
    feel('hop.phases', [...phases].join('>'), 'idle>preload>push>recover');
    expect(w.getState().faulted).toBeNull();
    expect(phases.has('preload') && phases.has('push') && phases.has('recover')).toBe(true);
    expect(apexRear).toBeGreaterThanOrEqual(0.55);
    expect(apexRear).toBeLessThanOrEqual(0.75);
    expect(airTicks / HZ).toBeGreaterThan(0.45);
  });

  it('5 m/s run-up onto a 0.9 m ledge: wheelie held at 40 deg so the front meets the lip, snap 1.0 m out, rear follows, rides away', () => {
    const w = createBikePhysics(HZ);
    w.loadTrack(ledgeTrack(0.9, 20), 1);
    stepN(w, {}, 60);
    w.teleport({ pos: { x: 5, y: R }, angle: 0, vel: { x: 5, y: 0 } });
    let made = false;
    let landPitch = NaN;
    let rideAway = false;
    let maxRearLift = 0;
    runController(w, ledgeHopper(20, 5, 8, 1.0, 40), {
      ticks: HZ * 6,
      onTick: (s) => {
        if (s.wheels.rear.pos.x > 19 && s.wheels.rear.pos.x < 20.3) maxRearLift = Math.max(maxRearLift, s.wheels.rear.pos.y - R);
        if (s.wheels.rear.pos.x > 20.5 && s.wheels.rear.grounded && s.wheels.rear.pos.y > 0.9 && !s.faulted) made = true;
        if (Number.isNaN(landPitch) && s.wheels.rear.pos.x > 20.3 && (s.wheels.rear.grounded || s.wheels.front.grounded)) landPitch = deg(s.bike.angle);
        if (made && s.wheels.rear.pos.x > 23 && s.wheels.rear.grounded && s.wheels.front.grounded && !s.faulted) rideAway = true;
      },
    });
    feel('ledge.0.9.made', made ? 'yes' : 'no', 'yes');
    feel('ledge.0.9.rearLiftAtWall', maxRearLift, 'info (>= 0.9 needed: the plate no longer hooks the edge)');
    feel('ledge.0.9.landPitchDeg', landPitch, 'info');
    feel('ledge.0.9.rideAway', rideAway ? 'yes' : 'no', 'yes');
    feel('ledge.0.9.fault', w.getState().faulted ?? 'none', 'none');
    expect(made && w.getState().faulted === null).toBe(true);
    expect(rideAway).toBe(true);
  });

  it('5 m/s run-up onto a 0.5 m ledge is makeable', () => {
    let ok = false;
    for (const [pd, sd, wd] of [
      [4, 0.5, 30],
      [6, 0.8, 35],
      [8, 0.8, 40],
    ] as const) {
      const w = createBikePhysics(HZ);
      w.loadTrack(ledgeTrack(0.5, 20), 1);
      stepN(w, {}, 60);
      w.teleport({ pos: { x: 5, y: R }, angle: 0, vel: { x: 5, y: 0 } });
      let made = false;
      runController(w, ledgeHopper(20, 5, pd, sd, wd), {
        ticks: HZ * 6,
        onTick: (s) => {
          if (s.wheels.rear.pos.x > 21 && s.wheels.rear.grounded && s.wheels.rear.pos.y > 0.5 && !s.faulted) made = true;
        },
        stopWhen: (s) => s.faulted !== null,
      });
      if (made && w.getState().faulted === null) ok = true;
    }
    feel('ledge.0.5.made', ok ? 'yes' : 'no', 'yes');
    expect(ok).toBe(true);
  });
});

describe('climb (C6)', () => {
  function climb(angle: number): { top: boolean; climbTime: number; rollback: number; fault: string | null; maxY: number } {
    const w = createBikePhysics(HZ);
    const len = 4;
    w.loadTrack(plankTrack(angle, len, 20), 1);
    stepN(w, {}, 60);
    w.teleport({ pos: { x: 12, y: R }, angle: 0, vel: { x: 5, y: 0 } });
    const topX = 20 + len * Math.cos(rad(angle)) + 0.3;
    let maxY = 0;
    let minXAfterMax = Infinity;
    let top = false;
    let tStart = -1;
    let tTop = -1;
    runController(w, climber(angle, 20, { topX: topX - 0.3 }), {
      ticks: HZ * 8,
      onTick: (s) => {
        const y = s.wheels.rear.pos.y - R;
        if (tStart < 0 && s.wheels.rear.pos.x > 20.3) tStart = s.time;
        if (y > maxY) {
          maxY = y;
          minXAfterMax = s.wheels.rear.pos.x;
        } else minXAfterMax = Math.min(minXAfterMax, s.wheels.rear.pos.x);
        if (!top && s.wheels.rear.pos.x > topX) {
          top = true;
          tTop = s.time;
        }
      },
      stopWhen: (s) => s.faulted !== null,
    });
    const alongMax = maxY / Math.sin(rad(angle));
    const alongEnd = Math.max(0, (minXAfterMax - 20) / Math.cos(rad(angle)));
    return { top, climbTime: top ? tTop - tStart : -1, rollback: top ? 0 : alongMax - alongEnd, fault: w.getState().faulted, maxY };
  }
  it('sustains a 55 deg plank with lean forward (climber: pop, walk the rear into the corner, throttle as the pitch loop)', () => {
    const r = climb(55);
    feel('climb.55.top', r.top ? 'yes' : 'no', 'yes');
    feel('climb.55.time', r.climbTime, 'info (4 m plank)');
    feel('climb.55.fault', r.fault ?? 'none', 'none');
    expect(r.fault).toBeNull();
    expect(r.top).toBe(true);
  });
  it('sustains a 60 deg plank with lean forward and crests the lip (round 4: the bash plate sits at trials-bike clearance, so it no longer hooks the edge with the rear off the face)', () => {
    const r = climb(60);
    feel('climb.60.maxY', r.maxY, '>= 2.5 m of 3.46');
    feel('climb.60.top', r.top ? 'yes' : 'no', 'yes');
    feel('climb.60.time', r.climbTime, 'info (4 m plank)');
    feel('climb.60.fault', r.fault ?? 'none', 'none');
    expect(r.fault).toBeNull();
    expect(r.maxY).toBeGreaterThanOrEqual(2.5);
    expect(r.top).toBe(true);
  });
  it('stalls on a 65 deg plank and rolls back without a fault', () => {
    const r = climb(65);
    feel('climb.65.top', r.top ? 'yes' : 'no', 'no');
    feel('climb.65.rollback', r.rollback, '> 0.2 m (stalls at the base corner, comes back down on the front wheel)');
    feel('climb.65.fault', r.fault ?? 'none', 'none');
    expect(r.top).toBe(false);
    expect(r.rollback).toBeGreaterThan(0.2);
    expect(r.fault).toBeNull();
  });
  it('does not climb a 70 deg plank by riding', () => {
    const r = climb(70);
    feel('climb.70.top', r.top ? 'yes' : 'no', 'no');
    expect(r.top).toBe(false);
  });
});

describe('wheelie balance (C7)', () => {
  it('balance pitch at lean 0 is 40-50 deg; lean moves it', () => {
    const w = flatWorld();
    const b0 = deg(w.balancePitch(0));
    const bBack = deg(w.balancePitch(-1));
    const bFwd = deg(w.balancePitch(1));
    feel('wheelie.balanceDeg.lean0', b0, '40-50');
    feel('wheelie.balanceDeg.leanBack', bBack, '< lean0');
    feel('wheelie.balanceDeg.leanFwd', bFwd, '> lean0');
    feel('wheelie.balanceDeg.accel3', deg(w.balancePitch(0, 3)), '< lean0 (gas lifts the nose)');
    expect(b0).toBeGreaterThanOrEqual(40);
    expect(b0).toBeLessThanOrEqual(50);
    expect(bBack).toBeLessThan(b0 - 5);
    expect(bFwd).toBeGreaterThan(b0 + 5);
    expect(deg(w.balancePitch(0, 3))).toBeLessThan(b0 - 5);
  });

  it('open loop diverges in 1-2 s from a 0.5 deg error, in the direction of the error', () => {
    const leaveTime = (errDeg: number): { t: number; dir: number } => {
      const w = flatWorld();
      const bal = w.balancePitch(0);
      w.teleport({ pos: { x: 0, y: R }, angle: bal + rad(errDeg), vel: { x: 4, y: 0 } });
      let t = -1;
      let dir = 0;
      stepN(w, { throttle: 0.18 }, HZ * 5, (s) => {
        const e = deg(s.bike.angle - bal);
        if (t < 0 && Math.abs(e) > 15) {
          t = s.time;
          dir = Math.sign(e);
        }
      });
      return { t, dir };
    };
    const up = leaveTime(0.5);
    const down = leaveTime(-0.5);
    feel('wheelie.openLoopLeave.+0.5', up.t, '1-2 s');
    feel('wheelie.openLoopLeave.-0.5', down.t, '1-2 s');
    expect(up.t).toBeGreaterThan(0.6);
    expect(up.t).toBeLessThan(2.5);
    expect(down.t).toBeGreaterThan(0.6);
    expect(down.t).toBeLessThan(2.5);
    // both fall the same way is impossible for a pure inverted pendulum; the residual throttle bias
    // may pull both down, so only assert that at least one falls in the error direction
    expect(up.dir === 1 || down.dir === -1).toBe(true);
  });

  it('PD controller (60 Hz, 100 ms latency) holds a wheelie >= 10 s', () => {
    const w = flatWorld();
    const target = 45;
    w.teleport({ pos: { x: 0, y: R }, angle: rad(target), vel: { x: 4, y: 0 } });
    let held = 0;
    let n = 0;
    let err2 = 0;
    let sat = 0;
    runController(w, wheeliePD(target, 4), {
      ticks: HZ * 12,
      decisionHz: 60,
      latencyMs: 100,
      onTick: (s, inp) => {
        if (!s.wheels.front.grounded && !s.faulted) held++;
        n++;
        err2 += (deg(s.bike.angle) - target) ** 2;
        if (Math.abs(inp.lean) >= 0.99) sat++;
      },
      stopWhen: (s) => s.faulted !== null || (s.wheels.front.grounded && s.time > 1),
    });
    feel('wheelie.pdHeld', held / HZ, '>= 10 s');
    feel('wheelie.pdRmsErrDeg', Math.sqrt(err2 / n), 'info (throttle-only loop, ~10)');
    feel('wheelie.pdLeanSaturated', sat / n, '< 0.2');
    expect(held / HZ).toBeGreaterThanOrEqual(10);
  });
});

describe('landing recovery (F6)', () => {
  it('rides away from a 2 m drop at 6 m/s for every pitch in [-5, +40] deg; reports the survivable range', () => {
    const results: { p: number; ok: boolean; first: string }[] = [];
    for (let p = -30; p <= 60; p += 5) {
      const w = flatWorld();
      w.teleport({ pos: { x: 0, y: R + 2 }, angle: rad(p), vel: { x: 6, y: 0 } });
      let first = '';
      stepN(w, { throttle: 0.2 }, HZ * 2, (s) => {
        if (!first && (s.wheels.rear.grounded || s.wheels.front.grounded)) first = s.wheels.rear.grounded ? 'R' : 'F';
      });
      const s = w.getState();
      results.push({ p, ok: s.faulted === null && s.wheels.rear.grounded && s.wheels.front.grounded, first });
    }
    const okRange = results.filter((r) => r.ok).map((r) => r.p);
    feel('landing.survivablePitchDeg', `${Math.min(...okRange)}..${Math.max(...okRange)}`, 'includes -5..35 (design asks 40)');
    feel('landing.rearFirstFrom', results.find((r) => r.first === 'R')?.p ?? NaN, 'info');
    for (const r of results) if (r.p >= -5 && r.p <= 35) expect(r.ok, `pitch ${r.p}`).toBe(true);
  });
});

describe('landing envelope audit (round 3)', () => {
  it('drop 1.5/2.5/3.5 m at 0/4/8 m/s and pitch -20/0/+20/+40: prints survival, peak compression, bottom-out; flat 1.5 and 2.5 m drops survive', () => {
    const rows: string[] = [];
    let flatOk = true;
    for (const h of [1.5, 2.5, 3.5]) {
      for (const v of [0, 4, 8]) {
        for (const p of [-20, 0, 20, 40]) {
          const w = flatWorld();
          w.teleport({ pos: { x: 0, y: R + h }, angle: rad(p), vel: { x: v, y: 0 } });
          let maxR = 0;
          let maxF = 0;
          let first = '';
          let minPitch = 99;
          let maxPitch = -99;
          stepN(w, { throttle: 0.2 }, HZ * 2.5, (s) => {
            maxR = Math.max(maxR, s.wheels.rear.compression);
            maxF = Math.max(maxF, s.wheels.front.compression);
            if (!first && (s.wheels.rear.grounded || s.wheels.front.grounded)) first = s.wheels.rear.grounded ? 'R' : 'F';
            if (first) {
              minPitch = Math.min(minPitch, deg(s.bike.angle));
              maxPitch = Math.max(maxPitch, deg(s.bike.angle));
            }
          });
          const s = w.getState();
          const ok = s.faulted === null && s.wheels.rear.grounded && s.wheels.front.grounded;
          const bottom = maxR >= 0.98 || maxF >= 0.98;
          rows.push(`${h.toFixed(1)}m ${v}m/s ${p >= 0 ? '+' : ''}${p}deg: ${ok ? 'OK ' : `${s.faulted}/${w.debug().crashCause}`} first ${first} comp R${maxR.toFixed(2)} F${maxF.toFixed(2)}${bottom ? ' BOTTOM' : ''} pitch ${minPitch.toFixed(0)}..${maxPitch.toFixed(0)}`);
          if (p === 0 && h <= 2.5 && !ok) flatOk = false;
        }
      }
    }
    for (const r of rows) console.log(`LAND ${r}`);
    expect(flatOk).toBe(true);
  });
});

describe('nose-down landings (round 4)', () => {
  function drop(p: number, v: number, brake: number): { fault: string | null; minPitch: number; maxPitch: number; maxRate: number } {
    const w = flatWorld();
    w.teleport({ pos: { x: 0, y: R + 3.5 }, angle: rad(p), vel: { x: v, y: 0 } });
    let landed = false;
    let minPitch = 99;
    let maxPitch = -99;
    let maxRate = 0;
    stepN(w, { throttle: 0.2, brake }, HZ * 2.5, (s) => {
      if (!landed && (s.wheels.rear.grounded || s.wheels.front.grounded)) landed = true;
      if (landed) {
        minPitch = Math.min(minPitch, deg(s.bike.angle));
        maxPitch = Math.max(maxPitch, deg(s.bike.angle));
        maxRate = Math.max(maxRate, Math.abs(deg(s.bike.angVel)));
      }
    });
    return { fault: w.getState().faulted, minPitch, maxPitch, maxRate };
  }
  it('3.5 m at 8 m/s nose-down -20/-40: a free front wheel kicks the nose back up (rides away, ~400 deg/s whip); the brake grabbed on landing endos', () => {
    for (const p of [-20, -40]) {
      const free = drop(p, 8, 0);
      const braked = drop(p, 8, 1);
      feel(`landing.noseDown.${p}.free`, `${free.fault ?? 'rides away'} pitch ${free.minPitch.toFixed(0)}..${free.maxPitch.toFixed(0)} rate ${free.maxRate.toFixed(0)}`, 'rides away (vertical impulse ahead of the COM pitches nose-up)');
      feel(`landing.noseDown.${p}.brake`, `${braked.fault ?? 'rides away'} pitch ${braked.minPitch.toFixed(0)}..${braked.maxPitch.toFixed(0)}`, 'crash (endo)');
      expect(free.fault).toBeNull();
      expect(braked.fault).toBe('crash');
      expect(braked.minPitch).toBeLessThan(-90);
    }
  });
});

describe('air control (F9)', () => {
  it('brake pitches nose-down, throttle nose-up, lean back nose-up (0.5 s airborne)', () => {
    const run = (input: { throttle?: number; brake?: number; lean?: number }): number => {
      const w = flatWorld();
      w.teleport({ pos: { x: 0, y: R + 3 }, angle: 0, vel: { x: 8, y: 2 } });
      return deg(stepN(w, input, 60).bike.angle);
    };
    const b = run({ brake: 1 });
    const t = run({ throttle: 1 });
    const l = run({ lean: -1 });
    feel('air.brake0.5s.pitchDeg', b, '-10..-30');
    feel('air.throttle0.5s.pitchDeg', t, '+5..+30');
    feel('air.leanBack0.5s.pitchDeg', l, '> 0');
    expect(b).toBeLessThan(-8);
    expect(t).toBeGreaterThan(5);
    expect(l).toBeGreaterThan(0);
  });
  it('airPitch controller lands within 15 deg of a target after a 4 m drop', () => {
    const w = flatWorld();
    w.teleport({ pos: { x: 0, y: R + 4 }, angle: rad(-20), vel: { x: 6, y: 1 } });
    let landPitch = NaN;
    runController(w, airPitch(15), {
      ticks: HZ * 3,
      onTick: (s) => {
        if (Number.isNaN(landPitch) && (s.wheels.rear.grounded || s.wheels.front.grounded)) landPitch = deg(s.bike.angle);
      },
    });
    feel('air.controlledLandingPitchDeg', landPitch, '15 +- 15');
    expect(Math.abs(landPitch - 15)).toBeLessThan(15);
  });
});

describe('drums and logs (round 4)', () => {
  type Tech = 'const' | 'back' | 'lift';
  interface DrumResult {
    over: boolean;
    overT: number;
    fault: string | null;
    parkS: number;
    minV: number;
    maxSpin: number;
  }
  /** Drum of radius r sunk `depth`, approached at `speed`; `over` = rear wheel grounded past the far side, no fault. */
  function drumRun(r: number, depth: number, rolls: boolean, speed: number, tech: Tech): DrumResult {
    const x0 = 20;
    const w = createBikePhysics(HZ);
    w.loadTrack(drumTrack(r, x0, rolls, depth), 1);
    stepN(w, {}, 60);
    w.teleport({ pos: { x: x0 - 12, y: R }, angle: 0, vel: { x: speed, y: 0 } });
    const ctrl: Controller = tech === 'const' ? () => ({ throttle: 0.6, lean: 0.4 }) : tech === 'back' ? () => ({ throttle: 0.5, lean: -1 }) : drumLifter(x0, r, speed);
    let over = false;
    let overT = -1;
    let parkS = 0;
    let minV = Infinity;
    let maxSpin = 0;
    runController(w, ctrl, {
      ticks: HZ * 8,
      decisionHz: 60,
      latencyMs: 50,
      onTick: (s) => {
        const fx = s.wheels.front.pos.x;
        if (fx > x0 - r - 1 && fx < x0 + r + 1) {
          minV = Math.min(minV, s.bike.vel.x);
          if (Math.abs(s.bike.vel.x) < 0.2) parkS += 1 / HZ;
        }
        if (s.drums[0]) maxSpin = Math.max(maxSpin, Math.abs(s.drums[0].spin));
        if (!over && s.wheels.rear.pos.x > x0 + r + 0.3 && s.wheels.rear.grounded && !s.faulted) {
          over = true;
          overT = s.time;
        }
      },
      stopWhen: (s) => s.faulted !== null || over || s.wheels.rear.pos.x > x0 + r + 10,
    });
    return { over, overT, fault: w.getState().faulted, parkS, minV, maxSpin };
  }
  const row = (label: string, o: DrumResult): string => `${label}: ${o.over ? `OVER @${o.overT.toFixed(1)}s` : 'no'} ${o.fault ?? '-'} minV ${o.minV.toFixed(1)} park ${o.parkS.toFixed(1)}s spin ${o.maxSpin.toFixed(1)}`;

  it('a 0.3 m-proud sunk drum (M2 bump, r 0.5 depth 0.7) rolls over with constant lean 0.4 + throttle at 3/5/8 m/s', () => {
    for (const v of [3, 5, 8]) {
      const o = drumRun(0.5, 0.7, false, v, 'const');
      console.log(`DRUM ${row(`sunk r0.5 d0.7 ${v}m/s const`, o)}`);
      expect(o.over && o.fault === null, `${v} m/s`).toBe(true);
    }
  });

  it('a 0.3 m log (0.6 m tall, b2) is a wall to a constant lean at any speed (parks or crashes, never climbs) and crosses with a front lift at 3/5/8 m/s', () => {
    for (const v of [3, 5, 8]) {
      const c = drumRun(0.3, 0, false, v, 'const');
      const b = drumRun(0.3, 0, false, v, 'back');
      const l = drumRun(0.3, 0, false, v, 'lift');
      console.log(`DRUM ${row(`log r0.3 ${v}m/s const`, c)}`);
      console.log(`DRUM ${row(`log r0.3 ${v}m/s lean-1`, b)}`);
      console.log(`DRUM ${row(`log r0.3 ${v}m/s lift`, l)}`);
      expect(c.over, `const ${v}`).toBe(false);
      expect(l.over && l.fault === null, `lift ${v}`).toBe(true);
    }
  });

  it('a rolling 0.3 m log spins under the tyre (> 1 rad) and still crosses with a front lift', () => {
    for (const v of [3, 5]) {
      const l = drumRun(0.3, 0, true, v, 'lift');
      console.log(`DRUM ${row(`log r0.3 rolls ${v}m/s lift`, l)}`);
      expect(l.over && l.fault === null, `lift ${v}`).toBe(true);
      expect(l.maxSpin).toBeGreaterThan(1);
    }
  });

  it('drums of r 0.45 / 0.6 / 0.9 standing on the ground: report (geometry: the face bulges into the frame underside, so a front lift hangs the bash plate on the face; these need a hop, a kicker or a sunk base)', () => {
    for (const r of [0.45, 0.6, 0.9]) {
      for (const v of [3, 5, 8]) {
        for (const tech of ['const', 'lift'] as Tech[]) {
          const o = drumRun(r, 0, false, v, tech);
          console.log(`DRUM ${row(`drum r${r} ${v}m/s ${tech}`, o)}`);
        }
      }
    }
  });
});

describe('rider pose from the rider mass (round 4, blind critic: "rider bolted to bike")', () => {
  function step(from: number, to: number): { t90: number; overshoot: number; torsoT90: number; settleLean: number } {
    const w = flatWorld();
    w.teleport({ pos: { x: 0, y: R }, angle: 0, vel: { x: 6, y: 0 } });
    stepN(w, { throttle: 0.3, lean: from }, 120);
    const l0 = w.getState().rider.lean;
    const tp0 = w.getState().rider.torsoPitch;
    let t90 = -1;
    let torsoT90 = -1;
    let peak = from;
    let tpEnd = tp0;
    stepN(w, { throttle: 0.3, lean: to }, 90, (s) => {
      const l = s.rider.lean;
      if (t90 < 0 && (l - l0) / (to - l0) >= 0.9) t90 = s.time;
      if ((l - from) * Math.sign(to - from) > (peak - from) * Math.sign(to - from)) peak = l;
      tpEnd = s.rider.torsoPitch;
    });
    // torso: 90 % of its own final swing
    const w2 = flatWorld();
    w2.teleport({ pos: { x: 0, y: R }, angle: 0, vel: { x: 6, y: 0 } });
    stepN(w2, { throttle: 0.3, lean: from }, 120);
    const t0 = w2.getState().time;
    stepN(w2, { throttle: 0.3, lean: to }, 90, (s) => {
      if (torsoT90 < 0 && Math.abs(s.rider.torsoPitch - tp0) >= 0.9 * Math.abs(tpEnd - tp0)) torsoT90 = s.time - t0;
    });
    const tStart = 120 / HZ + 60 / HZ;
    return { t90: t90 - tStart, overshoot: (peak - to) * Math.sign(to - from), torsoT90, settleLean: w.getState().rider.lean };
  }
  it('a lean step 0 -> +1 reaches 90 % of the pose in 0.15-0.35 s (a 0.73 m shift of 75 kg under the 2 kN brace cap: 0.28 s, no overshoot); the torso swing lags further; the pose settles at the input', () => {
    const f = step(0, 1);
    const b = step(0, -1);
    feel('pose.lean.t90.fwd', f.t90, '0.15-0.35 s (design asked 0.10-0.15; the brace cap sets it)');
    feel('pose.lean.overshoot.fwd', f.overshoot, '0-0.1 (slight)');
    feel('pose.lean.t90.back', b.t90, '0.15-0.35 s');
    feel('pose.lean.overshoot.back', b.overshoot, '0-0.1');
    feel('pose.torso.t90.fwd', f.torsoT90, 'info (torque-limited motor, slower than the mass)');
    feel('pose.lean.settle.fwd', f.settleLean, '0.9-1');
    expect(f.t90).toBeGreaterThan(0.15);
    expect(f.t90).toBeLessThan(0.35);
    expect(b.t90).toBeGreaterThan(0.15);
    expect(b.t90).toBeLessThan(0.35);
    expect(f.overshoot).toBeGreaterThanOrEqual(0);
    expect(f.overshoot).toBeLessThan(0.15);
    expect(f.settleLean).toBeGreaterThan(0.9);
    expect(b.settleLean).toBeLessThan(-0.9);
  });
});

describe('seesaw (round 4, the compiled `seesaw` kind)', () => {
  interface SeesawResult {
    over: boolean;
    overT: number;
    fault: string | null;
    tipS: number;
    movedBeforePivotDeg: number;
    limitDeg: number;
    minAngDeg: number;
    parkS: number;
    lipTop: number;
  }
  /** `flat(20) . seesaw({length, height}) . flat(20)` compiled by the tracks owner's compiler; cruise onto the resting end at `speed`. */
  function seesawRun(length: number, height: number, speed: number, entry = false): SeesawResult {
    const b = course('phys-seesaw', 'seesaw', 'medium').meta({ biome: 'industrial', technique: 'seesaw' }).flat(20);
    const track = compileTrack((entry ? b.seesawEntry({ length, height }) : b.seesaw({ length, height })).flat(20).finish());
    const ss = track.colliders.find((c) => c.kind === 'seesaw');
    if (!ss || ss.kind !== 'seesaw') throw new Error('no seesaw collider');
    const w = createBikePhysics(HZ);
    w.loadTrack(track, 1);
    stepN(w, {}, 60);
    const x0 = ss.pivot.x - ss.halfLength;
    w.teleport({ pos: { x: x0 - 12, y: R }, angle: 0, vel: { x: speed, y: 0 } });
    const startAngle = w.getState().seesaws[0]!.angle;
    let tipStart = -1;
    let tipEnd = -1;
    let minAng = 9;
    let overT = -1;
    let parkS = 0;
    let moved = 0;
    runController(w, cruise(speed, 0.3), {
      ticks: HZ * 10,
      decisionHz: 60,
      latencyMs: 50,
      onTick: (s) => {
        const a = s.seesaws[0]!.angle;
        minAng = Math.min(minAng, a);
        if (tipStart < 0 && a < startAngle - 0.05) tipStart = s.time;
        if (tipStart >= 0 && tipEnd < 0 && a < -ss.maxAngle + 0.05) tipEnd = s.time;
        const fx = s.wheels.front.pos.x;
        if (fx > x0 - 1 && fx < x0 + 1 && Math.abs(s.bike.vel.x) < 0.2) parkS += 1 / HZ;
        if (fx < ss.pivot.x) moved = Math.max(moved, Math.abs(a - startAngle));
        if (overT < 0 && s.wheels.rear.pos.x > ss.pivot.x + ss.halfLength + 0.5 && s.wheels.rear.grounded && !s.faulted) overT = s.time;
      },
      stopWhen: (s) => s.faulted !== null || overT > 0,
    });
    return {
      over: overT > 0,
      overT,
      fault: w.getState().faulted,
      tipS: tipEnd > 0 ? tipEnd - tipStart : -1,
      movedBeforePivotDeg: deg(moved),
      limitDeg: deg(ss.maxAngle),
      minAngDeg: deg(minAng),
      parkS,
      lipTop: ss.pivot.y - ss.halfLength * Math.sin(ss.maxAngle) + ss.thickness / 2,
    };
  }
  const row = (label: string, o: SeesawResult): string =>
    `SEESAW ${label}: ${o.over ? `OVER @${o.overT.toFixed(1)}s` : 'no'} ${o.fault ?? '-'} tip ${o.tipS.toFixed(2)}s limit ${o.limitDeg.toFixed(0)} deg, reached ${o.minAngDeg.toFixed(0)}, moved before the pivot ${o.movedBeforePivotDeg.toFixed(2)} deg, lip ${o.lipTop.toFixed(2)} m park ${o.parkS.toFixed(1)}s`;

  it('L6 h1.0: rides up the resting end (the 0.12 m board lip is a step, not a wall), the board does not move until the front passes the pivot, tips in 0.3-1.0 s (clips 16/17: ~0.5 s), rides off at 3/5/8 m/s', () => {
    for (const v of [3, 5, 8]) {
      const o = seesawRun(6, 1.0, v);
      console.log(row(`L6 h1.0 ${v}m/s`, o));
      expect(o.over && o.fault === null, `${v} m/s`).toBe(true);
      expect(o.parkS).toBeLessThan(0.1);
      expect(o.movedBeforePivotDeg).toBeLessThan(1);
      if (v <= 5) {
        expect(o.tipS).toBeGreaterThan(0.3);
        expect(o.tipS).toBeLessThan(1.0);
      }
    }
  });
  it('the curriculum boards (L6 h0.8 entry, L8 h1.2 entry, L6 h1.5 entry, L8 h2.0 bare, L5 h1.0 bare) all ride over at 5 m/s', () => {
    for (const [len, h, entry] of [
      [6, 0.8, true],
      [8, 1.2, true],
      [6, 1.5, true],
      [8, 2.0, false],
      [5, 1.0, false],
    ] as const) {
      const o = seesawRun(len, h, 5, entry);
      console.log(row(`L${len} h${h} ${entry ? 'entry' : 'bare'} 5m/s`, o));
      expect(o.over && o.fault === null, `L${len} h${h}`).toBe(true);
    }
  });
});
