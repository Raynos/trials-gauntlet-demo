/**
 * Parent-side aggregation of every stranger session on a track.
 *
 *   pnpm harness:stranger report <trackId> [--stale]
 *
 * Reads out/stranger/<trackId>/<session>/{session.json,state.json}, writes
 * out/metrics/<trackId>.stranger.json (committed) and .stranger.md, and returns the
 * markdown. `done` calls this too, so the metrics file is always the full aggregate.
 *
 * Medians are over *completed* sessions whose src fingerprint matches the working tree
 * (a session played on other physics says nothing about this one); `--stale` includes
 * them. Sessions with a state.json but no session.json are listed as in-progress (or
 * abandoned once their budget window has passed) and never counted.
 */
import fs from 'node:fs';
import path from 'node:path';
import { median, srcFingerprint, fingerprintMatches } from '../lib/metrics';
import { REPO_ROOT } from '../lib/paths';
import { writeJson } from '../lib/report';
import type { AttemptLog, BestAttempt, StrangerSession } from '../lib/schema';
import { createSim } from '../lib/sim';
import { STRANGER_OUT, type PersistedState } from './session';
import { defaultBikeForTier } from '../../src/game/rules';
import type { InputRecording } from '../../src/core/replay';

/** Older session.json files (before round 11) carry the bike only in the recording header. */
function bikeOfRecording(file: string | null): 'rookie' | 'pro' {
  if (!file) return 'rookie';
  const rec = readJson<InputRecording>(path.isAbsolute(file) ? file : path.join(REPO_ROOT, file));
  return rec?.header.bike ?? 'rookie';
}

export interface Death {
  n: number;
  endedBy: AttemptLog['endedBy'];
  reason: string;
  x: number;
  checkpoint: number;
  /** Nearest placed obstacle within [-2, +8] m, as `kind @ x`. */
  obstacle: string | null;
  calls: number;
}

/** The bound PASS asserts: median attempts <= PASS_FACTOR x the authored band top (CONTRACT §3). */
export const PASS_FACTOR = 1.5;
/** A verdict needs at least this many completed sessions on the current src and bike (README: "at least two"). */
export const MIN_SESSIONS = 2;

export interface SessionRow {
  sessionId: string;
  agent: string;
  bike: 'rookie' | 'pro';
  status: 'done' | 'in-progress' | 'abandoned';
  stale: boolean;
  srcFingerprint: string | null;
  strangerAttempts: number;
  cleared: boolean;
  finishTime: number | null;
  calls: number;
  wallMs: number;
  firstCheckpointCalls: number | null;
  faultsByCheckpoint: number[];
  bestAttempt: BestAttempt | null;
  recordingFile: string | null;
  deaths: Death[];
}

export interface StrangerMetricsFile {
  schema: 2;
  kind: 'stranger-metrics';
  trackId: string;
  attemptsBand: [number, number] | null;
  physics: string;
  srcFingerprint: string;
  updatedAt: string;
  includeStale: boolean;
  sessions: SessionRow[];
  /** Bike class the medians count (round 11): `--bike`, else the tier's default. */
  bike?: 'rookie' | 'pro';
  /** Completed sessions counted in the medians. */
  completed: number;
  clearedCount: number;
  medianAttempts: number | null;
  medianFinishTime: number | null;
  medianCalls: number | null;
  medianWallMs: number | null;
  /**
   * Round 11 (audit §4): the census behind the verdict — completed sessions on this src and bike (`n`), sessions
   * still open or abandoned (censored: they say nothing about attempts-to-clear and are NOT in the median), sessions
   * excluded as stale src or the other bike class, and the exact bound asserted.
   */
  census: {
    n: number;
    minSessions: number;
    censored: { sessionId: string; status: 'in-progress' | 'abandoned'; attemptsSoFar: number; calls: number }[];
    staleExcluded: number;
    otherBikeExcluded: number;
  };
  /** What PASS asserts: band[0] <= median <= factor x band[1], every counted session cleared, n >= minSessions. */
  asserted: { band: [number, number]; factor: number; limit: number } | null;
  /**
   * PASS = the assertion holds; FAIL = median above the limit or a counted session did not clear; UNDER-BAND = every
   * session cleared and the median sits below the authored band (easier than authored: a tracks note, not a ship
   * blocker — the gate treats it as within the limit); INSUFFICIENT = fewer than minSessions completed on this src;
   * n/a = no band.
   */
  verdict: 'PASS' | 'FAIL' | 'UNDER-BAND' | 'INSUFFICIENT' | 'n/a';
  /** verdict === 'PASS' (kept for older readers); null when INSUFFICIENT / n/a. */
  pass: boolean | null;
  deaths: {
    total: number;
    byReason: Record<string, number>;
    byObstacle: { obstacle: string; count: number; xs: number[] }[];
    byCheckpoint: number[];
  };
}

