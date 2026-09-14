/**
 * Types for every JSON the harness writes under `harness/out/` and the
 * committed `harness/out/metrics/`. Self-describing: `schema` + `kind`.
 * See docs/design/harness-metrics.md §8.
 */
import type { FaultReason } from '../../src/core/types';

export interface RunMeta {
  schema: 1;
  kind: string;
  runId: string;
  startedAt: string;
  wallMs: number;
  git: string;
  /** FNV over src/physics, src/tracks, src/core, src/game/rules.ts in the working tree (see metrics.ts). */
  srcFingerprint?: string;
  node: string;
  chromium?: string;
  /** Physics implementation the run used (MockPhysics | bikePhysicsFactory | ...). */
  physics?: string;
  /** Bike class the run was played on (round 7; absent in older reports = rookie). */
  bike?: 'rookie' | 'pro';
}

export interface FaultEvent {
  attempt: number;
  reason: FaultReason;
  /** Segment tick (resets on restart). */
  tick: number;
  /** Segment time in seconds. */
  simTime: number;
  /** Run clock (continuous) in seconds. */
  runTime: number;
  x: number;
  checkpoint: number;
}

export type Skill = 0 | 1 | 2 | 3 | 'oracle';

/** The first fault of a run, located against the track's placed obstacles. */
export interface Blocker {
  /** A fault reason, or 'stuck' when the run never faulted and never finished (parked against something). */
  reason: FaultReason | 'stuck';
  x: number;
  checkpoint: number;
  runTime: number;
  /** Nearest placed obstacle within [-2, +8] m ahead of the fault, or 'ground'. */
  obstacle: { kind: string; x: number; index: number } | null;
}

/** `harness/out/metrics/sweep.json`: one row per track, the tracks/physics owners' first input. */
export interface SweepRow {
  trackId: string;
  tier: string;
  technique: string;
  finishX: number;
  attemptsBand: [number, number] | null;
  skill: Skill;
  seeds: number[];
  /** Best distance over seeds (m) and as % of finishX. */
  bestX: number;
  bestPct: number;
  clears: number;
  attempts: number[];
  attemptsMedian: number;
  finishTimes: (number | null)[];
  outcomes: string[];
  firstBlocker: Blocker | null;
  wallMs: number;
  runs: string[];
  /** False when any seed's committed play is not retraced by a replay of its recording (physics snapshot infidelity): attempts/clears are then unverifiable. */
  replayFaithful?: boolean;
  replayDivergenceX?: number | null;
}
export interface SweepReport extends RunMeta {
  kind: 'sweep';
  skill: Skill;
  seeds: number;
  budgetMs: number | null;
  trackWallS: number;
  rows: SweepRow[];
}

export interface BeamConfig {
  width: number;
  depth: number;
  commit: number;
  cells: [number, number, number];
  budgetMs: number;
}

export interface ScoreWeights {
  progress: number;
  speed: number;
  upright: number;
  airPitch: number;
  checkpoint: number;
  finish: number;
  fault: number;
}

export interface BotRunReport extends RunMeta {
  kind: 'bot';
  trackId: string;
  seed: number;
  physicsHz: number;
  skill: Skill;
  config: BeamConfig;
  weights: ScoreWeights;
  outcome: 'finished' | 'maxAttempts' | 'timeout' | 'wallTimeout' | 'stuck';
  /** Furthest x reached (m) and as a fraction of finishX. */
  maxX: number;
  progress: number;
  firstBlocker: Blocker | null;
  /** 1 + faults (CONTRACT §3). */
  attempts: number;
  faults: FaultEvent[];
  faultsByCheckpoint: number[];
  /** Run-clock finish time (continuous through restarts), seconds. */
  finishTime: number | null;
  /** Segment time at the finish crossing (PhysicsState.finishTime). */
  segmentFinishTime: number | null;
  simSeconds: number;
  ticks: number;
  /** Oracle only: how many times the search rewound after a fault. */
  rewinds: number;
  search: {
    plans: number;
    expandedTotal: number;
    ticksSimulated: number;
    planWallMs: { p50: number; p95: number; max: number };
  };
  recordingFile: string;
  nodeHash: string;
  /** First tick where a straight replay of `recordingFile` stops matching the committed play's per-tick hash (null = retraces exactly). */
  playReplayDivergence?: { tick: number; x: number; playHash: string; replayHash: string } | null;
  browserHash: string | null;
  browserVerified: boolean | null;
}

