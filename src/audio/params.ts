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
export const P_TRANSIENT_COUNT = 15;
export const P_HEADER = 16;
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
  out[P_TRANSIENT_COUNT] = p.transientCount;
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
  /** Crash: engine gain ramps to 0 over this many seconds (bike is debris). */
  crashFadeS: 0.35,
} as const;

export const WHEEL_RADIUS = 0.34;
export const SPROCKET_TEETH = 42;
export const AIRBORNE_MIN_S = 0.1;
export const WIND_SPEED_REF = 14;
export const TYRE_MIN_SPEED = 0.15;

/** Distance ticks per surface, metres of travel between ticks (0 = none). */
export const TICK_SPACING: readonly number[] = [0, 1.2, 0.31, 0, 0, 0, 0, 0];

export const CHASSIS = {
  /** compression/s above which a grounded wheel emits a thunk. */
  thunkVel: 6,
  thunkMinGapS: 0.08,
  bottomOut: 0.97,
  /** land.impulse (N·s) that maps to gain 1. */
  landingImpulseRef: 900,
  landingMinGain: 0.15,
  skidChirpSlip: 0.6,
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
