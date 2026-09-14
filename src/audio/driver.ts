/**
 * ModelDriver: owns the model side (AudioParams, scratch, seeded rng) and
 * produces one packed Float32Array per update. Both the live WebAudioSystem
 * and the offline renderer sit on top of this, so they cannot drift apart.
 */
import { Rng } from '../core/rng';
import type { CompiledTrack, GameEvent, InputFrame, PhysicsState } from '../core/types';
import { applyEvent } from './model/events';
import { createScratch, mapParams, resetScratch, type ModelScratch } from './model/mapParams';
import { PACKED_LENGTH, biomeIndex, createParams, packParams, type AudioParams } from './params';

export const AUDIO_SEED_SALT = 0xa0d10;

export class ModelDriver {
  readonly params: AudioParams = createParams();
  readonly scratch: ModelScratch = createScratch();
  readonly packed = new Float32Array(PACKED_LENGTH);
  rng = new Rng(AUDIO_SEED_SALT);
  private lastPacked = false;

  setTrack(track: CompiledTrack | null, seed: number): void {
    this.rng = new Rng(((seed >>> 0) ^ AUDIO_SEED_SALT) >>> 0);
    resetScratch(this.scratch, false);
    this.scratch.biome = biomeIndex(track?.def.meta?.biome);
    this.params.transientCount = 0;
  }

  onEvent(e: GameEvent): void {
    applyEvent(this.params, e, this.scratch, this.rng);
  }

  /** Run the model and pack; the caller ships `packed` then must call flush(). */
  update(state: PhysicsState, dt: number, input: Readonly<InputFrame> | undefined): Float32Array {
    mapParams(this.params, state, input, dt, this.scratch, this.rng);
    packParams(this.params, this.packed);
    this.lastPacked = true;
    return this.packed;
  }

  /** Clear the transient queue after the packed frame has been consumed. */
  flush(): void {
    this.params.transientCount = 0;
    this.lastPacked = false;
  }

  get hasPending(): boolean {
    return this.lastPacked;
  }
}
