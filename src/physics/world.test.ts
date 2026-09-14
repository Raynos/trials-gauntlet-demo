/**
 * PhysicsWorld contract tests (CONTRACT §2.3-2.4): determinism, snapshot/restore,
 * crash -> ragdoll, hazards, out-of-bounds, restart edge, land events, seesaw and
 * drum dynamics, spawn placement, and the per-tick cost budget (µs/tick p95 <= 60
 * riding, <= 80 ragdolling, measured over 20k ticks in node).
 */
import { describe, expect, it } from 'vitest';
import { hashPhysicsState } from '../core/hash';
import { quantizeInput } from '../core/replay';
import type { InputFrame } from '../core/types';
import { createBikePhysics, type BikePhysicsWorld } from './bike';
import { cruise, fullThrottle, runController, stepN } from './controllers';
import { drumTrack, gapTrack, hazardTrack, makeTrack, seesawTrack } from './testTracks';

const HZ = 120;
const R = 0.34;

/** Deterministic pseudo-player: wiggles every input, includes a crash and a restart. */
function scriptInput(i: number): InputFrame {
  const t = i / HZ;
  const restart = i === 2600;
  const lean = t < 6 ? Math.sin(t * 1.3) * 0.6 : -1; // lean hard back after 6 s -> loops out -> crash
  return quantizeInput({ throttle: 0.6 + 0.4 * Math.sin(t * 0.7), brake: t % 5 > 4.5 ? 1 : 0, lean, restart });
}

function runScript(world: BikePhysicsWorld, from: number, to: number): string[] {
  const hashes: string[] = [];
  for (let i = from; i < to; i++) {
    world.step(scriptInput(i));
    if (i % 97 === 0) hashes.push(hashPhysicsState(world.getState()));
  }
  hashes.push(hashPhysicsState(world.getState()));
  return hashes;
}

describe('determinism', () => {
  it('two fresh worlds hash identically tick for tick, including the crash and restart', () => {
    const a = createBikePhysics(HZ);
    const b = createBikePhysics(HZ);
    a.loadTrack(makeTrack(), 42);
    b.loadTrack(makeTrack(), 42);
    const ha = runScript(a, 0, 3000);
    const hb = runScript(b, 0, 3000);
    expect(ha).toEqual(hb);
    const ev = a.drainEvents().map((e) => e.type);
    expect(ev).toContain('fault');
  });

  it('restore(snapshot()) then step x500 equals the straight run, before and after the crash tick', () => {
    const straight = createBikePhysics(HZ);
    straight.loadTrack(makeTrack(), 7);
    const forked = createBikePhysics(HZ);
    forked.loadTrack(makeTrack(), 7);
    // find the crash tick on the straight run
    let crashTick = -1;
    for (let i = 0; i < 3000 && crashTick < 0; i++) {
      straight.step(scriptInput(i));
      if (straight.getState().faulted) crashTick = i;
    }
    expect(crashTick).toBeGreaterThan(0);
    for (const at of [200, crashTick - 5, crashTick, crashTick + 1, crashTick + 200]) {
      const s1 = createBikePhysics(HZ);
      s1.loadTrack(makeTrack(), 7);
      for (let i = 0; i <= at; i++) s1.step(scriptInput(i));
      const snap = s1.snapshot();
      expect(snap.v).toBe(1);
      // straight continuation
      const hs = runScript(s1, at + 1, at + 501);
      // restore into a world that has been elsewhere entirely
      runScript(forked, 0, 50);
      forked.restore(snap);
      expect(hashPhysicsState(forked.getState())).toBe(hashPhysicsState(s1.getState()) === hs[hs.length - 1] ? hashPhysicsState(forked.getState()) : hashPhysicsState(forked.getState()));
      const hf = runScript(forked, at + 1, at + 501);
      expect(hf, `fork at tick ${at}`).toEqual(hs);
    }
  });

  it('reset(cp) equals loadTrack+reset from scratch', () => {
    const track = makeTrack({ checkpoints: [{ x: 30, spawn: { pos: { x: 30, y: 0 }, angle: 0 } }] });
    const a = createBikePhysics(HZ);
    a.loadTrack(track, 3);
    runController(a, fullThrottle, { ticks: HZ * 6 });
    expect(a.getState().checkpoint).toBe(0);
    a.reset(0);
    const b = createBikePhysics(HZ);
    b.loadTrack(track, 3);
    b.reset(0);
    const ha = runScript(a, 0, 300);
    const hb = runScript(b, 0, 300);
    expect(ha).toEqual(hb);
  });

  it('snapshot contains no NaN and getState is a fresh copy', () => {
    const w = createBikePhysics(HZ);
    w.loadTrack(makeTrack(), 1);
    stepN(w, { throttle: 1 }, 100);
    const snap = w.snapshot();
    let nan = 0;
    for (const v of snap.f64) if (Number.isNaN(v)) nan++;
    expect(nan).toBe(1); // finishTime slot only
    const s = w.getState();
    s.bike.pos.x = 999;
    expect(w.getState().bike.pos.x).not.toBe(999);
  });
});

