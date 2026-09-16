/**
 * Stranger session persistence. Each CLI call is a fresh node process: it
 * loads `state.json`, restores the physics snapshot into a new `createSim`,
 * does one thing, and writes `state.json` back. Time only goes forward.
 *
 * Layout: harness/out/stranger/<trackId>/<sessionId>/
 *   state.json        snapshot (b64) + counters + attempt log + recording runs
 *   attempts/NNN.json one file per ended attempt, written the moment it ends
 *   log.txt           one line per call
 */
import fs from 'node:fs';
import path from 'node:path';
import type { GameEvent, PhysicsState } from '../../src/core/types';
import { InputRecorder, encodeJSON, iterateFrames, type InputRecording } from '../../src/core/replay';
import type { BikeClass } from '../../src/core/types';
import { createSim, type Sim, type SimSnapshot } from '../lib/sim';
import type { RulesCounters } from '../lib/rules';
import { type TimedEvent } from '../lib/metrics';
import { recordingHeader } from '../lib/recording';
import type { AttemptLog } from '../lib/schema';
import { OUT_DIR, REPO_ROOT } from '../lib/paths';
import { writeJson } from '../lib/report';

export const STRANGER_OUT = path.join(OUT_DIR, 'stranger');
export const DEFAULT_BUDGET_CALLS = 150;
export const DEFAULT_BUDGET_MINUTES = 25;

export interface SnapshotB64 {
  v: 1;
  f64: string;
  u8: string;
  /** Run-rule counters (phase, run clock, latches) — see harness/lib/rules.ts. */
  counters: RulesCounters;
}

/** Only the events that matter for attempts/metrics are persisted (no `land`). */
export type PersistedEvent = TimedEvent & {
  event: Exclude<GameEvent, { type: 'land' }>;
  /** Checkpoint the bike held when the event fired (for faultsByCheckpoint). */
  checkpoint: number;
};

export interface PersistedState {
  schema: 1;
  kind: 'stranger-state';
  sessionId: string;
  trackId: string;
  seed: number;
  agent: string;
  startedAt: string;
  /** Round 9: wall time of the stranger's first call. A `prep`-created session may sit for half an hour before its
   *  stranger is spawned; the minutes budget counts from here, not from `startedAt` (r4 e3 s2 was handed 5 of 25 min). */
  firstCallAt?: string;
  physicsHz: number;
  physics: string;
  /** Calls made so far (every command counts, `start` included). */
  calls: number;
  /** Continuous run clock in ticks (never resets; Trials rules). */
  runTicks: number;
  snapshot: SnapshotB64;
  recording: InputRecording;
  attempts: AttemptLog[];
  events: PersistedEvent[];
  cleared: boolean;
  finishTime: number | null;
  firstCheckpointCalls: number | null;
  /** How many times the CLI had to call world.reset() directly (not expressible in the recording). */
  forcedResets: number;
  /** Run-clock tick at which the current attempt began (0, or the tick after the last respawn/reset). */
  attemptStartTick?: number;
  budget: { calls: number; minutes: number };
  log: string[];
}

export interface LoadedSession {
  dir: string;
  state: PersistedState;
  sim: Sim;
  recorder: InputRecorder;
}

export function budgetFromEnv(): { calls: number; minutes: number } {
  const c = Number(process.env['TRIALS_STRANGER_BUDGET_CALLS']);
  const m = Number(process.env['TRIALS_STRANGER_BUDGET_MINUTES']);
  return {
    calls: Number.isFinite(c) && c > 0 ? Math.floor(c) : DEFAULT_BUDGET_CALLS,
    minutes: Number.isFinite(m) && m > 0 ? m : DEFAULT_BUDGET_MINUTES,
  };
}

export function stampId(now = new Date()): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
}

export function sessionDir(trackId: string, sessionId: string): string {
  return path.join(STRANGER_OUT, trackId, sessionId);
}

// ---------------------------------------------------------------------------
// Snapshot <-> base64
// ---------------------------------------------------------------------------