/** `harness/out/metrics/<trackId>.json`: the per-track bot summary the parent judges. */
export interface TrackBotMetrics {
  schema: 1;
  kind: 'track-bot-metrics';
  trackId: string;
  updatedAt: string;
  physics: string;
  /** Bike class (round 7): `<track>.json` is rookie, `<track>.pro.json` is pro. */
  bike?: 'rookie' | 'pro';
  attemptsBand: [number, number] | null;
  targetAttempts: number | null;
  /** attempts per skill, median across seeds; index 0..3, then 'oracle'. */
  curve: { skill: Skill; seeds: number[]; attempts: number[]; median: number; finishTimes: (number | null)[] }[];
  botParTime: number | null;
  shaped: boolean | null;
  singleWall: { checkpoint: number; share: number } | null;
  runs: string[];
}

export interface AttemptLog {
  n: number;
  endedBy: 'fault' | 'restart' | 'reset' | 'finish';
  reason?: FaultReason;
  checkpoint: number;
  x: number;
  simTime: number;
  runTime: number;
  wallMs: number;
  calls: number;
  /** Run-clock ticks spanned by this attempt (the recording below replays from GO and ends at endTick). */
  startTick?: number;
  endTick?: number;
  /** Prefix recording written the moment the attempt ended: out/stranger/<track>/<id>/attempts/NNN.rec.json. */
  recordingFile?: string;
}

/** The attempt worth a clip: the clearing one, else the one that got furthest. */
export interface BestAttempt {
  n: number;
  cleared: boolean;
  x: number;
  startTick: number;
  endTick: number;
  /** Repo-relative recording; capture with `pnpm harness:clip <track> --recording <file> --from-tick <startTick>`. */
  recordingFile: string;
}

export interface StrangerSession extends RunMeta {
  kind: 'stranger';
  sessionId: string;
  trackId: string;
  seed: number;
  agent: string;
  cleared: boolean;
  attempts: AttemptLog[];
  /** attempts-to-clear = 1 + faults (restart/reset/crash), CONTRACT §3. */
  strangerAttempts: number;
  finishTime: number | null;
  calls: number;
  budget: { calls: number; minutes: number; exhausted: boolean };
  faultsByCheckpoint: number[];
  firstCheckpointCalls: number | null;
  recordingFile: string;
  replayVerified: boolean | null;
  replayFaults: number | null;
  attemptsBand: [number, number] | null;
  /** median(strangerAttempts over sessions) <= 1.5 * attemptsBand[1] */
  pass: boolean | null;
  bestAttempt?: BestAttempt | null;
  log: string[];
}

export interface CompareVerdict {
  pairId: string;
  tag: string;
  critic: string;
  at: string;
  /** What the critic said, in A/B terms (blind). */
  winner: 'A' | 'B' | 'tie' | 'invalid';
  confidence: number;
  reasons: string[];
  nonAAA: string;
  /** Unmasked. */
  left: 'ours' | 'ref';
  winnerUnmasked: 'ours' | 'ref' | 'tie' | 'invalid';
  ours: string;
  ref: string;
}

export interface PairAnswer {
  pairId: string;
  tag: string;
  seed: number;
  left: 'ours' | 'ref';
  ours: string;
  ref: string;
  pairMp4: string;
  sheet: string;
  createdAt: string;
}

