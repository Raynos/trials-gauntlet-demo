/**
 * PB ghost: replays the stored personal-best recording in a second,
 * independent physics world stepped in lockstep with the live run from GO.
 * The ghost keeps its own tick counter from GO (Trials rule) — live restarts
 * do not touch it — and mirrors the game's riding/crashed rules so the
 * recorded run reproduces exactly: restart edge = reset to last checkpoint,
 * crash = auto-respawn after `autoRespawn` ticks unless restarted earlier.
 * (A PB recording always starts at GO and ends at the finish, so a hold-
 * restart never occurs inside one.)
 */
import { NEUTRAL_INPUT, type CompiledTrack, type InputFrame, type PhysicsState } from '../core/types';
import { decodeAny, expandFrames } from '../core/replay';
import type { PhysicsWorld } from '../physics';

export class GhostRunner {
  private readonly frames: InputFrame[];
  private readonly fwd: InputFrame = { ...NEUTRAL_INPUT };
  private index = 0;
  private crashed = false;
  private crashTicks = 0;
  private restartLatch = false;
  private finished = false;
  private cached: PhysicsState | null = null;

  constructor(
    private readonly world: PhysicsWorld,
    track: CompiledTrack,
    recordingJson: string,
    private readonly autoRespawnTicks: number,
  ) {
    const rec = decodeAny(recordingJson);
    if (rec.header.physicsHz !== world.physicsHz) throw new Error(`ghost hz ${rec.header.physicsHz} != ${world.physicsHz}`);
    this.frames = expandFrames(rec);
    // Same bike class the PB was ridden on (header.bike; pre-garage recordings = rookie).
    world.loadTrack(track, rec.header.seed >>> 0, { bike: rec.header.bike ?? 'rookie' });
    world.reset(-1);
    world.drainEvents();
  }

  get length(): number {
    return this.frames.length;
  }

  get tick(): number {
    return this.index;
  }

  /** True once the recording is exhausted or the ghost has crossed the finish. */
  get done(): boolean {
    return this.finished || this.index >= this.frames.length;
  }

  /** Advance one tick of the recording (no-op when done). */
  step(): void {
    if (this.done) return;
    const input = this.frames[this.index++]!;
    const pressed = input.restart === true;
    const edge = pressed && !this.restartLatch;
    this.restartLatch = pressed;
    this.cached = null;
    if (this.crashed) {
      this.crashTicks++;
      if (edge || this.crashTicks >= this.autoRespawnTicks) {
        this.respawn();
        return;
      }
      this.stepWorld(input);
      return;
    }
    if (edge) {
      this.respawn();
      return;
    }
    this.stepWorld(input);
  }

  /** Fast-forward to `ticks` steps from GO (after a snapshot restore). */
  seek(ticks: number): void {
    if (ticks < this.index) {
      this.world.reset(-1);
      this.world.drainEvents();
      this.index = 0;
      this.crashed = false;
      this.crashTicks = 0;
      this.restartLatch = false;
      this.finished = false;
    }
    while (this.index < ticks && !this.done) this.step();
    this.cached = null;
  }

  state(): PhysicsState {
    if (!this.cached) this.cached = this.world.getState();
    return this.cached;
  }

  private respawn(): void {
    const cp = this.state().checkpoint;
    this.world.reset(cp);
    this.world.drainEvents();
    this.crashed = false;
    this.crashTicks = 0;
    this.cached = null;
  }

  private stepWorld(input: InputFrame): void {
    const f = this.fwd;
    f.throttle = input.throttle;
    f.brake = input.brake;
    f.lean = input.lean;
    f.hop = false;
    f.restart = false;
    this.world.step(f);
    for (const e of this.world.drainEvents()) {
      if (e.type === 'fault' && !this.crashed) {
        this.crashed = true;
        this.crashTicks = 0;
      } else if (e.type === 'finish') {
        this.finished = true;
      }
    }
  }
}
