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
  /** Balance pitch (deg) the bike would have at another lean, zero acceleration. */
  balanceAt: (lean: number) => number;
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
    balanceAt: (lean) => world.balancePitch(lean, 0) * RAD,
  };
}

/** Run a controller against the world: decisions at decisionHz, applied after latencyMs. */
export function runController(world: BikePhysicsWorld, ctrl: Controller, opts: RunOptions): RunResult {
  const hz = world.physicsHz;
  const decisionEvery = Math.max(1, Math.round(hz / (opts.decisionHz ?? 60)));
  const latencyTicks = Math.round(((opts.latencyMs ?? 0) / 1000) * hz);
  const queue: { at: number; input: InputFrame }[] = [];
  let current = quantizeInput({});
  let last = world.getState();
  for (let i = 0; i < opts.ticks; i++) {
    if (i % decisionEvery === 0) queue.push({ at: i + latencyTicks, input: quantizeInput(ctrl(observe(world, last))) });
    while (queue.length > 0 && queue[0]!.at <= i) current = queue.shift()!.input;
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
 * Steep climb of a plank whose base is at `baseX`, three phases like the reference clips:
 * approach — neutral, pop the front a little so the wheel meets the plank face instead of its
 * base; transition — front on the plank, rear still on the flat: weight forward, drive the
 * rear into the corner; climb — hang over the bars (lean +1) and use the throttle as the pitch
 * loop against the wheelie balance point (front hovering a few degrees above the slope). On a
 * plank steeper than the balance pitch the front cannot stay down, so the controller chops the
 * throttle and lets the bike roll back (the roll-back deceleration brings the nose down).
 */
export function climber(slopeDeg: number, baseX = -Infinity, opts: { hover?: number; margin?: number; kd?: number; speed?: number; cornerSpeed?: number; topX?: number; popDeg?: number } = {}): Controller {
  const hover = opts.hover ?? 8; // frame pitch above the slope with the front just off it (rear squat + fork extension are ~4 deg)
  const margin = opts.margin ?? 10;
  const kd = opts.kd ?? 0.06;
  const speed = opts.speed ?? 5;
  let phase = 0; // 0 approach, 1 transition, 2 climb (latched: never steps back)
  return (o) => {
    const rearX = o.state.wheels.rear.pos.x;
    const frontX = o.state.wheels.front.pos.x;
    if (phase === 0 && frontX >= baseX - 0.05) phase = 1;
    if (phase === 1 && rearX >= baseX - 0.15) phase = 2;
    if (opts.topX !== undefined && frontX > opts.topX - 0.2) {
      // front at the lip: keep it pinned so the bike carries over the edge instead of hanging on
      // the bash plate (the front carries weight now, no loop risk), then settle the nose and ride on
      if (rearX < opts.topX + 0.1) return { throttle: 1, lean: 1 };
      return { throttle: o.pitchDeg > 20 ? 0.1 : 0.4, lean: o.pitchDeg > 10 ? 0.6 : 0.2, brake: o.pitchDeg > 45 ? 0.5 : 0 };
    }
    if (phase === 0) {
      // approach: hold speed, lift the front to ~15 deg in the last metre
      const pop = frontX > baseX - 1.2;
      const hold = Math.max(0, Math.min(1, 0.05 + 0.15 * (speed - o.speed)));
      if (!pop) return { throttle: hold, lean: 0 };
      const err = (opts.popDeg ?? 15) - o.pitchDeg - kd * o.pitchRateDeg;
      return { throttle: Math.max(0.3, Math.min(1, 0.5 + 0.05 * err)), lean: -0.4 };
    }
    if (phase === 1) {
      // transition: front on the face, rear on the flat. Weight forward, roll the rear into the
      // corner at a walking pace (a fast rear-wheel hit on the corner launches the bike). If the
      // nose comes up past the balance point while the rear is still in the corner, chop it.
      const balT = o.balanceAt(1);
      if (o.pitchDeg > balT - 2) return { throttle: 0, lean: 1, brake: o.pitchDeg > balT + 2 ? 1 : 0 };
      const hold = Math.max(0.2, Math.min(1, 0.4 + 0.3 * ((opts.cornerSpeed ?? 1.8) - o.speed)));
      return { throttle: hold, lean: Math.max(0.6, Math.min(1, o.pitchDeg / 40)) };
    }
    // climb: pick the lean whose balance pitch sits `margin` above the slope (front hovering, rear
    // carrying the weight), then hold the pitch a few degrees above the slope with the throttle
    let leanBase = 1;
    for (let l = 0.3; l <= 1; l += 0.05) {
      if (o.balanceAt(l) >= slopeDeg + margin) {
        leanBase = l;
        break;
      }
    }
    const balL = o.balanceAt(leanBase);
    // in the last metre before the lip, accelerate into it: the front is about to land on the flat
    const nearTop = opts.topX !== undefined && frontX > opts.topX - 1.0;
    const target = Math.min(slopeDeg + hover + (nearTop ? 6 : 0), balL - (nearTop ? 0 : 2));
    const err = target - o.pitchDeg - kd * o.pitchRateDeg;
    let throttle = err > 0 ? 1 : Math.max(0, 1 + err / 4);
    const slip = o.state.rearSlip;
    if (slip > 0.6) throttle = Math.min(throttle, Math.max(0.35, 1 - (slip - 0.6) * 0.6));
    // slow loop: weight forward as the nose rises past the target (the balance formula is static;
    // suspension squat and the torso swing move the real balance point by a few degrees)
    const lean = Math.max(leanBase - 0.15, Math.min(1, leanBase + 0.02 * (o.pitchDeg - target)));
    let brake = 0;
    if (o.pitchDeg > balL) {
      throttle = 0;
      brake = o.pitchDeg > balL + 3 && o.speed > 0.5 ? 1 : 0;
    }
    return { throttle, lean, brake };
  };
}

/**
 * Wheelie balance. Lean is slow (body) and every lean change kicks the frame through the torso
 * swing, so the lean is parked where the static balance pitch equals the target and the throttle
 * is the whole fast loop: nose low -> gas (acceleration lifts the nose), nose high -> off (and
 * rear brake when it is really getting away). Holds indefinitely at 60 Hz with 100 ms latency.
 */
export function wheeliePD(targetDeg: number, targetSpeed: number, kp = 0.08, kd = 0.03): Controller {
  return (o) => {
    const err = targetDeg - o.pitchDeg;
    const rate = o.pitchRateDeg;
    let lean = 1;
    for (let l = -1; l <= 1; l += 0.05) {
      if (o.balanceAt(l) >= targetDeg) {
        lean = l;
        break;
      }
    }
    let throttle = 0.2 + kp * err - kd * rate + 0.05 * (targetSpeed - o.speed);
    throttle = Math.max(0, Math.min(1, throttle));
    const brake = err < -8 && rate > 0 ? Math.min(1, (-err - 8) / 10) : 0;
    return { lean, throttle, brake };
  };
}
