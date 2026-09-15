/**
 * Shared, platform-neutral contracts for the whole game.
 *
 * Everything here is *types only* (plus a few constants) so that `src/core`
 * can be imported from both the browser bundle and the node harness.
 */

// ---------------------------------------------------------------------------
// Math primitives
// ---------------------------------------------------------------------------

export interface Vec2 {
  x: number;
  y: number;
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

/**
 * One tick of player intent. Analog axes are already *quantized* (see
 * `quantizeInput` in replay.ts) before physics ever sees them, so a live run
 * and a replay feed physics byte-identical values.
 */
export interface InputFrame {
  /** 0..1 rear-wheel drive. */
  throttle: number;
  /** 0..1 brake (both wheels unless physics decides otherwise). */
  brake: number;
  /** -1..1 rider weight shift, negative = lean back, positive = lean forward. */
  lean: number;
  /**
   * @deprecated There is no hop button (CONTRACT §2.8): the hop is a lean/throttle
   * technique inside physics. Kept only so the recording flag byte keeps its layout;
   * input devices never set it and physics must ignore it.
   */
  hop?: boolean;
  /** Player asked for an instant restart at the last checkpoint. */
  restart?: boolean;
}

export const NEUTRAL_INPUT: Readonly<InputFrame> = Object.freeze({
  throttle: 0,
  brake: 0,
  lean: 0,
  hop: false,
  restart: false,
});

// ---------------------------------------------------------------------------
// Tracks
// ---------------------------------------------------------------------------

export type TrackTier = 'beginner' | 'easy' | 'medium' | 'hard' | 'extreme';

/**
 * A single obstacle placed on a track. `kind` is open so the tracks builder can
 * add vocabulary (ramp, drum, plank, gap, ...) without touching core.
 */
export interface TrackObstacle {
  kind: string;
  /** World-space anchor (x along the course, y up). */
  pos: Vec2;
  /** Free-form parameters interpreted by physics/render per `kind`. */
  params?: Record<string, number | string | boolean>;
}

/** Piecewise-linear ground profile: sorted by x. */
export type TrackProfilePoint = Vec2;

export interface TrackCheckpoint {
  /** x position along the course; crossing it arms a restart point. */
  x: number;
  /** Rider spawn transform when restarting here. */
  spawn: { pos: Vec2; angle: number };
}

export interface TrackDef {
  id: string;
  name: string;
  tier: TrackTier;
  /** Seed baked into the track so per-track cosmetic randomness is stable. */
  seed: number;
  /** Ground profile from start to finish (x strictly increasing). */
  profile: TrackProfilePoint[];
  obstacles: TrackObstacle[];
  checkpoints: TrackCheckpoint[];
  start: { pos: Vec2; angle: number };
  /** x coordinate the front wheel must cross to finish. */
  finishX: number;
  /** Author's target attempts-to-clear for a stranger, for the metric gate. */
  targetAttempts?: number;
  /** Biome, technique, camera keys, attempt band. See CONTRACT.md §2. */
  meta?: TrackMeta;
}

// ---------------------------------------------------------------------------
// Surfaces, biomes, track meta (CONTRACT.md §2)
// ---------------------------------------------------------------------------

export type SurfaceKind = 'dirt' | 'wood' | 'metal' | 'concrete' | 'rubber' | 'grate' | 'stone' | 'snow';
export type BiomeId = 'industrial' | 'canyon' | 'snow' | 'nightCity' | 'foundry';

/** Authored camera key for a stretch of track; consumed by render only. */
export interface CameraKey {
  /** World x range this key applies to (blended outside). */
  x0: number;
  x1: number;
  mode?: 'side' | 'side-tight' | 'high34' | 'low';
  /** Radians / metres; override the mode defaults. */
  yaw?: number;
  pitch?: number;
  dist?: number;
  roll?: number;
  /** -1..1, tighter / wider than the speed-driven default. */
  zoomBias?: number;
  /** Seconds to blend into this key (default 0.7). */
  blend?: number;
  /** Hard cut instead of blend. */
  cut?: boolean;
}

export interface TrackMeta {
  biome: BiomeId;
  /** The one thing this track teaches. */
  technique: string;
  /** The thing it then demands. */
  demands?: string;
  camera?: CameraKey[];
  /** Stranger attempts-to-clear target band [lo, hi]. */
  attemptsBand?: [number, number];
  targetTimeS?: number;
  /** HUD button hints (beginner tier only). */
  hints?: string[];
}

// ---------------------------------------------------------------------------
// Compiled track (CONTRACT.md §2.2) — the only thing physics/render/audio read
// ---------------------------------------------------------------------------

export interface ColliderBase {
  id: number;
  surface: SurfaceKind;
  /** Index into def.obstacles, or -1 for the ground profile. */
  obstacleIndex: number;
}
export interface ColliderPolyline extends ColliderBase {
  kind: 'polyline';
  points: Vec2[];
  oneWay?: boolean;
}
export interface ColliderCircle extends ColliderBase {
  kind: 'circle';
  center: Vec2;
  radius: number;
  /** Drum spins about its centre under the tyre (never translates). */
  rolls?: boolean;
}
export interface ColliderBox extends ColliderBase {
  kind: 'box';
  center: Vec2;
  halfW: number;
  halfH: number;
  angle: number;
}
export interface ColliderSeesaw extends ColliderBase {
  kind: 'seesaw';
  pivot: Vec2;
  halfLength: number;
  thickness: number;
  maxAngle: number;
  mass: number;
}
export type Collider = ColliderPolyline | ColliderCircle | ColliderBox | ColliderSeesaw;

export interface HazardZone {
  id: number;
  kind: 'fire' | 'water' | 'kill';
  min: Vec2;
  max: Vec2;
}

export interface PlacedObstacle {
  kind: string;
  pos: Vec2;
  /** Params with kind defaults filled in. */
  params: Record<string, number | string | boolean>;
  colliderIds: number[];
}

export interface CompiledTrack {
  def: TrackDef;
  /** Exact rideable geometry; render draws these surfaces. */
  colliders: Collider[];
  hazards: HazardZone[];
  placed: PlacedObstacle[];
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  /** bounds.minY - 6; below this the run faults 'out-of-bounds'. */
  oobY: number;
  /** FNV-1a over colliders; golden-tested per track. */
  hash: string;
}

// ---------------------------------------------------------------------------
// Physics
// ---------------------------------------------------------------------------

export interface WheelState {
  pos: Vec2;
  /** Radians, accumulates (for rendering spokes). */
  spin: number;
  /** Angular velocity (rad/s). */
  spinVel: number;
  /** 0..1 suspension compression. */
  compression: number;
  grounded: boolean;
}

export interface RiderPose {
  /** -1..1 effective lean (after physics smoothing/limits). */
  lean: number;
  /** 0..1 crouch, 1 = fully compressed for a hop. */
  crouch: number;
  /** Radians of torso pitch relative to the bike frame. */
  torsoPitch: number;
  /** Arm extension 0..1 (1 = arms straight, hanging off the back). */
  armExtend: number;
}

/**
 * Physics v2 (docs/plans/physics-v2.md §16.6): the simulated rider body — world position of its COM,
 * angle ψ_R, velocities. Lives at `PhysicsState.riderBody` rather than `rider.body`: `RiderPose` is
 * iterated as four numbers by render's `PoseFollower`, so a nested object there is not additive.
 */
export interface RiderBody {
  pos: Vec2;
  angle: number;
  vel: Vec2;
  angVel: number;
}

export type FaultReason = 'crash' | 'out-of-bounds' | 'restart' | 'timeout' | 'hazard';

/**
 * Snapshot of everything the renderer / hasher needs. Plain data only, no
 * class instances, so it can be structured-cloned and hashed field by field.
 */
export interface PhysicsState {
  /** Physics tick count since (re)start. */
  tick: number;
  /** Simulated seconds since (re)start (tick * dt). */
  time: number;
  bike: {
    pos: Vec2;
    vel: Vec2;
    /** Radians, CCW positive; 0 = level facing +x. */
    angle: number;
    angVel: number;
  };
  wheels: {
    rear: WheelState;
    front: WheelState;
  };
  rider: RiderPose;
  /** Physics v2 only (additive, optional): the simulated rider body. Absent on v1 / mock physics. */
  riderBody?: RiderBody;
  /** Index of the last checkpoint crossed, -1 when none. */
  checkpoint: number;
  /**
   * "Run over" flag — TRUE ON FAULTS TOO (crash, out-of-bounds, hazard), not just on a finish.
   * It means "physics stopped racing", not "the player cleared the track". To test for a clear
   * use `finishTime !== null` (or `hook.cleared()` / `Game.cleared()`); to test for a crash use
   * `faulted !== null`. Two owners have tripped on this; the name is kept for wire compatibility.
   */
  finished: boolean;
  faulted: FaultReason | null;
  /** Finish time in seconds — non-null iff the track was CLEARED. Null while running or after a fault. */
  finishTime: number | null;
  /** The quantized input applied this tick. */
  input: { throttle: number; brake: number; lean: number };
  engine: { rpm: number; throttleEff: number; limiter: boolean };
  contacts: { rear: SurfaceKind | null; front: SurfaceKind | null };
  /** rear.spinVel*R - groundSpeed along bike x (m/s); > 0 = wheelspin. */
  rearSlip: number;
  hopPhase: 'idle' | 'preload' | 'push' | 'recover';
  /** Non-null from the crash tick until reset; render draws exactly this. */
  ragdoll: RagdollBody[] | null;
  seesaws: { id: number; angle: number; angVel: number }[];
  drums: { id: number; spin: number }[];
}

export interface RagdollBody {
  id: 'head' | 'torso' | 'pelvis' | 'upperArm' | 'forearm' | 'thigh' | 'shin';
  pos: Vec2;
  angle: number;
}

export type PhysicsSnapshot = { v: 1; f64: Float64Array; u8: Uint8Array };

// ---------------------------------------------------------------------------
// Game events
// ---------------------------------------------------------------------------

export type GameEvent =
  | { type: 'checkpoint'; index: number; tick: number; time: number }
  | { type: 'fault'; reason: FaultReason; tick: number; time: number }
  | { type: 'finish'; tick: number; time: number }
  | { type: 'restart'; checkpoint: number; tick: number }
  | { type: 'countdown'; n: 3 | 2 | 1 }
  | { type: 'go' }
  | { type: 'land'; impulse: number; wheel: 'rear' | 'front'; surface: SurfaceKind; tick: number };

export type GamePhase = 'menu' | 'countdown' | 'riding' | 'crashed' | 'finished';
export type QualityTier = 'low' | 'medium' | 'high';

/**
 * Per-frame run info the game pushes to the HUD (`Hud.setRun`) and the renderer
 * (`GameRenderer.setRunInfo`, which only needs `runTime` + `phase`).
 */
export interface RunInfo {
  /** Run clock in seconds: 0 before GO, runs through crashes/restarts, frozen at finish. */
  runTime: number;
  faults: number;
  phase: GamePhase;
  /** Last checkpoint crossed, -1 = none. */
  checkpoint: number;
  checkpointCount: number;
  /**
   * Simulated seconds since the track was loaded (loop ticks / hz; keeps
   * running through countdown and restarts). HUD motion is clocked from this,
   * never from wall time, so captures are frame-deterministic.
   */
  simTime: number;
}

export type Medal = 'platinum' | 'gold' | 'silver' | 'bronze';

/**
 * Bike class (MEGA_PLAN P1 / P4). `rookie` = soft, wheelie assist on, forgiving; `pro` = raw
 * (no assist, real CdA drag, sharper throttle). Physics owns the presets; the game passes the
 * class to `loadTrack(track, seed, { bike })`, stores it with best times (PB per class per
 * track), records it in the recording header and shows it on the results panel. Medal targets
 * on Pro are 10 % tighter (`src/game/rules.ts`).
 */
export type BikeClass = 'rookie' | 'pro';
export const BIKE_CLASSES: readonly BikeClass[] = ['rookie', 'pro'];
export const DEFAULT_BIKE: BikeClass = 'rookie';

/** Cosmetic rider clothing, independent of bike class and physics state. */
export type RiderOutfit = 'street' | 'race';

/** Optional renderer capability for changing clothing without loading a different track. */
export interface RiderOutfitRenderer {
  /** True only after the requested outfit is available for both detail levels. */
  setRiderOutfit?(outfit: RiderOutfit): Promise<boolean>;
}

/**
 * Bike solver a recording / PB / run-log entry was produced on (physics.md "v2 status"; CONTRACT §2.5 v2
 * block). Stamped into `RecordingHeader.physics`; a recording without the stamp predates the v2 flip and
 * reads as `'v1'`. The game never ghosts or offers to watch a PB whose stamp differs from the live solver
 * (its medal and time stay), because the same inputs run to a different finish on the other solver.
 */
export type PhysicsVersion = 'v1' | 'v2';

/** Outcome of one finished run (results panel, best-time store). */
export interface RunResult {
  trackId: string;
  /** Run clock at the finish line (what every metric calls "finish time"). */
  time: number;
  faults: number;
  medal: Medal;
  /** True when this run beat the stored best time. */
  personalBest: boolean;
  /** Previous best time, or null on the first clear. */
  previousBest: number | null;
  /** Effective medal target for this run (already tightened for Pro); null when the track has none. */
  targetTimeS: number | null;
  /** Bike class the run was ridden on (absent in pre-garage results / harness mirrors = rookie). */
  bike?: BikeClass;
}

/**
 * One entry of the local, opt-in run log (MEGA_PLAN P3: attempts-per-track and death-x
 * histograms from the user's own sessions). Appended by the app on every finished run
 * (`src/game/telemetry.ts`), bounded, exported via Settings → Copy / Share run log.
 */
/**
 * One packed run of identical input frames: `[count, throttle u8, brake u8, lean i8, flags u8]` —
 * the recording's RLE layout (`src/core/replay.ts` `InputRun`), reused for the death trace.
 */
export type InputTraceRun = [count: number, throttle: number, brake: number, lean: number, flags: number];

export interface DeathRecord {
  x: number;
  reason: FaultReason;
  checkpoint: number;
  /** The last second (120 ticks) of quantized input before the fault, oldest first, RLE-packed. */
  trace?: InputTraceRun[];
}

/** Replay viewer camera (docs/design/game.md §16). `fixed` holds the camera where it was when chosen; the viewer re-anchors when the bike leaves the frame. */
export type ReplayCameraMode = 'game' | 'follow-wide' | 'fixed';

/**
 * Optional renderer hook for the replay viewer (`GameRenderer.setCameraOverride?(o | null)`): null = the
 * game camera. Until the render owner implements it, the viewer drives the rig's public `bounds` /
 * `setKeys` through `renderer.debug.rig` (src/game/replay.ts).
 */
export interface CameraOverride {
  mode: ReplayCameraMode;
  /** `fixed`: world x/y the camera holds. */
  x?: number;
  y?: number;
}

export interface RunTelemetry {
  /** ISO time the run finished. */
  at: string;
  track: string;
  bike: BikeClass;
  /** 1 + faults (CONTRACT §3). */
  attempts: number;
  faults: number;
  /** Solver the run was ridden on (`'v2'` from the flip on; absent in entries logged before it = v1). */
  physics?: PhysicsVersion;
  /** Run clock at the line (s). */
  time: number;
  /** Wall seconds from the first GO on this track load to the results panel (includes pauses). */
  timeToClear: number;
  medal: Medal;
  deaths: DeathRecord[];
  device: string;
  quality: QualityTier;
  /** Why the tier was chosen: `manual`, `probe median 16.4 ms`, `pending`. */
  qualityWhy: string;
  fps: { p50: number; p95: number };
  /** Frame ms p50 / p95 over the run. */
  frameMs: { p50: number; p95: number };
  build: string;
  /** Every navigation (quit / pause / resume / goto / restart) during the run with what triggered it (docs/tasks/touch-navigation-invariant.md §1). */
  nav?: NavEvent[];
}

/**
 * One navigation the app performed, with everything needed to tell a legitimate tap from a ghost one:
 * the trigger (DOM event + target, or the polled meta flag + device), the UI state it acted on, how long
 * the current screen had been up, the last pointerdown, and whether the trigger's target was `.live`
 * and drawn at ≥ 0.5 opacity at the time (the invariant: `false` here is a bug).
 */
export interface NavEvent {
  /** performance.now() ms. */
  at: number;
  kind: 'quit' | 'pause' | 'resume' | 'goto' | 'restart';
  /** Destination screen (`goto`) or restart flavour. */
  to?: string;
  /** `click button.tile.on[menu]`, `pointerdown div.tz.tz-pause`, `poll:touch:pause`, … */
  trigger: string;
  screen: string;
  phase: string;
  /** Results reveal stage (-1 when the panel is down). */
  stage: number;
  /** ms since the current screen appeared (`screenAt`). */
  sinceScreenMs: number;
  /** Last pointerdown: logical x/y, ms before this event, target description. */
  down: { x: number; y: number; agoMs: number; target: string } | null;
  /** Effective (ancestor-multiplied) opacity of the trigger target at the time, 1 for non-DOM triggers. */
  opacity: number;
  /** The trigger target (or the pointerdown target for polled triggers) was inside a `.live` element drawn at ≥ 0.5 opacity. */
  targetLive: boolean;
}

export type InputDevice = 'keyboard' | 'gamepad' | 'touch';

export interface CameraDebug {
  pos: Vec2;
  dist: number;
  bikeScreenX: number;
  bikeScreenY: number;
  bikeHeightFrac: number;
  /** Rig angles in radians (render reports them; the harness asserts |roll| < 1e-6). */
  roll?: number;
  yaw?: number;
  pitch?: number;
  /** Rig state name, e.g. 'side' | 'high34' | 'crash' | 'finish' (render-defined). */
  state?: string;
}

export type GameEventListener = (event: GameEvent) => void;

// ---------------------------------------------------------------------------
// Simulation constants
// ---------------------------------------------------------------------------

export const DEFAULT_PHYSICS_HZ = 120;
/** Bike geometry shared by physics, render and the mock (CONTRACT §2.5). */
export const WHEEL_RADIUS = 0.34;
export const WHEELBASE = 1.3;

// ---------------------------------------------------------------------------
// Test hook exposed on `window.__trials`
// ---------------------------------------------------------------------------

export interface RenderStats {
  /** Draw calls in the last frame. */
  calls: number;
  triangles: number;
  points: number;
  lines: number;
  geometries: number;
  textures: number;
  programs: number;
  /** Estimated GPU texture memory in MB (from tracked texture sizes). */
  texturesMB: number;
  /** Renderer string reported by WebGL (UNMASKED_RENDERER_WEBGL). */
  renderer: string;
  /** 'webgl2' | 'webgl' | 'none' */
  contextKind: string;
}

export interface HookInfo {
  version: string;
  physicsHz: number;
  trackId: string;
  seed: number;
  /** Bike class the loaded track is riding (`rookie` until the garage / harness picks otherwise). */
  bike?: BikeClass;
  /** True when the game is not running its own clock (harness mode). */
  harness: boolean;
  /** Page time (performance.now) at which the hook was installed and `ready` became true. */
  readyAtMs?: number;
  /** Wall ms of the most recent loadTrack (compile + physics + renderer.setTrack + audio.setTrack). */
  loadTrackMs?: number;
  /** Breakdown of the most recent render(): HUD DOM work, renderer submit, GPU sync (when sync=true). */
  lastRender?: { hudMs: number; submitMs: number; syncMs: number };
  /** Which implementations main.ts composed, e.g. { physics: 'createBikePhysics', render: 'ThreeRenderer', audio: 'WebAudioSystem' }. */
  modules?: Record<string, string>;
}

/**
 * Global test hook so a headless harness can drive the game without a real
 * clock. All methods are synchronous and deterministic.
 */
export interface TrialsHook {
  ready: true;
  info(): HookInfo;
  /** Advance physics by `n` ticks with the current input. Returns new tick. */
  step(n?: number): number;
  /** Set the input applied on subsequent ticks (quantized on entry). */
  setInput(frame: Partial<InputFrame>): void;
  getState(): PhysicsState;
  /**
   * Load a track by id and reset (synchronously: physics, HUD and the renderer's world are up on return).
   * Returns false when the id is unknown; when the renderer exposes `whenReady()` (art + hero model still
   * streaming) a promise that resolves to the same boolean once frame 0 is art-complete — `await` it before
   * a capture. `step` / `render` stay synchronous.
   */
  loadTrack(id: string, seed?: number): boolean | Promise<boolean>;
  /** Reset to the last checkpoint (or start). */
  restart(): void;
  /** Finish time in seconds, or null while running. */
  finishTime(): number | null;
  /** Stable hash (hex string) of the full physics state. */
  hashState(): string;
  /** Physics ticks since (re)start. */
  frame(): number;
  /** Rendered frame count since page load. */
  renderedFrames(): number;
  /**
   * Render the current state once. Returns render ms via performance.now.
   * With `sync` the timing includes a 1x1 readPixels after the draw, i.e.
   * the GPU/SwiftShader raster work, not just command submission.
   */
  render(sync?: boolean): number;
  stats(): RenderStats;
  /** Set viewport size in CSS pixels; harness uses this for stable capture. */
  resize(width: number, height: number): void;
  /** Feed a whole recording and run it to the end; returns the final state. */
  runRecording(recordingJson: string): PhysicsState;
  /** Start / stop recording inputs; stop returns the JSON recording. */
  startRecording(): void;
  stopRecording(): string | null;
  listTracks(): string[];
  // -- CONTRACT.md §2.9 additions --
  snapshot(): string;
  restore(b64: string): void;
  drainEvents(): GameEvent[];
  /** Run clock (seconds since GO, runs through restarts). */
  runTime(): number;
  faults(): number;
  phase(): GamePhase;
  marks(): { checkpoints: number[]; finishX: number; start: number };
  camera(): CameraDebug;
  setQuality(t: QualityTier): void;
  audio?: { renderOffline(recordingJson: string, seconds: number): Promise<Float32Array> };
  /** Harness convenience: jump straight to GO. */
  skipCountdown(): void;
  /** PB ghost physics state (second world, lockstep from GO), or null. */
  ghost(): PhysicsState | null;
  /** True iff the current segment crossed the finish line (`finishTime !== null`). Faults never set this. */
  cleared(): boolean;
  /** Pick the bike class for the next `loadTrack` (also reloads in place while nothing is racing). */
  setBike?(bike: BikeClass): void;
  /** Last finished run's recording (GO → finish, JSON) — what "Watch replay" plays; null before a clear. */
  lastRun?(): string | null;
  /** Front-end page only: every navigation this page performed (docs/tasks/touch-navigation-invariant.md §1). */
  navLog?(): NavEvent[];
  /** Front-end page only (harness/e2e): drive the app shell synchronously — one app frame (input poll + advance 0 s + live tick), the flow methods, the state. */
  app?: {
    frame(): void;
    play(trackId: string): void;
    goto(screen: 'menu' | 'tracks' | 'settings' | 'garage' | 'credits'): void;
    togglePause(): void;
    screen(): string;
    paused(): boolean;
  };
  /** Replay viewer (front-end page only): open the viewer on a recording (default: the last run), read its transport, or close it. */
  replay?: {
    open(recordingJson?: string): boolean;
    seek(tick: number): void;
    info(): { tick: number; length: number; playing: boolean; speed: number; camera: ReplayCameraMode } | null;
    close(): void;
  };
}
