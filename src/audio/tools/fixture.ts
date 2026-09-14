/**
 * Scripted PhysicsState trajectories for offline renders and tests (no
 * physics needed). The "gauntlet" script walks every sound source:
 *   countdown → GO → idle → throttle ramp → limiter → jump + landing →
 *   crash → auto-restart → wood/metal riding + checkpoint → finish.
 */
import type { GameEvent, PhysicsState, SurfaceKind } from '../../core/types';
import type { StateScript } from '../offline';

export function blankState(): PhysicsState {
  const wheel = (): PhysicsState['wheels']['rear'] => ({
    pos: { x: 0, y: 0 },
    spin: 0,
    spinVel: 0,
    compression: 0.2,
    grounded: true,
  });
  return {
    tick: 0,
    time: 0,
    bike: { pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, angle: 0, angVel: 0 },
    wheels: { rear: wheel(), front: wheel() },
    rider: { lean: 0, crouch: 0, torsoPitch: 0, armExtend: 0 },
    checkpoint: -1,
    finished: false,
    faulted: null,
    finishTime: null,
    input: { throttle: 0, brake: 0, lean: 0 },
    engine: { rpm: 1500, throttleEff: 0, limiter: false },
    contacts: { rear: 'dirt', front: 'dirt' },
    rearSlip: 0,
    hopPhase: 'idle',
    ragdoll: null,
    seesaws: [],
    drums: [],
  };
}

export interface GauntletMarks {
  go: number;
  throttleStart: number;
  limiterStart: number;
  takeoff: number;
  landing: number;
  crash: number;
  restart: number;
  checkpoint: number;
  finish: number;
  end: number;
}

export const GAUNTLET: GauntletMarks = {
  go: 3.0,
  throttleStart: 4.0,
  limiterStart: 7.0,
  takeoff: 8.0,
  landing: 8.8,
  crash: 10.0,
  restart: 11.0,
  checkpoint: 13.0,
  finish: 15.0,
  end: 17.0,
};

const lerp = (a: number, b: number, t: number): number => a + (b - a) * Math.min(1, Math.max(0, t));

/** Build the gauntlet script. `updateHz` must match the render. */
export function gauntletScript(updateHz = 60, marks: GauntletMarks = GAUNTLET): StateScript {
  const s = blankState();
  const dt = 1 / updateHz;
  let segmentStart = 0;
  let fired: Record<string, boolean> = {};
  let x = 0;
  return (u: number, t: number, emit: (e: GameEvent) => void): PhysicsState => {
    const once = (key: string, f: () => void): void => {
      if (!fired[key]) {
        fired[key] = true;
        f();
      }
    };
    // countdown + go
    if (t < marks.go) {
      const n = 3 - Math.floor(t);
      once(`cd${n}`, () => emit({ type: 'countdown', n: n as 3 | 2 | 1 }));
    }
    once('go', () => {
      if (t >= marks.go) emit({ type: 'go' });
    });
    if (t < marks.go) fired['go'] = false;

    let rpm = 1500;
    let load = 0;
    let limiter = false;
    let vx = 0;
    let grounded = true;
    let surface: SurfaceKind = 'dirt';
    let compression = 0.2;
    let slip = 0;

    if (t >= marks.throttleStart && t < marks.limiterStart) {
      const k = (t - marks.throttleStart) / (marks.limiterStart - marks.throttleStart);
      load = 1;
      rpm = lerp(1500, 10000, Math.pow(k, 0.7));
      vx = lerp(0, 18, k);
      slip = k < 0.15 ? 4 : 0;
    } else if (t >= marks.limiterStart && t < marks.takeoff) {
      load = 1;
      // limiter: cut at 10000, re-arm at 9500 — a 12 Hz sawtooth between them
      const ph = ((t - marks.limiterStart) * 12) % 1;
      rpm = 9500 + 500 * ph;
      limiter = ph > 0.7;
      vx = 20;
    } else if (t >= marks.takeoff && t < marks.landing) {
      load = 0.3;
      rpm = 6000;
      vx = 18;
      grounded = false;
      compression = 0;
      once('takeoff', () => undefined);
    } else if (t >= marks.landing && t < marks.crash) {
      load = 0.6;
      rpm = 5000;
      vx = 16;
      const k = (t - marks.landing) / 0.12;
      compression = k < 1 ? lerp(0.2, 1.0, k) : lerp(1.0, 0.3, (t - marks.landing - 0.12) / 0.3);
      once('land', () => {
        emit({ type: 'land', impulse: 900, wheel: 'rear', surface: 'dirt', tick: u * 2 });
        emit({ type: 'land', impulse: 500, wheel: 'front', surface: 'dirt', tick: u * 2 + 2 });
      });
    } else if (t >= marks.crash && t < marks.restart) {
      once('crash', () => emit({ type: 'fault', reason: 'crash', tick: u * 2, time: t }));
      rpm = 2500;
      vx = 0;
      grounded = false;
      compression = 0;
    } else if (t >= marks.restart && t < marks.finish) {
      once('restart', () => {
        emit({ type: 'restart', checkpoint: 0, tick: 0 });
        segmentStart = t;
      });
      const k = (t - marks.restart) / (marks.finish - marks.restart);
      load = 0.8;
      rpm = lerp(3000, 8000, k);
      vx = lerp(6, 14, k);
      surface = t < marks.checkpoint ? 'wood' : 'metal';
      once('checkpoint', () => {
        if (t >= marks.checkpoint) emit({ type: 'checkpoint', index: 1, tick: u * 2, time: t });
      });
      if (t < marks.checkpoint) fired['checkpoint'] = false;
    } else if (t >= marks.finish) {
      once('finish', () => emit({ type: 'finish', tick: u * 2, time: t }));
      load = 0;
      rpm = lerp(6000, 1500, (t - marks.finish) / 1.5);
      vx = lerp(12, 0, (t - marks.finish) / 2);
      surface = 'metal';
    }

    x += vx * dt;
    const segT = t - segmentStart;
    s.tick = Math.round(segT * 120);
    s.time = segT;
    s.bike.pos.x = x;
    s.bike.vel.x = vx;
    s.bike.vel.y = grounded ? 0 : -2;
    s.engine.rpm = rpm;
    s.engine.throttleEff = load;
    s.engine.limiter = limiter;
    s.input.throttle = load;
    const spinVel = (vx + slip) / 0.34;
    for (const w of [s.wheels.rear, s.wheels.front]) {
      w.grounded = grounded;
      w.compression = compression;
      w.spinVel = spinVel;
      w.spin += spinVel * dt;
      w.pos.x = x;
    }
    s.contacts.rear = grounded ? surface : null;
    s.contacts.front = grounded ? surface : null;
    s.rearSlip = slip;
    s.faulted = t >= marks.crash && t < marks.restart ? 'crash' : null;
    s.finished = t >= marks.finish;
    if (t >= marks.restart && t < marks.restart + dt) fired = { ...fired, land: false };
    return s;
  };
}
