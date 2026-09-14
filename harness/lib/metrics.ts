/**
 * Attempt counting, latency extraction and state diffing shared by the bot,
 * the stranger and the gate.
 *
 * CONTRACT §3: attempts = 1 + fault events of any reason (crash, hazard,
 * out-of-bounds, manual restart). The restart mash after a crash is NOT a
 * second fault — and with the game's rule layer (harness/lib/rules.ts, mirrored
 * from Game.tick) it never emits one: a restart edge while `crashed` is a free
 * respawn. So the count below is simply "every fault event", identical to the
 * game's own fault counter (`hook.faults()`); the bot's browser verification
 * asserts the two agree. RESTART_GRACE_TICKS is kept as a knob for raw-physics
 * event streams (no rule layer) and is 0 by default.
 */
import { execFileSync } from 'node:child_process';
import type { GameEvent, PhysicsState } from '../../src/core/types';
import { FLAG_RESTART, type InputRecording } from '../../src/core/replay';
import type { RunMeta } from './schema';

export const RESTART_GRACE_TICKS = 0;

export interface TimedEvent {
  event: GameEvent;
  /** Run-clock tick (continuous) at which the event was drained. */
  runTick: number;
}

/** Fault events that count, per CONTRACT §3, from a run-clock-stamped event stream. */
export function countedFaults(events: TimedEvent[]): TimedEvent[] {
  const out: TimedEvent[] = [];
  let lastNonRestartFaultTick = -Infinity;
  for (const te of events) {
    const e = te.event;
    if (e.type !== 'fault') continue;
    if (e.reason === 'restart') {
      if (RESTART_GRACE_TICKS > 0 && te.runTick - lastNonRestartFaultTick <= RESTART_GRACE_TICKS) continue;
      out.push(te);
    } else {
      lastNonRestartFaultTick = te.runTick;
      out.push(te);
    }
  }
  return out;
}

export function attemptsFromEvents(events: TimedEvent[]): number {
  return 1 + countedFaults(events).length;
}

/** Rising edges of FLAG_RESTART in a recording: what a player pressed. */
export function restartEdges(rec: InputRecording): number {
  let edges = 0;
  let prev = false;
  for (const r of rec.runs) {
    const on = (r[4] & FLAG_RESTART) !== 0;
    if (on && !prev) edges++;
    prev = on;
  }
  return edges;
}

export function faultsByCheckpoint(faults: { checkpoint: number }[], checkpointCount: number): number[] {
  const out = new Array<number>(checkpointCount + 1).fill(0);
  for (const f of faults) out[Math.min(checkpointCount, Math.max(0, f.checkpoint + 1))]!++;
  return out;
}

export function median(values: number[]): number {
  if (values.length === 0) return Number.NaN;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export function percentileOf(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1));
  return s[idx]!;
}

/** Dotted paths of fields that differ between two plain-data states. */
export function diffState(a: unknown, b: unknown, prefix = '', out: string[] = []): string[] {
  if (Object.is(a, b)) return out;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') {
    out.push(prefix || '<root>');
    return out;
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(ao), ...Object.keys(bo)]);
  for (const k of keys) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (!(k in ao) || !(k in bo)) out.push(p);
    else diffState(ao[k], bo[k], p, out);
  }
  return out;
}

export function diffPhysicsStates(a: PhysicsState, b: PhysicsState): string[] {
  return diffState(a, b);
}

export function runId(now = new Date()): string {
  const p = (n: number, w = 2): string => String(n).padStart(w, '0');
  const stamp = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
  const hex = Math.floor(Math.random() * 0xffffff)
    .toString(16)
    .padStart(6, '0');
  return `${stamp}-${hex}`;
}

let cachedGit: string | null = null;
export function gitHead(): string {
  if (cachedGit) return cachedGit;
  try {
    cachedGit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    cachedGit = 'unknown';
  }
  return cachedGit;
}

export function runMeta(kind: string, startedAt: Date, extra: Partial<RunMeta> = {}): RunMeta {
  return {
    schema: 1,
    kind,
    runId: runId(startedAt),
    startedAt: startedAt.toISOString(),
    wallMs: Date.now() - startedAt.getTime(),
    git: gitHead(),
    node: process.version,
    ...extra,
  };
}