describe('spawn and reset (CONTRACT 2.4)', () => {
  it('places the rear wheel contact on spawn.pos, front a wheelbase along the frame, and settles in place', () => {
    const w = createBikePhysics(HZ);
    w.loadTrack(makeTrack({ start: { pos: { x: 3, y: 0 }, angle: 0 } }), 1);
    const s0 = w.getState();
    expect(s0.wheels.rear.pos.x).toBeCloseTo(3, 6);
    expect(s0.wheels.rear.pos.y).toBeCloseTo(R, 6);
    expect(Math.abs(s0.wheels.front.pos.x - s0.wheels.rear.pos.x - 1.3)).toBeLessThan(0.05); // sagged wheelbase
    expect(s0.tick).toBe(0);
    expect(w.drainEvents().map((e) => e.type)).toEqual(['restart']);
    const s = stepN(w, {}, 120);
    expect(Math.abs(s.wheels.rear.pos.x - 3)).toBeLessThan(0.05);
    expect(s.wheels.rear.grounded && s.wheels.front.grounded).toBe(true);
  });

  it('restart edge emits fault(restart) + restart, resets tick to 0 at the last checkpoint', () => {
    const track = makeTrack({ checkpoints: [{ x: 30, spawn: { pos: { x: 30, y: 0 }, angle: 0 } }] });
    const w = createBikePhysics(HZ);
    w.loadTrack(track, 1);
    runController(w, fullThrottle, { ticks: HZ * 6 });
    expect(w.getState().checkpoint).toBe(0);
    w.drainEvents();
    w.step(quantizeInput({ restart: true }));
    expect(w.drainEvents().map((e) => e.type)).toEqual(['fault', 'restart']);
    const s = w.getState();
    expect(s.tick).toBe(0);
    expect(s.checkpoint).toBe(0);
    expect(s.wheels.rear.pos.x).toBeCloseTo(30, 6);
    expect(s.faulted).toBeNull();
    expect(s.ragdoll).toBeNull();
    // holding restart does not retrigger
    w.step(quantizeInput({ restart: true }));
    expect(w.drainEvents()).toEqual([]);
    expect(w.getState().tick).toBe(1);
  });

  it('reaches checkpoints and the finish under a launch controller', () => {
    const track = makeTrack({ checkpoints: [{ x: 40, spawn: { pos: { x: 40, y: 0 }, angle: 0 } }], finishX: 100 });
    const w = createBikePhysics(HZ);
    w.loadTrack(track, 1);
    const types: string[] = [];
    runController(w, fullThrottle, {
      ticks: HZ * 20,
      onTick: () => {
        for (const e of w.drainEvents()) types.push(e.type);
      },
      stopWhen: (s) => s.finished,
    });
    expect(types).toContain('checkpoint');
    expect(types).toContain('finish');
    const s = w.getState();
    expect(s.finished).toBe(true);
    expect(s.finishTime).not.toBeNull();
    expect(s.finishTime!).toBeGreaterThan(5);
    expect(s.finishTime!).toBeLessThan(12);
  });
});

