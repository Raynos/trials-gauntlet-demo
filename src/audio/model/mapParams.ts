/**
 * Pure, allocation-free mapping from physics state to AudioParams.
 *
 * Nothing here touches a clock, `Math.random`, or Web Audio. The only memory
 * is `ModelScratch` (previous-frame values for edge detection and envelope
 * timers), so the output depends solely on the ordered sequence of
 * `(state, input, dt)` and `GameEvent`s — which is what makes an offline
 * render byte-identical to itself and testable in node.
 *
 * Time: the model advances its own clock from `state.time` deltas when they
 * are positive (segment time from physics), else from `dt`. The game passes
 * the physics dt (1/120) rather than the frame delta, and state.time is the
 * truth regardless of render rate.
 */
import type { InputFrame, PhysicsState } from '../../core/types';
import type { Rng } from '../../core/rng';
import {
  AIRBORNE_MIN_S,
  CHASSIS,
  DUCK,
  ENGINE,
  SPROCKET_TEETH,
  TICK_SPACING,
  TK,
  TYRE_MIN_SPEED,
  WHEEL_RADIUS,
  WIND_SPEED_REF,
  pushTransient,
  surfaceIndex,
  type AudioParams,
} from '../params';

export interface ModelScratch {
  /** Model clock, seconds; runs through restarts. */
  time: number;
  prevStateTime: number;
  prevCompression: [number, number];
  prevGrounded: [boolean, boolean];
  lastThunkAt: [number, number];
  bottomedOut: [boolean, boolean];
  /** Metres travelled since the last distance tick, per wheel. */
  travel: [number, number];
  airborneFor: number;
  wind: number;
  prevSkid: number;
  clutch: number;
  duckImpactUntil: number;
  duckUiUntil: number;
  /** Time the crash happened (engine fades), or -1. */
  crashAt: number;
  /** Time the finish happened (ambience fades), or -1. */
  finishAt: number;
  /** Set on restart; suppresses edge detectors on the very next update. */
  justReset: boolean;
  biome: number;
  /** Updates counted (for tests). */
  updates: number;
}

export function createScratch(): ModelScratch {
  return {
    time: 0,
    prevStateTime: 0,
    prevCompression: [0, 0],
    prevGrounded: [false, false],
    lastThunkAt: [-1, -1],
    bottomedOut: [false, false],
    travel: [0, 0],
    airborneFor: 0,
    wind: 0,
    prevSkid: 0,
    clutch: 0,
    duckImpactUntil: -1,
    duckUiUntil: -1,
    crashAt: -1,
    finishAt: -1,
    justReset: true,
    biome: 0,
    updates: 0,
  };
}

/** Reset per-segment memory (restart); keeps the clock and biome. */
export function resetScratch(s: ModelScratch, keepTime = true): void {
  const time = keepTime ? s.time : 0;
  const biome = s.biome;
  const fresh = createScratch();
  Object.assign(s, fresh);
  s.time = time;
  s.prevStateTime = 0;
  s.biome = biome;
}

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/**
 * Fill `out` from the current physics state. Transients already queued in
 * `out` (from events) are kept; this appends continuous-source edges.
 * `input` is unused for now (physics already applies throttle to
 * `state.engine`), but is part of the contract so the model can see raw
 * intent later (e.g. brake squeal from `input.brake`).
 */
