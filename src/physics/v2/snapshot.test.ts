/**
 * Snapshot fidelity under search load (CONTRACT §2.3: `restore(snapshot())` then step×m hashes ==
 * the straight run, from ANY prior state). This is the physics-side twin of
 * `harness/gate/snapshot-probe.ts`: beam search snapshots a root, rolls every macro-action out,
 * restores the root and continues. If the next tick then differs from a straight run, the world keeps
 * state outside `snapshot()`/`restore()` and the bot's committed play is a trajectory no replay
 * reproduces (round-5 bug: `legStopX/Y` from the last force pass fed the hop push->recover edge).
 * v2: kept verbatim from v1 (physics-v2.md §12); only the imports differ.
 */
import { describe, expect, it } from 'vitest';
import { hashPhysicsState } from '../../core/hash';
import { quantizeInput } from '../../core/replay';
import type { InputFrame, PhysicsSnapshot, PhysicsState } from '../../core/types';
import { F_SLOTS, createBikePhysicsV2 as createBikePhysics, type BikePhysicsWorldV2 as BikePhysicsWorld } from './bike';
import { makeTrack, seesawTrack } from '../testTracks';

const HZ = 120;
const N = 2600;

/** Flat course with a seesaw, a rolling log and a checkpoint: every dynamic collider kind in one run. */
function gauntlet() {
  return makeTrack({
    id: 'snap-gauntlet',
    extra: [
      { kind: 'seesaw', id: 0, surface: 'wood', obstacleIndex: 0, pivot: { x: 24, y: 0.5 }, halfLength: 2, thickness: 0.1, maxAngle: Math.atan2(0.45, 2), mass: 80 },
      { kind: 'circle', id: 0, surface: 'metal', obstacleIndex: 1, center: { x: 44, y: 0.3 }, radius: 0.3, rolls: true },
    ],
    checkpoints: [{ x: 34, spawn: { pos: { x: 34, y: 0 }, angle: 0 } }],
    finishX: 1e9,
  });
}

/**
 * The trajectory T: launch, brake, a hop every 2 s (lean back + throttle, snap forward), the seesaw
 * and the drum, a loop-out crash at 12 s, ragdoll to sleep, restart at 16 s, ride again.
 */
function script(i: number): InputFrame {
  const t = i / HZ;
  if (i === 16 * HZ) return quantizeInput({ restart: true });
  if (t >= 12) return quantizeInput({ throttle: 1, lean: -1 });
  const ph = t % 2;
  let lean = 0.2 + Math.sin(t * 0.9) * 0.2; // R2: never below 0 while riding - a lean -0.25 at 0.75 throttle over the seesaw's tip looped on the v2 plant
  let throttle = 0.5; // R2: 0.75 with lean +0.2 loops off the tipping seesaw's far end at 8 m/s on the v2 plant (the rear's lighter rebound lets the tip kick it)
  // R2: the hop is real now (0.5 m); a preload at throttle 0.75 from 8 m/s looped the bike at 5 s and the
  // trajectory never reached the drum - the hop is scripted at the technique's throttle and only on the flat before the seesaw (a hop landing on the seesaw's tip looped too)
  if (t > 1 && t < 4 && ph >= 0.3 && ph < 0.6) {
    lean = -1;
    throttle = 0.4;
  } else if (t > 1 && t < 4 && ph >= 0.6 && ph < 0.75) {
    lean = 1;
    throttle = 0.3;
  } else if (t > 1 && t < 4 && ph >= 0.75 && ph < 0.85) {
    lean = -1; // R7: the reference gesture's tuck - a +1 held through the flight noses over now that the body is held
    throttle = 0.2;
  }
  const brake = ph > 1.7 && ph < 1.85 ? 1 : 0;
  if (brake) throttle = 0;
  return quantizeInput({ throttle, brake, lean });
}

/** What beam search rolls out from a root: 15 ticks of each macro-action. */
const ACTIONS: InputFrame[][] = [
  Array.from({ length: 15 }, () => quantizeInput({ throttle: 1 })),
  Array.from({ length: 15 }, () => quantizeInput({ brake: 1 })),
  Array.from({ length: 15 }, () => quantizeInput({ throttle: 1, lean: -1 })),
  Array.from({ length: 15 }, () => quantizeInput({ throttle: 0.5, lean: 1 })),
  Array.from({ length: 15 }, (_, i) => quantizeInput(i < 8 ? { throttle: 1, lean: -1 } : { throttle: 1, lean: 1 })),
  Array.from({ length: 15 }, (_, i) => quantizeInput({ restart: i === 0, throttle: 1 })),
  Array.from({ length: 15 }, () => quantizeInput({})),
];

function hash(w: BikePhysicsWorld): string {
  return hashPhysicsState(w.getState());
}

interface Coverage {
  brake: number;
  push: number;
  preload: number;
  seesaw: number;
  drum: number;
  ragdoll: number;
  restart: number;
  air: number;
}

