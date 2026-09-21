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
import fs from 'node:fs';
import path from 'node:path';
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

/**
 * FNV-1a over the *working-tree* sources that decide a simulation result. One shared checkout
 * means HEAD alone does not identify what ran; two reports with different fingerprints are not
 * comparable.
 *
 * Round 12 (harness-metrics.md Round 11 open item): the hash covers only what the sim IMPORTS —
 * `src/physics/**`, `src/tracks/**`, `src/game/rules.ts` and the runtime core modules
 * (`hash.ts`, `replay.ts`, `rng.ts`, `riderGeometry.ts`). Not `src/core/types.ts` / `global.d.ts` / `loop.ts` /
 * `index.ts`: a hook-interface type (cfc98f8) cannot change a physics result, yet it restamped
 * 36 goldens and 22 stranger sessions stale in round 11. `.test.ts` and `.d.ts` are skipped.
 * `SIM_IDENTICAL_STAMPS` lists earlier stamps PROVEN sim-identical to the current one (a golden
 * restamp with node == browser on every track); `fingerprintMatches()` is the comparison every
 * consumer uses, so a change of the hashed set never orphans a proven session.
 */
export const SIM_FINGERPRINT_DIRS = ['src/physics', 'src/tracks'] as const;
export const SIM_FINGERPRINT_FILES = ['src/game/rules.ts', 'src/core/hash.ts', 'src/core/replay.ts', 'src/core/rng.ts', 'src/core/riderGeometry.ts'] as const;
/**
 * current fingerprint -> earlier stamps proven identical. `6412a755` was the round-12 stamp of this
 * same tree under the old hash (all of src/core): 19/19 Rookie goldens node == browser, the same
 * physics bytes. Prune an entry once nothing on disk carries the old stamp.
 */
export const SIM_IDENTICAL_STAMPS: Readonly<Record<string, readonly string[]>> = {
  // 817dddd2 = HEAD 682d05c under this hash; 6412a755 / 6f0cbe22 = the same tree under the old all-of-src/core hash
  // (6f0cbe22: +15 lines of hook types in types.ts). 7e836cbe = HEAD 88401ed: fa62eae ADDED src/tracks/courses/playgrounds.ts
  // + segments.ts and registered them (`git diff 682d05c..88401ed -- src/physics src/tracks src/game/rules.ts` touches no
  // existing course, no physics, no rules line), so every earlier track simulates byte-identically; the p1–p5 playgrounds
  // themselves have no earlier stamp to inherit.
  // 2e249552 / d3f20790: two working-tree states of fa62eae while it was being written (x3 strangers r8p p1 / p2 ran `done`
  // under them); x3 p2's session recording replays to hash 5bd588d5cec2a135 on 682d05c and on 88401ed, node == browser.
  '7e836cbe': ['817dddd2', '6412a755', '6f0cbe22', '2e249552', 'd3f20790'],
  '817dddd2': ['6412a755', '6f0cbe22'],
};
let cachedFp: string | null = null;
/** Recomputed every call (to detect edits while a long run is in flight). */
export function freshFingerprint(): string {
  cachedFp = null;
  return srcFingerprint();
}
/** True when `stamp` is the current fingerprint or one proven sim-identical to it. */
export function fingerprintMatches(stamp: string | null | undefined, fp = srcFingerprint()): boolean {
  if (!stamp) return false;
  if (stamp === fp) return true;
  return (SIM_IDENTICAL_STAMPS[fp] ?? []).includes(stamp);
}
/** The hash itself, over `root`; `srcFingerprint()` caches it for the repo. */
export function simFingerprint(root: string): string {
  let h = 0x811c9dc5;
  const mix = (buf: Uint8Array): void => {
    for (let i = 0; i < buf.length; i++) {
      h ^= buf[i]!;
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  };
  const isSource = (name: string): boolean => /\.ts$/.test(name) && !/\.test\.ts$/.test(name) && !/\.d\.ts$/.test(name);
  const file = (p: string): void => {
    mix(new TextEncoder().encode(path.relative(root, p)));
    mix(fs.readFileSync(p));
  };
  const walk = (dir: string): void => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (isSource(e.name)) file(p);
    }
  };
  for (const d of SIM_FINGERPRINT_DIRS) walk(path.join(root, d));
  for (const f of SIM_FINGERPRINT_FILES) {
    const p = path.join(root, f);
    if (fs.existsSync(p)) file(p);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
export function srcFingerprint(root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..')): string {
  if (cachedFp) return cachedFp;
  cachedFp = simFingerprint(root);
  return cachedFp;
}

export function runMeta(kind: string, startedAt: Date, extra: Partial<RunMeta> = {}): RunMeta {
  return {
    schema: 1,
    kind,
    runId: runId(startedAt),
    startedAt: startedAt.toISOString(),
    wallMs: Date.now() - startedAt.getTime(),
    git: gitHead(),
    srcFingerprint: srcFingerprint(),
    node: process.version,
    ...extra,
  };
}
