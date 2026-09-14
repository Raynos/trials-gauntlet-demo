/**
 * The one bot (CONTRACT §3).
 *
 *   pnpm harness:bot <trackId> [--skill 0..3] [--oracle] [--all] [--seeds N] [--budget ms]
 *                    [--max-attempts 50] [--max-sim-seconds 300] [--track-wall-s 120] [--no-verify] [--crash-probe]
 *                    [--dev] [--build] [--verbose]
 *   pnpm harness:bot --all-tracks [--skill 2 | --skill 2,3] [--seeds 2] [--track-wall-s 120]   -> out/metrics/sweep.json + sweep.md
 *   pnpm harness:bot --refresh-goldens [--tracks a,b] [--build]   re-prove every inputs/<track>/bot-*.json on the
 *                    working tree (node replay finishes, node hash == browser hash) and re-stamp it; goldens that
 *                    no longer finish are reported STALE and need a bot run (lib/golden.ts refreshGoldens)
 *   (a skill list runs one sweep per skill and writes one table per skill into sweep.md; sweep.json holds `sweeps[]`)
 *
 * Writes per run  harness/out/bot/<trackId>/<runId>.json          (BotRunReport)
 *        summary  harness/out/metrics/<trackId>.json               (TrackBotMetrics, committed)
 *        golden   harness/inputs/<trackId>/bot-<skill>.json        (best recording per skill)
 *        crash    harness/inputs/<trackId>/crash.json              (--crash-probe)
 * One line per run on stdout:
 *   bot flat-test skill=3 seed=1 attempts=1 finish=9.867 plans=79 ticks=1.2M wall=41s verified=yes
 */
import fs from 'node:fs';
import path from 'node:path';
import { InputRecorder, quantizeInput, type InputRecording } from '../../src/core/replay';
import type { InputFrame } from '../../src/core/types';
import { flagBool, flagNum, parseArgs } from '../lib/args';
import { faultsByCheckpoint, freshFingerprint, median, percentileOf, restartEdges, runMeta, srcFingerprint } from '../lib/metrics';
import { HARNESS_DIR } from '../lib/paths';
import { saveRecording } from '../lib/recording';
import { fail, writeJson } from '../lib/report';
import type { Blocker, BotRunReport, Skill, SweepReport, SweepRow, TrackBotMetrics } from '../lib/schema';
import { refreshGoldens } from '../lib/golden';
import { createSim, listSimTracks, type Sim } from '../lib/sim';
import { BrowserVerifier } from '../lib/verify';
import { formatActions } from './actions';
import { configFor, playTrack } from './play';
import { DEFAULT_WEIGHTS } from './score';

export const METRICS_DIR = path.join(HARNESS_DIR, 'out', 'metrics');
export const INPUTS_DIR = path.join(HARNESS_DIR, 'inputs');

export function skillLabel(skill: Skill): string {
  return skill === 'oracle' ? 'oracle' : String(skill);
}

export function goldenFile(trackId: string, skill: Skill): string {
  return path.join(INPUTS_DIR, trackId, `bot-${skillLabel(skill)}.json`);
}

export function recordingFromFrames(sim: Sim, frames: InputFrame[], note: string): InputRecording {
  // `src=<fingerprint>` lets the gate pick goldens recorded on this physics (ship-gate pickGolden).
  const rec = new InputRecorder({ version: 1, trackId: sim.track.id, seed: sim.seed, physicsHz: sim.hz, note: `${note} src=${srcFingerprint()}` });
  for (const f of frames) rec.push(f);
  return rec.toRecording();
}

export interface RunOnce {
  report: BotRunReport;
  recording: InputRecording;
}