function cover(c: Coverage, s: PhysicsState, i: number): void {
  if (s.input.brake > 0 && s.wheels.rear.grounded) c.brake++;
  if (s.hopPhase === 'push') c.push++;
  if (s.hopPhase === 'preload') c.preload++;
  if (s.seesaws.some((x) => Math.abs(x.angVel) > 0.05)) c.seesaw++;
  if (s.drums.some((x) => Math.abs(x.spin) > 0.05)) c.drum++;
  if (s.ragdoll) c.ragdoll++;
  if (i > 16 * HZ && s.tick < 200) c.restart++;
  if (!s.wheels.rear.grounded && !s.wheels.front.grounded && !s.ragdoll) c.air++;
}

function expectCovered(c: Coverage): void {
  for (const k of Object.keys(c) as (keyof Coverage)[]) expect(c[k], `segment ${k} never happened in T`).toBeGreaterThan(0);
}

describe('snapshot fidelity under search load (CONTRACT 2.3)', () => {
  it('probe: rollouts + restore every 15 ticks never change the next tick, across brake, hop, seesaw, drum, crash, ragdoll and restart', () => {
    const A = createBikePhysics(HZ);
    const B = createBikePhysics(HZ);
    A.loadTrack(gauntlet(), 5);
    B.loadTrack(gauntlet(), 5);
    const c: Coverage = { brake: 0, push: 0, preload: 0, seesaw: 0, drum: 0, ragdoll: 0, restart: 0, air: 0 };
    for (let i = 0; i < N; i++) {
      if (i % 15 === 0) {
        const root = B.snapshot();
        for (const frames of ACTIONS) {
          B.restore(root);
          for (const f of frames) B.step(f);
        }
        B.restore(root);
        expect(hash(B), `restore(root) != root at tick ${i}`).toBe(hash(A));
      }
      A.step(script(i));
      B.step(script(i));
      const s = A.getState();
      cover(c, s, i);
      if (hash(A) !== hash(B)) {
        throw new Error(`diverged on tick ${i + 1} (hop ${s.hopPhase}, brake ${s.input.brake}, ragdoll ${!!s.ragdoll}, x ${s.bike.pos.x.toFixed(2)})`);
      }
    }
    expectCovered(c);
  });

  it('foreign snapshot in between: run to k, restore a snapshot from another trajectory/world, restore k, step to N == straight run', () => {
    // T straight, with a snapshot at every tick of interest
    const T = createBikePhysics(HZ);
    T.loadTrack(gauntlet(), 5);
    const straight: string[] = [];
    const snaps = new Map<number, PhysicsSnapshot>();
    const states = new Map<number, PhysicsState>();
    for (let i = 0; i < N; i++) {
      T.step(script(i));
      straight.push(hash(T));
      snaps.set(i, T.snapshot());
      states.set(i, T.getState());
    }
    // pick one tick per segment
    const pick = (pred: (s: PhysicsState, i: number) => boolean, name: string): number => {
      for (let i = 0; i < N; i++) if (pred(states.get(i)!, i)) return i;
      throw new Error(`no tick in segment ${name}`);
    };
    const ks: [string, number][] = [
      ['brake', pick((s) => s.input.brake > 0 && s.wheels.rear.grounded && s.tick > 100, 'brake')],
      ['preload', pick((s) => s.hopPhase === 'preload', 'preload')],
      ['push', pick((s) => s.hopPhase === 'push', 'push')],
      ['push+2', pick((s) => s.hopPhase === 'push', 'push') + 2],
      ['recover', pick((s) => s.hopPhase === 'recover', 'recover')],
      ['seesaw', pick((s) => s.seesaws.some((x) => Math.abs(x.angVel) > 0.05), 'seesaw')],
      ['drum', pick((s) => s.drums.some((x) => Math.abs(x.spin) > 0.05), 'drum')],
      ['crash-1', pick((s) => s.faulted !== null, 'crash') - 1],
      ['crash', pick((s) => s.faulted !== null, 'crash')],
      ['ragdoll+30', pick((s) => s.faulted !== null, 'crash') + 30],
      ['asleep', pick((s, i) => i > 15 * HZ && s.ragdoll !== null, 'asleep')],
      ['restart', 16 * HZ],
      ['restart+40', 16 * HZ + 40],
    ];
    // foreign snapshots: T much later (ragdoll asleep) and T at a hop push, plus another seed
    const foreignA = snaps.get(15 * HZ + 50)!;
    const foreignB = snaps.get(pick((s) => s.hopPhase === 'push', 'push'))!;
    const other = createBikePhysics(HZ);
    other.loadTrack(gauntlet(), 99);
    for (let i = 0; i < 700; i++) other.step(quantizeInput({ throttle: 1, lean: i > 300 ? -1 : 0.2 }));
    const foreignC = other.snapshot();

    const W = createBikePhysics(HZ);
    W.loadTrack(gauntlet(), 5);
    let at = -1;
    for (const [name, k] of ks) {
      // bring W to tick k along T (from wherever it is: rewind via the stored snapshot if needed)
      if (at > k) {
        W.restore(snaps.get(k)!);
      } else {
        for (let i = at + 1; i <= k; i++) W.step(script(i));
      }
      expect(hash(W), `W at k=${k} (${name})`).toBe(straight[k]);
      // wander: three foreign restores, each stepped a while with different input
      for (const [f, frames] of [
        [foreignA, ACTIONS[2]!],
        [foreignB, ACTIONS[4]!],
        [foreignC, ACTIONS[1]!],
        [foreignA, ACTIONS[5]!],
      ] as [PhysicsSnapshot, InputFrame[]][]) {
        W.restore(f);
        for (let r = 0; r < 3; r++) for (const fr of frames) W.step(fr);
      }
      // back to k, continue to k + 400 along T
      W.restore(snaps.get(k)!);
      expect(hash(W), `restore(k=${k}) (${name})`).toBe(straight[k]);
      const end = Math.min(N - 1, k + 400);
      for (let i = k + 1; i <= end; i++) {
        W.step(script(i));
        if (hash(W) !== straight[i]) throw new Error(`${name}: fork at k=${k} diverged at tick ${i} (${i - k} ticks after restore)`);
      }
      at = end;
    }
  });

  it('a used world (other track, crash, ragdoll, restart) that loads the track again replays hash-equal to a fresh world', () => {
    const fresh = createBikePhysics(HZ);
    fresh.loadTrack(gauntlet(), 5);
    const used = createBikePhysics(HZ);
    // work on a different track with a different dynamic body count, crash, sleep, restart, snapshot/restore
    used.loadTrack(seesawTrack(), 3);
    for (let i = 0; i < 900; i++) used.step(quantizeInput({ throttle: 1, lean: i > 200 ? -1 : 0 }));
    const s = used.snapshot();
    for (let i = 0; i < 100; i++) used.step(quantizeInput({ restart: i === 0, throttle: 1, lean: -1 }));
    used.restore(s);
    for (let i = 0; i < 50; i++) used.step(quantizeInput({ throttle: 1, lean: -1 }));
    // now the same track + seed as `fresh`, mid-way through a hop push of the previous world
    used.loadTrack(gauntlet(), 5);
    for (let i = 0; i < N; i++) {
      fresh.step(script(i));
      used.step(script(i));
      if (hash(fresh) !== hash(used)) throw new Error(`used world diverged from fresh at tick ${i + 1}`);
    }
    // and reset(-1) on both equals a fresh load
    fresh.reset(-1);
    used.reset(-1);
    const again = createBikePhysics(HZ);
    again.loadTrack(gauntlet(), 5);
    for (let i = 0; i < 600; i++) {
      fresh.step(script(i));
      used.step(script(i));
      again.step(script(i));
      expect(hash(fresh), `reset replay tick ${i}`).toBe(hash(again));
      expect(hash(used), `reset replay tick ${i}`).toBe(hash(again));
    }
  });
});


