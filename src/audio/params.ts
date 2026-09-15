/**
 * AudioParams — the contract between the pure model (`model/`) and the DSP
 * (`dsp/`). The model fills a flat struct once per update; the graph packs it
 * into a Float32Array (so it crosses the AudioWorklet boundary as one copy)
 * and the synth reads only that. Every tuning constant the model needs lives
 * here too, so there is one place to tune.
 */
import type { BiomeId, SurfaceKind } from '../core/types';

// ---------------------------------------------------------------------------
// Enumerations (index-coded so they pack into floats)
// ---------------------------------------------------------------------------

export const SURFACES: readonly SurfaceKind[] = ['dirt', 'wood', 'metal', 'concrete', 'rubber', 'grate', 'stone', 'snow'];
export const BIOMES: readonly BiomeId[] = ['industrial', 'canyon', 'snow', 'nightCity', 'foundry'];

export function surfaceIndex(s: SurfaceKind | null): number {
  if (s === null) return -1;
  const i = SURFACES.indexOf(s);
  return i < 0 ? 0 : i;
}
export function biomeIndex(b: BiomeId | undefined): number {
  const i = b ? BIOMES.indexOf(b) : 0;
  return i < 0 ? 0 : i;
}

/** One-shot kinds. Order is the wire format; append only. */
export const TRANSIENT_KINDS = [
  'landing', // 0  wheel touchdown, gain ∝ impulse, pitch = surface index / 8
  'thunk', // 1  suspension bump while grounded
  'bottomOut', // 2  suspension slammed to the stop
  'impact', // 3  chassis hit (crash layer 1)
  'debris', // 4  crash debris grain
  'grunt', // 5  rider formant grunt
  'fault', // 6  CRASH!/fault stamp slap
  'tick', // 7  plank joint / drum ridge tick (pitch selects)
  'skidChirp', // 8  rear slip crossing upward
  'countdown', // 9  880 Hz tick
  'go', // 10 GO chord + whoosh
  'checkpoint', // 11 chime + flame-jet whoosh
  'restart', // 12 HARD STOP of chassis/ui voices + click + whoosh
  'finishTick', // 13 timer-freeze tick
  'fanfare', // 14 one fanfare note (pitch = note index / 4)
  'firework', // 15 firework pop
  'crowd', // 16 crowd swell
  'hazard', // 17 fire/water whoosh on hazard fault
  'kill', // 18 hard stop only (no click); used by dispose/mute
  'starter', // 19 starter whir + catch on respawn / track load
  'plank', // 20 board-joint thud (wood decks), pitch = speed/20
  // round 3 (v2 retune)
  'crowdRoar', // 21 start-gate roar on GO (gain = crowd density near the bike)
  'crowdCheer', // 22 cheer on a clean landing after >= 0.5 s of air (pitch = airtime/1.5)
  'crowdGroan', // 23 groan on a crash
  'crowdApplause', // 24 applause at the finish
  'hop', // 25 the hop: pitch 0 = preload creak (suspension + rider loading), 1 = the snap (spring release)
  'bodyThud', // 26 a ragdoll body meeting the ground (soft, few)
] as const;
export type TransientKind = (typeof TRANSIENT_KINDS)[number];
export const TK: Record<TransientKind, number> = Object.fromEntries(TRANSIENT_KINDS.map((k, i) => [k, i])) as Record<
  TransientKind,
  number
>;

export interface Transient {
  kind: number;
  /** 0..1 loudness scaler. */
  gain: number;
  /** 0..1 recipe-specific (surface, note, brightness). */
  pitch: number;
  /** -1..1 */
  pan: number;
  /** Seconds from the update this was emitted in. */
  delay: number;
}

// ---------------------------------------------------------------------------
// The struct
// ---------------------------------------------------------------------------

export const MAX_TRANSIENTS = 24;

