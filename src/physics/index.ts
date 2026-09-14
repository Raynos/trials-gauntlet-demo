/**
 * Physics contract. Physics v2 (docs/design/physics-v2.md) is `createBikePhysicsV2`; until it passes
 * its acceptance suite (§14) the shipped default `createBikePhysics` remains v1 so tracks, goldens and
 * the live game are unaffected. `?physics=v2` opts in. The default flips to v2 at acceptance; v1 is
 * deleted in R3 (§16.2).
 */
import type { CompiledTrack, GameEvent, InputFrame, PhysicsSnapshot, PhysicsState } from '../core/types';

import type { BikeClassV2 } from './v2/tuning';

/** Per-load options: which bike the track is ridden on (a parameter row, §13). Default 'rookie', the reference row. */
export interface LoadTrackOptions {
  bike?: BikeClassV2;
}

export interface PhysicsWorld {
  /** Hz the world was configured for (dt = 1 / hz). */
  readonly physicsHz: number;
  /** Load a compiled track and reset to its start; `opts.bike` picks the class row. */
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

import { createBikePhysicsV2 } from './v2/bike';
import { createBikePhysics as createBikePhysicsV1Impl, bikePhysicsFactory as bikePhysicsFactoryV1Impl } from './bike';
import type { BikePhysicsWorld as BikePhysicsWorldV1Type } from './bike';
import type { PartialTuning as PartialTuningV1Type } from './tuning';

/** The shipped default until v2 acceptance: v1. */
export function createBikePhysics(physicsHz: number, tuning?: PartialTuningV1Type): BikePhysicsWorldV1Type {
  return createBikePhysicsV1Impl(physicsHz, tuning);
}
export const bikePhysicsFactory = (physicsHz: number): PhysicsWorld => bikePhysicsFactoryV1Impl(physicsHz);
export const bikePhysicsFactoryV2 = (physicsHz: number): PhysicsWorld => createBikePhysicsV2(physicsHz);

export { createBikePhysicsV2 } from './v2/bike';
export type { BikePhysicsWorldV2 as BikePhysicsWorld, PhysicsDebugV2 as PhysicsDebug, TeleportPose, HopPhase, LoadTrackOptionsV2 } from './v2/bike';
export { DEFAULT_TUNING_V2 as DEFAULT_TUNING, mergeTuningV2 as mergeTuning, BIKE_PRESETS_V2 as BIKE_PRESETS, BIKE_CLASSES_V2 as BIKE_CLASSES, bikeTuningV2 as bikeTuning } from './v2/tuning';
export type { TuningV2 as BikeTuning, PartialTuningV2 as PartialTuning, BikeClassV2 as BikeClass } from './v2/tuning';

// v1 (rounds 1-11), kept importable for two rounds so the harness can A/B (§16.2)
export { createBikePhysics as createBikePhysicsV1, bikePhysicsFactory as bikePhysicsFactoryV1 } from './bike';
export type { BikePhysicsWorld as BikePhysicsWorldV1, PhysicsDebug as PhysicsDebugV1 } from './bike';
export { DEFAULT_TUNING as DEFAULT_TUNING_V1, BIKE_PRESETS as BIKE_PRESETS_V1, bikeTuning as bikeTuningV1 } from './tuning';
export type { BikeTuning as BikeTuningV1, PartialTuning as PartialTuningV1 } from './tuning';
