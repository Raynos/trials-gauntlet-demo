/**
 * Audio contract (CONTRACT.md §2.7). Engine, tyres, suspension, impacts,
 * ambience and UI sounds are synthesised from physics state + game events;
 * `NullAudio` is the silent implementation, `WebAudioSystem` the real one.
 *
 * Wiring (core-game owner):
 *   const audio = new WebAudioSystem({ makePhysics: (hz) => new MockPhysics(hz) });
 *   game = new Game({ ..., audio });
 *   audio.setTrack(compiledTrack, seed);            // from Game.loadTrack (biome, seed)
 *   firstGesture.addEventListener(() => { void audio.unlock(); });   // sync inside the handler
 *   hook.audio = { renderOffline: audio.renderOffline! };            // harness
 *   game.render(): this.audio?.update(state, dt, this.input);        // pass input
 */
import type { BikeClass, CompiledTrack, GameEvent, InputFrame, PhysicsState } from '../core/types';

export type AudioScene = 'run' | 'menu' | 'results';

export interface AudioSystem {
  /** Must be called from a user gesture in browsers; no-op when already live. */
  unlock(): Promise<void>;
  /** Per rendered frame: continuous sources (engine pitch, wind, wheel roll). */
  update(state: PhysicsState, dt: number, input?: Readonly<InputFrame>): void;
  /** One-shots. */
  onEvent(event: GameEvent): void;
  setMasterVolume(v: number): void;
  dispose(): void;
  /** Harness: replay a recording to interleaved stereo PCM (48 kHz), no clock. */
  renderOffline?: ((recordingJson: string, seconds: number) => Promise<Float32Array>) | undefined;
  /** Additive (round 2): biome + seed + crowd stands follow the track. */
  setTrack?(track: CompiledTrack, seed: number): void;
  /** Additive (round 3): the bike class (voicing only). */
  setBike?(bike: BikeClass): void;
  /** Additive (round 3): the app's screen for the music bed; null = infer from events. */
  setScene?(scene: AudioScene | null): void;
}

export class NullAudio implements AudioSystem {
  async unlock(): Promise<void> {}
  update(): void {}
  onEvent(): void {}
  setMasterVolume(): void {}
  dispose(): void {}
}

export { WebAudioSystem, type WebAudioOptions } from './graph/webAudio';
export {
  OFFLINE_SAMPLE_RATE,
  OFFLINE_UPDATE_HZ,
  createOfflineRenderer,
  encodeWav16,
  renderRecording,
  renderScript,
  renderWorld,
  type WorldSource,
  type OfflineOptions,
  type OfflineResult,
} from './offline';
export type { AudioParams, Transient, TransientKind } from './params';