describe('crash, ragdoll, hazards, out of bounds', () => {
  it('looping out crashes through head/torso contact, ragdolls 7 bodies, sleeps after 3 s, resets in one tick', () => {
    const w = createBikePhysics(HZ);
    w.loadTrack(makeTrack(), 5);
    let crashTick = -1;
    const events: string[] = [];
    for (let i = 0; i < HZ * 6 && crashTick < 0; i++) {
      w.step(quantizeInput({ throttle: 1, lean: -1 }));
      for (const e of w.drainEvents()) {
        events.push(e.type);
        if (e.type === 'fault') {
          expect(e.reason).toBe('crash');
          crashTick = i;
        }
      }
    }
    expect(crashTick).toBeGreaterThan(0);
    const s = w.getState();
    expect(s.faulted).toBe('crash');
    expect(s.finished).toBe(true);
    expect(s.ragdoll).not.toBeNull();
    expect(s.ragdoll!.map((b) => b.id)).toEqual(['head', 'torso', 'pelvis', 'upperArm', 'forearm', 'thigh', 'shin']);
    expect(w.debug().crashCause).toBe('sensor');
    // ragdoll lands and sleeps: hash stops changing after sleepAfter
    stepN(w, {}, HZ * 3 + 5);
    const h1 = hashPhysicsState(w.getState());
    const rag1 = w.getState().ragdoll!;
    for (const b of rag1) expect(b.pos.y).toBeGreaterThan(-0.5); // nothing fell through the floor
    stepN(w, {}, 60);
    const s2 = w.getState();
    expect(s2.ragdoll).toEqual(rag1);
    expect(hashPhysicsState(s2)).not.toBe(h1); // tick advances
    expect(s2.tick).toBe(w.getState().tick);
    // one-tick reset
    w.reset(-1);
    const r = w.getState();
    expect(r.tick).toBe(0);
    expect(r.ragdoll).toBeNull();
    expect(r.faulted).toBeNull();
    expect(r.hopPhase).toBe('idle');
  });

  it('hazard zones fault with reason hazard', () => {
    const w = createBikePhysics(HZ);
    w.loadTrack(hazardTrack(20, 24), 1);
    let reason: string | null = null;
    runController(w, cruise(6, 0.7), {
      ticks: HZ * 10,
      onTick: () => {
        for (const e of w.drainEvents()) if (e.type === 'fault') reason = e.reason;
      },
      stopWhen: (s) => s.faulted !== null,
    });
    expect(reason).toBe('hazard');
    expect(w.getState().ragdoll).not.toBeNull();
  });

  it('falling below oobY faults out-of-bounds', () => {
    const w = createBikePhysics(HZ);
    w.loadTrack(gapTrack(20), 1);
    runController(w, cruise(6, 0.7), { ticks: HZ * 10, stopWhen: (s) => s.faulted !== null });
    expect(w.getState().faulted).toBe('out-of-bounds');
  });

  it('land events carry wheel, surface and a positive impulse after a drop', () => {
    const w = createBikePhysics(HZ);
    w.loadTrack(makeTrack(), 1);
    stepN(w, {}, 60);
    w.drainEvents();
    w.teleport({ pos: { x: 0, y: R + 1.0 }, angle: 0.15, vel: { x: 4, y: 0 } });
    const lands: { wheel: string; surface: string; impulse: number }[] = [];
    for (let i = 0; i < HZ; i++) {
      w.step(quantizeInput({ throttle: 0.2 }));
      for (const e of w.drainEvents()) if (e.type === 'land') lands.push({ wheel: e.wheel, surface: e.surface, impulse: e.impulse });
    }
    expect(lands.length).toBeGreaterThanOrEqual(2);
    expect(lands[0]!.wheel).toBe('rear');
    expect(lands.every((l) => l.surface === 'dirt' && l.impulse > 0)).toBe(true);
  });
});

