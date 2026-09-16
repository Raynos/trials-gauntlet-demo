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
 *
 * Round 3: tuned to physics v2 (docs/design/physics.md "v2 status — R3/R4/R5"):
 * torque from the class thrust curve, the clutch as `reportRpm` models it, the
 * hop from `hopPhase`, the crash as the ragdoll's own body impacts, the crowd
 * from the gates kit's stands, the scene for the music bed.
 */
import type { CompiledTrack, InputFrame, PhysicsState } from '../../core/types';
import type { Rng } from '../../core/rng';
import {
  AIRBORNE_MIN_S,
  CHASSIS,
  CROWD,
  DUCK,
  ENGINE,
  MUSIC,
  SPROCKET_TEETH,
  TICK_SPACING,
  TK,
  TYRE_MIN_SPEED,
  WHEEL_RADIUS,
  WIND_SPEED_REF,
  pushTransient,
  surfaceIndex,
  torqueFrac,
  type AudioParams,
} from '../params';

export const SCENE_RUN = 0;
export const SCENE_MENU = 1;
export const SCENE_RESULTS = 2;

const HOP_INDEX: Record<PhysicsState['hopPhase'], number> = { idle: 0, preload: 1, push: 2, recover: 3 };
const MAX_BODIES = 8;

/** One crowd stand: people count and the x span it occupies (world metres). */
export interface Stand {
  n: number;
  xa: number;
  xb: number;
}

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
  /** Airtime of the flight that ended at the last touchdown (for the cheer rule). */
  lastAir: number;
  wind: number;
  prevSkid: number;
  clutch: number;
  duckImpactUntil: number;
  duckUiUntil: number;
  /** Time the crash happened (engine fades), or -1. */
  crashAt: number;
  /** Time of the last crowd groan (kept across restarts: one groan per crash, never a re-trigger). */
  lastGroanAt: number;
  /** Smoothed wheelie lug (see AudioParams.lug). */
  lug: number;
  /** Bike speed at the last update (m/s) — the landing scrub reads it (events carry no velocity). */
  speed: number;
  /** Time the finish happened (ambience fades), or -1. */
  finishAt: number;
  /** Set on restart; suppresses edge detectors on the very next update. */
  justReset: boolean;
  biome: number;
  /** 0 rookie 1 pro. */
  bike: number;
  prevHop: number;
  /** Ragdoll body tracking: previous positions (x,y pairs) and per-body speeds. */
  bodyPrev: Float64Array;
  bodySpeed: Float64Array;
  bodyHave: boolean;
  bodyThuds: number;
  /** Crowd stands (set from the track). */
  stands: Stand[];
  crowd: number;
  /** Music scene: SCENE_RUN / SCENE_MENU / SCENE_RESULTS. */
  scene: number;
  /** Explicit scene from the app (setScene); -1 = infer from events. */
  sceneOverride: number;
  /** When the results bed should start (after the finish stinger), or -1. */
  resultsAt: number;
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
    lastAir: 0,
    wind: 0,
    prevSkid: 0,
    clutch: 0,
    duckImpactUntil: -1,
    duckUiUntil: -1,
    crashAt: -1,
    lastGroanAt: -1e9,
    lug: 0,
    speed: 0,
    finishAt: -1,
    justReset: true,
    biome: 0,
    bike: 0,
    prevHop: 0,
    bodyPrev: new Float64Array(MAX_BODIES * 2),
    bodySpeed: new Float64Array(MAX_BODIES),
    bodyHave: false,
    bodyThuds: 0,
    stands: [],
    crowd: 0,
    scene: SCENE_MENU,
    sceneOverride: -1,
    resultsAt: -1,
    updates: 0,
  };
}

