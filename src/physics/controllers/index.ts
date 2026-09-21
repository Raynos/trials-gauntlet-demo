/**
 * Closed-loop controllers used ONLY by the physics feel tests (CONTRACT §3:
 * the harness has its own bot). A controller sees `PhysicsState` plus a few
 * derived scalars at a decision rate with a latency, and its output goes
 * through `quantizeInput` like a human's.
 */
import type { InputFrame, PhysicsState } from '../../core/types';
import { quantizeInput } from '../../core/replay';
import type { PhysicsWorld } from '../index';

/** What a controller needs from a world: v1 and v2 both satisfy it. */
export interface ControllableWorld extends PhysicsWorld {
  balancePitch(lean: number, accel?: number): number;
}
type BikePhysicsWorld = ControllableWorld;

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
 * the bike still (rear brake holds it) or rolling when `roll` is set. (v1's
 * rows are measured with this one; the v2 technique is `hopperV2`.)
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
 * The v2 hop (physics-v2 §9.5, R2): preload (lean back, a little throttle) for `preloadS`, snap the lean
 * forward and hold it `snapS` (the legs' push + the arms' pull), then a quick lean back for `tuckS` (the
 * third movement of Lesson 7: the body drops toward the bike and pulls the rear up under the rider), then
 * neutral. `roll` keeps the bike moving through the preload instead of holding it on the rear brake.
 */
export function hopperV2(startT: number, preloadS = 0.3, roll = false, snapS = 0.22, tuckS = 0.1): Controller {
  return (o) => {
    const t = o.t - startT;
    if (t < 0) return roll ? { throttle: 0.35, lean: 0 } : { brake: 1, lean: 0 };
    if (t < preloadS) return { throttle: roll ? 0.5 : 0.3, lean: -1 };
    if (t < preloadS + snapS) return { throttle: 0.3, lean: 1 };
    if (t < preloadS + snapS + tuckS) return { throttle: 0.2, lean: -1 };
    if (!o.airborne && o.pitchDeg > 15) return { throttle: 0.1, lean: 1 };
    return { throttle: 0.2, lean: 0 };
  };
}

/**
 * The same hop keyed to a lip at `lipX` for a rolling approach at `speed` (the lab level's take-off):
 * hold the speed, start the preload `preloadS` before the front wheel reaches the lip and snap as it
 * passes it, tuck, then fly neutral and lean into the landing (nose high: forward; nose low: back).
 */
export function lipHopper(lipX: number, speed = 8.5, preloadS = 0.3, snapS = 0.22, tuckS = 0.1, hop = true, o: { preLean?: number; thrPre?: number; snapLead?: number; snapLean?: number; thrSnap?: number } = {}): Controller {
  const preLean = o.preLean ?? -0.8;
  const snapLean = o.snapLean ?? 1;
  const thrSnap = o.thrSnap ?? 0.5;
  const snapLead = o.snapLead ?? 0.8; // the REAR wheel this far before the lip's edge: the push leaves the ramp through the rear
  let snapT = NaN;
  let preT = NaN;
  return (ob) => {
    const rearX = ob.state.wheels.rear.pos.x;
    const v = Math.max(1, ob.speed);
    const hold = Math.max(0, Math.min(1, 0.15 + 0.3 * (speed - ob.speed)));
    // approach with the weight forward (R3: the Pro loops at lean 0 under the hold throttle from a standstill)
    const approachLean = ob.speed < speed - 1 ? 0.5 : 0;
    if (!hop) {
      if (rearX < lipX) return { throttle: hold, lean: approachLean };
      return { throttle: 0.25, lean: ob.pitchDeg < -10 ? -0.8 : 0 };
    }
    if (Number.isNaN(preT) && rearX >= lipX - snapLead - preloadS * v) preT = ob.t;
    if (Number.isNaN(preT)) return { throttle: hold, lean: approachLean };
    if (Number.isNaN(snapT) && (rearX >= lipX - snapLead || ob.t - preT >= preloadS + 0.15)) snapT = ob.t;
    if (Number.isNaN(snapT)) return { throttle: o.thrPre ?? hold, lean: preLean };
    const t = ob.t - snapT;
    if (t < snapS) return { throttle: thrSnap, lean: snapLean };
    if (t < snapS + tuckS) return { throttle: 0.3, lean: -1 };
    // fly it: hold the lean back (K_att nose-up) while the nose is dropping, forward against a rising nose
    // Keep landing recovery through a front-wheel-only touchdown: straightening the rider before
    // the rear wheel arrives transfers the torso's angular momentum into a forward endo.
    if (ob.airborne || !ob.state.wheels.rear.grounded) return { throttle: 0.3, lean: ob.pitchRateDeg < -30 || ob.pitchDeg < -5 ? -1 : ob.pitchDeg > 25 || ob.pitchRateDeg > 60 ? 0.6 : 0 };
    return { throttle: 0.3, lean: ob.pitchDeg > 15 ? 0.8 : 0 };
  };
}