export interface AudioParams {
  /** Physics engine rpm (idle 1500 .. limiter 10000). */
  rpm: number;
  /** 0..1 effective throttle (physics `throttleEff`). */
  load: number;
  /** 1 while the rev limiter is cutting. */
  limiter: number;
  /** 0..1 engine level scaler (1 riding, ramps to 0 after a crash). */
  engineGain: number;
  /** Ground-contact speed per wheel (rear, front), m/s; 0 when airborne. */
  tyreSpeed: [number, number];
  /** Surface index per wheel, -1 when airborne. */
  tyreSurface: [number, number];
  /** 0..1 normalised rear longitudinal slip. */
  skid: number;
  /** Rear sprocket tooth frequency, Hz (0 when stopped). */
  chainHz: number;
  /** 0..1 speed wind. */
  wind: number;
  /** 1 when both wheels have been off the ground >= AIRBORNE_MIN_S. */
  airborne: number;
  /** Biome index into BIOMES. */
  biome: number;
  /** 0..1 ambience level (fades on finish). */
  ambientGain: number;
  /** Requested game-bus attenuation in dB (>= 0); the synth smooths it. */
  duckDb: number;
  /** 0..1 auto-clutch slipping (engine held at clutchRpm under throttle while the wheel lags). */
  clutch: number;
  /** 0..1 crashed bike scrubbing along the ground on its frame. */
  scrape: number;
  /** 0..1 ground speed / 20 m/s (engine presence winds up with speed). */
  speed: number;
  /** 0 run, 1 menu (front end), 2 results — the music bed follows this; inferred from events, overridable. */
  scene: number;
  /** 0..1 crowd density near the bike (the gates kit's stands: start 30, checkpoint 7, finish 34 people). */
  crowd: number;
  /** 0..1 engine torque fraction = throttleEff × thrustFrac(v) / max — the bark; falls with speed on v2. */
  torque: number;
  /** 0 rookie, 1 pro (voicing only; rpm/limiter stay physics'). */
  bike: number;
  /** hopPhase index: 0 idle 1 preload 2 push 3 recover. */
  hop: number;
  transients: Transient[];
  transientCount: number;
}

export function createParams(): AudioParams {
  const transients: Transient[] = [];
  for (let i = 0; i < MAX_TRANSIENTS; i++) transients.push({ kind: 0, gain: 0, pitch: 0, pan: 0, delay: 0 });
  return {
    rpm: ENGINE.idleRpm,
    load: 0,
    limiter: 0,
    engineGain: 1,
    tyreSpeed: [0, 0],
    tyreSurface: [-1, -1],
    skid: 0,
    chainHz: 0,
    wind: 0,
    airborne: 0,
    biome: 0,
    ambientGain: 1,
    duckDb: 0,
    clutch: 0,
    scrape: 0,
    speed: 0,
    scene: 0,
    crowd: 0,
    torque: 0,
    bike: 0,
    hop: 0,
    transients,
    transientCount: 0,
  };
}

/** Push a transient (dropped when the frame is full). */
export function pushTransient(p: AudioParams, kind: number, gain: number, pitch = 0, pan = 0, delay = 0): void {
  if (p.transientCount >= MAX_TRANSIENTS) return;
  const t = p.transients[p.transientCount++]!;
  t.kind = kind;
  t.gain = gain;
  t.pitch = pitch;
  t.pan = pan;
  t.delay = delay;
}

// ---------------------------------------------------------------------------
// Wire format — Float32Array, fixed layout
// ---------------------------------------------------------------------------

export const P_RPM = 0;
export const P_LOAD = 1;
export const P_LIMITER = 2;
export const P_ENGINE_GAIN = 3;
export const P_TYRE_SPEED = 4; // 4,5
export const P_TYRE_SURFACE = 6; // 6,7
export const P_SKID = 8;
export const P_CHAIN_HZ = 9;
export const P_WIND = 10;
export const P_AIRBORNE = 11;
export const P_BIOME = 12;
export const P_AMBIENT_GAIN = 13;
export const P_DUCK_DB = 14;
export const P_CLUTCH = 15;
export const P_SCRAPE = 16;
export const P_SPEED = 17;
export const P_TRANSIENT_COUNT = 18;
export const P_SCENE = 19;
export const P_CROWD = 20;
export const P_TORQUE = 21;
export const P_BIKE = 22;
export const P_HOP = 23;
export const P_HEADER = 28;
export const P_TRANSIENT_STRIDE = 5;
export const PACKED_LENGTH = P_HEADER + MAX_TRANSIENTS * P_TRANSIENT_STRIDE;