/** Reset per-segment memory (restart); keeps the clock, biome, bike, stands and scene. */
export function resetScratch(s: ModelScratch, keepTime = true): void {
  const time = keepTime ? s.time : 0;
  const { biome, bike, stands, scene, sceneOverride, lastGroanAt } = s;
  const fresh = createScratch();
  Object.assign(s, fresh);
  s.time = time;
  s.lastGroanAt = lastGroanAt;
  s.prevStateTime = 0;
  s.biome = biome;
  s.bike = bike;
  s.stands = stands;
  s.scene = scene;
  s.sceneOverride = sceneOverride;
}

/** The stands the gates kit builds for a track (start, one per checkpoint, finish). */
export function standsOf(track: CompiledTrack | null): Stand[] {
  if (!track) return [];
  const out: Stand[] = [];
  const sx = track.def.start.pos.x;
  out.push({ n: CROWD.start.n, xa: sx + CROWD.start.xa, xb: sx + CROWD.start.xb });
  for (const c of track.def.checkpoints) out.push({ n: CROWD.checkpoint.n, xa: c.x + CROWD.checkpoint.xa, xb: c.x + CROWD.checkpoint.xb });
  const fx = track.def.finishX;
  out.push({ n: CROWD.finish.n, xa: fx + CROWD.finish.xa, xb: fx + CROWD.finish.xb });
  return out;
}