/**
 * Wheelie hold for the v2 plant (R2). The chassis balances about the rear axle at `balanceAt(lean)`
 * (attitude torque included), so the lean is PARKED where the coasting balance sits `park` deg above
 * the target and barely moves (every lean change kicks the pitch through the torso swing and K_att);
 * the throttle (nose up) and the rear brake (nose down) are the fast loop, a slow integral on the
 * throttle removes the proportional offset, and a small speed term keeps it from running away.
 * The entry is not this controller's job: start it from a wheelie (the tests teleport into one).
 */
export function wheelieHoldV2(targetDeg: number, targetSpeed: number, o: { park?: number; kp?: number; kd?: number; ki?: number; kb?: number; kdb?: number; ks?: number; bias?: number; leanRate?: number } = {}): Controller {
  const park = o.park ?? 1;
  const kp = o.kp ?? 0.03;
  const kd = o.kd ?? 0.012;
  const ki = o.ki ?? 0;
  const kb = o.kb ?? 0.08;
  const kdb = o.kdb ?? 0.015;
  const ks = o.ks ?? 0.02;
  const bias = o.bias ?? 0.1;
  const leanRate = o.leanRate ?? 2;
  let leanCmd = NaN;
  let lastT = NaN;
  let integ = 0;
  return (ob) => {
    let leanPark = 1;
    for (let l = -1; l <= 1.001; l += 0.01) {
      if (ob.balanceAt(l) >= targetDeg + park) {
        leanPark = l;
        break;
      }
    }
    if (Number.isNaN(leanCmd)) leanCmd = leanPark;
    const dtc = Number.isNaN(lastT) ? 0 : ob.t - lastT;
    lastT = ob.t;
    const err = targetDeg - ob.pitchDeg;
    const rate = ob.pitchRateDeg;
    integ = Math.max(-0.3, Math.min(0.3, integ + ki * err * dtc));
    leanCmd += Math.max(-leanRate * dtc, Math.min(leanRate * dtc, leanPark - leanCmd));
    const throttle = Math.max(0, Math.min(1, bias + integ + kp * err - kd * rate + ks * (targetSpeed - ob.speed)));
    const brake = err < 0 ? Math.max(0, Math.min(1, -(kb * err + kdb * rate))) : 0;
    return { throttle, lean: leanCmd, brake };
  };
}

/**
 * Wheelie hold with anticipation (R3, parent decision 4). Same actuators as `wheelieHoldV2` (parked lean,
 * throttle up / rear brake down) but the feedback variable is the PREDICTED pitch `pitch + rate * horizon`,
 * the way a human leads a slow actuator: the Rookie's throttle is a 0.15 s lag behind a 100 ms decision
 * latency, and against the 0.3 s e-fold a PD on the current pitch limit-cycles +-9 deg and eventually
 * loops. `horizon` ~ latency + throttle lag. The lean is parked at the coasting balance and left alone.
 */
export function wheelieHoldV3(targetDeg: number, targetSpeed: number, o: { park?: number; horizon?: number; kp?: number; kd?: number; ki?: number; kb?: number; ks?: number; bias?: number } = {}): Controller {
  const park = o.park ?? 1;
  const horizon = o.horizon ?? 0.25;
  const kp = o.kp ?? 0.035;
  const kd = o.kd ?? 0.004;
  const ki = o.ki ?? 0.02;
  const kb = o.kb ?? 0.03;
  const ks = o.ks ?? 0.03;
  const bias = o.bias ?? 0.12;
  let leanCmd = NaN;
  let lastT = NaN;
  let integ = 0;
  return (ob) => {
    if (Number.isNaN(leanCmd)) {
      leanCmd = 1;
      for (let l = -1; l <= 1.001; l += 0.01) {
        if (ob.balanceAt(l) >= targetDeg + park) {
          leanCmd = l;
          break;
        }
      }
    }
    const dtc = Number.isNaN(lastT) ? 0 : ob.t - lastT;
    lastT = ob.t;
    const predicted = ob.pitchDeg + ob.pitchRateDeg * horizon;
    const err = targetDeg - predicted;
    integ = Math.max(-0.25, Math.min(0.25, integ + ki * err * dtc));
    const throttle = Math.max(0, Math.min(1, bias + integ + kp * err - kd * ob.pitchRateDeg + ks * (targetSpeed - ob.speed)));
    const brake = err < -3 ? Math.max(0, Math.min(1, -kb * (err + 3))) : 0;
    return { throttle, lean: leanCmd, brake };
  };
}