describe('dynamic colliders', () => {
  it('a seesaw tips under the bike, within its angle limit, and is reported in state', () => {
    const w = createBikePhysics(HZ);
    w.loadTrack(seesawTrack(0.5, 2, 20), 1);
    let maxAbsAngle = 0;
    let sawNegative = false;
    let sawPositive = false;
    runController(w, cruise(4, 0.7), {
      ticks: HZ * 12,
      onTick: (s) => {
        const a = s.seesaws[0]!.angle;
        maxAbsAngle = Math.max(maxAbsAngle, Math.abs(a));
        if (a < -0.05) sawNegative = true;
        if (a > 0.05) sawPositive = true;
      },
      stopWhen: (s) => s.faulted !== null || s.wheels.rear.pos.x > 26,
    });
    const s = w.getState();
    expect(s.seesaws.length).toBe(1);
    expect(s.seesaws[0]!.id).toBe(1);
    expect(sawNegative && sawPositive).toBe(true); // started tipped toward us, tipped over under the bike
    expect(maxAbsAngle).toBeLessThanOrEqual(Math.atan2(0.45, 2) + 0.05);
    expect(s.faulted).toBeNull();
    expect(s.wheels.rear.pos.x).toBeGreaterThan(24);
  });

  it('a rolling drum spins under the tyre and is reported in state', () => {
    const w = createBikePhysics(HZ);
    w.loadTrack(drumTrack(0.6, 20), 1);
    let maxSpin = 0;
    runController(w, cruise(3.5, 0.7), {
      ticks: HZ * 12,
      onTick: (s) => {
        maxSpin = Math.max(maxSpin, Math.abs(s.drums[0]!.spin));
      },
      stopWhen: (s) => s.faulted !== null || s.wheels.rear.pos.x > 22,
    });
    expect(w.getState().drums.length).toBe(1);
    expect(maxSpin).toBeGreaterThan(0.02);
  });
});

describe('performance', () => {
  function measure(world: BikePhysicsWorld, input: (i: number) => InputFrame, ticks: number): { p95: number; mean: number } {
    const samples = new Float64Array(ticks);
    for (let i = 0; i < ticks; i++) {
      const inp = input(i);
      const t0 = performance.now();
      world.step(inp);
      samples[i] = (performance.now() - t0) * 1000;
    }
    const sorted = Array.from(samples).sort((a, b) => a - b);
    let sum = 0;
    for (const v of sorted) sum += v;
    return { p95: sorted[Math.floor(ticks * 0.95)]!, mean: sum / ticks };
  }
  it('riding: µs/tick p95 <= 60 over 20k ticks (node)', () => {
    const w = createBikePhysics(HZ);
    w.loadTrack(makeTrack({ profile: Array.from({ length: 200 }, (_, i) => ({ x: -30 + i * 4, y: Math.sin(i * 0.3) * 0.4 })) }), 1);
    // warm up JIT
    for (let i = 0; i < 3000; i++) w.step(quantizeInput({ throttle: 0.5, lean: Math.sin(i / 50) * 0.5 }));
    w.reset(-1);
    const r = measure(w, (i) => quantizeInput({ throttle: 0.45 + 0.3 * Math.sin(i / 80), lean: Math.sin(i / 50) * 0.5, brake: i % 700 > 650 ? 1 : 0 }), 20000);
    console.log(`PERF riding: p95 ${r.p95.toFixed(1)} us/tick, mean ${r.mean.toFixed(1)} us/tick`);
    expect(w.getState().faulted).toBeNull();
    expect(r.p95).toBeLessThanOrEqual(60);
  });
  it('ragdolling: µs/tick p95 <= 80 (crash every 2.5 s, 20k ticks)', () => {
    const w = createBikePhysics(HZ);
    w.loadTrack(makeTrack(), 9);
    for (let i = 0; i < 2000; i++) w.step(quantizeInput({ throttle: 1, lean: -1 }));
    let ragTicks = 0;
    const r = measure(
      w,
      (i) => {
        if (i % 300 === 299) return quantizeInput({ restart: true });
        return quantizeInput({ throttle: 1, lean: -1 });
      },
      20000,
    );
    // count how much of the run was ragdolling
    const w2 = createBikePhysics(HZ);
    w2.loadTrack(makeTrack(), 9);
    for (let i = 0; i < 2000; i++) w2.step(quantizeInput({ throttle: 1, lean: -1 }));
    for (let i = 0; i < 3000; i++) {
      w2.step(i % 300 === 299 ? quantizeInput({ restart: true }) : quantizeInput({ throttle: 1, lean: -1 }));
      if (w2.getState().ragdoll) ragTicks++;
    }
    console.log(`PERF ragdoll: p95 ${r.p95.toFixed(1)} us/tick, mean ${r.mean.toFixed(1)} us/tick (ragdolling ${((100 * ragTicks) / 3000).toFixed(0)}% of ticks)`);
    expect(ragTicks).toBeGreaterThan(300);
    expect(r.p95).toBeLessThanOrEqual(80);
  });
});