/** Locate a fault against the placed obstacles: nearest one within [-2, +8] m ahead. */
export function locateBlocker(sim: Sim, f: { reason: Blocker['reason']; x: number; checkpoint: number; runTime: number }): Blocker {
  let best: Blocker['obstacle'] = null;
  let bestD = Infinity;
  sim.compiled.placed.forEach((o, index) => {
    const d = o.pos.x - f.x;
    if (d < -2 || d > 8) return;
    const score = Math.abs(d);
    if (score < bestD) {
      bestD = score;
      best = { kind: o.kind, x: o.pos.x, index };
    }
  });
  return { reason: f.reason, x: f.x, checkpoint: f.checkpoint, runTime: f.runTime, obstacle: best };
}

export async function runOnce(
  trackId: string,
  seed: number,
  skill: Skill,
  o: { budgetMs?: number; maxAttempts?: number; maxSimSeconds?: number; maxWallMs?: number; verbose?: boolean },
): Promise<RunOnce> {
  const started = new Date();
  const sim = await createSim(trackId, seed);
  const config = configFor(skill, o.budgetMs);
  const limits: Partial<{ maxAttempts: number; maxSimSeconds: number; maxWallMs: number }> = {};
  if (o.maxAttempts !== undefined) limits.maxAttempts = o.maxAttempts;
  if (o.maxSimSeconds !== undefined) limits.maxSimSeconds = o.maxSimSeconds;
  if (o.maxWallMs !== undefined) limits.maxWallMs = o.maxWallMs;
  const res = playTrack(sim, {
    skill,
    config,
    weights: DEFAULT_WEIGHTS,
    limits,
    ...(o.verbose ? { log: (l: string) => console.error(`  [bot] ${l}`) } : {}),
  });
  const recording = recordingFromFrames(sim, res.frames, `bot skill=${skillLabel(skill)} outcome=${res.outcome}`);
  // Node hash: replay the recording from a fresh sim so it is the recording's hash, not the search's.
  const fresh = await createSim(trackId, seed);
  // Tick-by-tick: the replay must retrace the committed play exactly. A divergence means
  // the search's snapshot/restore left the world in a state a straight run never reaches
  // (physics snapshot() misses state) — the recording is then not evidence of the play.
  let playReplayDivergence: BotRunReport['playReplayDivergence'] = null;
  for (let i = 0; i < res.frames.length; i++) {
    fresh.step(res.frames[i]!);
    if (playReplayDivergence === null && fresh.hash() !== res.hashes[i]) {
      playReplayDivergence = { tick: i + 1, x: fresh.state().bike.pos.x, playHash: res.hashes[i]!, replayHash: fresh.hash() };
    }
  }
  const replay = { hash: fresh.hash() };
  if (playReplayDivergence) {
    console.error(`  [bot] WARNING replay of the recording diverges from the committed play at tick ${playReplayDivergence.tick} (x=${playReplayDivergence.x.toFixed(2)} m): physics snapshot()/restore() is not a faithful round trip on this build; the bot's attempts/finish below describe a trajectory no replay reproduces`);
  }
  const planWall = res.plans.map((p) => p.wallMs);
  const runDir = path.join(HARNESS_DIR, 'out', 'bot', trackId);
  const meta = runMeta('bot', started, { physics: sim.physicsName });
  const report: BotRunReport = {
    ...meta,
    kind: 'bot',
    trackId,
    seed,
    physicsHz: sim.hz,
    skill,
    config,
    weights: DEFAULT_WEIGHTS,
    outcome: res.outcome,
    maxX: res.maxX,
    progress: sim.track.finishX > 0 ? Math.min(1, res.maxX / sim.track.finishX) : 0,
    firstBlocker: res.faults[0] ? locateBlocker(sim, res.faults[0]) : null,
    attempts: res.attempts,
    faults: res.faults,
    faultsByCheckpoint: faultsByCheckpoint(res.faults, sim.track.checkpoints.length),
    finishTime: res.finishTime,
    segmentFinishTime: res.segmentFinishTime,
    simSeconds: res.frames.length / sim.hz,
    ticks: res.frames.length,
    rewinds: res.rewinds,
    search: {
      plans: res.plans.length,
      expandedTotal: res.plans.reduce((a, p) => a + p.expanded, 0),
      ticksSimulated: res.ticksSimulated,
      planWallMs: { p50: percentileOf(planWall, 50), p95: percentileOf(planWall, 95), max: Math.max(0, ...planWall) },
    },
    recordingFile: path.join(runDir, `${meta.runId}-skill${skillLabel(skill)}.rec.json`),
    nodeHash: replay.hash,
    playReplayDivergence,
    browserHash: null,
    browserVerified: null,
  };
  if (res.forcedResets > 0) console.error(`  [bot] WARNING ${res.forcedResets} forced resets: physics did not respawn on the restart input`);
  if (res.attempts !== res.faults.length + 1) {
    console.error(`  [bot] WARNING attempts=${res.attempts} != faults+1=${res.faults.length + 1} (restart grace filtering)`);
  }
  const edges = restartEdges(recording);
  if (skill !== 'oracle' && edges + 1 !== res.attempts && sim.physicsName === 'MockPhysics') {
    console.error(`  [bot] note restart edges+1=${edges + 1} attempts=${res.attempts}`);
  }
  saveRecording(report.recordingFile, recording);
  writeJson(path.join(runDir, `${meta.runId}-skill${skillLabel(skill)}.json`), report);
  if (o.verbose) console.error(`  [bot] actions: ${formatActions(res.plans.flatMap((p) => (p.finishes ? p.actions : p.actions.slice(0, config.commit))))}`);
  return { report, recording };
}