/**
 * Rolling hop onto a ledge whose vertical face is at `wallX` (top at `ledgeY`), the way the clips
 * do it: hold `speed` on the approach, then from `preloadDist` before the wall lean back and gas
 * into a wheelie held at `wheelieDeg` (front wheel high enough to meet the lip, not the face);
 * when the front is `snapDist` from the wall snap forward (the hop push lifts the rear); once the
 * rear is over the lip level the bike with throttle/lean (nose-down: gas + lean back; nose-up:
 * brake + lean forward) and ride away.
 */
export function ledgeHopper(wallX: number, speed = 5, preloadDist = 4, snapDist = 0.4, wheelieDeg = 35): Controller {
  let snapped = false;
  return (o) => {
    const frontX = o.state.wheels.front.pos.x;
    const rearX = o.state.wheels.rear.pos.x;
    const dist = wallX - frontX;
    const hold = Math.max(0, Math.min(1, 0.05 + 0.15 * (speed - o.speed)));
    if (!snapped && dist > preloadDist) return { throttle: hold, lean: 0 };
    if (!snapped && dist > snapDist) {
      // wheelie: lean back, throttle as the pitch loop
      const err = wheelieDeg - o.pitchDeg;
      const throttle = Math.max(0.3, Math.min(1, 0.45 + 0.06 * err - 0.012 * o.pitchRateDeg));
      return { throttle, lean: -1 };
    }
    snapped = true;
    if (rearX < wallX + 0.2) return { throttle: 0.5, lean: 1 };
    // recover: level the bike, then ride
    if (o.airborne || !o.rearGrounded) {
      if (o.pitchDeg < -8) return { throttle: 1, lean: -0.6 };
      if (o.pitchDeg > 25) return { brake: 1, throttle: 0, lean: 1 };
      return { throttle: 0.4, lean: 0.3 };
    }
    return { throttle: 0.35, lean: 0 };
  };
}

/**
 * Log / drum crossing by a front lift (techniques.md clips 10-12): hold `speed` on the approach,
 * then from `leadDist` before the drum centre pop the front with throttle against a lean of -0.4
 * (above `hopLeanBack`, so no preload starts: a snap here would fire a hop) to the pitch that puts
 * the front wheel centre at the drum top (`asin(2r / wheelbase)` + a margin); once the front is on
 * the drum hang over the bars and drive the rear into and up the face, then settle. Geometry bounds
 * it: a drum of radius r standing on the ground is 2r tall and meets a 0.34 m wheel at
 * `acos((R - r) / (R + r))` from vertical (86 deg for r 0.3), so without the lift every drum is a
 * wall; and for r >= 0.45 the face bulges into the frame's underside, so the bash plate catches
 * before the rear reaches the face and the bike hangs (see physics.md 12.3).
 */