export function encodeSnapshot(snap: SimSnapshot): SnapshotB64 {
  const s = snap.physics;
  return {
    v: 1,
    f64: Buffer.from(s.f64.buffer, s.f64.byteOffset, s.f64.byteLength).toString('base64'),
    u8: Buffer.from(s.u8.buffer, s.u8.byteOffset, s.u8.byteLength).toString('base64'),
    counters: snap.counters,
  };
}

export function decodeSnapshot(s: SnapshotB64): SimSnapshot {
  const f = Buffer.from(s.f64, 'base64');
  const fab = new ArrayBuffer(f.byteLength); // fresh buffer: 8-byte aligned
  new Uint8Array(fab).set(f);
  const u = Buffer.from(s.u8, 'base64');
  const uab = new ArrayBuffer(u.byteLength);
  new Uint8Array(uab).set(u);
  return { physics: { v: 1, f64: new Float64Array(fab), u8: new Uint8Array(uab) }, counters: s.counters };
}

// ---------------------------------------------------------------------------
// Create / load / save
// ---------------------------------------------------------------------------

export async function createSession(opts: {
  trackId: string;
  seed?: number;
  sessionId?: string;
  agent: string;
  /** Bike class (round 7); default rookie. Stored in the session recording's header. */
  bike?: BikeClass;
}): Promise<LoadedSession> {
  const now = new Date();
  const sim = await createSim(opts.trackId, opts.seed, undefined, { bike: opts.bike });
  const sessionId = opts.sessionId ?? `${opts.trackId}-${stampId(now)}`;
  const dir = sessionDir(opts.trackId, sessionId);
  if (fs.existsSync(path.join(dir, 'state.json'))) throw new Error(`session already exists: ${sessionId}`);
  fs.mkdirSync(path.join(dir, 'attempts'), { recursive: true });
  const recorder = new InputRecorder(recordingHeader(sim, `stranger ${sessionId} agent=${opts.agent}`));
  const state: PersistedState = {
    schema: 1,
    kind: 'stranger-state',
    sessionId,
    trackId: opts.trackId,
    seed: sim.seed,
    agent: opts.agent,
    startedAt: now.toISOString(),
    physicsHz: sim.hz,
    physics: sim.physicsName,
    calls: 0,
    runTicks: 0,
    snapshot: encodeSnapshot(sim.snap()),
    recording: recorder.toRecording(),
    attempts: [],
    events: [],
    cleared: false,
    finishTime: null,
    firstCheckpointCalls: null,
    forcedResets: 0,
    attemptStartTick: 0,
    budget: budgetFromEnv(),
    log: [],
  };
  return { dir, state, sim, recorder };
}

/** Find a session's directory by id (optionally narrowed to a track), or the newest one for a track. */
export function resolveSessionDir(sessionId: string | undefined, trackId: string | undefined): string {
  if (sessionId) {
    if (trackId) {
      const d = sessionDir(trackId, sessionId);
      if (fs.existsSync(path.join(d, 'state.json'))) return d;
    }
    if (fs.existsSync(STRANGER_OUT)) {
      for (const t of fs.readdirSync(STRANGER_OUT)) {
        const d = path.join(STRANGER_OUT, t, sessionId);
        if (fs.existsSync(path.join(d, 'state.json'))) return d;
      }
    }
    throw new Error(`session not found: ${sessionId} (run 'start' first)`);
  }
  // Newest session for the track.
  const trackDir = path.join(STRANGER_OUT, trackId ?? 'flat-test');
  if (!fs.existsSync(trackDir)) throw new Error(`no sessions for track '${trackId}' (run 'start' first)`);
  let best: { d: string; mtime: number } | null = null;
  for (const id of fs.readdirSync(trackDir)) {
    const f = path.join(trackDir, id, 'state.json');
    if (!fs.existsSync(f)) continue;
    const mtime = fs.statSync(f).mtimeMs;
    if (!best || mtime > best.mtime) best = { d: path.join(trackDir, id), mtime };
  }
  if (!best) throw new Error(`no sessions for track '${trackId}' (run 'start' first)`);
  return best.d;
}

