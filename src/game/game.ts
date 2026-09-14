/**
 * Game integration: owns the loop, the run state machine (menu → countdown →
 * riding ⇄ crashed → finished), the run clock, the fault counter, restart
 * semantics, physics, renderer, HUD, audio and the input recorder.
 *
 * It has no notion of wall-clock: `RafDriver` and the harness hook both feed
 * it, and every timer here is an integer tick count advanced only inside
 * `tick()`, so a recording replays every phase change tick for tick.
 * See docs/design/game.md.
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
  type CameraDebug,
  type CompiledTrack,
  type GameEvent,
  type GameEventListener,
  type GamePhase,
  type InputFrame,
  type PhysicsSnapshot,
  type PhysicsState,
  type QualityTier,
  type RenderStats,
  type RunInfo,
  type TrackDef,
} from '../core';
import type { AudioSystem } from '../audio';
import type { PhysicsWorld } from '../physics';
import type { GameRenderer } from '../render';
import { DEFAULT_TRACK_ID, compileTrack, getTrack } from '../tracks';
import type { Hud } from '../ui';
import { COUNTDOWN_BEATS, medalFor, ruleTicks, targetTimeOf, type RunResult } from './rules';

export interface BestTimeStore {
  get(trackId: string): { time: number; faults: number } | null;
  put(trackId: string, result: RunResult): void;
}

export interface GameOptions {
  physicsHz?: number;
  physics: PhysicsWorld;
  renderer: GameRenderer;
  hud?: Hud;
  audio?: AudioSystem;
  bestTimes?: BestTimeStore;
  /** Harness mode: `loadTrack` and full restarts start at GO (no countdown). */
  autoSkipCountdown?: boolean;
}

/** Everything the game layer adds on top of the physics snapshot. */
export interface GameCounters {
  phase: GamePhase;
  runTicks: number;
  finishRunTicks: number;
  faults: number;
  countdownTick: number;
  crashTicks: number;
  holdTicks: number;
  holdFired: boolean;
  restartLatch: boolean;
  resultsTicks: number;
  resultsShown: boolean;
}

const EVENT_QUEUE_MAX = 256;

/** Optional renderer methods from CONTRACT §2.7 the scaffold renderer may not have yet. */
type RendererExtras = Partial<{
  onEvent(e: GameEvent): void;
  setQuality(t: QualityTier): void;
  camera(): CameraDebug;
  setRunInfo(info: { runTime: number; phase: GamePhase }): void;
}>;

export class Game {
  readonly loop: FixedStepLoop;
  readonly physicsHz: number;
  readonly ticks: ReturnType<typeof ruleTicks>;
  private readonly physics: PhysicsWorld;
  private readonly renderer: GameRenderer & RendererExtras;
  private readonly hud: Hud | undefined;
  private readonly audio: AudioSystem | undefined;
  private readonly bestTimes: BestTimeStore | undefined;
  private readonly autoSkipCountdown: boolean;

  private input: InputFrame = { ...NEUTRAL_INPUT };
  /** Reused frame forwarded to physics: the player's frame minus `restart`. */
  private readonly fwd: InputFrame = { ...NEUTRAL_INPUT };
  private track: TrackDef | null = null;
  private seed = 0;
  private recorder: InputRecorder | null = null;
  private readonly listeners = new Set<GameEventListener>();
  private lastState: PhysicsState | null = null;
  private pending: GameEvent[] = [];
  private quality: QualityTier = 'high';
  private pausedFlag = false;
  private readonly runInfo: RunInfo = { runTime: 0, faults: 0, phase: 'menu', checkpoint: -1, checkpointCount: 0, simTime: 0 };
  private lastResult: RunResult | null = null;

  // -- run state machine counters (all integers, all snapshot-able) --------
  private phaseValue: GamePhase = 'menu';
  private runTicks = 0;
  private finishRunTicks = 0;
  private faultCount = 0;
  private countdownTick = 0;
  private crashTicks = 0;
  private holdTicks = 0;
  private holdFired = false;
  private restartLatch = false;
  private resultsTicks = 0;
  private resultsShown = false;

  /** Fired once per finished run, 0.4 s after the finish line. */
  onResults: ((result: RunResult) => void) | null = null;
  /** Fired on every phase change (menus, audio state, etc.). */
  onPhase: ((phase: GamePhase, prev: GamePhase) => void) | null = null;