export interface GateCheck {
  id: string;
  value: number | boolean | string | null;
  /** The limit applied (SwiftShader override on this machine when one exists). */
  limit: number | boolean | null;
  pass: boolean;
  /** Real-hardware ship target when it differs from `limit`, and whether the value meets it. */
  shipLimit?: number;
  shipPass?: boolean;
  unit?: string;
  note?: string;
}

export interface DeterminismCheck {
  id: 'D1' | 'D2' | 'D3' | 'D4' | 'D4b' | 'D4c' | 'D5' | 'D7' | 'D8';
  name: string;
  pass: boolean;
  hashes: string[];
  firstDivergentTick?: number;
  diffPaths?: string[];
  note?: string;
}

export interface DeterminismReport extends RunMeta {
  kind: 'determinism';
  recordingFile: string;
  ticks: number;
  checks: DeterminismCheck[];
  pass: boolean;
}

export interface GateReport extends RunMeta {
  kind: 'gate';
  trackId: string;
  thresholdsFile: string;
  /** True when the renderer is SwiftShader/software GL and the scaled limits applied. */
  softwareGL: boolean;
  build: { distBytes: number; jsGzipBytes: number; buildMs: number };
  browser: { version: string; renderer: string; flagSet: string };
  checks: GateCheck[];
  failed: number;
  pass: boolean;
  boot: { runs: number[]; p50: number; min?: number; max: number; firstFrameMs: number[]; loadavg1?: number; cores?: number; retried?: boolean };
  clear: {
    recording: string | null;
    finishTime: number | null;
    expected: number | null;
    hash: string | null;
    expectedHash: string | null;
    faults: number;
    hashOk: boolean | null;
  };
  crash: { recording: string | null; faultTick: number | null; faultTime: number | null; reason: FaultReason | null };
  restart: { ticks: number | null; wallMs: number[]; frameMs: number[]; noCountdown: boolean | null; movesOnFirstTick: boolean | null; movesAfterTicks?: number };
  fault: { toControlTicks: number | null; toControlMs: number | null; autoRespawnTicks: number | null; autoRespawnMs: number | null };
  heap: { beforeMB: number; afterMB: number; growthMB: number; seconds: number };
  perf: {
    drawCalls: number;
    triangles: number;
    texturesMB: number;
    physicsUsPerTickP95: number;
    renderSubmitMsP95: number;
    renderSyncedMsP95: number;
  };
  determinism: DeterminismReport | null;
  /** G10: stranger medians per judged track on the working tree's src (informational until armed). */
  stranger?: { srcFingerprint: string; armed: boolean; minSessions: number; rows: GateStrangerRow[] };
  /** G10 second row: reflex-bot (average) medians on the same tracks (harness/reflex). */
  reflex?: { srcFingerprint: string; armed: boolean; minSeeds: number; rows: GateReflexRow[] };
  /** G10 third row (round 7): the same reflex medians on the Pro bike (`<track>.pro.reflex.json`); informational, the band is authored for Rookie. */
  reflexPro?: { srcFingerprint: string; armed: boolean; minSeeds: number; rows: GateReflexRow[] };
  /** G2b (round 7): Pro-bike clears by golden replay (`bot-3-pro.json`) on flat-test and b1, pinned under `<track>:pro` in expected.json. */
  clearPro?: Array<{ trackId: string; recording: string | null; finishTime: number | null; expected: number | null; hash: string | null; expectedHash: string | null; faults: number; fresh: boolean | null }>;
}

export interface GateReflexRow {
  trackId: string;
  skill: ReflexSkill;
  attemptsBand: [number, number] | null;
  limit: number | null;
  /** src the metrics file was recorded on; only a match with the working tree counts. */
  srcFingerprint: string;
  seedsFresh: number;
  medianAttempts: number | null;
  medianFinishTime: number | null;
  allCleared: boolean;
  pass: boolean | null;
  deadliest: string | null;
}

