/**
 * Audio contract. Engine, suspension, impacts and UI sounds are driven from
 * physics state + game events; the scaffold ships a silent implementation.
 */
import type { GameEvent, PhysicsState } from '../core/types';

export interface AudioSystem {
  /** Must be called from a user gesture in browsers; no-op when already live. */
  unlock(): Promise<void>;
  /** Per rendered frame: continuous sources (engine pitch, wind, wheel roll). */
  update(state: PhysicsState, dt: number): void;
  /** One-shots. */
  onEvent(event: GameEvent): void;
  setMasterVolume(v: number): void;
  dispose(): void;
}

export class NullAudio implements AudioSystem {
  async unlock(): Promise<void> {}
  update(): void {}
  onEvent(): void {}
  setMasterVolume(): void {}
  dispose(): void {}
}