function readJson<T>(f: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8')) as T;
  } catch {
    return null;
  }
}

export async function report(trackId: string, o: { fresh?: boolean; bike?: 'rookie' | 'pro' } = {}): Promise<{ metrics: StrangerMetricsFile; markdown: string; jsonFile: string; mdFile: string }> {
  const fresh = o.fresh ?? true;
  const sim = await createSim(trackId);
  const fp = srcFingerprint();
  const placed = sim.compiled.placed;
  const nearest = (x: number): string | null => {
    let best: { kind: string; x: number } | null = null;
    for (const p of placed) {
      const d = p.pos.x - x;
      if (d < -2 || d > 8) continue;
      if (!best || Math.abs(d) < Math.abs(best.x - x)) best = { kind: p.kind, x: p.pos.x };
    }
    return best ? `${best.kind} @ ${best.x.toFixed(1)} m` : null;
  };
  const deathsOf = (attempts: AttemptLog[]): Death[] =>
    attempts.map((a) => ({ n: a.n, endedBy: a.endedBy, reason: a.reason ?? a.endedBy, x: a.x, checkpoint: a.checkpoint, obstacle: nearest(a.x), calls: a.calls }));

  const dir = path.join(STRANGER_OUT, trackId);
  const rows: SessionRow[] = [];
  if (fs.existsSync(dir)) {
    for (const id of fs.readdirSync(dir).sort()) {
      const sdir = path.join(dir, id);
      const done = readJson<StrangerSession & { forcedResets?: number }>(path.join(sdir, 'session.json'));
      if (done && done.kind === 'stranger') {
        const stamp = done.srcFingerprint ?? null;
        rows.push({
          sessionId: done.sessionId,
          agent: done.agent,
          bike: done.bike ?? bikeOfRecording(done.recordingFile),
          status: 'done',
          stale: !fingerprintMatches(stamp, fp),
          srcFingerprint: stamp,
          strangerAttempts: done.strangerAttempts,
          cleared: done.cleared,
          finishTime: done.finishTime,
          calls: done.calls,
          wallMs: done.wallMs,
          firstCheckpointCalls: done.firstCheckpointCalls,
          faultsByCheckpoint: done.faultsByCheckpoint,
          bestAttempt: done.bestAttempt ?? null,
          recordingFile: done.recordingFile,
          deaths: deathsOf(done.attempts),
        });
        continue;
      }
      const st = readJson<PersistedState>(path.join(sdir, 'state.json'));
      if (!st || st.kind !== 'stranger-state') continue;
      const ageMin = (Date.now() - new Date(st.startedAt).getTime()) / 60_000;
      const abandoned = ageMin > st.budget.minutes + 5;
      rows.push({
        sessionId: st.sessionId,
        agent: st.agent,
        bike: st.recording.header.bike ?? 'rookie',
        status: abandoned ? 'abandoned' : 'in-progress',
        stale: false,
        srcFingerprint: null,
        strangerAttempts: 1 + st.attempts.length,
        cleared: st.cleared,
        finishTime: st.finishTime,
        calls: st.calls,
        wallMs: Date.now() - new Date(st.firstCallAt ?? st.startedAt).getTime(),
        firstCheckpointCalls: st.firstCheckpointCalls,
        faultsByCheckpoint: [],
        bestAttempt: null,
        recordingFile: null,
        deaths: deathsOf(st.attempts),
      });
    }
  }

  // The band is authored for the tier's default bike (`defaultBikeForTier`): medians count that class
  // unless `--bike` says otherwise; the other class's rows stay in the table, marked.
  const bike = o.bike ?? defaultBikeForTier(sim.track.tier, null);
  const counted = rows.filter((r) => r.status === 'done' && (!fresh || !r.stale) && r.bike === bike);
  const censored = rows
    .filter((r): r is SessionRow & { status: 'in-progress' | 'abandoned' } => r.status !== 'done' && r.bike === bike)
    .map((r) => ({ sessionId: r.sessionId, status: r.status, attemptsSoFar: r.strangerAttempts, calls: r.calls }));
  const staleExcluded = rows.filter((r) => r.status === 'done' && fresh && r.stale && r.bike === bike).length;
  const otherBikeExcluded = rows.filter((r) => r.status === 'done' && r.bike !== bike).length;
  const cleared = counted.filter((r) => r.cleared);
  const band = sim.track.meta?.attemptsBand ?? null;
  const med = (xs: number[]): number | null => (xs.length ? median(xs) : null);
  const byReason: Record<string, number> = {};
  const byObstacleMap = new Map<string, number[]>();
  const byCheckpoint = new Array<number>(sim.track.checkpoints.length + 1).fill(0);
  for (const r of counted) {
    for (const d of r.deaths) {
      byReason[d.reason] = (byReason[d.reason] ?? 0) + 1;
      const key = d.obstacle ?? 'ground';
      byObstacleMap.set(key, [...(byObstacleMap.get(key) ?? []), d.x]);
      byCheckpoint[d.checkpoint + 1] = (byCheckpoint[d.checkpoint + 1] ?? 0) + 1;
    }
  }
  const byObstacle = [...byObstacleMap.entries()].map(([obstacle, xs]) => ({ obstacle, count: xs.length, xs: xs.map((x) => Math.round(x * 10) / 10) })).sort((a, b) => b.count - a.count);
  const medianAttempts = med(counted.map((r) => r.strangerAttempts));
  const asserted = band ? { band, factor: PASS_FACTOR, limit: PASS_FACTOR * band[1] } : null;
  let verdict: StrangerMetricsFile['verdict'] = 'n/a';
  if (asserted && medianAttempts !== null) {
    if (counted.length < MIN_SESSIONS) verdict = 'INSUFFICIENT';
    else if (!counted.every((r) => r.cleared) || medianAttempts > asserted.limit) verdict = 'FAIL';
    else if (medianAttempts < asserted.band[0]) verdict = 'UNDER-BAND';
    else verdict = 'PASS';
  } else if (asserted) verdict = 'INSUFFICIENT';
  const metrics: StrangerMetricsFile = {
    schema: 2,
    kind: 'stranger-metrics',
    trackId,
    attemptsBand: band,
    physics: sim.physicsName,
    srcFingerprint: fp,
    updatedAt: new Date().toISOString(),
    includeStale: !fresh,
    sessions: rows,
    bike,
    completed: counted.length,
    clearedCount: cleared.length,
    medianAttempts,
    medianFinishTime: med(cleared.map((r) => r.finishTime!).filter((t) => t !== null)),
    medianCalls: med(counted.map((r) => r.calls)),
    medianWallMs: med(counted.map((r) => r.wallMs)),
    census: { n: counted.length, minSessions: MIN_SESSIONS, censored, staleExcluded, otherBikeExcluded },
    asserted,
    verdict,
    pass: verdict === 'PASS' ? true : verdict === 'FAIL' || verdict === 'UNDER-BAND' ? false : null,
    deaths: { total: counted.reduce((a, r) => a + r.deaths.length, 0), byReason, byObstacle, byCheckpoint },
  };

  const metricsDir = path.join(REPO_ROOT, 'harness', 'out', 'metrics');
  const jsonFile = path.join(metricsDir, `${trackId}.stranger.json`);
  const mdFile = path.join(metricsDir, `${trackId}.stranger.md`);
  writeJson(jsonFile, metrics);
  const markdown = toMarkdown(metrics);
  fs.mkdirSync(metricsDir, { recursive: true });
  fs.writeFileSync(mdFile, markdown + '\n');
  return { metrics, markdown, jsonFile, mdFile };
}