export function mapParams(
  out: AudioParams,
  state: PhysicsState,
  input: Readonly<InputFrame> | undefined,
  dt: number,
  scratch: ModelScratch,
  _rng: Rng,
): void {
  void input;
  // -- clock ---------------------------------------------------------------
  let step = state.time - scratch.prevStateTime;
  if (!(step > 0) || step > 0.5) step = scratch.justReset ? 0 : dt;
  scratch.prevStateTime = state.time;
  scratch.time += step;
  scratch.updates++;
  const now = scratch.time;

  // -- engine (physics owns rpm; we only scale) ----------------------------
  out.rpm = state.engine.rpm;
  out.load = clamp(state.engine.throttleEff, 0, 1);
  out.limiter = state.engine.limiter ? 1 : 0;
  if (scratch.crashAt >= 0) {
    // Stall: the crank sags and dies while the ragdoll flies (physics parks rpm at idle).
    const k = clamp((now - scratch.crashAt) / ENGINE.crashFadeS, 0, 1);
    out.engineGain = 1 - k;
    out.rpm = state.engine.rpm * (1 - ENGINE.stallDrop * k);
    out.load = 0;
    out.limiter = 0;
  } else {
    out.engineGain = 1;
  }

  // -- tyres ----------------------------------------------------------------
  const vx = state.bike.vel.x;
  const vy = state.bike.vel.y;
  const speed = Math.sqrt(vx * vx + vy * vy);
  const rear = state.wheels.rear;
  const front = state.wheels.front;
  const rearSurf = state.contacts.rear;
  const frontSurf = state.contacts.front;
  const rearGround = rearSurf !== null && rear.grounded;
  const frontGround = frontSurf !== null && front.grounded;
  const rearRoll = rearGround ? Math.abs(rear.spinVel) * WHEEL_RADIUS : 0;
  const frontRoll = frontGround ? Math.abs(front.spinVel) * WHEEL_RADIUS : 0;
  out.tyreSpeed[0] = rearRoll < TYRE_MIN_SPEED ? 0 : rearRoll;
  out.tyreSpeed[1] = frontRoll < TYRE_MIN_SPEED ? 0 : frontRoll;
  out.tyreSurface[0] = rearGround ? surfaceIndex(rearSurf) : -1;
  out.tyreSurface[1] = frontGround ? surfaceIndex(frontSurf) : -1;

  out.speed = clamp(speed / 20, 0, 1);
  // auto-clutch slipping: crank parked at clutchRpm under throttle while the wheel lags
  const clutchOn =
    scratch.crashAt < 0 &&
    out.load >= ENGINE.clutchThrottle &&
    Math.abs(state.engine.rpm - ENGINE.clutchRpm) < 80 &&
    rearRoll < 6;
  const kClutch = step > 0 ? 1 - Math.exp(-step / 0.06) : 0;
  scratch.clutch += ((clutchOn ? 1 : 0) - scratch.clutch) * kClutch;
  out.clutch = scratch.clutch < 0.01 ? 0 : scratch.clutch;
  // crashed bike scrubbing along the ground on its frame
  const scraping = state.faulted === 'crash' && state.ragdoll !== null && (rear.grounded || front.grounded) && speed > 0.8;
  out.scrape = scraping ? clamp(speed / 8, 0, 1) : 0;

  // skid: normalised rear slip
  const slip = rearGround ? clamp(Math.abs(state.rearSlip) / Math.max(2, speed), 0, 1) : 0;
  out.skid = slip;
  if (slip >= CHASSIS.skidChirpSlip && scratch.prevSkid < CHASSIS.skidChirpSlip && !scratch.justReset) {
    pushTransient(out, TK.skidChirp, clamp(slip, 0.4, 1), 0, -0.15);
  }
  scratch.prevSkid = slip;

  // chain whine
  out.chainHz = Math.abs(rear.spinVel) / (2 * Math.PI) * SPROCKET_TEETH;
  if (speed < 1.5 && rearRoll < 1.5) out.chainHz = 0;

  // distance ticks (plank joints / drum ridges)
  for (let w = 0; w < 2; w++) {
    const si = out.tyreSurface[w as 0 | 1];
    const spacing = si >= 0 ? TICK_SPACING[si] ?? 0 : 0;
    const v = out.tyreSpeed[w as 0 | 1];
    if (spacing > 0 && v > 0) {
      const before = scratch.travel[w as 0 | 1];
      scratch.travel[w as 0 | 1] = before + v * step;
      // every joint crossed inside this update, sample-placed by its sub-frame delay
      let n = 0;
      while (scratch.travel[w as 0 | 1] >= spacing && n < 4) {
        scratch.travel[w as 0 | 1] -= spacing;
        n++;
        const crossed = n * spacing - before;
        const delay = v > 0 ? clamp(crossed / v, 0, step) : 0;
        const pan = w === 0 ? -0.15 : 0.15;
        if (si === 1) pushTransient(out, TK.plank, clamp(0.35 + v / 20, 0.35, 1), clamp(v / 20, 0, 1), pan, delay);
        else pushTransient(out, TK.tick, clamp(v / 12, 0.2, 1), si / 8, pan, delay);
      }
    } else {
      scratch.travel[w as 0 | 1] = 0;
    }
  }

  // -- chassis edges -------------------------------------------------------
  const wheels = [rear, front] as const;
  const crashed = state.faulted === 'crash' || state.faulted === 'hazard';
  for (let w = 0; w < 2; w++) {
    const wh = wheels[w]!;
    const i = w as 0 | 1;
    const c = clamp(wh.compression, 0, 1);
    const cv = step > 0 ? (c - scratch.prevCompression[i]) / step : 0;
    if (!scratch.justReset && wh.grounded && scratch.prevGrounded[i]) {
      // a tumbling wreck clatters (sparse metal ticks over the scrape), it does not thunk like a landing
      const gap = crashed ? CHASSIS.crashClatterGapS : CHASSIS.thunkMinGapS;
      if (cv > CHASSIS.thunkVel && now - scratch.lastThunkAt[i] >= gap) {
        scratch.lastThunkAt[i] = now;
        if (crashed) pushTransient(out, TK.tick, 0.6, 2 / 8, w === 0 ? -0.3 : 0.3);
        else pushTransient(out, TK.thunk, clamp((cv - CHASSIS.thunkVel) / 12 + 0.3, 0.3, 1), 0, w === 0 ? -0.15 : 0.15);
      }
    }
    const bottom = c >= CHASSIS.bottomOut;
    if (bottom && !scratch.bottomedOut[i] && !scratch.justReset && !crashed) {
      pushTransient(out, TK.bottomOut, 1, 0, w === 0 ? -0.2 : 0.2);
    }
    scratch.bottomedOut[i] = bottom;
    scratch.prevCompression[i] = c;
    scratch.prevGrounded[i] = wh.grounded;
  }

  // -- air / wind ------------------------------------------------------------
  if (!rear.grounded && !front.grounded) scratch.airborneFor += step;
  else scratch.airborneFor = 0;
  out.airborne = scratch.airborneFor >= AIRBORNE_MIN_S ? 1 : 0;
  const windTarget = Math.pow(clamp(speed / WIND_SPEED_REF, 0, 1), 1.5);
  const k = step > 0 ? 1 - Math.exp(-step / 0.15) : 0;
  scratch.wind += (windTarget - scratch.wind) * k;
  out.wind = scratch.wind;

  // -- scene ----------------------------------------------------------------
  out.biome = scratch.biome;
  out.ambientGain = scratch.finishAt >= 0 ? clamp(1 - (now - scratch.finishAt) / 0.25, 0, 1) : 1;
  const duckImpact = now < scratch.duckImpactUntil ? DUCK.impactDb : 0;
  const duckUi = now < scratch.duckUiUntil ? DUCK.uiDb : 0;
  out.duckDb = duckImpact + duckUi;

  scratch.justReset = false;
}