/** 0..1 crowd density heard at bike x: people-weighted inverse-square falloff from the nearest edge of each stand. */
export function crowdDensity(stands: readonly Stand[], x: number): number {
  let d = 0;
  for (const s of stands) {
    const dist = x < s.xa ? s.xa - x : x > s.xb ? x - s.xb : 0;
    const k = dist / CROWD.falloffM;
    d += s.n / CROWD.start.n / (1 + k * k);
  }
  return d > 1 ? 1 : d;
}

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/**
 * Fill `out` from the current physics state. Transients already queued in
 * `out` (from events) are kept; this appends continuous-source edges.
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

  const vx = state.bike.vel.x;
  const vy = state.bike.vel.y;
  const speed = Math.sqrt(vx * vx + vy * vy);
  scratch.speed = speed;
  const rear = state.wheels.rear;
  const front = state.wheels.front;

  // -- engine (physics owns rpm; we only scale) ----------------------------
  out.rpm = state.engine.rpm;
  out.load = clamp(state.engine.throttleEff, 0, 1);
  out.limiter = state.engine.limiter ? 1 : 0;
  out.bike = scratch.bike;
  // torque: the v2 thrust curve at the rear rim speed (the wheel's, so a free-revving wheel in the air is off-torque)
  const rimV = Math.abs(rear.spinVel) * WHEEL_RADIUS;
  out.torque = out.load * torqueFrac(scratch.bike, rimV);
  if (scratch.crashAt >= 0) {
    // The kill: physics parks rpm at idle and throttleEff at 0 on the crash tick; we let it die audibly —
    // round 4: the crank runs down (rpm × (1 − stallDrop·k) → a few slowing, sparse putts) under a gain that
    // holds and then falls (1 − k²), so the crash is an engine dying, not a fade.
    const k = clamp((now - scratch.crashAt) / ENGINE.crashFadeS, 0, 1);
    out.engineGain = 1 - k * k;
    out.rpm = Math.max(150, state.engine.rpm * (1 - ENGINE.stallDrop * k));
    out.load = 0;
    out.torque = 0;
    out.limiter = 0;
  } else {
    out.engineGain = 1;
  }

  // -- tyres ----------------------------------------------------------------
  const rearSurf = state.contacts.rear;
  const frontSurf = state.contacts.front;
  const rearGround = rearSurf !== null && rear.grounded;
  const frontGround = frontSurf !== null && front.grounded;
  const rearRoll = rearGround ? rimV : 0;
  const frontRoll = frontGround ? Math.abs(front.spinVel) * WHEEL_RADIUS : 0;
  out.tyreSpeed[0] = rearRoll < TYRE_MIN_SPEED ? 0 : rearRoll;
  out.tyreSpeed[1] = frontRoll < TYRE_MIN_SPEED ? 0 : frontRoll;
  out.tyreSurface[0] = rearGround ? surfaceIndex(rearSurf) : -1;
  out.tyreSurface[1] = frontGround ? surfaceIndex(frontSurf) : -1;

  out.speed = clamp(speed / 20, 0, 1);
  // the wheelie's clutch balance (round 4): front up, rear down, slow, throttle on, the crank near idle — physics
  // holds ~1700 rpm here (reportRpm), so the engine voices the load it is under rather than a pitch it has not got
  const lugOn = scratch.crashAt < 0 && !front.grounded && rear.grounded && speed < 6 && out.load > 0.02 && state.engine.rpm < 2600;
  const kLug = step > 0 ? 1 - Math.exp(-step / 0.15) : 0;
  scratch.lug += ((lugOn ? 1 : 0) - scratch.lug) * kLug;
  out.lug = scratch.lug < 0.01 ? 0 : scratch.lug;
  // slipping clutch (v2 reportRpm): the crank is held at clutchRpm under throttle while the wheel is below clutchSpeed
  const clutchOn =
    scratch.crashAt < 0 &&
    out.load >= ENGINE.clutchThrottle &&
    Math.abs(state.engine.rpm - ENGINE.clutchRpm) < 80 &&
    rimV < ENGINE.clutchSpeed;
  const kClutch = step > 0 ? 1 - Math.exp(-step / 0.06) : 0;
  scratch.clutch += ((clutchOn ? 1 : 0) - scratch.clutch) * kClutch;
  out.clutch = scratch.clutch < 0.01 ? 0 : scratch.clutch;
  // crashed bike scrubbing along the ground on its frame (v2's crash brakes stop the bike in ~0.1 s; rare)
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
  out.chainHz = (Math.abs(rear.spinVel) / (2 * Math.PI)) * SPROCKET_TEETH;
  if (speed < 1.5 && rearRoll < 1.5) out.chainHz = 0;

  // distance ticks (plank joints / drum ridges)
  for (let w = 0; w < 2; w++) {
    const si = out.tyreSurface[w as 0 | 1];
    const spacing = si >= 0 ? (TICK_SPACING[si] ?? 0) : 0;
    const v = out.tyreSpeed[w as 0 | 1];
    if (spacing > 0 && v > 0) {
      const before = scratch.travel[w as 0 | 1];
      scratch.travel[w as 0 | 1] = before + v * step;
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
      const gap = crashed ? CHASSIS.crashClatterGapS : CHASSIS.thunkMinGapS;
      if (cv > CHASSIS.thunkVel && now - scratch.lastThunkAt[i] >= gap) {
        scratch.lastThunkAt[i] = now;
        if (crashed) pushTransient(out, TK.tick, 0.6, 2 / 8, w === 0 ? -0.3 : 0.3);
        else pushTransient(out, TK.thunk, clamp((cv - CHASSIS.thunkVel) / 12 + 0.3, 0.3, 1), 0, w === 0 ? -0.15 : 0.15);
      }
    }
    // bottom-out (v2: every drop >= 1 m runs the rear onto the bump stop and rides away — a deep stop knock,
    // ringing only on metal); gain from the closing rate, pitch = surface
    const bottom = c >= CHASSIS.bottomOut;
    if (bottom && !scratch.bottomedOut[i] && !scratch.justReset && !crashed) {
      const surf = out.tyreSurface[i] >= 0 ? out.tyreSurface[i] : 0;
      pushTransient(out, TK.bottomOut, clamp(0.5 + cv / 30, 0.5, 1), surf / 8, w === 0 ? -0.2 : 0.2);
    }
    scratch.bottomedOut[i] = bottom;
    scratch.prevCompression[i] = c;
    scratch.prevGrounded[i] = wh.grounded;
  }

  // -- the hop (physics hopPhase: idle → preload → push → recover) -----------
  const hop = HOP_INDEX[state.hopPhase] ?? 0;
  out.hop = hop;
  if (!scratch.justReset && hop !== scratch.prevHop && scratch.crashAt < 0) {
    if (hop === 1) pushTransient(out, TK.hop, 1, 0, 0); // preload creak
    else if (hop === 2 && scratch.prevHop === 1) pushTransient(out, TK.hop, 1, 1, 0); // the snap
  }
  scratch.prevHop = hop;

  // -- ragdoll sensors: a body meeting the ground is a soft thud; a few, then quiet -------------
  const rag = state.ragdoll;
  if (rag !== null && scratch.crashAt >= 0 && now - scratch.crashAt <= CHASSIS.bodyThudWindowS) {
    const nb = rag.length < MAX_BODIES ? rag.length : MAX_BODIES;
    for (let b = 0; b < nb; b++) {
      const body = rag[b]!;
      const px = scratch.bodyPrev[2 * b]!;
      const py = scratch.bodyPrev[2 * b + 1]!;
      if (scratch.bodyHave && step > 0) {
        const sp = Math.sqrt((body.pos.x - px) * (body.pos.x - px) + (body.pos.y - py) * (body.pos.y - py)) / step;
        const drop = scratch.bodySpeed[b]! - sp;
        if (drop >= CHASSIS.bodyThudDecel && scratch.bodyThuds < CHASSIS.bodyThudMax && now - scratch.crashAt > 0.03) {
          scratch.bodyThuds++;
          const heavy = body.id === 'torso' || body.id === 'pelvis';
          pushTransient(out, TK.bodyThud, clamp(drop / 8, 0.35, 1) * (heavy ? 1 : 0.7), heavy ? 0 : 0.6, clamp((body.pos.x - state.bike.pos.x) * 0.3, -0.5, 0.5));
        }
        scratch.bodySpeed[b] = sp;
      }
      scratch.bodyPrev[2 * b] = body.pos.x;
      scratch.bodyPrev[2 * b + 1] = body.pos.y;
    }
    scratch.bodyHave = true;
  } else {
    scratch.bodyHave = false;
  }

  // -- air / wind ------------------------------------------------------------
  if (!rear.grounded && !front.grounded) scratch.airborneFor += step;
  else {
    if (scratch.airborneFor > 0) scratch.lastAir = scratch.airborneFor;
    scratch.airborneFor = 0;
  }
  out.airborne = scratch.airborneFor >= AIRBORNE_MIN_S ? 1 : 0;
  const windTarget = Math.pow(clamp(speed / WIND_SPEED_REF, 0, 1), 1.5);
  const k = step > 0 ? 1 - Math.exp(-step / 0.15) : 0;
  scratch.wind += (windTarget - scratch.wind) * k;
  out.wind = scratch.wind;

  // -- scene ----------------------------------------------------------------
  out.biome = scratch.biome;
  out.ambientGain = scratch.finishAt >= 0 ? clamp(1 - (now - scratch.finishAt) / 0.25, 0, 1) : 1;
  scratch.crowd = crowdDensity(scratch.stands, state.bike.pos.x);
  out.crowd = scratch.finishAt >= 0 ? scratch.crowd : scratch.crowd * (scratch.crashAt >= 0 ? 0.6 : 1);
  if (scratch.resultsAt >= 0 && now >= scratch.resultsAt && scratch.sceneOverride < 0) {
    scratch.scene = SCENE_RESULTS;
    scratch.resultsAt = -1;
  }
  out.scene = scratch.sceneOverride >= 0 ? scratch.sceneOverride : scratch.scene;
  const duckImpact = now < scratch.duckImpactUntil ? DUCK.impactDb : 0;
  const duckUi = now < scratch.duckUiUntil ? DUCK.uiDb : 0;
  out.duckDb = duckImpact + duckUi;

  scratch.justReset = false;
}

/** Results bed timing helper shared with events.ts. */
export function scheduleResults(scratch: ModelScratch): void {
  scratch.resultsAt = scratch.time + MUSIC.resultsDelayS;
}
