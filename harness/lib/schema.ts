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
  id: 'D1' | 'D2' | 'D3' | 'D4' | 'D4b' | 'D5' | 'D7' | 'D8';
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
  boot: { runs: number[]; p50: number; max: number; firstFrameMs: number[] };
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
  restart: { ticks: number | null; wallMs: number[]; frameMs: number[]; noCountdown: boolean | null; movesOnFirstTick: boolean | null };
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
}