function fmtTicks(n: number): string {
  return n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}k` : String(n);
}

export function printRunLine(r: BotRunReport): void {
  const fin = r.finishTime === null ? 'none' : r.finishTime.toFixed(3);
  const ver = r.browserVerified === null ? 'skipped' : r.browserVerified ? 'yes' : 'NO';
  const blk = r.firstBlocker ? ` blocker=${r.firstBlocker.reason}@${r.firstBlocker.x.toFixed(1)}m${r.firstBlocker.obstacle ? `(${r.firstBlocker.obstacle.kind}@${r.firstBlocker.obstacle.x.toFixed(1)})` : '(ground)'}` : '';
  console.log(
    `bot ${r.trackId} skill=${skillLabel(r.skill)} seed=${r.seed} attempts=${r.attempts} outcome=${r.outcome} finish=${fin} maxX=${r.maxX.toFixed(1)} (${(r.progress * 100).toFixed(0)}%)${blk} plans=${r.search.plans} ticks=${fmtTicks(r.search.ticksSimulated)} wall=${(r.wallMs / 1000).toFixed(1)}s verified=${ver}`,
  );
}

export function sweepMarkdown(rep: SweepReport): string {
  const lines = [
    `| track | tier | technique | finishX | best m | best % | clear | attempts (seeds) | replay | first blocker |`,
    `|---|---|---|---:|---:|---:|---|---|---|---|`,
  ];
  for (const r of rep.rows) {
    const b = r.firstBlocker;
    const blocker = b ? `${b.reason} @ ${b.x.toFixed(1)} m${b.obstacle ? ` — ${b.obstacle.kind} @ ${b.obstacle.x.toFixed(1)} m` : ' — ground'}` : '—';
    lines.push(
      `| ${r.trackId} | ${r.tier} | ${r.technique} | ${r.finishX.toFixed(0)} | ${r.bestX.toFixed(1)} | ${(r.bestPct * 100).toFixed(0)}% | ${r.clears}/${r.seeds.length} | ${r.attemptsMedian} (${r.attempts.join(', ')}) | ${r.replayFaithful === undefined ? '?' : r.replayFaithful ? 'ok' : `DIVERGES @ ${r.replayDivergenceX?.toFixed(0) ?? '?'} m`} | ${blocker} |`,
    );
  }
  return lines.join('\n');
}

/** Pick the best run for a skill: finished > fewer attempts > faster. */
function bestOf(runs: RunOnce[]): RunOnce | null {
  const sorted = [...runs].sort((a, b) => {
    const fa = a.report.outcome === 'finished' ? 0 : 1;
    const fb = b.report.outcome === 'finished' ? 0 : 1;
    if (fa !== fb) return fa - fb;
    if (a.report.attempts !== b.report.attempts) return a.report.attempts - b.report.attempts;
    return (a.report.finishTime ?? Infinity) - (b.report.finishTime ?? Infinity);
  });
  return sorted[0] ?? null;
}

export function loadTrackMetrics(trackId: string): TrackBotMetrics | null {
  const f = path.join(METRICS_DIR, `${trackId}.json`);
  if (!fs.existsSync(f)) return null;
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8')) as TrackBotMetrics;
  } catch {
    return null;
  }
}

function updateTrackMetrics(sim: Sim, bySkill: Map<Skill, RunOnce[]>): TrackBotMetrics {
  const prev = loadTrackMetrics(sim.track.id);
  const curveMap = new Map<string, TrackBotMetrics['curve'][number]>();
  // A physics change invalidates the old curve: start over.
  if (prev && prev.physics === sim.physicsName) for (const c of prev.curve) curveMap.set(skillLabel(c.skill), c);
  for (const [skill, runs] of bySkill) {
    curveMap.set(skillLabel(skill), {
      skill,
      seeds: runs.map((r) => r.report.seed),
      attempts: runs.map((r) => r.report.attempts),
      median: median(runs.map((r) => r.report.attempts)),
      finishTimes: runs.map((r) => r.report.finishTime),
    });
  }
  const order: Skill[] = [0, 1, 2, 3, 'oracle'];
  const curve = order.map((s) => curveMap.get(skillLabel(s))).filter((c): c is TrackBotMetrics['curve'][number] => c !== undefined);
  const oracle = curveMap.get('oracle');
  const botParTime = oracle ? (oracle.finishTimes.filter((t): t is number => t !== null).sort((a, b) => a - b)[0] ?? null) : null;
  const band = sim.track.meta?.attemptsBand ?? null;
  const targetAttempts = sim.track.targetAttempts ?? band?.[1] ?? null;
  const skilled = ([0, 1, 2, 3] as const).map((s) => curveMap.get(String(s))?.median);
  let shaped: boolean | null = null;
  if (skilled.every((m): m is number => m !== undefined)) {
    const mono = skilled.every((m, i) => i === 0 || m <= skilled[i - 1]!);
    shaped = mono && (targetAttempts === null || skilled[3]! <= targetAttempts);
  }
  let singleWall: TrackBotMetrics['singleWall'] = null;
  const allFaults = [...bySkill.values()].flat().flatMap((r) => r.report.faultsByCheckpoint);
  if (allFaults.length > 0) {
    const n = sim.track.checkpoints.length + 1;
    const hist = new Array<number>(n).fill(0);
    for (const r of [...bySkill.values()].flat()) r.report.faultsByCheckpoint.forEach((v, i) => (hist[i]! += v));
    const sum = hist.reduce((a, b) => a + b, 0);
    if (sum > 0) {
      const i = hist.indexOf(Math.max(...hist));
      const share = hist[i]! / sum;
      if (share > 0.7) singleWall = { checkpoint: i - 1, share };
    }
  }
  const metrics: TrackBotMetrics = {
    schema: 1,
    kind: 'track-bot-metrics',
    trackId: sim.track.id,
    updatedAt: new Date().toISOString(),
    physics: sim.physicsName,
    attemptsBand: band,
    targetAttempts,
    curve,
    botParTime,
    shaped,
    singleWall,
    runs: [...(prev && prev.physics === sim.physicsName ? prev.runs : []), ...[...bySkill.values()].flat().map((r) => r.report.runId)].slice(-40),
  };
  writeJson(path.join(METRICS_DIR, `${sim.track.id}.json`), metrics);
  return metrics;
}

/**
 * Crash probe: find the earliest non-restart fault within 8 s using
 * aggressive scripted inputs; write inputs/<track>/crash.json.
 */
export async function crashProbe(trackId: string, seed: number): Promise<{ file: string; faultTick: number; reason: string } | null> {
  const scripts: Array<{ name: string; frame: Partial<InputFrame> }> = [
    { name: 'gas-back', frame: { throttle: 1, lean: -1 } },
    { name: 'gas-fwd', frame: { throttle: 1, lean: 1 } },
    { name: 'gas', frame: { throttle: 1 } },
    { name: 'lean-back', frame: { lean: -1 } },
  ];
  let best: { name: string; tick: number; reason: string; frames: InputFrame[] } | null = null;
  for (const s of scripts) {
    const sim = await createSim(trackId, seed);
    const f = quantizeInput(s.frame);
    const frames: InputFrame[] = [];
    const maxTicks = 8 * sim.hz;
    for (let t = 0; t < maxTicks; t++) {
      const ev = sim.step(f);
      frames.push(f);
      const fault = ev.find((e) => e.type === 'fault' && e.reason !== 'restart');
      if (fault && fault.type === 'fault') {
        if (!best || t < best.tick) best = { name: s.name, tick: t, reason: fault.reason, frames };
        break;
      }
      if (sim.state().finished) break;
    }
  }
  if (!best) return null;
  const sim = await createSim(trackId, seed);
  // Hold the crashing input a further 0.5 s so the ragdoll is visible, then coast.
  const tail = quantizeInput({});
  const frames = [...best.frames, ...new Array<InputFrame>(Math.round(sim.hz * 0.5)).fill(best.frames[0]!), ...new Array<InputFrame>(sim.hz).fill(tail)];
  const rec = recordingFromFrames(sim, frames, `crash probe ${best.name}: ${best.reason} at tick ${best.tick}`);
  const file = path.join(INPUTS_DIR, trackId, 'crash.json');
  saveRecording(file, rec);
  return { file, faultTick: best.tick, reason: best.reason };
}


/** --all-tracks: budget-capped committed play on every registered track; one summary table per skill. */
async function sweep(flags: ReturnType<typeof parseArgs>['flags'], seeds: number, skill: Skill): Promise<{ report: SweepReport; md: string; fp0: string; started: Date }> {
  const started = new Date();
  const trackWallS = flagNum(flags, 'track-wall-s', 120);
  const budget = flags.budget !== undefined ? flagNum(flags, 'budget', 0) : undefined;
  const only = typeof flags.tracks === 'string' ? flags.tracks.split(',') : null;
  const ids = listSimTracks().filter((id) => !only || only.includes(id));
  const rows: SweepRow[] = [];
  const first = await createSim(ids[0]!);
  console.log(`sweep: physics=${first.physicsName} src=${srcFingerprint()} skill=${skillLabel(skill)} seeds=${seeds} trackWall=${trackWallS}s tracks=${ids.length}`);
  const fp0 = srcFingerprint();
  for (const id of ids) {
    const sim = await createSim(id);
    const runs: RunOnce[] = [];
    const t0 = performance.now();
    if (freshFingerprint() !== fp0) console.error(`WARNING src/physics|tracks changed on disk during the sweep (${fp0} -> ${freshFingerprint()}); this process still runs the code it loaded at start. Re-run the sweep.`);
    for (let k = 0; k < seeds; k++) {
      const seed = (sim.seed + k) >>> 0;
      const o: Parameters<typeof runOnce>[3] = { maxWallMs: trackWallS * 1000, verbose: flagBool(flags, 'verbose') };
      if (budget !== undefined) o.budgetMs = budget;
      const r = await runOnce(id, seed, skill, o);
      runs.push(r);
      printRunLine(r.report);
    }
    const reps = runs.map((r) => r.report);
    const bestX = Math.max(...reps.map((r) => r.maxX));
    // First blocker: from the run that got least far (the wall), else the earliest fault.
    const blockers = reps.map((r) => r.firstBlocker).filter((b): b is Blocker => b !== null).sort((a, b) => a.x - b.x);
    // Never faulted, never finished: the bike is parked against something at maxX.
    for (const r of reps) {
      if (r.firstBlocker === null && r.outcome !== 'finished') {
        blockers.push(locateBlocker(sim, { reason: 'stuck', x: r.maxX, checkpoint: -1, runTime: r.simSeconds }));
      }
    }
    blockers.sort((a, b) => a.x - b.x);
    rows.push({
      trackId: id,
      tier: sim.track.tier,
      technique: sim.track.meta?.technique ?? '',
      finishX: sim.track.finishX,
      attemptsBand: sim.track.meta?.attemptsBand ?? null,
      skill,
      seeds: reps.map((r) => r.seed),
      bestX,
      bestPct: sim.track.finishX > 0 ? Math.min(1, bestX / sim.track.finishX) : 0,
      clears: reps.filter((r) => r.outcome === 'finished').length,
      attempts: reps.map((r) => r.attempts),
      attemptsMedian: median(reps.map((r) => r.attempts)),
      finishTimes: reps.map((r) => r.finishTime),
      outcomes: reps.map((r) => r.outcome),
      firstBlocker: blockers[0] ?? null,
      replayFaithful: reps.every((r) => !r.playReplayDivergence),
      replayDivergenceX: reps.map((r) => r.playReplayDivergence?.x).find((x): x is number => x !== undefined) ?? null,
      wallMs: performance.now() - t0,
      runs: reps.map((r) => r.runId),
    });
    updateTrackMetrics(sim, new Map([[skill, runs]]));
    // Golden per track when it cleared (node-hash only; verify in the browser with harness:replay / gate).
    const best = bestOf(runs);
    if (best && best.report.outcome === 'finished') saveRecording(goldenFile(id, skill), best.recording);
  }
  const report: SweepReport = {
    ...runMeta('sweep', started, { physics: first.physicsName }),
    kind: 'sweep',
    skill,
    seeds,
    budgetMs: budget ?? null,
    trackWallS,
    rows,
  };
  const md = sweepMarkdown(report);
  console.log(`\n${md}\nsweep skill=${skillLabel(skill)}: wall=${((Date.now() - started.getTime()) / 1000).toFixed(0)}s`);
  return { report, md, fp0, started };
}

/** Parse `--skill 2` / `--skill 2,3` / `--oracle` into the list of skills to sweep. */
export function sweepSkills(flags: ReturnType<typeof parseArgs>['flags']): Skill[] {
  if (flagBool(flags, 'oracle')) return ['oracle'];
  const raw = typeof flags.skill === 'string' ? flags.skill : String(flagNum(flags, 'skill', 2));
  const out: Skill[] = [];
  for (const part of raw.split(',')) {
    const t = part.trim();
    if (t === 'oracle') out.push('oracle');
    else if (/^[0-3]$/.test(t)) out.push(Number(t) as 0 | 1 | 2 | 3);
    else fail(`--skill: '${t}' is not 0..3 or oracle`);
  }
  return out;
}

/** One sweep per skill; sweep.md gets one section per skill, sweep.json `sweeps[]` (+ the first at top level for older readers). */
async function sweepAll(flags: ReturnType<typeof parseArgs>['flags'], seeds: number): Promise<void> {
  const skills = sweepSkills(flags);
  const results: Awaited<ReturnType<typeof sweep>>[] = [];
  for (const skill of skills) results.push(await sweep(flags, seeds, skill));
  const first = results[0]!;
  const header = (r: (typeof results)[number]): string => `## skill ${skillLabel(r.report.skill)} — ${seeds} seed(s), physics ${r.report.physics}, src ${r.fp0}${r.fp0 !== freshFingerprint() ? ` (src is now ${freshFingerprint()})` : ''}, git ${r.report.git}, ${r.started.toISOString()}, wall ${(r.report.wallMs / 1000).toFixed(0)} s`;
  const md = [`# Bot sweep — skills ${skills.map(skillLabel).join(', ')} (${results.length === 1 ? 'one table' : 'one table per skill'})`, '', ...results.flatMap((r) => [header(r), '', r.md, ''])].join('\n');
  writeJson(path.join(METRICS_DIR, 'sweep.json'), { ...first.report, wallMs: results.reduce((a, r) => a + r.report.wallMs, 0), skills, sweeps: results.map((r) => r.report) });
  fs.writeFileSync(path.join(METRICS_DIR, 'sweep.md'), md);
  console.log(`\nsweep: harness/out/metrics/sweep.json (+ sweep.md) skills=${skills.map(skillLabel).join(',')} wall=${(results.reduce((a, r) => a + r.report.wallMs, 0) / 1000).toFixed(0)}s`);
}

