/**
 * Game integration: owns the loop, physics, renderer, HUD, audio and the
 * input recorder. Has no notion of wall-clock — `RafDriver` and the harness
 * hook both feed it.
 */
import {
  DEFAULT_PHYSICS_HZ,
  FixedStepLoop,
  InputRecorder,
  NEUTRAL_INPUT,
  decodeAny,
  encodeJSON,
  hashPhysicsState,
  iterateFrames,
  quantizeInput,
  type GameEvent,
  type GameEventListener,
  type InputFrame,
  type PhysicsState,
  type RenderStats,
  type TrackDef,
} from '../core';
import type { AudioSystem } from '../audio';
import type { PhysicsWorld } from '../physics';
import type { GameRenderer } from '../render';
import { DEFAULT_TRACK_ID, getTrack } from '../tracks';
import type { Hud } from '../ui';

export interface GameOptions {
  physicsHz?: number;
  physics: PhysicsWorld;
  renderer: GameRenderer;
  hud?: Hud;
  audio?: AudioSystem;
}

export class Game {
  readonly loop: FixedStepLoop;
  readonly physicsHz: number;
  private readonly physics: PhysicsWorld;
  private readonly renderer: GameRenderer;
  private readonly hud: Hud | undefined;
  private readonly audio: AudioSystem | undefined;
  private input: InputFrame = { ...NEUTRAL_INPUT };
  private track: TrackDef | null = null;
  private seed = 0;
  private recorder: InputRecorder | null = null;
  private readonly listeners = new Set<GameEventListener>();
  private lastState: PhysicsState | null = null;

  constructor(options: GameOptions) {
    this.physicsHz = options.physicsHz ?? DEFAULT_PHYSICS_HZ;
    if (options.physics.physicsHz !== this.physicsHz) {
      throw new Error(`physics hz ${options.physics.physicsHz} != game hz ${this.physicsHz}`);
    }
    this.physics = options.physics;
    this.renderer = options.renderer;
    this.hud = options.hud;
    this.audio = options.audio;
    this.loop = new FixedStepLoop(
      {
        tick: () => this.tick(),
        render: (alpha, dt) => this.render(alpha, dt),
      },
      { physicsHz: this.physicsHz },
    );
  }

  // -- events ---------------------------------------------------------------

  onEvent(listener: GameEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: GameEvent): void {
    this.hud?.onEvent(event);
    this.audio?.onEvent(event);
    for (const l of this.listeners) l(event);
  }

  // -- track / lifecycle ----------------------------------------------------

  get currentTrack(): TrackDef | null {
    return this.track;
  }

  get currentSeed(): number {
    return this.seed;
  }

  loadTrack(id: string = DEFAULT_TRACK_ID, seed?: number): boolean {
    const track = getTrack(id);
    if (!track) return false;
    this.track = track;
    this.seed = (seed ?? track.seed) >>> 0;
    this.physics.loadTrack(track, this.seed);
    this.renderer.setTrack(track);
    this.hud?.setTrackName(`${track.name} · ${track.tier}`);
    this.loop.reset();
    this.input = { ...NEUTRAL_INPUT };
    this.flushEvents();
    this.lastState = this.physics.getState();
    return true;
  }

  /** Instant restart at the last checkpoint. */
  restart(): void {
    const cp = this.lastState?.checkpoint ?? -1;
    this.physics.reset(cp);
    this.flushEvents();
    this.lastState = this.physics.getState();
  }

  /** Full restart from the track start (also resets the tick counter). */
  restartFromStart(): void {
    this.physics.reset(-1);
    this.loop.reset();
    this.flushEvents();
    this.lastState = this.physics.getState();
  }

  // -- input ----------------------------------------------------------------

  setInput(frame: Partial<InputFrame>): void {
    this.input = quantizeInput(frame);
  }

  getInput(): Readonly<InputFrame> {
    return this.input;
  }

  // -- simulation -----------------------------------------------------------

  private tick(): void {
    this.recorder?.push(this.input);
    this.physics.step(this.input);
    this.flushEvents();
    this.lastState = null; // invalidate cache
  }

  private flushEvents(): void {
    for (const e of this.physics.drainEvents()) this.emit(e);
  }

  private render(alpha: number, dt: number): number {
    const state = this.getState();
    this.hud?.update(state);
    this.audio?.update(state, dt);
    return this.renderer.render(state, alpha);
  }

  /** Harness entry: advance exactly n ticks. */
  step(n = 1): number {
    return this.loop.stepTicks(n);
  }

  /** Harness entry: render once, return ms (optionally including gl.finish). */
  renderOnce(sync = false): number {
    if (!sync) return this.render(this.loop.alpha, this.loop.dt);
    const t0 = performance.now();
    this.render(this.loop.alpha, this.loop.dt);
    this.renderer.finish();
    return performance.now() - t0;
  }

  /** Real-time entry: feed elapsed seconds. */
  advance(elapsedSeconds: number): void {
    this.loop.advance(elapsedSeconds);
  }

  getState(): PhysicsState {
    if (!this.lastState) this.lastState = this.physics.getState();
    return this.lastState;
  }

  hashState(): string {
    return hashPhysicsState(this.getState());
  }

  finishTime(): number | null {
    return this.getState().finishTime;
  }

  stats(): RenderStats {
    return this.renderer.stats();
  }

  resize(width: number, height: number, pixelRatio?: number): void {
    this.renderer.resize(width, height, pixelRatio);
  }

  get framesRendered(): number {
    return this.renderer.framesRendered;
  }

  // -- recording ------------------------------------------------------------

  startRecording(note?: string): void {
    if (!this.track) throw new Error('startRecording: no track loaded');
    const header: InputRecorder['header'] = {
      version: 1,
      trackId: this.track.id,
      seed: this.seed,
      physicsHz: this.physicsHz,
    };
    if (note) header.note = note;
    this.recorder = new InputRecorder(header);
  }

  stopRecording(): string | null {
    if (!this.recorder) return null;
    const json = encodeJSON(this.recorder.toRecording());
    this.recorder = null;
    return json;
  }

  /**
   * Load the recording's track+seed, replay every frame, return final state.
   * Does not render; callers wanting frames drive step() themselves.
   */
  runRecording(data: string | Uint8Array): PhysicsState {
    const rec = decodeAny(data);
    if (rec.header.physicsHz !== this.physicsHz) {
      throw new Error(`recording hz ${rec.header.physicsHz} != game hz ${this.physicsHz}`);
    }
    if (!this.loadTrack(rec.header.trackId, rec.header.seed)) {
      throw new Error(`unknown track ${rec.header.trackId}`);
    }
    for (const frame of iterateFrames(rec)) {
      this.input = frame;
      this.loop.stepTicks(1);
    }
    this.input = { ...NEUTRAL_INPUT };
    return this.getState();
  }
}
