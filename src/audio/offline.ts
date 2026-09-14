/**
 * Offline rendering — replay a recording through physics + the audio model +
 * the synth with no clock, producing interleaved stereo Float32 PCM.
 *
 * Runs anywhere (node, worker, browser main thread): the synth is plain JS.
 * Byte-identical across runs because every schedule time is `u / updateHz`
 * (sample-aligned at 48 kHz / 60 Hz = 800 samples per update) and every
 * stochastic draw is seeded.
 */
import { NEUTRAL_INPUT, decodeAny, iterateFrames, type GameEvent, type InputFrame, type PhysicsState } from '../core';
import type { PhysicsFactory } from '../physics';
import { compileTrack, getTrack } from '../tracks';
import { ModelDriver } from './driver';
import { TrialsSynth, type SynthOptions } from './dsp/synth';

export const OFFLINE_SAMPLE_RATE = 48000;
export const OFFLINE_UPDATE_HZ = 60;

export interface OfflineOptions {
  sampleRate?: number;
  updateHz?: number;
  solo?: SynthOptions['solo'];
  /** Emit 3-2-1-GO before the first tick (adds 3 s); default false: `go` at t = 0. */
  countdown?: boolean;
  /** Called per update with the state (tests use it to log rpm etc.). */
  onUpdate?: (u: number, state: PhysicsState, driver: ModelDriver) => void;
  /** Called for every event the physics emitted (after the model saw it). */
  onEvent?: (u: number, e: GameEvent) => void;
}

export interface OfflineResult {
  /** Interleaved stereo. */
  pcm: Float32Array;
  sampleRate: number;
  channels: 2;
  updates: number;
}

/**
 * A synthetic source of states for fixture renders (no physics): the callback
 * fills `state`/events for update `u`; return false to stop.
 */
export type StateScript = (u: number, t: number, emit: (e: GameEvent) => void) => PhysicsState;

export function renderScript(script: StateScript, seconds: number, opts: OfflineOptions = {}, seed = 1): OfflineResult {
  const sampleRate = opts.sampleRate ?? OFFLINE_SAMPLE_RATE;
  const updateHz = opts.updateHz ?? OFFLINE_UPDATE_HZ;
  const spu = sampleRate / updateHz;
  if (!Number.isInteger(spu)) throw new Error(`sampleRate/updateHz must be an integer (${sampleRate}/${updateHz})`);
  const updates = Math.ceil(seconds * updateHz);
  const driver = new ModelDriver();
  driver.setTrack(null, seed);
  const synth = new TrialsSynth(sampleRate, { seed, solo: opts.solo ?? null });
  const L = new Float32Array(updates * spu);
  const R = new Float32Array(updates * spu);
  const emit = (e: GameEvent): void => driver.onEvent(e);
  for (let u = 0; u < updates; u++) {
    const state = script(u, u / updateHz, emit);
    const packed = driver.update(state, 1 / updateHz, undefined);
    opts.onUpdate?.(u, state, driver);
    synth.setParams(packed);
    driver.flush();
    synth.process(L, R, u * spu, spu);
  }
  return { pcm: interleave(L, R), sampleRate, channels: 2, updates };
}