  constructor(options: GameOptions) {
    this.physicsHz = options.physicsHz ?? DEFAULT_PHYSICS_HZ;
    if (options.physics.physicsHz !== this.physicsHz) {
      throw new Error(`physics hz ${options.physics.physicsHz} != game hz ${this.physicsHz}`);
    }
    this.ticks = ruleTicks(this.physicsHz);
    this.physics = options.physics;
    this.renderer = options.renderer;
    this.hud = options.hud;
    this.audio = options.audio;
    this.bestTimes = options.bestTimes;
    this.autoSkipCountdown = options.autoSkipCountdown ?? false;
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
    if (event.type === 'fault') this.faultCount++;
    this.pending.push(event);
    if (this.pending.length > EVENT_QUEUE_MAX) this.pending.splice(0, this.pending.length - EVENT_QUEUE_MAX);
    this.hud?.onEvent(event);
    this.audio?.onEvent(event);
    this.renderer.onEvent?.(event);
    for (const l of this.listeners) l(event);
  }

  private setPhase(next: GamePhase): void {
    const prev = this.phaseValue;
    if (prev === next) return;
    this.phaseValue = next;
    this.onPhase?.(next, prev);
  }

  // -- track / lifecycle ----------------------------------------------------

  get currentTrack(): TrackDef | null {
    return this.track;
  }

  get currentSeed(): number {
    return this.seed;
  }

  /** Wall ms of the last loadTrack (reported through hook.info for the boot gate). */
  lastLoadMs = 0;

  loadTrack(id: string = DEFAULT_TRACK_ID, seed?: number): boolean {
    const track = getTrack(id);
    if (!track) return false;
    const t0 = performance.now();
    this.track = track;
    this.seed = (seed ?? track.seed) >>> 0;
    const compiled = compileTrack(track);
    this.physics.loadTrack(compiled, this.seed);
    this.renderer.setTrack(compiled);
    (this.audio as Partial<{ setTrack(t: CompiledTrack, seed: number): void }> | undefined)?.setTrack?.(compiled, this.seed);
    this.hud?.setTrack(track);
    this.loop.reset();
    this.input = { ...NEUTRAL_INPUT };
    this.lastResult = null;
    this.beginRun();
    this.lastLoadMs = performance.now() - t0;
    return true;
  }

  /** Back to the menu phase: nothing ticks until the next loadTrack/startRun. */
  toMenu(): void {
    this.setPhase('menu');
    this.pausedFlag = false;
  }

  /** Re-arm the current track from its start (used by the menu's Play). */
  startRun(): void {
    if (!this.track) return;
    this.physics.reset(-1);
    this.physics.drainEvents();
    this.lastState = null;
    this.emit({ type: 'restart', checkpoint: -1, tick: 0 });
    this.beginRun();
  }

  /** Common tail of loadTrack / full restart: zero the run, start the countdown. */
  private beginRun(): void {
    this.faultCount = 0;
    this.runTicks = 0;
    this.finishRunTicks = 0;
    this.crashTicks = 0;
    this.resultsTicks = 0;
    this.resultsShown = false;
    this.holdFired = true; // the press that triggered a hold must be released before it can fire again
    this.lastState = null;
    if (this.autoSkipCountdown) {
      this.go();
    } else {
      this.countdownTick = 0;
      this.setPhase('countdown');
      this.emit({ type: 'countdown', n: 3 });
    }
  }

  /** GO: physics state becomes byte-identical to a fresh load; the run clock starts. */
  private go(): void {
    this.physics.reset(-1);
    this.physics.drainEvents(); // swallow whatever reset produced: replays start here
    this.lastState = null;
    this.runTicks = 0;
    this.setPhase('riding');
    this.emit({ type: 'go' });
  }

  /** Manual restart (tap): a fault while riding, free while crashed, full retry when finished. */
  restart(): void {
    this.restartEdge();
  }

  private restartEdge(): void {
    switch (this.phaseValue) {
      case 'riding': {
        const s = this.getState();
        this.emit({ type: 'fault', reason: 'restart', tick: s.tick, time: s.time });
        this.respawn(s.checkpoint);
        return;
      }
      case 'crashed':
        this.respawn(this.getState().checkpoint);
        return;
      case 'finished':
        this.restartFromStart();
        return;
      default:
        return;
    }
  }

  /** One-tick hard cut to a checkpoint: no countdown, run clock keeps running. */
  private respawn(checkpoint: number): void {
    this.physics.reset(checkpoint);
    this.physics.drainEvents();
    this.lastState = null;
    this.crashTicks = 0;
    this.setPhase('riding');
    this.emit({ type: 'restart', checkpoint, tick: 0 });
  }