export function packParams(p: AudioParams, out: Float32Array): Float32Array {
  out[P_RPM] = p.rpm;
  out[P_LOAD] = p.load;
  out[P_LIMITER] = p.limiter;
  out[P_ENGINE_GAIN] = p.engineGain;
  out[P_TYRE_SPEED] = p.tyreSpeed[0];
  out[P_TYRE_SPEED + 1] = p.tyreSpeed[1];
  out[P_TYRE_SURFACE] = p.tyreSurface[0];
  out[P_TYRE_SURFACE + 1] = p.tyreSurface[1];
  out[P_SKID] = p.skid;
  out[P_CHAIN_HZ] = p.chainHz;
  out[P_WIND] = p.wind;
  out[P_AIRBORNE] = p.airborne;
  out[P_BIOME] = p.biome;
  out[P_AMBIENT_GAIN] = p.ambientGain;
  out[P_DUCK_DB] = p.duckDb;
  out[P_CLUTCH] = p.clutch;
  out[P_SCRAPE] = p.scrape;
  out[P_SPEED] = p.speed;
  out[P_TRANSIENT_COUNT] = p.transientCount;
  out[P_SCENE] = p.scene;
  out[P_CROWD] = p.crowd;
  out[P_TORQUE] = p.torque;
  out[P_BIKE] = p.bike;
  out[P_HOP] = p.hop;
  for (let i = 0; i < p.transientCount; i++) {
    const t = p.transients[i]!;
    const o = P_HEADER + i * P_TRANSIENT_STRIDE;
    out[o] = t.kind;
    out[o + 1] = t.gain;
    out[o + 2] = t.pitch;
    out[o + 3] = t.pan;
    out[o + 4] = t.delay;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Tuning constants used by the model
// ---------------------------------------------------------------------------

export const ENGINE = {
  /** Physics owns these (CONTRACT §2.3); listed for scaling only. */
  idleRpm: 1500,
  redlineRpm: 10000,
  /**
   * Crash (v2): physics parks rpm at idle and throttleEff at 0 on the crash tick and the bike stops within
   * 0.1 s (crash brakes); audio presents the kill — gain to 0 and the audible pitch sagging by `stallDrop`
   * over `crashFadeS` — two dying putts, then quiet.
   */
  crashFadeS: 0.35,
  stallDrop: 0.55,
  /**
   * v2 `reportRpm`: below `clutchSpeed` m/s the reported rpm is max(wheel rpm, idle + throttleEff·(clutchRpm − idle))
   * — the slipping clutch. On the Rookie (throttle τ 0.15 s) that is a 1 s climb to 3500 and a hold to 7 m/s.
   */
  clutchRpm: 3500,
  clutchSpeed: 7,
  clutchThrottle: 0.25,
  /**
   * v2 thrust curves (tuning.ts `curveV`/`curveF`, Rookie | Pro): the torque the engine is making at rim speed v.
   * Audio's `torque` = throttleEff × f(v) / max f — the bark and the intake honk follow torque, the harmonic
   * brightness follows rpm. A tone map, not a re-derivation of rpm.
   */
  curveV: [
    [0, 3, 5, 8, 12, 17, 20],
    [0, 3, 5, 8, 12.6, 17.85, 21],
  ] as readonly (readonly number[])[],
  curveF: [
    [1.07, 1.07, 1.0, 1.0, 0.7, 0.48, 0.35],
    [1.0, 1.0, 1.0, 1.0, 0.7, 0.48, 0.35],
  ] as readonly (readonly number[])[],
} as const;

/** v2 thrust fraction at rim speed v for a class (0 rookie, 1 pro), normalised to 1 at its peak. */
export function torqueFrac(bike: number, v: number): number {
  const V = ENGINE.curveV[bike === 1 ? 1 : 0]!;
  const F = ENGINE.curveF[bike === 1 ? 1 : 0]!;
  const a = v < 0 ? -v : v;
  const n = V.length;
  if (a >= V[n - 1]!) return 0;
  for (let i = 1; i < n; i++) {
    if (a <= V[i]!) {
      const t = (a - V[i - 1]!) / (V[i]! - V[i - 1]!);
      return (F[i - 1]! + t * (F[i]! - F[i - 1]!)) / F[0]!;
    }
  }
  return 0;
}

export const WHEEL_RADIUS = 0.34;
export const SPROCKET_TEETH = 42;
export const AIRBORNE_MIN_S = 0.1;
export const WIND_SPEED_REF = 14;
export const TYRE_MIN_SPEED = 0.15;

/** Distance ticks per surface, metres of travel between ticks (0 = none). */
/** Wood: 0.22 m boards + 2 cm gaps (rendering.md) → a joint every 0.24 m; metal drums: ridge every 0.31 m. */
export const TICK_SPACING: readonly number[] = [0, 0.24, 0.31, 0, 0, 0, 0, 0];

export const CHASSIS = {
  /** compression/s above which a grounded wheel emits a thunk. */
  thunkVel: 6,
  thunkMinGapS: 0.08,
  /** Crashed bike: suspension hits become sparse metal clatter at most this often per wheel. */
  crashClatterGapS: 0.25,
  bottomOut: 0.97,
  /**
   * land.impulse is the normal impulse of the touchdown tick (N·s). v2 bot corpus (R5, 21 tracks, 1007 landings):
   * p50 10.3, p75 20.2, p90 37.3, p97 63.5, max 225; the R3 landing table's 2 m drop reads rear 42 / front 59
   * at 6 m/s (the servo's legs absorb the rest over the next ticks, so the touchdown tick under-reports a big
   * landing: v1's ref 120 left a 2 m drop at gain 0.59). ref 60 → p50 0.34, p75 0.52, 2 m ≈ 0.8–1, ≥ p97 = 1.
   * ≤ 5 is a wheel settling (p25 4.5). gain = (impulse/ref)^0.6.
   */
  landingImpulseRef: 60,
  landingMinImpulse: 5,
  landingCurve: 0.6,
  skidChirpSlip: 0.6,
  /** Ragdoll: a body counts as hitting the ground when its frame-to-frame speed drops by this much (m/s). */
  bodyThudDecel: 2.5,
  bodyThudMax: 3,
  bodyThudWindowS: 1.2,
} as const;

export const CROWD = {
  /** People per stand as the gates kit places them (src/render/world/gates.ts crowdZone calls). */
  start: { n: 30, xa: -9, xb: 7 },
  checkpoint: { n: 7, xa: 1.5, xb: 6.5 },
  finish: { n: 34, xa: -7, xb: 9 },
  /** Density = Σ n/30 · 1/(1 + (d/falloffM)²), d = bike x to the nearest point of the stand; clamped to 1. */
  falloffM: 12,
  /** Below this density a stand is out of earshot: no roar / cheer / groan (≈ 60 m from the start stand). */
  earshot: 0.06,
  /** A landing after this much air, not crashed, earns a cheer. */
  cheerAirS: 0.5,
  groanDelayS: 0.22,
  applauseDelayS: 0.35,
} as const;

export const MUSIC = {
  /** Results bed starts this long after the finish (after the fanfare's last note). */
  resultsDelayS: 1.4,
} as const;

export const DUCK = {
  impactDb: 6,
  impactHoldS: 0.3,
  uiDb: 3,
  uiHoldS: 0.2,
} as const;

export const TIMING = {
  faultStampDelayS: 0.2,
  gruntDelayS: 0.04,
  grunt2DelayS: 0.26,
  fanfareDelayS: 0.15,
  fanfareGapS: 0.08,
  ambientFadeS: 0.25,
} as const;
