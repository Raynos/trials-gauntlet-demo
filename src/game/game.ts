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
  DEFAULT_BIKE,
  DEFAULT_PHYSICS_HZ,
  FixedStepLoop,
  InputRecorder,
  NEUTRAL_INPUT,
  decodeAny,
  encodeJSON,
  expandFrames,
  hashPhysicsState,
  iterateFrames,
  packFrame,
  quantizeInput,
  type BikeClass,
  type CameraDebug,
  type CompiledTrack,
  type GameEvent,
  type GameEventListener,
  type GamePhase,
  type InputFrame,
  type InputTraceRun,
  type PhysicsSnapshot,
  type PhysicsVersion,
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
import { GhostRunner } from './ghost';
import { COUNTDOWN_BEATS, FINISH_BRAKE, medalFor, ruleTicks, targetForBike, targetTimeOf, type RunResult } from './rules';

/** `loadTrack(track, seed, { bike })` — physics picks the tuning preset (`BIKE_PRESETS`, physics round 11); `rookie` is the round-10 bike to the byte. */
export type BikeLoadOptions = { bike: BikeClass };

/** Ring of the last N samples with p50 / p95 (perf overlay). Wall-clock only; never feeds the sim. */
export class Percentiles {
  private readonly buf: Float64Array;
  private n = 0;
  private i = 0;
  constructor(size = 240) {
    this.buf = new Float64Array(size);
  }
  push(v: number): void {
    this.buf[this.i] = v;
    this.i = (this.i + 1) % this.buf.length;
    if (this.n < this.buf.length) this.n++;
  }
  get count(): number {
    return this.n;
  }
  reset(): void {
    this.n = 0;
    this.i = 0;
  }
  stats(): { p50: number; p95: number } {
    if (this.n === 0) return { p50: 0, p95: 0 };
    const a = Array.from(this.buf.subarray(0, this.n)).sort((x, y) => x - y);
    return { p50: a[Math.min(this.n - 1, Math.floor(this.n * 0.5))]!, p95: a[Math.min(this.n - 1, Math.floor(this.n * 0.95))]! };
  }
}

export interface BestRecord {
  time: number;
  faults: number;
  /** Run clock at each checkpoint crossing of the PB run (index = checkpoint index). */
  splits?: number[];
  /** JSON InputRecording of the PB run, from GO to the finish (drives the ghost). */
  recording?: string;
}

export interface BestTimeStore {
  /** Entry for a bike class; without `bike` the track's best across classes. */
  get(trackId: string, bike?: BikeClass): BestRecord | null;
  put(trackId: string, result: RunResult, run: { splits: number[]; recording: string | null }): void;
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
  /** Builds the second world for the PB ghost; without it there is no ghost. */
  physicsFactory?: (physicsHz: number) => PhysicsWorld;
  /** Record every run from GO so a personal best can be stored with its inputs (live mode). */
  autoRecord?: boolean;
  /** PB ghost on by default (harness mode passes false so µs/tick measures one world). */
  ghostEnabled?: boolean;
  /**
   * Solver `physics` / `physicsFactory` are (`'v2'` = the shipped default, `'v1'` = `?physics=v1`). Stamped
   * into every recording header; a stored PB whose stamp differs is never ghosted or offered as a replay
   * (its medal stays). Absent (mock physics, unit tests) = no gating.
   */
  physicsVersion?: PhysicsVersion | undefined;
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
  /** Post-finish: the bike crashed on the run-out and physics is frozen at the tick before the fault. Optional so older snapshots / the harness mirror (`harness/lib/rules.ts`) still type. */
  finishFrozen?: boolean;
}

const EVENT_QUEUE_MAX = 256;
/** Ticks of input kept for the death trace / `?trace=1` (1 s at 120 Hz). */
export const TRACE_TICKS = 120;

/** Optional renderer methods from CONTRACT §2.7 the scaffold renderer may not have yet. */
type RendererExtras = Partial<{
  onEvent(e: GameEvent): void;
  setQuality(t: QualityTier): void;
  camera(): CameraDebug;
  setRunInfo(info: { runTime: number; phase: GamePhase }): void;
  setGhost(state: PhysicsState | null): void;
  setBikeClass(c: BikeClass): void;
}>;