  /** Full restart: faults and run clock reset, countdown again. */
  restartFromStart(): void {
    this.physics.reset(-1);
    this.physics.drainEvents();
    this.lastState = null;
    this.emit({ type: 'restart', checkpoint: -1, tick: 0 });
    this.beginRun();
  }

  skipCountdown(): void {
    if (this.phaseValue === 'countdown') this.go();
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
    const input = this.input;
    this.recorder?.push(input);
    const T = this.ticks;

    // Restart edge + hold tracking is phase-independent.
    const pressed = input.restart === true;
    const edge = pressed && !this.restartLatch;
    this.restartLatch = pressed;
    if (pressed) this.holdTicks++;
    else {
      this.holdTicks = 0;
      this.holdFired = false;
    }
    if (pressed && !this.holdFired && this.holdTicks >= T.holdRestart && this.phaseValue !== 'menu') {
      this.holdFired = true;
      if (this.phaseValue === 'crashed' || this.phaseValue === 'riding') this.runTicks++;
      this.restartFromStart();
      return;
    }

    switch (this.phaseValue) {
      case 'menu':
        return;
      case 'countdown': {
        // Bike is alive but held: neutral input, and nothing physics says counts yet.
        this.physics.step(NEUTRAL_INPUT);
        this.physics.drainEvents();
        this.lastState = null;
        this.countdownTick++;
        if (this.countdownTick % T.countdownBeat === 0) {
          const n = COUNTDOWN_BEATS - this.countdownTick / T.countdownBeat;
          if (n <= 0) this.go();
          else this.emit({ type: 'countdown', n: n as 3 | 2 | 1 });
        }
        return;
      }
      case 'riding': {
        this.runTicks++;
        if (edge) {
          this.restartEdge(); // fault + reset, physics does not step this tick
          return;
        }
        this.stepPhysics(input);
        return;
      }
      case 'crashed': {
        this.runTicks++;
        this.crashTicks++;
        if (edge || this.crashTicks >= T.autoRespawn) {
          this.respawn(this.getState().checkpoint);
          return;
        }
        this.stepPhysics(input);
        return;
      }
      case 'finished': {
        if (edge) {
          this.restartFromStart();
          return;
        }
        this.resultsTicks++;
        if (!this.resultsShown && this.resultsTicks >= T.resultsDelay) {
          this.resultsShown = true;
          this.publishResults();
        }
        this.stepPhysics(input);
        return;
      }
    }
  }

  private stepPhysics(input: InputFrame): void {
    const f = this.fwd;
    f.throttle = input.throttle;
    f.brake = input.brake;
    f.lean = input.lean;
    f.hop = false;
    f.restart = false;
    this.physics.step(f);
    this.lastState = null;
    const events = this.physics.drainEvents();
    for (let i = 0; i < events.length; i++) this.processPhysicsEvent(events[i]!);
  }

  private processPhysicsEvent(e: GameEvent): void {
    switch (e.type) {
      case 'fault':
        if (this.phaseValue !== 'riding') return; // ragdoll re-contacts / post-finish tumbles are not faults
        this.crashTicks = 0;
        this.setPhase('crashed');
        this.emit(e);
        return;
      case 'finish':
        if (this.phaseValue !== 'riding') return;
        this.finishRunTicks = this.runTicks;
        this.resultsTicks = 0;
        this.resultsShown = false;
        this.setPhase('finished');
        this.emit(e);
        return;
      case 'restart':
        return; // the game emits its own restart events around reset()
      default:
        this.emit(e);
    }
  }

  private publishResults(): void {
    const track = this.track;
    if (!track) return;
    const time = this.finishRunTicks / this.physicsHz;
    const prev = this.bestTimes?.get(track.id) ?? null;
    const result: RunResult = {
      trackId: track.id,
      time,
      faults: this.faultCount,
      medal: medalFor(time, this.faultCount, targetTimeOf(track)),
      personalBest: prev === null || time < prev.time,
      previousBest: prev ? prev.time : null,
      targetTimeS: targetTimeOf(track),
    };
    this.lastResult = result;
    if (result.personalBest) this.bestTimes?.put(track.id, result);
    this.hud?.showResults(result);
    this.onResults?.(result);
  }