describe('ground-started rider transfer snapshots', () => {
  for (const bike of ['rookie', 'pro'] as const) {
    it(`${bike}: midpoint, reverse cancellation and reset retain exact state bytes`, () => {
      const a = createBikePhysics(HZ), b = createBikePhysics(HZ);
      const track = makeTrack({ finishX: 1e9 });
      a.loadTrack(track, 31, { bike }); b.loadTrack(track, 31, { bike });
      const blend = F_SLOTS.indexOf('transferBlend');
      for (let i=0;i<60;i++) a.step(quantizeInput({}));
      for (let i=0;i<36;i++) a.step(quantizeInput({lean:-1,throttle:.3}));
      for (let i=1;i<=8;i++) a.step(quantizeInput({lean:-1+i/15,throttle:.3}));
      const midpoint = a.snapshot();
      expect(midpoint.f64[blend]).toBeGreaterThan(.9);
      for (const root of [midpoint]) {
        b.restore(root);
        for (let i=0;i<100;i++) {
          const input=quantizeInput(i<6?{lean:-.4+i/15,throttle:.3}:i<18?{lean:-1,throttle:.2}:{lean:0,throttle:.2});
          a.step(input); b.step(input);
          expect(b.snapshot().f64).toEqual(a.snapshot().f64);
          expect(b.snapshot().u8).toEqual(a.snapshot().u8);
          if(i===6) {
            const cancelled=a.snapshot();
            expect(cancelled.f64[blend]).toBe(0);
            b.step(quantizeInput({lean:1,throttle:1}));
            b.restore(cancelled);
          }
        }
      }
      a.restore(midpoint);
      a.step(quantizeInput({restart:true}));
      expect(a.snapshot().f64.slice(blend,blend+6)).toEqual(new Float64Array(6));
      a.loadTrack(track,31,{bike});
      expect(a.snapshot().f64.slice(blend,blend+6)).toEqual(new Float64Array(6));
    });
  }
});