export function toMarkdown(m: StrangerMetricsFile): string {
  const fmtS = (t: number | null): string => (t === null ? '—' : `${t.toFixed(1)} s`);
  const lines: string[] = [];
  lines.push(`# Stranger — ${m.trackId} (${m.physics}, src ${m.srcFingerprint}, ${m.updatedAt}${m.bike ? `, medians on ${m.bike}` : ''})`);
  lines.push('');
  const c = m.census;
  lines.push(
    `**${m.verdict}** — n = ${c.n} completed${m.bike ? ` on ${m.bike}` : ''} (min ${c.minSessions}) · cleared ${m.clearedCount}/${c.n} · median attempts ${m.medianAttempts ?? '—'}${m.asserted ? ` · asserted ${m.asserted.band[0]} ≤ median ≤ ${m.asserted.limit.toFixed(1)} (${m.asserted.factor} × band top ${m.asserted.band[1]}) and every counted session cleared` : ' · no band'} · censored ${c.censored.length}${c.censored.length ? ` (${c.censored.map((x) => `${x.sessionId} ${x.status} at attempt ${x.attemptsSoFar}`).join('; ')})` : ''} · excluded: ${c.staleExcluded} stale src, ${c.otherBikeExcluded} other bike · median time to clear ${fmtS(m.medianFinishTime)} · median calls ${m.medianCalls ?? '—'} · median wall ${m.medianWallMs === null ? '—' : `${(m.medianWallMs / 60000).toFixed(1)} min`}`,
  );
  lines.push('');
  lines.push('| session | agent | bike | status | attempts | cleared | time to clear | calls | wall | 1st cp call | died at | best attempt |');
  lines.push('|---|---|---|---|---:|---|---:|---:|---:|---:|---|---|');
  for (const r of m.sessions) {
    const died = r.deaths.length ? r.deaths.map((d) => `${d.reason}@${d.x.toFixed(0)}m${d.obstacle ? ` (${d.obstacle.split(' @ ')[0]})` : ''}`).join(', ') : '—';
    const best = r.bestAttempt ? `#${r.bestAttempt.n} ${r.bestAttempt.cleared ? 'clear' : `${r.bestAttempt.x.toFixed(0)} m`} ticks ${r.bestAttempt.startTick}–${r.bestAttempt.endTick}` : '—';
    lines.push(
      `| ${r.sessionId} | ${r.agent} | ${r.bike}${m.bike && r.bike !== m.bike ? ' (not counted)' : ''} | ${r.status}${r.stale ? ' (stale src)' : ''} | ${r.strangerAttempts} | ${r.cleared ? 'yes' : 'no'} | ${fmtS(r.finishTime)} | ${r.calls} | ${(r.wallMs / 60000).toFixed(1)} min | ${r.firstCheckpointCalls ?? '—'} | ${died} | ${best} |`,
    );
  }
  if (m.deaths.total > 0) {
    lines.push('');
    lines.push(`Where they died (${m.deaths.total} ended attempts over counted sessions):`);
    lines.push('');
    lines.push('| obstacle | deaths | x (m) |');
    lines.push('|---|---:|---|');
    for (const o of m.deaths.byObstacle) lines.push(`| ${o.obstacle} | ${o.count} | ${o.xs.join(', ')} |`);
    lines.push('');
    lines.push(`by reason: ${Object.entries(m.deaths.byReason).map(([k, v]) => `${k} ${v}`).join(', ')} · by checkpoint segment: [${m.deaths.byCheckpoint.join(', ')}]`);
  }
  return lines.join('\n');
}
