/**
 * Physics contract. The real bike/rider simulation lives here later; the
 * scaffold only fixes the interface so the game, harness and renderer can be
 * built against it in parallel.
 */
import type { CompiledTrack, GameEvent, InputFrame, PhysicsSnapshot, PhysicsState } from '../core/types';

export interface PhysicsWorld {
  /** Hz the world was configured for (dt = 1 / hz). */
  readonly physicsHz: number;
  /** Load a compiled track and reset to its start. */
  loadTrack(track: CompiledTrack, seed: number): void;
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