export async function renderRecording(
  recordingJson: string,
  seconds: number,
  makePhysics: PhysicsFactory,
  opts: OfflineOptions = {},
): Promise<OfflineResult> {
  const rec = decodeAny(recordingJson);
  const def = getTrack(rec.header.trackId);
  if (!def) throw new Error(`renderOffline: unknown track ${rec.header.trackId}`);
  const track = compileTrack(def);
  const sampleRate = opts.sampleRate ?? OFFLINE_SAMPLE_RATE;
  const updateHz = opts.updateHz ?? OFFLINE_UPDATE_HZ;
  const spu = sampleRate / updateHz;
  const tpu = rec.header.physicsHz / updateHz;
  if (!Number.isInteger(spu) || !Number.isInteger(tpu)) {
    throw new Error(`renderOffline: sampleRate ${sampleRate}, physicsHz ${rec.header.physicsHz} must be multiples of ${updateHz}`);
  }
  const physics = makePhysics(rec.header.physicsHz);
  physics.loadTrack(track, rec.header.seed);
  const driver = new ModelDriver();
  driver.setTrack(track, rec.header.seed);
  const synth = new TrialsSynth(sampleRate, { seed: rec.header.seed, solo: opts.solo ?? null });
  const frames = iterateFrames(rec);
  let current: Readonly<InputFrame> = NEUTRAL_INPUT;
  let exhausted = false;
  const nextFrame = (): Readonly<InputFrame> => {
    if (exhausted) return NEUTRAL_INPUT;
    const r = frames.next();
    if (r.done) {
      exhausted = true;
      return NEUTRAL_INPUT;
    }
    return r.value;
  };
  const preroll = opts.countdown ? 3 * updateHz : 0;
  const updates = Math.ceil(seconds * updateHz);
  const L = new Float32Array(updates * spu);
  const R = new Float32Array(updates * spu);
  // Track load emits a 'restart' event; the model treats it as the initial reset.
  for (const e of physics.drainEvents()) {
    driver.onEvent(e);
    opts.onEvent?.(0, e);
  }
  let lastState = physics.getState();
  for (let u = 0; u < updates; u++) {
    if (u < preroll) {
      if (u % updateHz === 0) {
        const n = (3 - u / updateHz) as 3 | 2 | 1;
        driver.onEvent({ type: 'countdown', n });
      }
    } else {
      if (u === preroll) driver.onEvent({ type: 'go' });
      for (let k = 0; k < tpu; k++) {
        current = nextFrame();
        physics.step(current);
        for (const e of physics.drainEvents()) {
          driver.onEvent(e);
          opts.onEvent?.(u, e);
        }
      }
      lastState = physics.getState();
    }
    const packed = driver.update(lastState, 1 / updateHz, current);
    opts.onUpdate?.(u, lastState, driver);
    synth.setParams(packed);
    driver.flush();
    synth.process(L, R, u * spu, spu);
  }
  return { pcm: interleave(L, R), sampleRate, channels: 2, updates };
}

/** Contract-shaped closure for `window.__trials.audio.renderOffline`. */
export function createOfflineRenderer(
  makePhysics: PhysicsFactory,
  opts: OfflineOptions = {},
): (recordingJson: string, seconds: number) => Promise<Float32Array> {
  return async (recordingJson, seconds) => (await renderRecording(recordingJson, seconds, makePhysics, opts)).pcm;
}

export function interleave(L: Float32Array, R: Float32Array): Float32Array {
  const out = new Float32Array(L.length * 2);
  for (let i = 0; i < L.length; i++) {
    out[2 * i] = L[i]!;
    out[2 * i + 1] = R[i]!;
  }
  return out;
}

/** 16-bit PCM WAV encoder for interleaved float samples. */
export function encodeWav16(pcm: Float32Array, sampleRate: number, channels: number): Uint8Array {
  const frames = pcm.length;
  const buf = new ArrayBuffer(44 + frames * 2);
  const dv = new DataView(buf);
  const str = (o: number, s: string): void => {
    for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, 'RIFF');
  dv.setUint32(4, 36 + frames * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);
  dv.setUint16(22, channels, true);
  dv.setUint32(24, sampleRate, true);
  dv.setUint32(28, sampleRate * channels * 2, true);
  dv.setUint16(32, channels * 2, true);
  dv.setUint16(34, 16, true);
  str(36, 'data');
  dv.setUint32(40, frames * 2, true);
  let o = 44;
  for (let i = 0; i < frames; i++, o += 2) {
    const v = Math.max(-1, Math.min(1, pcm[i]!));
    dv.setInt16(o, v < 0 ? v * 32768 : v * 32767, true);
  }
  return new Uint8Array(buf);
}
