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
  /** Bunny-hop / preload request (edge-triggered by physics). */
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
export interface TrackProfilePoint extends Vec2 {}

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

export type FaultReason = 'crash' | 'out-of-bounds' | 'restart' | 'timeout';

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
  /** Index of the last checkpoint crossed, -1 when none. */
  checkpoint: number;
  /** True when the run is over (finished or faulted). */
  finished: boolean;
  faulted: FaultReason | null;
  /** Finish time in seconds, or null while running. */
  finishTime: number | null;
}

// ---------------------------------------------------------------------------
// Game events
// ---------------------------------------------------------------------------

export type GameEvent =
  | { type: 'checkpoint'; index: number; tick: number; time: number }
  | { type: 'fault'; reason: FaultReason; tick: number; time: number }
  | { type: 'finish'; tick: number; time: number }
  | { type: 'restart'; checkpoint: number; tick: number };

export type GameEventListener = (event: GameEvent) => void;

// ---------------------------------------------------------------------------
// Simulation constants
// ---------------------------------------------------------------------------

export const DEFAULT_PHYSICS_HZ = 120;

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
  /** True when the game is not running its own clock (harness mode). */
  harness: boolean;
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
  /** Load a track by id and reset. Returns false when the id is unknown. */
  loadTrack(id: string, seed?: number): boolean;
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
}