/** Solver stamp of a recording (JSON or binary); unstamped = `'v1'` (recorded before the v2 flip). */
export function recordingPhysics(source: string): PhysicsVersion {
  try {
    if (source.charCodeAt(0) === 0x7b /* { */) {
      const raw = JSON.parse(source) as { header?: { physics?: unknown } };
      const p = raw.header?.physics;
      return p === 'v2' ? 'v2' : 'v1';
    }
    return decodeAny(source).header.physics ?? 'v1';
  } catch {
    return 'v1';
  }
}

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
  private readonly physicsFactory: ((physicsHz: number) => PhysicsWorld) | undefined;
  private readonly autoRecord: boolean;
  /** Solver in effect (see `GameOptions.physicsVersion`); undefined = ungated. */
  readonly physicsVersion: PhysicsVersion | undefined;
  private compiled: CompiledTrack | null = null;
  private pbRecorder: InputRecorder | null = null;
  private pbJson: string | null = null;
  private splits: number[] = [];
  private ghost: GhostRunner | null = null;
  private ghostEnabled = true;
  private lastGhostState: PhysicsState | null = null;
  /** Recording the current PB ghost was built from (reused across playback seeks instead of rebuilding the world). */
  private ghostSource: string | null = null;

  // -- last run / playback (replay viewer, docs/design/game.md §16) --------
  private lastRunJson: string | null = null;
  private lastRunMeta: { time: number; faults: number; bike: BikeClass; trackId: string } | null = null;
  private playbackFrames: InputFrame[] | null = null;
  private playbackGhost = true;
  /** Wall → sim rate while a replay plays (0.25 / 0.5 / 1). */
  playbackSpeed = 1;
  private playbackEnded = false;

  // -- input trace: the last second of quantized frames (telemetry deaths, `?trace=1`) --
  private readonly traceRing = new Int16Array(TRACE_TICKS * 4);
  private traceN = 0;
  private traceI = 0;

  // -- physics lab (`lab-*` tracks / `?lab=1`): ghost of the last attempt, per-tick tap --
  private labMode = false;
  private attemptFrames: InputFrame[] = [];
  private attemptCp = -1;
  private lastAttempt: { checkpoint: number; frames: InputFrame[] } | null = null;
  /** Called after every riding / crashed tick with the fresh state (lab trace sampling); off by default. */
  tickTap: ((state: PhysicsState, runTick: number) => void) | null = null;

  private input: InputFrame = { ...NEUTRAL_INPUT };
  /** Reused frame forwarded to physics: the player's frame minus `restart`. */
  private readonly fwd: InputFrame = { ...NEUTRAL_INPUT };
  private track: TrackDef | null = null;
  private seed = 0;
  private bike: BikeClass = DEFAULT_BIKE;
  /** `?perf=1`: time each physics step (µs) for the overlay. Off by default — no per-tick `performance.now`. */
  perfTiming = false;
  readonly physicsUs = new Percentiles(240);
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
  private finishFrozen = false;

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
    this.physicsFactory = options.physicsFactory;
    this.autoRecord = options.autoRecord ?? false;
    this.ghostEnabled = options.ghostEnabled ?? true;
    this.physicsVersion = options.physicsVersion;
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

  /** Bike class in effect for the next `loadTrack` (Garage choice / per-tier default; App sets it before loading). */
  get currentBike(): BikeClass {
    return this.bike;
  }

  /**
   * Choose the bike class. Takes effect on the next load; when a track is already up and
   * nothing is racing (menu backdrop, countdown) the world is reloaded in place so the
   * Garage preview and the countdown show the chosen bike.
   */
  setBike(bike: BikeClass): void {
    if (bike === this.bike) return;
    this.bike = bike;
    if (this.track && (this.phaseValue === 'menu' || this.phaseValue === 'countdown')) {
      const phase = this.phaseValue;
      this.loadTrack(this.track.id, this.seed);
      if (phase === 'menu') this.toMenu();
    }
  }

  loadTrack(id: string = DEFAULT_TRACK_ID, seed?: number, bike?: BikeClass): boolean {
    const track = getTrack(id);
    if (!track) return false;
    const t0 = performance.now();
    this.track = track;
    this.seed = (seed ?? track.seed) >>> 0;
    if (bike) this.bike = bike;
    const compiled = compileTrack(track);
    this.compiled = compiled;
    this.physics.loadTrack(compiled, this.seed, { bike: this.bike });
    this.renderer.setTrack(compiled);
    // CONTRACT §2.7 `setBikeClass` (render round 11): the hero wears the class livery on every load path —
    // garage preview (`setBike` reload), track launch, `hook.setBike`, a replay's `header.bike`. Optional: a
    // renderer without it keeps the default livery and the garage card tint carries the colour.
    this.renderer.setBikeClass?.(this.bike);
    (this.audio as Partial<{ setTrack(t: CompiledTrack, seed: number): void }> | undefined)?.setTrack?.(compiled, this.seed);
    this.hud?.setTrack(track);
    this.loop.reset();
    this.input = { ...NEUTRAL_INPUT };
    this.lastResult = null;
    this.lastAttempt = null;
    this.ghostSource = null;
    this.ghost = null;
    this.beginRun();
    this.lastLoadMs = performance.now() - t0;
    return true;
  }

  /** Renderer art / hero model for the loaded track are in (frame 0 final); resolves at once when the renderer has no `whenReady`. */
  whenReady(): Promise<void> | null {
    const r = this.renderer as Partial<{ whenReady(): Promise<void> }>;
    return typeof r.whenReady === 'function' ? r.whenReady.call(this.renderer) : null;
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
    this.finishFrozen = false;
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
    this.splits = [];
    this.pbJson = null;
    this.pbRecorder = this.autoRecord && this.track ? new InputRecorder({ version: 1, trackId: this.track.id, seed: this.seed, physicsHz: this.physicsHz, bike: this.bike, ...(this.physicsVersion ? { physics: this.physicsVersion } : {}) }) : null;
    this.setPhase('riding');
    this.emit({ type: 'go' });
    this.beginAttempt(-1);
    this.spawnGhost();
  }

  // -- physics lab: ghost of the last attempt ------------------------------------

  /** `lab-*` tracks / `?lab=1`: the ghost slot shows the previous attempt (from its spawn to its fault) instead of the PB. */
  setLabMode(on: boolean): void {
    if (on === this.labMode) return;
    this.labMode = on;
    this.lastAttempt = null;
    if (this.phaseValue === 'riding' || this.phaseValue === 'crashed') {
      this.spawnGhost();
      this.ghost?.seek(this.runTicks);
    }
  }

  get lab(): boolean {
    return this.labMode;
  }

  /** Attempts on this run: 1 + faults (CONTRACT §3). */
  attempts(): number {
    return 1 + this.faultCount;
  }

  private beginAttempt(checkpoint: number): void {
    if (!this.labMode) return;
    if (this.attemptFrames.length > 0) this.lastAttempt = { checkpoint: this.attemptCp, frames: this.attemptFrames };
    this.attemptFrames = [];
    this.attemptCp = checkpoint;
  }

  // -- PB ghost ---------------------------------------------------------------

  /** Build the ghost for the current track from the stored PB recording (if any). */
  private spawnGhost(): void {
    this.lastGhostState = null;
    if (!this.ghostEnabled || !this.physicsFactory || !this.track || !this.compiled) {
      this.ghost = null;
      return;
    }
    if (this.labMode) {
      // Lab: the previous attempt, from its own spawn point; it starts when the live bike respawns.
      this.ghost = null;
      this.ghostSource = null;
      const a = this.lastAttempt;
      if (!a) return;
      this.ghost = new GhostRunner(this.physicsFactory(this.physicsHz), this.compiled, { frames: a.frames, seed: this.seed, bike: this.bike, checkpoint: a.checkpoint }, this.ticks.autoRespawn);
      return;
    }
    if (this.playbackFrames && !this.playbackGhost) {
      this.ghost = null;
      return;
    }
    const rec = this.bestTimes?.get(this.track.id, this.bike)?.recording;
    if (!rec || !this.recordingMatchesPhysics(rec)) {
      // No PB, or a PB recorded on the other solver: the same inputs would ride to a different finish, so no ghost.
      this.ghost = null;
      this.ghostSource = null;
      return;
    }
    if (this.ghost && this.ghostSource === rec) {
      this.ghost.seek(0); // same PB: rewind the existing world (playback seeks do this per scrub frame)
      return;
    }
    try {
      this.ghost = new GhostRunner(this.physicsFactory(this.physicsHz), this.compiled, rec, this.ticks.autoRespawn);
      this.ghostSource = rec;
    } catch (e) {
      console.warn('[trials] ghost recording unusable', e);
      this.ghost = null;
      this.ghostSource = null;
    }
  }

  /**
   * True when a recording was produced on the live solver (header stamp; unstamped = v1). A game without a
   * `physicsVersion` (mock physics, unit tests) accepts everything. Cheap: JSON is sniffed for the header only.
   */
  recordingMatchesPhysics(source: string): boolean {
    if (!this.physicsVersion) return true;
    return recordingPhysics(source) === this.physicsVersion;
  }

  setGhostEnabled(on: boolean): void {
    if (on === this.ghostEnabled) return;
    this.ghostEnabled = on;
    if (!on) {
      this.ghost = null;
      this.lastGhostState = null;
    } else if (this.phaseValue !== 'menu' && this.phaseValue !== 'countdown') {
      this.spawnGhost();
      this.ghost?.seek(this.runTicks);
    }
  }

  ghostEnabledFlag(): boolean {
    return this.ghostEnabled;
  }

  /** Ghost physics state for the renderer / hook; null when there is no ghost or before GO. */
  ghostState(): PhysicsState | null {
    if (!this.ghost || this.phaseValue === 'menu' || this.phaseValue === 'countdown') return null;
    if (!this.lastGhostState) this.lastGhostState = this.ghost.state();
    return this.lastGhostState;
  }

  /** Current run's checkpoint splits (run clock at each crossing). */
  currentSplits(): readonly number[] {
    return this.splits;
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
    if (this.labMode) {
      this.beginAttempt(checkpoint);
      this.spawnGhost();
    }
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
    if (this.playbackFrames) {
      // Replay viewer: the recording is the player. Frame index == ticks since GO (what the recorder counted).
      const f = this.phaseValue === 'riding' || this.phaseValue === 'crashed' ? this.playbackFrames[this.runTicks] : undefined;
      this.input = f ?? NEUTRAL_INPUT;
    }
    const input = this.input;
    this.recorder?.push(input);
    const T = this.ticks;
    if (this.phaseValue === 'riding' || this.phaseValue === 'crashed') {
      const [pt, pb, pl, pf] = packFrame(input);
      const o = this.traceI * 4;
      this.traceRing[o] = pt;
      this.traceRing[o + 1] = pb;
      this.traceRing[o + 2] = pl;
      this.traceRing[o + 3] = pf;
      this.traceI = (this.traceI + 1) % TRACE_TICKS;
      if (this.traceN < TRACE_TICKS) this.traceN++;
      if (this.labMode && this.phaseValue === 'riding' && this.attemptFrames.length < 120 * 600) this.attemptFrames.push(input);
    }

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

    if (this.phaseValue === 'riding' || this.phaseValue === 'crashed' || this.phaseValue === 'finished') {
      if (this.phaseValue !== 'finished') this.pbRecorder?.push(input);
      if (this.ghost) {
        this.ghost.step();
        this.lastGhostState = null;
      }
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
        this.tickTap?.(this.getState(), this.runTicks);
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
        this.tickTap?.(this.getState(), this.runTicks);
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
        if (!this.finishFrozen) this.stepFinishCoast();
        return;
      }
    }
  }

  /**
   * After the line the game owns the input (docs/design/game.md §1 Finish): throttle 0, lean 0, brake
   * ramping 0 → 0.6 over 1.0 s so the bike coasts and stops on the run-out with the rider upright. A
   * finish never shows a fault: if the bike still crashes past the line (no run-out), the tick is
   * undone (physics restored to the tick before) and the world freezes there — no ✕, no ragdoll, no
   * respawn, no camera cut. The pre-step snapshot is two typed-array copies, only while finished.
   */
  private stepFinishCoast(): void {
    const k = Math.min(1, this.resultsTicks / this.ticks.finishBrake);
    const f = this.fwd;
    f.throttle = 0;
    f.brake = Math.round(FINISH_BRAKE * k * 255) / 255;
    f.lean = 0;
    f.hop = false;
    f.restart = false;
    const before = this.physics.snapshot();
    this.physics.step(f);
    this.lastState = null;
    const events = this.physics.drainEvents();
    let faulted = false;
    for (let i = 0; i < events.length; i++) {
      const e = events[i]!;
      if (e.type === 'fault') faulted = true;
      else this.processPhysicsEvent(e);
    }
    if (faulted) {
      this.physics.restore(before);
      this.physics.drainEvents();
      this.lastState = null;
      this.finishFrozen = true;
    }
  }

  /** Input the world is actually being driven with (the player's frame, or the game's post-finish coast). */
  effectiveInput(): Readonly<InputFrame> {
    return this.phaseValue === 'finished' ? this.fwd : this.input;
  }

  private stepPhysics(input: InputFrame): void {
    const f = this.fwd;
    f.throttle = input.throttle;
    f.brake = input.brake;
    f.lean = input.lean;
    f.hop = false;
    f.restart = false;
    if (this.perfTiming) {
      const t0 = performance.now();
      this.physics.step(f);
      this.physicsUs.push((performance.now() - t0) * 1000);
    } else this.physics.step(f);
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
      case 'checkpoint': {
        if (this.phaseValue === 'riding') {
          const t = this.runTicks / this.physicsHz;
          this.splits[e.index] = t;
          const pb = this.track ? this.bestTimes?.get(this.track.id, this.bike) : null;
          const ref = pb?.splits?.[e.index];
          if (typeof ref === 'number') this.hud?.showSplit(e.index, t - ref);
        }
        this.emit(e);
        return;
      }
      case 'finish':
        if (this.phaseValue !== 'riding') return;
        this.finishRunTicks = this.runTicks;
        this.pbJson = this.pbRecorder ? encodeJSON(this.pbRecorder.toRecording()) : null;
        this.pbRecorder = null;
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
    if (this.playbackFrames) return; // a replay never stores, logs or shows results; the viewer reads `playbackInfo()`
    const time = this.finishRunTicks / this.physicsHz;
    if (this.pbJson) {
      this.lastRunJson = this.pbJson;
      this.lastRunMeta = { time, faults: this.faultCount, bike: this.bike, trackId: track.id };
    }
    const prev = this.bestTimes?.get(track.id, this.bike) ?? null;
    const result: RunResult = {
      trackId: track.id,
      time,
      faults: this.faultCount,
      medal: medalFor(time, this.faultCount, targetTimeOf(track), this.bike),
      personalBest: prev === null || time < prev.time,
      previousBest: prev ? prev.time : null,
      targetTimeS: targetForBike(targetTimeOf(track), this.bike),
      bike: this.bike,
    };
    this.lastResult = result;
    if (result.personalBest) this.bestTimes?.put(track.id, result, { splits: [...this.splits], recording: this.pbJson });
    // The panel's staged reveal is clocked from the HUD's sim time: anchor it to THIS tick, not to the last render
    // (a stepped sim — harness, e2e — would otherwise render straight into the final stage).
    const info = this.runInfo;
    info.runTime = this.runTime();
    info.faults = this.faultCount;
    info.phase = this.phaseValue;
    info.simTime = this.loop.ticks / this.physicsHz;
    this.hud?.setRun(info);
    this.hud?.showResults(result);
    this.onResults?.(result);
  }

  /** Timing of the most recent render pass (hook.info().lastRender). */
  readonly lastRender = { hudMs: 0, submitMs: 0, syncMs: 0 };

  /**
   * Front-end screens that fully cover the canvas (the Broadcast menu's key art) switch the WebGL
   * frame off: on a phone the covered canvas still cost a full tier frame plus a compositor copy.
   */
  renderEnabled = true;

  private render(alpha: number, dt: number): number {
    if (!this.renderEnabled) return 0;
    const tStart = performance.now();
    const state = this.getState();
    const info = this.runInfo;
    info.runTime = this.runTime();
    info.faults = this.faultCount;
    info.phase = this.phaseValue;
    info.checkpoint = state.checkpoint;
    info.checkpointCount = this.track?.checkpoints.length ?? 0;
    info.simTime = (this.loop.ticks + alpha) / this.physicsHz;
    this.renderer.setRunInfo?.(info);
    this.renderer.setGhost?.(this.ghostState());
    this.hud?.setRun(info);
    this.hud?.update(state, this.ghostState());
    this.audio?.update(state, dt, this.effectiveInput());
    const tHud = performance.now();
    const ms = this.renderer.render(state, alpha);
    this.lastRender.hudMs = tHud - tStart;
    this.lastRender.submitMs = performance.now() - tHud;
    this.lastRender.syncMs = 0;
    return ms;
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
    const t1 = performance.now();
    this.renderer.finish();
    const t2 = performance.now();
    this.lastRender.syncMs = t2 - t1;
    return t2 - t0;
  }

  /** Real-time entry: feed elapsed seconds. Paused or in the menu: render only. */
  advance(elapsedSeconds: number): void {
    if (this.pausedFlag || this.phaseValue === 'menu') {
      this.loop.renderOnce();
      return;
    }
    if (this.playbackFrames) {
      this.loop.advance(elapsedSeconds * this.playbackSpeed);
      // The run is over and the finish coast has settled: hold the last frame (the transport shows ↺).
      if (this.phaseValue === 'finished' && this.resultsTicks >= this.ticks.finishBrake + this.physicsHz) {
        this.pausedFlag = true;
        this.playbackEnded = true;
      }
      return;
    }
    this.loop.advance(elapsedSeconds);
  }

  // -- replay viewer (docs/design/game.md §16) --------------------------------------

  /** JSON recording of the last finished run (GO → finish), regardless of PB; null before a clear on this page. */
  lastRunRecording(): { json: string; time: number; faults: number; bike: BikeClass; trackId: string } | null {
    return this.lastRunJson && this.lastRunMeta ? { json: this.lastRunJson, ...this.lastRunMeta } : null;
  }

  /**
   * Enter playback: the recording drives every tick through the same `tick()` as live play (restart
   * taps, crashes and auto-respawns reproduce). Loads the recording's track / seed / bike when they
   * differ from what is up, else rewinds in place (renderer world kept). Starts at GO, playing.
   * `ghost` = PB ghost alongside (default on; off when the recording *is* the PB).
   */
  startPlayback(json: string, opts: { ghost?: boolean } = {}): boolean {
    const rec = decodeAny(json);
    if (rec.header.physicsHz !== this.physicsHz) return false;
    const bike = rec.header.bike ?? DEFAULT_BIKE;
    const seed = rec.header.seed >>> 0;
    this.playbackFrames = expandFrames(rec);
    this.playbackGhost = opts.ghost ?? true;
    this.playbackSpeed = 1;
    this.playbackEnded = false;
    this.pausedFlag = false;
    if (!this.track || this.track.id !== rec.header.trackId || this.seed !== seed || this.bike !== bike) {
      if (!this.loadTrack(rec.header.trackId, seed, bike)) {
        this.playbackFrames = null;
        return false;
      }
    }
    this.resetToGo();
    return true;
  }

  /** Leave playback: the world stays where it is (the app restores its own state or reloads a track). */
  stopPlayback(): void {
    this.playbackFrames = null;
    this.playbackEnded = false;
    this.playbackSpeed = 1;
    this.pausedFlag = false;
  }

  /** Scrub: deterministic re-simulation from GO to `tick` (≈ 3 µs/tick, ghost world included). Never interpolates. */
  seekPlayback(tick: number): void {
    if (!this.playbackFrames) return;
    const n = Math.max(0, Math.min(this.playbackLength(), Math.floor(tick)));
    this.resetToGo();
    this.loop.stepTicks(n);
    this.playbackEnded = false;
    this.hud?.clearBanners?.(); // the banners of the whole re-simulated stretch would all pop on the next frame
  }

  playbackLength(): number {
    return this.playbackFrames?.length ?? 0;
  }

  playbackInfo(): { tick: number; length: number; ended: boolean; finished: boolean } | null {
    if (!this.playbackFrames) return null;
    return { tick: this.phaseValue === 'finished' ? this.finishRunTicks : this.runTicks, length: this.playbackFrames.length, ended: this.playbackEnded, finished: this.phaseValue === 'finished' };
  }

  inPlayback(): boolean {
    return this.playbackFrames !== null;
  }

  /** Rewind to GO without a countdown (playback start / scrub): the same physics reset as `go()`. */
  private resetToGo(): void {
    this.physics.reset(-1);
    this.physics.drainEvents();
    this.lastState = null;
    this.emit({ type: 'restart', checkpoint: -1, tick: 0 });
    this.faultCount = 0;
    this.finishRunTicks = 0;
    this.crashTicks = 0;
    this.resultsTicks = 0;
    this.resultsShown = false;
    this.finishFrozen = false;
    this.holdTicks = 0;
    this.holdFired = true;
    this.restartLatch = false;
    this.go();
  }

  /** The last ≤ 1 s of quantized input (oldest first), RLE-packed like a recording — telemetry death trace. */
  recentInput(): InputTraceRun[] {
    const out: InputTraceRun[] = [];
    const n = this.traceN;
    for (let k = 0; k < n; k++) {
      const i = ((this.traceI - n + k + TRACE_TICKS) % TRACE_TICKS) * 4;
      const t = this.traceRing[i]!;
      const b = this.traceRing[i + 1]!;
      const l = this.traceRing[i + 2]!;
      const f = this.traceRing[i + 3]!;
      const last = out[out.length - 1];
      if (last && last[1] === t && last[2] === b && last[3] === l && last[4] === f) last[0]++;
      else out.push([1, t, b, l, f]);
    }
    return out;
  }

  /** The physics world's `debug()` when it has one (lab HUD reads it defensively); null otherwise. Allocates — call only with the lab on. */
  physicsDebug(): unknown {
    const p = this.physics as Partial<{ debug(): unknown }>;
    try {
      return typeof p.debug === 'function' ? p.debug.call(this.physics) : null;
    } catch {
      return null;
    }
  }

  /** Suspension bump-stop start as a fraction of travel per wheel (physics `tuning`, default 0.8) — the lab HUD marks the zone. */
  bumpStopStart(): { rear: number; front: number } {
    const t = (this.physics as Partial<{ tuning: { rear?: { stopStart?: number }; front?: { stopStart?: number } } }>).tuning;
    const r = t?.rear?.stopStart;
    const f = t?.front?.stopStart;
    return { rear: typeof r === 'number' ? r : 0.8, front: typeof f === 'number' ? f : 0.8 };
  }

  /** Drop HUD banners / flashes (replay open + scrub). */
  clearHudTransients(): void {
    this.hud?.clearBanners?.();
  }

  /** The renderer the game draws with (the replay viewer's camera modes talk to it; duck-typed). */
  get rendererRef(): GameRenderer {
    return this.renderer;
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
      finishFrozen: this.finishFrozen,
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
    this.finishFrozen = c.finishFrozen ?? false;
    if (this.ghost) {
      this.ghost.seek(this.runTicks);
      this.lastGhostState = null;
    }
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

  /** Track cleared (finish line crossed). `PhysicsState.finished` is also true on faults — do not use it for this. */
  cleared(): boolean {
    return this.getState().finishTime !== null;
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
      bike: this.bike,
    };
    if (this.physicsVersion) header.physics = this.physicsVersion;
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
    if (!this.loadTrack(rec.header.trackId, rec.header.seed, rec.header.bike ?? DEFAULT_BIKE)) {
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
