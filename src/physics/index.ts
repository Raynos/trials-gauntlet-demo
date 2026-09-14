/**
 * Physics contract. The real bike/rider simulation lives here later; the
 * scaffold only fixes the interface so the game, harness and renderer can be
 * built against it in parallel.
 */
import type { CompiledTrack, GameEvent, InputFrame, PhysicsSnapshot, PhysicsState } from '../core/types';

import type { BikeClass } from './tuning';

/** Per-load options (round 11): which bike the track is ridden on. Default 'rookie' (the round-10 bike to the byte). */
export interface LoadTrackOptions {
  bike?: BikeClass;
}

export interface PhysicsWorld {
  /** Hz the world was configured for (dt = 1 / hz). */
  readonly physicsHz: number;
  /** Load a compiled track and reset to its start; `opts.bike` picks the tuning preset (Rookie / Pro). */
  loadTrack(track: CompiledTrack, seed: number, opts?: LoadTrackOptions): void;
  /** Reset to the given checkpoint index (-1 = track start). */
  reset(checkpoint: number): void;
  /** Advance exactly one tick with the given (already quantized) input. */
  step(input: InputFrame): void;
  /** Deterministic snapshot; must be plain data (see hashPhysicsState). */
  getState(): PhysicsState;
  /** Events emitted during the most recent step(); cleared on each call. */
  drainEvents(): GameEvent[];
  /** Full state incl. rng, latches, contact caches, seesaw/drum state. */
  snapshot(): PhysicsSnapshot;
  /** restore(snapshot()) then step×m must hash identically to the straight run. */
  restore(s: PhysicsSnapshot): void;
}

export type PhysicsFactory = (physicsHz: number) => PhysicsWorld;

export { createBikePhysics, bikePhysicsFactory } from './bike';
export type { BikePhysicsWorld, PhysicsDebug, TeleportPose, SuspDebug, HopPhase } from './bike';
export { DEFAULT_TUNING, mergeTuning, BIKE_PRESETS, BIKE_CLASSES, bikeTuning } from './tuning';
export type { BikeTuning, PartialTuning, BikeClass } from './tuning';
