/**
 * The one bot (CONTRACT §3).
 *
 *   pnpm harness:bot <trackId> [--skill 0..3] [--oracle] [--all] [--seeds N] [--budget ms]
 *                    [--max-attempts 50] [--max-sim-seconds 300] [--no-verify] [--crash-probe]
 *                    [--dev] [--build] [--verbose]
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
import { faultsByCheckpoint, median, percentileOf, restartEdges, runMeta } from '../lib/metrics';
import { HARNESS_DIR } from '../lib/paths';
import { saveRecording } from '../lib/recording';
import { fail, writeJson } from '../lib/report';
import type { BotRunReport, Skill, TrackBotMetrics } from '../lib/schema';
import { createSim, type Sim } from '../lib/sim';
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
  const rec = new InputRecorder({ version: 1, trackId: sim.track.id, seed: sim.seed, physicsHz: sim.hz, note });
  for (const f of frames) rec.push(f);
  return rec.toRecording();
}

export interface RunOnce {
  report: BotRunReport;
  recording: InputRecording;
}

export async function runOnce(
  trackId: string,
  seed: number,
  skill: Skill,
  o: { budgetMs?: number; maxAttempts?: number; maxSimSeconds?: number; verbose?: boolean },
): Promise<RunOnce> {
  const started = new Date();
  const sim = await createSim(trackId, seed);
  const config = configFor(skill, o.budgetMs);
  const limits: Partial<{ maxAttempts: number; maxSimSeconds: number }> = {};
  if (o.maxAttempts !== undefined) limits.maxAttempts = o.maxAttempts;
  if (o.maxSimSeconds !== undefined) limits.maxSimSeconds = o.maxSimSeconds;
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
  const replay = fresh.run(res.frames);
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
  console.log(
    `bot ${r.trackId} skill=${skillLabel(r.skill)} seed=${r.seed} attempts=${r.attempts} outcome=${r.outcome} finish=${fin} plans=${r.search.plans} ticks=${fmtTicks(r.search.ticksSimulated)} wall=${(r.wallMs / 1000).toFixed(1)}s verified=${ver}`,
  );
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

async function main(): Promise<void> {
  const { positional, flags } = parseArgs();
  const trackId = positional[0];
  if (!trackId) fail('usage: harness/bot/bot.ts <trackId> [--skill 0..3] [--oracle] [--all] [--seeds N] [--budget ms]');
  const seeds = Math.max(1, flagNum(flags, 'seeds', 1));
  const budget = flags.budget !== undefined ? flagNum(flags, 'budget', 0) : undefined;
  const verify = !flagBool(flags, 'no-verify');
  const verbose = flagBool(flags, 'verbose');
  const skills: Skill[] = flagBool(flags, 'all')
    ? [0, 1, 2, 3, 'oracle']
    : flagBool(flags, 'oracle')
      ? ['oracle']
      : [Math.max(0, Math.min(3, Math.round(flagNum(flags, 'skill', 3)))) as 0 | 1 | 2 | 3];
  const probe = await createSim(trackId);
  const baseSeed = flags.seed !== undefined ? flagNum(flags, 'seed', probe.seed) : probe.seed;
  console.log(`bot ${trackId}: physics=${probe.physicsName} hz=${probe.hz} finishX=${probe.track.finishX} checkpoints=${probe.track.checkpoints.length} skills=[${skills.map(skillLabel).join(',')}] seeds=${seeds}`);

  if (flagBool(flags, 'crash-probe')) {
    const r = await crashProbe(trackId, baseSeed);
    if (r) console.log(`crash-probe: ${r.reason} at tick ${r.faultTick} (${(r.faultTick / probe.hz).toFixed(2)}s) -> ${r.file}`);
    else console.log(`crash-probe: no non-restart fault within 8 s on ${probe.physicsName} (no crash.json written)`);
  }

  const bySkill = new Map<Skill, RunOnce[]>();
  const runOpts: Parameters<typeof runOnce>[3] = { verbose };
  if (budget !== undefined) runOpts.budgetMs = budget;
  if (flags['max-attempts'] !== undefined) runOpts.maxAttempts = flagNum(flags, 'max-attempts', 50);
  if (flags['max-sim-seconds'] !== undefined) runOpts.maxSimSeconds = flagNum(flags, 'max-sim-seconds', 300);
  for (const skill of skills) {
    const runs: RunOnce[] = [];
    for (let k = 0; k < seeds; k++) {
      const seed = (baseSeed + k) >>> 0;
      const r = await runOnce(trackId, seed, skill, runOpts);
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
        writeJson(path.join(HARNESS_DIR, 'out', 'bot', trackId, `${best.report.runId}-skill${skillLabel(skill)}.json`), best.report);
      }
      const golden = goldenFile(trackId, skill);
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
    `metrics: harness/out/metrics/${trackId}.json curve=[${metrics.curve.map((c) => `${skillLabel(c.skill)}:${c.median}`).join(' ')}] par=${metrics.botParTime ?? 'n/a'} shaped=${metrics.shaped ?? 'n/a'}`,
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
