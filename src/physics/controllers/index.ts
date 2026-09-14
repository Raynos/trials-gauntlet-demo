/**
 * Closed-loop controllers used ONLY by the physics feel tests (CONTRACT §3:
 * the harness has its own bot). A controller sees `PhysicsState` plus a few
 * derived scalars at a decision rate with a latency, and its output goes
 * through `quantizeInput` like a human's.
 */
import type { InputFrame, PhysicsState } from '../../core/types';
import { quantizeInput } from '../../core/replay';
import type { BikePhysicsWorld } from '../bike';

export interface Observation {
  state: PhysicsState;
  t: number;
  pitchDeg: number;
  pitchRateDeg: number;
  speed: number;
  rearGrounded: boolean;
  frontGrounded: boolean;
  airborne: boolean;
  /** world.balancePitch(currentLean, 0) in degrees; the only "cheat", and it is public. */
  balancePitchDeg: number;
}

export type Controller = (obs: Observation) => Partial<InputFrame>;

export interface RunOptions {
  ticks: number;
  decisionHz?: number;
  latencyMs?: number;
  stopWhen?: (s: PhysicsState) => boolean;
  /** Called after every tick with the state (for traces); avoids keeping every state alive. */
  onTick?: (s: PhysicsState, input: InputFrame) => void;
}

export interface RunResult {
  ticks: number;
  last: PhysicsState;
  stopped: boolean;
}

const RAD = 180 / Math.PI;

export function observe(world: BikePhysicsWorld, s: PhysicsState): Observation {
  const rearG = s.wheels.rear.grounded;
  const frontG = s.wheels.front.grounded;
  return {
    state: s,
    t: s.time,
    pitchDeg: s.bike.angle * RAD,
    pitchRateDeg: s.bike.angVel * RAD,
    speed: Math.sqrt(s.bike.vel.x * s.bike.vel.x + s.bike.vel.y * s.bike.vel.y) * Math.sign(s.bike.vel.x || 1),
    rearGrounded: rearG,
    frontGrounded: frontG,
    airborne: !rearG && !frontG,
    balancePitchDeg: world.balancePitch(s.rider.lean, 0) * RAD,
  };
}

/** Run a controller against the world: decisions at decisionHz, applied after latencyMs. */
export function runController(world: BikePhysicsWorld, ctrl: Controller, opts: RunOptions): RunResult {
  const hz = world.physicsHz;
  const decisionEvery = Math.max(1, Math.round(hz / (opts.decisionHz ?? 60)));
  const latencyTicks = Math.round(((opts.latencyMs ?? 0) / 1000) * hz);
  const queue: InputFrame[] = [];
  let current = quantizeInput({});
  let last = world.getState();
  for (let i = 0; i < opts.ticks; i++) {
    if (i % decisionEvery === 0) {
      const decided = quantizeInput(ctrl(observe(world, last)));
      queue.push(decided);
    }
    while (queue.length > latencyTicks + 1) queue.shift();
    if (queue.length > latencyTicks) current = queue[0]!;
    if (queue.length > latencyTicks) queue.shift();
    world.step(current);
    last = world.getState();
    opts.onTick?.(last, current);
    if (opts.stopWhen?.(last)) return { ticks: i + 1, last, stopped: true };
  }
  return { ticks: opts.ticks, last, stopped: false };
}

/** Step the world with a fixed input for n ticks; returns the last state. */
export function stepN(world: BikePhysicsWorld, input: Partial<InputFrame>, n: number, onTick?: (s: PhysicsState) => void): PhysicsState {
  const q = quantizeInput(input);
  let s = world.getState();
  for (let i = 0; i < n; i++) {
    world.step(q);
    s = world.getState();
    onTick?.(s);
  }
  return s;
}

// ---------------------------------------------------------------------------
// Reference controllers
// ---------------------------------------------------------------------------

/** Launch: lean fully forward and hold full throttle, easing off when the front lifts (anti-loop). */
export const fullThrottle: Controller = (o) => {
  let throttle = 1;
  if (o.pitchDeg > 8) throttle = Math.max(0, 1 - (o.pitchDeg - 8) / 10 - o.pitchRateDeg / 60);
  return { throttle, lean: 0.2 };
};

/** Coast at a target speed with a small throttle PI loop (used to set up other tests). */
export function cruise(targetSpeed: number, lean = 0): Controller {
  return (o) => ({ throttle: Math.max(0, Math.min(1, 0.05 + 0.25 * (targetSpeed - o.speed))), brake: o.speed > targetSpeed + 0.5 ? 0.3 : 0, lean });
}

