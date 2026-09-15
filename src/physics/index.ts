/**
 * Physics contract. Physics v2 (docs/plans/physics-v2.md) is the shipped default from R3 on
 * (`createBikePhysics` = `createBikePhysicsV2`); v1 stays importable as `createBikePhysicsV1` for two
 * rounds so the harness can A/B (`?physics=v1`), then it is deleted (§16.2).
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
import type { BikePhysicsWorldV2 as BikePhysicsWorldV2Type } from './v2/bike';
import type { PartialTuningV2 as PartialTuningV2Type } from './v2/tuning';

/** The shipped default: v2 (flipped after R3, 2026-09-14). */
export function createBikePhysics(physicsHz: number, tuning?: PartialTuningV2Type): BikePhysicsWorldV2Type {
  return createBikePhysicsV2(physicsHz, tuning);
}
export const bikePhysicsFactory = (physicsHz: number): PhysicsWorld => createBikePhysicsV2(physicsHz);
export const bikePhysicsFactoryV2 = bikePhysicsFactory;
export const bikePhysicsFactoryV1 = (physicsHz: number): PhysicsWorld => bikePhysicsFactoryV1Impl(physicsHz);
export { createBikePhysicsV1Impl as createBikePhysicsV1 };

export { createBikePhysicsV2 } from './v2/bike';
export type { BikePhysicsWorldV2 as BikePhysicsWorld, PhysicsDebugV2 as PhysicsDebug, TeleportPose, HopPhase, LoadTrackOptionsV2 } from './v2/bike';
export { DEFAULT_TUNING_V2 as DEFAULT_TUNING, mergeTuningV2 as mergeTuning, BIKE_PRESETS_V2 as BIKE_PRESETS, BIKE_CLASSES_V2 as BIKE_CLASSES, bikeTuningV2 as bikeTuning } from './v2/tuning';
export type { TuningV2 as BikeTuning, PartialTuningV2 as PartialTuning, BikeClassV2 as BikeClass } from './v2/tuning';

// v1 (rounds 1-11), kept importable for two rounds so the harness can A/B (§16.2)
export type { BikePhysicsWorld as BikePhysicsWorldV1, PhysicsDebug as PhysicsDebugV1 } from './bike';
export { DEFAULT_TUNING as DEFAULT_TUNING_V1, BIKE_PRESETS as BIKE_PRESETS_V1, bikeTuning as bikeTuningV1 } from './tuning';
export type { BikeTuning as BikeTuningV1, PartialTuning as PartialTuningV1 } from './tuning';