async function main(): Promise<void> {
  const { positional, flags } = parseArgs();
  const allTracks = flagBool(flags, 'all-tracks');
  const trackId = positional[0];
  if (!trackId && !allTracks && !flagBool(flags, 'refresh-goldens')) fail('usage: harness/bot/bot.ts <trackId> [--skill 0..3] [--oracle] [--all] [--seeds N] [--budget ms] | --all-tracks | --refresh-goldens [--tracks a,b]');
  const seeds = Math.max(1, flagNum(flags, 'seeds', 1));
  if (flagBool(flags, 'refresh-goldens')) {
    const ids = typeof flags['tracks'] === 'string' ? (flags['tracks'] as string).split(',').map((x) => x.trim()).filter(Boolean) : listSimTracks();
    const verifier = new BrowserVerifier({ dev: flagBool(flags, 'dev'), build: flagBool(flags, 'build'), verbose: flagBool(flags, 'verbose') });
    try {
      console.log(`refresh-goldens: src=${srcFingerprint()} tracks=${ids.length}`);
      const rows = await refreshGoldens(ids, (rec) => verifier.run(rec), (l) => console.log(`  ${l}`));
      const n = (r: string): number => rows.filter((x) => x.result === r).length;
      // A track is covered when at least one of its goldens is proven on this src; stale lower-skill
      // files are leftovers of older physics (the picker ignores them), not a failure by themselves.
      const uncovered = ids.filter((id) => !rows.some((x) => x.trackId === id && x.result !== 'stale'));
      console.log(`refresh-goldens: fresh ${n('fresh')}, restamped ${n('restamped')}, stale ${n('stale')}; tracks with a proven golden ${ids.length - uncovered.length}/${ids.length}${uncovered.length ? ` — re-run pnpm harness:bot <track> for: ${uncovered.join(', ')}` : ''}`);
      if (uncovered.length) process.exitCode = 1;
    } finally {
      await verifier.close();
    }
    return;
  }
  if (allTracks) {
    await sweepAll(flags, seeds);
    return;
  }
  const budget = flags.budget !== undefined ? flagNum(flags, 'budget', 0) : undefined;
  const verify = !flagBool(flags, 'no-verify');
  const verbose = flagBool(flags, 'verbose');
  const skills: Skill[] = flagBool(flags, 'all')
    ? [0, 1, 2, 3, 'oracle']
    : flagBool(flags, 'oracle')
      ? ['oracle']
      : [Math.max(0, Math.min(3, Math.round(flagNum(flags, 'skill', 3)))) as 0 | 1 | 2 | 3];
  const track = trackId!;
  const probe = await createSim(track);
  const baseSeed = flags.seed !== undefined ? flagNum(flags, 'seed', probe.seed) : probe.seed;
  console.log(`bot ${track}: physics=${probe.physicsName} hz=${probe.hz} finishX=${probe.track.finishX} checkpoints=${probe.track.checkpoints.length} skills=[${skills.map(skillLabel).join(',')}] seeds=${seeds}`);

  if (flagBool(flags, 'crash-probe')) {
    const r = await crashProbe(track, baseSeed);
    if (r) console.log(`crash-probe: ${r.reason} at tick ${r.faultTick} (${(r.faultTick / probe.hz).toFixed(2)}s) -> ${r.file}`);
    else console.log(`crash-probe: no non-restart fault within 8 s on ${probe.physicsName} (no crash.json written)`);
  }

  const bySkill = new Map<Skill, RunOnce[]>();
  const runOpts: Parameters<typeof runOnce>[3] = { verbose };
  if (budget !== undefined) runOpts.budgetMs = budget;
  if (flags['max-attempts'] !== undefined) runOpts.maxAttempts = flagNum(flags, 'max-attempts', 50);
  if (flags['max-sim-seconds'] !== undefined) runOpts.maxSimSeconds = flagNum(flags, 'max-sim-seconds', 300);
  if (flags['track-wall-s'] !== undefined) runOpts.maxWallMs = flagNum(flags, 'track-wall-s', 120) * 1000;
  for (const skill of skills) {
    const runs: RunOnce[] = [];
    for (let k = 0; k < seeds; k++) {
      const seed = (baseSeed + k) >>> 0;
      const r = await runOnce(track, seed, skill, runOpts);
      runs.push(r);
      printRunLine(r.report);
    }
    bySkill.set(skill, runs);
  }

  // Golden recordings: best run per skill, browser-verified unless --no-verify.
  let verifier: BrowserVerifier | null = null;
  let anyMismatch = false;
  try {
    for (const [skill, runs] of bySkill) {
      const best = bestOf(runs);
      if (!best) continue;
      if (verify) {
        verifier ??= new BrowserVerifier({ dev: flagBool(flags, 'dev'), build: flagBool(flags, 'build'), verbose });
        const b = await verifier.run(best.recording);
        best.report.browserHash = b.hash;
        best.report.browserVerified = b.hash === best.report.nodeHash;
        if (b.faults !== best.report.attempts - 1) {
          console.error(`  [bot] WARNING browser faults=${b.faults} but node attempts-1=${best.report.attempts - 1} (rule layer drift between harness/lib/rules.ts and src/game/game.ts)`);
        }
        if (!best.report.browserVerified) {
          anyMismatch = true;
          console.error(`MISMATCH skill=${skillLabel(skill)}: node ${best.report.nodeHash} browser ${b.hash} (browser faults=${b.faults} finish=${b.finishTime})`);
        }
        writeJson(path.join(HARNESS_DIR, 'out', 'bot', track, `${best.report.runId}-skill${skillLabel(skill)}.json`), best.report);
      }
      const golden = goldenFile(track, skill);
      if (best.report.outcome === 'finished' && best.report.browserVerified !== false) {
        saveRecording(golden, best.recording);
        console.log(`golden: ${path.relative(process.cwd(), golden)} (attempts=${best.report.attempts} finish=${best.report.finishTime?.toFixed(3)} hash=${best.report.nodeHash} verified=${best.report.browserVerified ?? 'skipped'})`);
      } else {
        console.log(`golden: NOT written for skill=${skillLabel(skill)} (outcome=${best.report.outcome}, verified=${best.report.browserVerified})`);
      }
    }
  } finally {
    await verifier?.close();
  }
  const metrics = updateTrackMetrics(probe, bySkill);
  console.log(
    `metrics: harness/out/metrics/${track}.json curve=[${metrics.curve.map((c) => `${skillLabel(c.skill)}:${c.median}`).join(' ')}] par=${metrics.botParTime ?? 'n/a'} shaped=${metrics.shaped ?? 'n/a'}`,
  );
  if (anyMismatch) process.exitCode = 1;
}

const isEntry = process.argv[1] !== undefined && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname;
if (isEntry) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