/** Airborne pitch control: throttle nose-up, brake nose-down, lean with it. */
export function airPitch(targetDeg: number): Controller {
  return (o) => {
    if (!o.airborne) return { throttle: 0.2, lean: 0 };
    const err = targetDeg - o.pitchDeg - 0.25 * o.pitchRateDeg;
    if (err > 3) return { throttle: 1, lean: -1 };
    if (err < -3) return { brake: 1, lean: 1 };
    return { lean: 0 };
  };
}

/**
 * Bunny hop as a scripted technique: preload (lean back + throttle) for
 * `preloadS`, then snap the lean forward. `throttle` during the preload keeps
 * the bike still (rear brake holds it) or rolling when `roll` is set.
 */
export function hopper(startT: number, preloadS = 0.3, roll = false): Controller {
  return (o) => {
    const t = o.t - startT;
    if (t < 0) return roll ? { throttle: 0.35, lean: 0 } : { brake: 1, lean: 0 };
    if (t < preloadS) return { throttle: roll ? 0.6 : 0.35, lean: -1, brake: roll ? 0 : 1 };
    if (t < preloadS + 0.35) return { throttle: roll ? 0.4 : 0.3, lean: 1 };
    return { throttle: 0.2, lean: 0 };
  };
}

/**
 * Rolling hop onto a ledge whose vertical face is at `wallX`: hold `speed` on the approach,
 * preload (lean back + throttle) from `preloadDist` before the wall, snap forward at `snapDist`.
 */
export function ledgeHopper(wallX: number, speed = 5, preloadDist = 4, snapDist = 1.4, wheelieDeg = 30): Controller {
  return (o) => {
    const frontX = o.state.wheels.front.pos.x;
    const dist = wallX - frontX;
    const hold = Math.max(0, Math.min(1, 0.05 + 0.15 * (speed - o.speed)));
    if (dist > preloadDist) return { throttle: hold, lean: 0 };
    if (dist > snapDist) {
      // manual: lean back, gas to pop the front, then hold the pitch with throttle
      const err = wheelieDeg - o.pitchDeg;
      const throttle = Math.max(0.3, Math.min(1, 0.4 + 0.05 * err - 0.01 * o.pitchRateDeg));
      return { throttle, lean: -1 };
    }
    if (dist > -1.5) return { throttle: 0.5, lean: 1 };
    return { throttle: 0.3, lean: 0 };
  };
}

/**
 * Steep climb: hang over the bars and hold the pitch a few degrees above the slope with the
 * throttle (more gas = nose up); rear brake when it gets away, ease off on wheelspin.
 */
export function climber(slopeDeg: number): Controller {
  return (o) => {
    // both wheels down: full gas while the pitch is at/below the slope, ease off as the nose lifts
    const over = o.pitchDeg - slopeDeg;
    let throttle = over < 1 ? 1 : Math.max(0, 1 - (over - 1) / 7);
    if (o.pitchRateDeg > 80) throttle = Math.min(throttle, 0.2);
    // traction control: back off before the tyre passes its grip peak
    const slip = o.state.rearSlip;
    if (slip > 0.5) throttle = Math.min(throttle, Math.max(0.3, 1 - (slip - 0.5) * 0.5));
    const brake = over > 12 ? Math.min(1, (over - 12) / 10) : 0;
    const lean = Math.max(0.3, Math.min(1, o.pitchDeg / 30));
    return { throttle, lean, brake };
  };
}

/**
 * Wheelie balance. Lean is slow (body), so the fast loop is throttle/brake: nose low -> gas
 * (acceleration raises the balance point), nose high -> brake. Lean handles the bias.
 */
export function wheeliePD(targetDeg: number, targetSpeed: number, kp = 0.06, kd = 0.012): Controller {
  return (o) => {
    const err = targetDeg - o.pitchDeg;
    const rate = o.pitchRateDeg;
    const lean = Math.max(-1, Math.min(1, -0.04 * err + 0.004 * rate));
    let throttle = 0.35 + kp * err - kd * rate + 0.05 * (targetSpeed - o.speed);
    throttle = Math.max(0, Math.min(1, throttle));
    const brake = err < -6 || (err < 0 && rate > 40) ? Math.max(0, Math.min(1, -kp * err + kd * rate)) : 0;
    return { lean, throttle, brake };
  };
}