export function drumLifter(centreX: number, r: number, speed = 5, opts: { popDeg?: number; leadDist?: number } = {}): Controller {
  const R = 0.34;
  const target = opts.popDeg ?? Math.min(45, (Math.asin(Math.min(1, (2 * r) / 1.3)) * 180) / Math.PI + 8);
  const leadDist = opts.leadDist ?? 2.5;
  let phase = 0;
  return (o) => {
    const fx = o.state.wheels.front.pos.x;
    const rx = o.state.wheels.rear.pos.x;
    const dist = centreX - fx;
    // approach with the revs up (round 7, soft clutch: a pop off an idling crank arrives 0.25 s late),
    // holding the speed on the brake instead of a closed throttle
    const hold = Math.max(0.25, Math.min(1, 0.05 + 0.15 * (speed - o.speed)));
    if (phase === 0 && dist > leadDist) return { throttle: hold, lean: 0, brake: o.speed > speed + 0.2 ? 0.3 : 0 };
    if (phase === 0 && (dist > r + 0.15 || (!o.frontGrounded && fx < centreX))) {
      if (fx > centreX - r - 0.1 && o.state.wheels.front.pos.y > 2 * r + R - 0.05) phase = 1;
      else {
        const err = target - o.pitchDeg - 0.05 * o.pitchRateDeg;
        return { throttle: Math.max(0.3, Math.min(1, 0.5 + 0.06 * err)), lean: -0.4 };
      }
    }
    phase = 1;
    if (rx < centreX + r * 0.3) return { throttle: o.pitchDeg > 50 ? 0.1 : 0.9, lean: 1 };
    if (o.pitchDeg < -15) return { throttle: 0.6, lean: -0.5 };
    return { throttle: 0.4, lean: 0.2 };
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
  const hover = opts.hover ?? 10; // frame pitch above the slope with the front just off it (rear squat + fork extension are ~4 deg; round 9: 8 -> 10, the 60 deg crest stalled at the lip with the rear spinning once the drag became a field)
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
      if (rearX < opts.topX + 0.1) {
        // drive through the lip (round 7): with the front over the flat there is no loop to fear, and the
        // round-6 chop at the balance pitch is what hung the bike (speed 1.2 -> 0.4 m/s, then the
        // floored throttle spun the tyre at 20 m/s of slip and the plate rested on the edge). Feather
        // only on real wheelspin, ease only if the nose actually passes the balance point; no brake.
        const slipHere = o.state.rearSlip;
        const thr = o.pitchDeg > o.balanceAt(1) + 4 ? 0.3 : slipHere > 3 ? 0.6 : 1;
        return { throttle: thr, lean: 1, brake: 0 };
      }
      // over the lip: stay over the bars until the nose is down (a lean change here swings the torso
      // and kicks the nose up while the spinning rear grabs the edge), brake if it keeps rising
      if (o.pitchDeg > 25) return { throttle: 0, lean: 1, brake: o.pitchDeg > 35 || o.pitchRateDeg > 40 ? 1 : 0 };
      return { throttle: 0.3, lean: o.pitchDeg > 10 ? 0.8 : 0.3 };
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
      const hold = Math.max(0.2, Math.min(1, 0.4 + 0.3 * ((opts.cornerSpeed ?? 2.5) - o.speed)));
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
export function wheeliePD(targetDeg: number, targetSpeed: number, kp = 0.08, kd = 0.03, ks = 0.05, bias = 0.2, kv = 0, kb = 0): Controller {
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
    let throttle = bias + kp * err - kd * rate + ks * (targetSpeed - o.speed);
    // kv > 0: the rider's throttle ceiling closes as the bike runs past the target speed (a wheelie
    // held at constant speed on a bike with no drag governor: the throttle balances, it does not
    // accelerate; round 11, the Pro bike)
    const ceil = kv > 0 ? Math.max(0.1, 1 - kv * (o.speed - targetSpeed)) : 1;
    const raw = throttle;
    throttle = Math.max(0, Math.min(ceil, throttle));
    // kb > 0: the rear brake is the throttle's negative half (a rider covers the rear brake in a
    // wheelie: the correction is symmetric and the mean thrust is zero, so the speed holds)
    const brake = kb > 0 ? Math.max(0, Math.min(1, -raw * kb)) : err < -8 && rate > 0 ? Math.min(1, (-err - 8) / 10) : 0;
    return { lean, throttle, brake };
  };
}

/**
 * Wheelie hold the way the reference rider does it (techniques obs 8, 11): the LEAN is the balance
 * actuator (sit back = nose up, over the bars = nose down, through the mass shift and the torso
 * store), parked where the static balance equals the target and driven by a PD on the pitch error;
 * the throttle is a slow speed loop around `throttle` with a small pitch term, and the rear brake
 * catches a nose past the target and still rising. Round 11: the throttle-only `wheeliePD` is a
 * bang-bang on a bike with no drag governor (its mean thrust runs the Pro to the limiter and the
 * plant gain with it); a rider balances with his body.
 */
export function wheelieLean(targetDeg: number, targetSpeed: number, opts: { kl?: number; kdl?: number; kp?: number; kd?: number; ks?: number; throttle?: number } = {}): Controller {
  const kl = opts.kl ?? 0.05;
  const kdl = opts.kdl ?? 0.01;
  const kp = opts.kp ?? 0.01;
  const kd = opts.kd ?? 0.005;
  const ks = opts.ks ?? 0.08;
  const thr0 = opts.throttle ?? 0.25;
  return (o) => {
    const err = targetDeg - o.pitchDeg;
    const rate = o.pitchRateDeg;
    let leanBal = 1;
    for (let l = -1; l <= 1; l += 0.05) {
      if (o.balanceAt(l) >= targetDeg) {
        leanBal = l;
        break;
      }
    }
    const lean = Math.max(-1, Math.min(1, leanBal - kl * err + kdl * rate));
    let throttle = thr0 + kp * err - kd * rate + ks * (targetSpeed - o.speed);
    throttle = Math.max(0, Math.min(1, throttle));
    const brake = err < -8 && rate > 0 ? Math.min(1, (-err - 8) / 10) : 0;
    return { lean, throttle, brake };
  };
}