export interface GateStrangerRow {
  trackId: string;
  attemptsBand: [number, number] | null;
  /** factor x attemptsBand[1] */
  limit: number | null;
  /** Sessions completed on the working tree's src fingerprint (the only ones that count). */
  completedFresh: number;
  completedAny: number;
  medianAttempts: number | null;
  allCleared: boolean;
  /** null = nothing to judge yet */
  pass: boolean | null;
  sessions: string[];
}

// ---------------------------------------------------------------------------
// Reflex bot (harness/reflex/**): a real-time controller with human limits
// ---------------------------------------------------------------------------

export type ReflexSkill = 'novice' | 'average' | 'good';

export interface ReflexDeath {
  attempt: number;
  reason: FaultReason;
  x: number;
  checkpoint: number;
  runTime: number;
  pitchDeg: number;
  speed: number;
  airborne: boolean;
  /** The rule the player was executing when it died. */
  rule: string;
  /** Nearest placed obstacle within [-2, +8] m, or null = open ground. */
  obstacle: { kind: string; x: number; index: number } | null;
  /** What the section memory changed after this death. */
  lesson: string[];
}

export interface ReflexRunReport extends RunMeta {
  kind: 'reflex';
  /** 'node' = createSim with the game rules; 'browser' = real keyboard events into the live RAF loop. */
  mode: 'node' | 'browser';
  trackId: string;
  seed: number;
  physicsHz: number;
  skill: ReflexSkill;
  /** Reaction delay drawn for this run (s). */
  reactionS: number;
  outcome: 'finished' | 'maxAttempts' | 'timeout';
  attempts: number;
  finishTime: number | null;
  maxX: number;
  progress: number;
  simSeconds: number;
  deaths: ReflexDeath[];
  faultsByCheckpoint: number[];
  /** How often each rule was the one driving the hands (tap slots). */
  rules: Record<string, number>;
  recordingFile: string;
  /** Hash of the physics state at the end of play, and of a fresh node replay of the recording. */
  playHash: string;
  replayHash: string;
  replayFaithful: boolean;
  browserHash?: string | null;
  browserVerified?: boolean | null;
  /** Browser mode only. */
  live?: {
    fps: number;
    /** Wall ms per perception round trip, p50/p95. */
    glanceMsP50: number;
    glanceMsP95: number;
    glances: number;
    keyEvents: number;
    /** Riding ticks that elapsed before the recording started (prepended as neutral frames). */
    startTick: number;
    countdownMs: number;
    wallS: number;
    /** 'virtual': Playwright fake clock, rAF at `frameMs` (a 60 fps player regardless of raster cost); 'wall': real clock. */
    clock: 'virtual' | 'wall';
    frameMs: number;
    /** Real ms this machine needed per player frame (SwiftShader raster cost). */
    wallMsPerFrame: number;
    /** Node replay of the recording reproduces the browser's final hash. */
    roundTrip: boolean;
  };
}

export interface ReflexTrackMetrics {
  schema: 1;
  kind: 'track-reflex-metrics';
  trackId: string;
  tier: string;
  technique: string;
  updatedAt: string;
  physics: string;
  /** Bike class (round 7): `<track>.reflex.json` is rookie, `<track>.pro.reflex.json` is pro. */
  bike?: 'rookie' | 'pro';
  srcFingerprint: string;
  attemptsBand: [number, number] | null;
  finishX: number;
  bySkill: {
    skill: ReflexSkill;
    seeds: number[];
    attempts: number[];
    medianAttempts: number;
    clears: number;
    finishTimes: (number | null)[];
    medianFinishTime: number | null;
    bestX: number;
    /** Deaths aggregated by nearest obstacle across seeds, most deadly first. */
    deaths: { obstacle: string; x: number; count: number; reasons: Record<string, number>; rules: Record<string, number> }[];
    runs: string[];
  }[];
  /** Live-browser runs (b1 validation), when any. */
  browser?: { runs: string[]; attempts: number[]; medianAttempts: number; finishTimes: (number | null)[]; fps: number[]; roundTrips: boolean[] };
}