export async function loadSession(dir: string): Promise<LoadedSession> {
  const raw = JSON.parse(fs.readFileSync(path.join(dir, 'state.json'), 'utf8')) as PersistedState;
  if (raw.kind !== 'stranger-state' || raw.schema !== 1) throw new Error(`bad state file in ${dir}`);
  // state.json keeps the header as an object (no decode), so `bike` survives there.
  const sim = await createSim(raw.trackId, raw.seed, raw.physicsHz, { bike: raw.recording.header.bike });
  if (sim.physicsName !== raw.physics) {
    throw new Error(`physics changed since session start (${raw.physics} -> ${sim.physicsName}); start a new session`);
  }
  sim.restore(decodeSnapshot(raw.snapshot));
  const recorder = new InputRecorder({ ...raw.recording.header });
  for (const f of iterateFrames(raw.recording)) recorder.push(f);
  return { dir, state: raw, sim, recorder };
}

export function saveSession(s: LoadedSession): void {
  s.state.snapshot = encodeSnapshot(s.sim.snap());
  s.state.recording = s.recorder.toRecording();
  writeJson(path.join(s.dir, 'state.json'), s.state);
}

export function appendLog(s: LoadedSession, line: string): void {
  const stamped = `${new Date().toISOString()} #${s.state.calls} ${line}`;
  s.state.log.push(stamped);
  fs.mkdirSync(s.dir, { recursive: true });
  fs.appendFileSync(path.join(s.dir, 'log.txt'), stamped + '\n');
}

export function wallMs(s: LoadedSession): number {
  return Date.now() - new Date(s.state.firstCallAt ?? s.state.startedAt).getTime();
}

export function budgetLeft(s: LoadedSession): { callsLeft: number; secondsLeft: number; exhausted: boolean } {
  const callsLeft = Math.max(0, s.state.budget.calls - s.state.calls);
  const secondsLeft = Math.max(0, s.state.budget.minutes * 60 - wallMs(s) / 1000);
  return { callsLeft, secondsLeft: Math.round(secondsLeft), exhausted: callsLeft <= 0 || secondsLeft <= 0 };
}

/**
 * Log an ended attempt to state + attempts/NNN.json (crash-safe: written immediately),
 * with attempts/NNN.rec.json: the session's input stream up to this moment. That prefix
 * replays from GO to the end of this attempt, so any attempt is a clip
 * (`harness:clip <track> --recording <rec> --from-tick <startTick>`).
 */
export function endAttempt(
  s: LoadedSession,
  endedBy: AttemptLog['endedBy'],
  st: PhysicsState,
  reason?: AttemptLog['reason'],
  extra: Record<string, unknown> = {},
): AttemptLog {
  const n = s.state.attempts.length + 1;
  const recName = `${String(n).padStart(3, '0')}.rec.json`;
  const recAbs = path.join(s.dir, 'attempts', recName);
  fs.mkdirSync(path.dirname(recAbs), { recursive: true });
  fs.writeFileSync(recAbs, encodeJSON(s.recorder.toRecording()) + '\n');
  const a: AttemptLog = {
    n,
    endedBy,
    checkpoint: st.checkpoint,
    x: round(st.bike.pos.x, 3),
    simTime: round(st.time, 4),
    runTime: round(s.state.runTicks / s.state.physicsHz, 4),
    wallMs: wallMs(s),
    calls: s.state.calls,
    startTick: s.state.attemptStartTick ?? 0,
    endTick: s.state.runTicks,
    recordingFile: path.relative(REPO_ROOT, recAbs),
  };
  if (reason !== undefined) a.reason = reason;
  s.state.attempts.push(a);
  writeJson(path.join(s.dir, 'attempts', `${String(n).padStart(3, '0')}.json`), { ...a, ...extra });
  return a;
}

/** Call after the respawn/reset ticks have been recorded: the next attempt starts here. */
export function beginAttempt(s: LoadedSession): void {
  s.state.attemptStartTick = s.state.runTicks;
}

export function round(v: number, d: number): number {
  const m = 10 ** d;
  return Math.round(v * m) / m;
}