  private render(alpha: number, dt: number): number {
    const state = this.getState();
    const info = this.runInfo;
    info.runTime = this.runTime();
    info.faults = this.faultCount;
    info.phase = this.phaseValue;
    info.checkpoint = state.checkpoint;
    info.checkpointCount = this.track?.checkpoints.length ?? 0;
    info.simTime = (this.loop.ticks + alpha) / this.physicsHz;
    this.renderer.setRunInfo?.(info);
    this.hud?.setRun(info);
    this.hud?.update(state);
    this.audio?.update(state, dt, this.input);
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

  /** Real-time entry: feed elapsed seconds. Paused or in the menu: render only. */
  advance(elapsedSeconds: number): void {
    if (this.pausedFlag || this.phaseValue === 'menu') {
      this.loop.renderOnce();
      return;
    }
    this.loop.advance(elapsedSeconds);
  }

  setPaused(p: boolean): void {
    this.pausedFlag = p;
  }

  paused(): boolean {
    return this.pausedFlag;
  }

  getState(): PhysicsState {
    if (!this.lastState) this.lastState = this.physics.getState();
    return this.lastState;
  }

  hashState(): string {
    return hashPhysicsState(this.getState());
  }

  // -- CONTRACT.md §2.9 -----------------------------------------------------

  snapshot(): PhysicsSnapshot {
    return this.physics.snapshot();
  }

  restore(s: PhysicsSnapshot): void {
    this.physics.restore(s);
    this.physics.drainEvents();
    this.lastState = null;
  }

  counters(): GameCounters {
    return {
      phase: this.phaseValue,
      runTicks: this.runTicks,
      finishRunTicks: this.finishRunTicks,
      faults: this.faultCount,
      countdownTick: this.countdownTick,
      crashTicks: this.crashTicks,
      holdTicks: this.holdTicks,
      holdFired: this.holdFired,
      restartLatch: this.restartLatch,
      resultsTicks: this.resultsTicks,
      resultsShown: this.resultsShown,
    };
  }

  restoreCounters(c: GameCounters): void {
    this.setPhase(c.phase);
    this.runTicks = c.runTicks;
    this.finishRunTicks = c.finishRunTicks;
    this.faultCount = c.faults;
    this.countdownTick = c.countdownTick;
    this.crashTicks = c.crashTicks;
    this.holdTicks = c.holdTicks;
    this.holdFired = c.holdFired;
    this.restartLatch = c.restartLatch;
    this.resultsTicks = c.resultsTicks;
    this.resultsShown = c.resultsShown;
  }

  /** Events since the last call (also delivered to listeners as they happen). */
  drainEvents(): GameEvent[] {
    const out = this.pending;
    this.pending = [];
    return out;
  }

  /** Run clock: 0 before GO, runs through crashes and restarts, frozen at finish. */
  runTime(): number {
    const t = this.phaseValue === 'finished' ? this.finishRunTicks : this.runTicks;
    return t / this.physicsHz;
  }

  faults(): number {
    return this.faultCount;
  }

  phase(): GamePhase {
    return this.phaseValue;
  }

  result(): RunResult | null {
    return this.lastResult;
  }

  camera(): CameraDebug {
    if (typeof this.renderer.camera === 'function') return this.renderer.camera();
    const s = this.getState();
    return { pos: { x: s.bike.pos.x, y: s.bike.pos.y }, dist: 14, bikeScreenX: 0.3, bikeScreenY: 0.55, bikeHeightFrac: 0.2 };
  }

  setQuality(t: QualityTier): void {
    this.quality = t;
    this.renderer.setQuality?.(t);
  }

  get qualityTier(): QualityTier {
    return this.quality;
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
   * Load the recording's track+seed, start at GO, replay every frame through
   * the same tick() as live play, return the final physics state.
   */
  runRecording(data: string | Uint8Array): PhysicsState {
    const rec = decodeAny(data);
    if (rec.header.physicsHz !== this.physicsHz) {
      throw new Error(`recording hz ${rec.header.physicsHz} != game hz ${this.physicsHz}`);
    }
    if (!this.loadTrack(rec.header.trackId, rec.header.seed)) {
      throw new Error(`unknown track ${rec.header.trackId}`);
    }
    this.skipCountdown();
    const wasPaused = this.pausedFlag;
    this.pausedFlag = false;
    for (const frame of iterateFrames(rec)) {
      this.input = frame;
      this.loop.stepTicks(1);
    }
    this.pausedFlag = wasPaused;
    this.input = { ...NEUTRAL_INPUT };
    return this.getState();
  }
}
