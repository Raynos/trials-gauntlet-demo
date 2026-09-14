/**
 * The reflex bot (a person holding keys): the primary attempts-to-clear instrument.
 *
 *   pnpm harness:reflex <trackId> [--skill novice|average|good] [--seeds 3] [--attempts-cap 50] [--max-sim-seconds 300]
 *                       [--browser N] [--no-verify] [--build] [--dev] [--verbose]
 *   pnpm harness:reflex --all-tracks [--skill average] [--seeds 3] [--tracks a,b]
 *   pnpm harness:reflex --calibrate                      # reflex (average) vs the stranger medians on b1/b2/b3/e1
 *
 * Writes per run  harness/out/reflex/<trackId>/<runId>-<skill>.json (+ .rec.json)   ReflexRunReport + recording
 *        summary  harness/out/metrics/<trackId>.reflex.json                          ReflexTrackMetrics (committed)
 *        table    harness/out/metrics/reflex.md (--all-tracks)                       one row per track
 *        browser  harness/out/reflex/<trackId>/<runId>-browser-<skill>.json (+ .rec.json)   --browser N live runs
 */
import fs from 'node:fs';
import path from 'node:path';
import { InputRecorder, type InputRecording } from '../../src/core/replay';
import type { InputFrame } from '../../src/core/types';
import { flagBool, flagNum, flagStr, parseArgs } from '../lib/args';
import { faultsByCheckpoint, median, runMeta, srcFingerprint } from '../lib/metrics';
import { HARNESS_DIR } from '../lib/paths';
import { saveRecording } from '../lib/recording';
import { fail, writeJson } from '../lib/report';
import type { ReflexDeath, ReflexRunReport, ReflexSkill, ReflexTrackMetrics } from '../lib/schema';
import { createSim, listSimTracks, parseBike, type Sim } from '../lib/sim';
import { DEFAULT_BIKE, type BikeClass } from '../../src/core/types';
import { BrowserVerifier } from '../lib/verify';
import { ReflexBrowser } from './browser';
import { SKILLS, type SkillName } from './controller';
import { playReflex, type ReflexFault } from './play';

export const METRICS_DIR = path.join(HARNESS_DIR, 'out', 'metrics');
const OUT_DIR = path.join(HARNESS_DIR, 'out', 'reflex');
/** The tracks the stranger round judges (gate G10); the calibration targets. */
export const CALIBRATION_TRACKS = ['b1-first-ride', 'b2-lean-back', 'b3-kicker-row', 'e1-uphill-weight'] as const;

/** `<track>.reflex.json` is the Rookie table (as always); Pro lands in `<track>.pro.reflex.json`. */
export function reflexMetricsFile(trackId: string, bike: BikeClass = DEFAULT_BIKE): string {
  return path.join(METRICS_DIR, `${trackId}${bike === DEFAULT_BIKE ? '' : `.${bike}`}.reflex.json`);
}

function bikeSuffix(bike: BikeClass): string {
  return bike === DEFAULT_BIKE ? '' : `-${bike}`;
}

function recordingOf(sim: Sim, frames: InputFrame[], note: string): InputRecording {
  const rec = new InputRecorder({ version: 1, trackId: sim.track.id, seed: sim.seed, physicsHz: sim.hz, bike: sim.bike, note: `${note} bike=${sim.bike} src=${srcFingerprint()}` });
  for (const f of frames) rec.push(f);
  return rec.toRecording();
}

function toDeath(f: ReflexFault): ReflexDeath {
  return { attempt: f.attempt, reason: f.reason, x: f.x, checkpoint: f.checkpoint, runTime: f.runTime, pitchDeg: f.pitchDeg, speed: f.speed, airborne: f.airborne, rule: f.rule, obstacle: f.obstacle, lesson: f.lesson };
}

export interface RunOnce {
  report: ReflexRunReport;
  recording: InputRecording;
}

export async function runOnce(trackId: string, seed: number, skill: SkillName, o: { attemptsCap?: number; maxSimSeconds?: number; verbose?: boolean; bike?: BikeClass }): Promise<RunOnce> {
  const started = new Date();
  const bike = o.bike ?? DEFAULT_BIKE;
  const sim = await createSim(trackId, seed, undefined, { bike });
  const res = playReflex(sim, {
    skill,
    seed,
    ...(o.attemptsCap !== undefined ? { attemptsCap: o.attemptsCap } : {}),
    ...(o.maxSimSeconds !== undefined ? { maxSimSeconds: o.maxSimSeconds } : {}),
    ...(o.verbose ? { log: (l: string) => console.error(`  [reflex] ${l}`) } : {}),
  });
  const recording = recordingOf(sim, res.frames, `reflex skill=${skill} outcome=${res.outcome} attempts=${res.attempts} reaction=${(res.reactionS * 1000).toFixed(0)}ms`);
  // A fresh sim replaying the recording must land on the same state: the frames are the play.
  const fresh = await createSim(trackId, seed, undefined, { bike });
  const replay = fresh.run(res.frames);
  const meta = runMeta('reflex', started, { physics: sim.physicsName, bike });
  const runDir = path.join(OUT_DIR, trackId);
  const report: ReflexRunReport = {
    ...meta,
    kind: 'reflex',
    mode: 'node',
    trackId,
    seed,
    physicsHz: sim.hz,
    skill,
    reactionS: res.reactionS,
    outcome: res.outcome,
    attempts: res.attempts,
    finishTime: res.finishTime,
    maxX: res.maxX,
    progress: sim.track.finishX > 0 ? Math.min(1, res.maxX / sim.track.finishX) : 0,
    simSeconds: res.frames.length / sim.hz,
    deaths: res.faults.map(toDeath),
    faultsByCheckpoint: faultsByCheckpoint(res.faults, sim.track.checkpoints.length),
    rules: res.rules,
    recordingFile: path.join(runDir, `${meta.runId}-${skill}${bikeSuffix(bike)}.rec.json`),
    playHash: res.finalHash,
    replayHash: replay.hash,
    replayFaithful: replay.hash === res.finalHash,
    browserHash: null,
    browserVerified: null,
  };
  if (!report.replayFaithful) console.error(`  [reflex] WARNING replay hash ${replay.hash} != play hash ${res.finalHash} (physics is not deterministic under a straight replay)`);
  saveRecording(report.recordingFile, recording);
  writeJson(path.join(runDir, `${meta.runId}-${skill}${bikeSuffix(bike)}.json`), report);
  return { report, recording };
}

function deathsKey(d: ReflexDeath): { obstacle: string; x: number } {
  return d.obstacle ? { obstacle: `${d.obstacle.kind} @ ${d.obstacle.x.toFixed(1)} m`, x: d.obstacle.x } : { obstacle: `ground @ ${(Math.round(d.x / 5) * 5).toFixed(0)} m`, x: Math.round(d.x / 5) * 5 };
}

export function aggregateDeaths(reports: ReflexRunReport[]): ReflexTrackMetrics['bySkill'][number]['deaths'] {
  const m = new Map<string, ReflexTrackMetrics['bySkill'][number]['deaths'][number]>();
  for (const r of reports) {
    for (const d of r.deaths) {
      const k = deathsKey(d);
      const e = m.get(k.obstacle) ?? { obstacle: k.obstacle, x: k.x, count: 0, reasons: {}, rules: {} };
      e.count++;
      e.reasons[d.reason] = (e.reasons[d.reason] ?? 0) + 1;
      e.rules[d.rule] = (e.rules[d.rule] ?? 0) + 1;
      m.set(k.obstacle, e);
    }
  }
  return [...m.values()].sort((a, b) => b.count - a.count || a.x - b.x);
}

export function printRunLine(r: ReflexRunReport): void {
  const fin = r.finishTime === null ? 'none' : r.finishTime.toFixed(3);
  const first = r.deaths[0];
  const blk = first ? ` first death=${first.reason}@${first.x.toFixed(1)}m${first.obstacle ? `(${first.obstacle.kind}@${first.obstacle.x.toFixed(0)})` : '(ground)'} rule=${first.rule}` : '';
  const live = r.live ? ` clock=${r.live.clock} fps=${r.live.fps.toFixed(1)} wall/frame=${r.live.wallMsPerFrame.toFixed(0)}ms glance=${r.live.glanceMsP50.toFixed(1)}ms keys=${r.live.keyEvents} wall=${r.live.wallS.toFixed(0)}s roundTrip=${r.live.roundTrip ? 'yes' : 'NO'}` : '';
  console.log(
    `reflex ${r.trackId} ${r.mode} skill=${r.skill} seed=${r.seed} react=${(r.reactionS * 1000).toFixed(0)}ms attempts=${r.attempts} outcome=${r.outcome} finish=${fin} maxX=${r.maxX.toFixed(1)} (${(r.progress * 100).toFixed(0)}%) deaths=${r.deaths.length}${blk} replay=${r.replayFaithful ? 'ok' : 'DIVERGES'}${live}`,
  );
}

export function loadTrackMetrics(trackId: string, bike: BikeClass = DEFAULT_BIKE): ReflexTrackMetrics | null {
  const f = reflexMetricsFile(trackId, bike);
  if (!fs.existsSync(f)) return null;
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8')) as ReflexTrackMetrics;
  } catch {
    return null;
  }
}

function updateTrackMetrics(sim: Sim, bySkill: Map<SkillName, ReflexRunReport[]>, browser?: ReflexRunReport[]): ReflexTrackMetrics {
  const prev = loadTrackMetrics(sim.track.id, sim.bike);
  const fp = srcFingerprint();
  const rows = new Map<string, ReflexTrackMetrics['bySkill'][number]>();
  // Rows from an earlier run on the same physics + src survive; a src change starts over.
  if (prev && prev.physics === sim.physicsName && prev.srcFingerprint === fp) for (const r of prev.bySkill) rows.set(r.skill, r);
  for (const [skill, reps] of bySkill) {
    const finishTimes = reps.map((r) => r.finishTime);
    const cleared = finishTimes.filter((t): t is number => t !== null);
    rows.set(skill, {
      skill,
      seeds: reps.map((r) => r.seed),
      attempts: reps.map((r) => r.attempts),
      medianAttempts: median(reps.map((r) => r.attempts)),
      clears: cleared.length,
      finishTimes,
      medianFinishTime: cleared.length ? median(cleared) : null,
      bestX: Math.max(...reps.map((r) => r.maxX)),
      deaths: aggregateDeaths(reps),
      runs: reps.map((r) => r.runId),
    });
  }
  const order: ReflexSkill[] = ['novice', 'average', 'good'];
  const metrics: ReflexTrackMetrics = {
    schema: 1,
    kind: 'track-reflex-metrics',
    trackId: sim.track.id,
    bike: sim.bike,
    tier: sim.track.tier,
    technique: sim.track.meta?.technique ?? '',
    updatedAt: new Date().toISOString(),
    physics: sim.physicsName,
    srcFingerprint: fp,
    attemptsBand: sim.track.meta?.attemptsBand ?? null,
    finishX: sim.track.finishX,
    bySkill: order.map((s) => rows.get(s)).filter((r): r is ReflexTrackMetrics['bySkill'][number] => r !== undefined),
  };
  const b = browser && browser.length ? browser : prev && prev.physics === sim.physicsName && prev.srcFingerprint === fp ? null : null;
  if (b) {
    metrics.browser = {
      runs: b.map((r) => r.runId),
      attempts: b.map((r) => r.attempts),
      medianAttempts: median(b.map((r) => r.attempts)),
      finishTimes: b.map((r) => r.finishTime),
      fps: b.map((r) => r.live?.fps ?? 0),
      roundTrips: b.map((r) => r.live?.roundTrip ?? false),
    };
  } else if (prev?.browser && prev.physics === sim.physicsName && prev.srcFingerprint === fp) {
    metrics.browser = prev.browser;
  }
  writeJson(reflexMetricsFile(sim.track.id, sim.bike), metrics);
  return metrics;
}

export function tableMarkdown(rows: ReflexTrackMetrics[], skill: ReflexSkill): string {
  const lines = [
    `| track | tier | band | attempts (seeds) | median | clears | time to clear (median) | best % | where it died (count · rule) |`,
    `|---|---|---|---|---:|---|---:|---:|---|`,
  ];
  for (const m of rows) {
    const r = m.bySkill.find((s) => s.skill === skill);
    if (!r) continue;
    const deaths = r.deaths
      .slice(0, 3)
      .map((d) => {
        const rule = Object.entries(d.rules).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
        return `${d.obstacle} ×${d.count} (${rule})`;
      })
      .join('; ');
    lines.push(
      `| ${m.trackId} | ${m.tier} | ${m.attemptsBand ? `${m.attemptsBand[0]}–${m.attemptsBand[1]}` : '—'} | ${r.attempts.join(', ')} | ${r.medianAttempts} | ${r.clears}/${r.seeds.length} | ${r.medianFinishTime === null ? '—' : `${r.medianFinishTime.toFixed(1)} s`} | ${((Math.min(1, r.bestX / m.finishX)) * 100).toFixed(0)}% | ${deaths || '—'} |`,
    );
  }
  return lines.join('\n');
}

function parseSkill(flags: ReturnType<typeof parseArgs>['flags']): SkillName {
  const s = flagStr(flags, 'skill', 'average');
  if (!(s in SKILLS)) fail(`--skill: '${s}' is not novice|average|good`);
  return s as SkillName;
}

async function browserRuns(trackId: string, skill: SkillName, n: number, flags: ReturnType<typeof parseArgs>['flags']): Promise<ReflexRunReport[]> {
  const verbose = flagBool(flags, 'verbose');
  const q = flagStr(flags, 'quality', 'low');
  if (q !== 'low' && q !== 'medium' && q !== 'high') fail(`--quality: '${q}' is not low|medium|high`);
  const rb = new ReflexBrowser({
    dev: flagBool(flags, 'dev'),
    build: flagBool(flags, 'build'),
    verbose,
    width: flagNum(flags, 'width', 480),
    height: flagNum(flags, 'height', 270),
    quality: q,
    clock: flagBool(flags, 'wall-clock') ? 'wall' : 'virtual',
    frameMs: flagNum(flags, 'frame-ms', 1000 / 60),
  });
  const out: ReflexRunReport[] = [];
  try {
    const probe = await createSim(trackId);
    for (let k = 0; k < n; k++) {
      const started = new Date();
      const seed = (probe.seed + 1000 + k) >>> 0;
      const r = await rb.play(trackId, {
        skill,
        seed,
        attemptsCap: flagNum(flags, 'attempts-cap', 50),
        maxWallS: flagNum(flags, 'max-wall-s', 400),
        ...(verbose ? { log: (l: string) => console.error(`  [reflex:browser] ${l}`) } : {}),
      });
      const meta = runMeta('reflex', started, { physics: probe.physicsName });
      const runDir = path.join(OUT_DIR, trackId);
      const report: ReflexRunReport = {
        ...meta,
        kind: 'reflex',
        mode: 'browser',
        trackId,
        seed,
        physicsHz: r.fullRecording.header.physicsHz,
        skill,
        reactionS: r.reactionS,
        outcome: r.outcome,
        attempts: r.attempts,
        finishTime: r.finishTime,
        maxX: r.maxX,
        progress: probe.track.finishX > 0 ? Math.min(1, r.maxX / probe.track.finishX) : 0,
        simSeconds: r.live.wallS,
        deaths: r.faults.map(toDeath),
        faultsByCheckpoint: faultsByCheckpoint(r.faults, probe.track.checkpoints.length),
        rules: r.rules,
        recordingFile: path.join(runDir, `${meta.runId}-browser-${skill}.rec.json`),
        playHash: r.browserHash,
        replayHash: r.replayHash,
        replayFaithful: r.roundTrip,
        browserHash: r.browserHash,
        browserVerified: r.roundTrip,
        live: { ...r.live, roundTrip: r.roundTrip },
      };
      saveRecording(report.recordingFile, { ...r.fullRecording, header: { ...r.fullRecording.header, note: `${r.fullRecording.header.note ?? ''} src=${srcFingerprint()}` } });
      writeJson(path.join(runDir, `${meta.runId}-browser-${skill}.json`), report);
      printRunLine(report);
      if (!r.roundTrip) console.error(`  [reflex:browser] MISMATCH node replay ${r.replayHash} vs browser live ${r.browserHash} (startTick=${r.live.startTick})`);
      out.push(report);
    }
  } finally {
    await rb.close();
  }
  return out;
}

async function runTrack(trackId: string, skills: SkillName[], seeds: number, flags: ReturnType<typeof parseArgs>['flags'], bike: BikeClass = DEFAULT_BIKE): Promise<{ metrics: ReflexTrackMetrics; runs: RunOnce[] }> {
  const probe = await createSim(trackId, undefined, undefined, { bike });
  const baseSeed = flags.seed !== undefined ? flagNum(flags, 'seed', probe.seed) : probe.seed;
  const o = { attemptsCap: flagNum(flags, 'attempts-cap', 50), maxSimSeconds: flagNum(flags, 'max-sim-seconds', 300), verbose: flagBool(flags, 'verbose'), bike };
  const bySkill = new Map<SkillName, ReflexRunReport[]>();
  const all: RunOnce[] = [];
  for (const skill of skills) {
    const reps: ReflexRunReport[] = [];
    for (let k = 0; k < seeds; k++) {
      const r = await runOnce(trackId, (baseSeed + k) >>> 0, skill, o);
      printRunLine(r.report);
      reps.push(r.report);
      all.push(r);
    }
    bySkill.set(skill, reps);
  }
  // Browser verification of one recording (the best finished run) through runRecording: node hash == browser hash.
  if (!flagBool(flags, 'no-verify') && !flagBool(flags, 'all-tracks')) {
    const best = [...all].sort((a, b) => (a.report.outcome === 'finished' ? 0 : 1) - (b.report.outcome === 'finished' ? 0 : 1) || a.report.attempts - b.report.attempts)[0];
    if (best) {
      const v = new BrowserVerifier({ dev: flagBool(flags, 'dev'), build: flagBool(flags, 'build'), verbose: flagBool(flags, 'verbose') });
      try {
        const b = await v.run(best.recording);
        best.report.browserHash = b.hash;
        best.report.browserVerified = b.hash === best.report.playHash;
        writeJson(path.join(OUT_DIR, trackId, `${best.report.runId}-${best.report.skill}${bikeSuffix(bike)}.json`), best.report);
        console.log(`verify: ${best.report.runId} skill=${best.report.skill} bike=${bike} node ${best.report.playHash} browser ${b.hash} ${best.report.browserVerified ? 'IDENTICAL' : 'MISMATCH'} (browser faults=${b.faults}, attempts-1=${best.report.attempts - 1})`);
        if (!best.report.browserVerified) process.exitCode = 1;
      } finally {
        await v.close();
      }
    }
  }
  const nBrowser = flagNum(flags, 'browser', 0);
  if (nBrowser > 0 && bike !== DEFAULT_BIKE) fail(`--browser drives the live game on its default bike; --bike ${bike} is node-only for now`);
  const browser = nBrowser > 0 ? await browserRuns(trackId, skills[0]!, nBrowser, flags) : undefined;
  const metrics = updateTrackMetrics(probe, bySkill, browser);
  return { metrics, runs: all };
}

/** Calibration: reflex `average` medians next to the stranger medians (any src) on the four judged tracks. */
export function calibrationMarkdown(tracks: readonly string[], skill: ReflexSkill = 'average'): string {
  const lines = [
    `| track | band | stranger median attempts (sessions, src) | reflex ${skill} median (seeds) | ratio | stranger time to clear | reflex time to clear | stranger deaths (top) | reflex deaths (top) |`,
    `|---|---|---|---|---:|---:|---:|---|---|`,
  ];
  for (const id of tracks) {
    const sf = path.join(METRICS_DIR, `${id}.stranger.json`);
    const rf = loadTrackMetrics(id);
    const r = rf?.bySkill.find((s) => s.skill === skill);
    let stranger: { median: number | null; n: number; src: string; time: number | null; deaths: string } = { median: null, n: 0, src: '—', time: null, deaths: '—' };
    if (fs.existsSync(sf)) {
      const s = JSON.parse(fs.readFileSync(sf, 'utf8')) as {
        srcFingerprint?: string;
        medianAttempts?: number | null;
        medianFinishTime?: number | null;
        sessions: Array<{ status: string; strangerAttempts: number; finishTime?: number | null; srcFingerprint?: string | null }>;
        deaths?: { byObstacle?: Array<{ obstacle: string; count: number }> };
      };
      const done = s.sessions.filter((x) => x.status === 'done');
      const att = done.map((x) => x.strangerAttempts);
      const times = done.map((x) => x.finishTime).filter((t): t is number => typeof t === 'number');
      const deaths = (s.deaths?.byObstacle ?? []).slice(0, 3).map((d) => `${d.obstacle} ×${d.count}`);
      const srcs = [...new Set(done.map((x) => x.srcFingerprint ?? '?'))];
      stranger = {
        median: att.length ? median(att) : (s.medianAttempts ?? null),
        n: done.length,
        src: srcs.join('/'),
        time: times.length ? median(times) : (s.medianFinishTime ?? null),
        deaths: deaths.join('; ') || '—',
      };
    }
    const band = rf?.attemptsBand;
    const ratio = stranger.median && r ? (r.medianAttempts / stranger.median).toFixed(2) : '—';
    lines.push(
      `| ${id} | ${band ? `${band[0]}–${band[1]}` : '—'} | ${stranger.median ?? '—'} (${stranger.n}, ${stranger.src}) | ${r ? `${r.medianAttempts} (${r.attempts.join(', ')})` : '—'} | ${ratio} | ${stranger.time === null ? '—' : `${stranger.time.toFixed(1)} s`} | ${r?.medianFinishTime == null ? '—' : `${r.medianFinishTime.toFixed(1)} s`} | ${stranger.deaths} | ${r ? r.deaths.slice(0, 3).map((d) => `${d.obstacle} ×${d.count}`).join('; ') || '—' : '—'} |`,
    );
  }
  return lines.join('\n');
}

async function main(): Promise<void> {
  const { positional, flags } = parseArgs();
  const seeds = Math.max(1, flagNum(flags, 'seeds', 3));
  const skill = parseSkill(flags);
  if (flagBool(flags, 'calibrate')) {
    console.log(calibrationMarkdown(CALIBRATION_TRACKS, skill));
    return;
  }
  const bikeFlag = flags.bike;
  const bikes: BikeClass[] = bikeFlag === 'both' || bikeFlag === 'rookie,pro' ? ['rookie', 'pro'] : [parseBike(bikeFlag)];
  if (flagBool(flags, 'all-tracks')) {
    const only = typeof flags.tracks === 'string' ? flags.tracks.split(',') : null;
    const ids = listSimTracks().filter((id) => !only || only.includes(id));
    const started = new Date();
    const sections: string[] = [];
    for (const bike of bikes) {
      const rows: ReflexTrackMetrics[] = [];
      const t0 = new Date();
      console.log(`reflex sweep: bike=${bike} skill=${skill} seeds=${seeds} src=${srcFingerprint()} tracks=${ids.length}`);
      for (const id of ids) rows.push((await runTrack(id, [skill], seeds, flags, bike)).metrics);
      sections.push(
        [
          `## ${bike === 'pro' ? 'Pro' : 'Rookie'} bike — skill ${skill}, ${seeds} seed(s), physics ${rows[0]?.physics ?? '?'}, src ${srcFingerprint()}, ${t0.toISOString()}, wall ${((Date.now() - t0.getTime()) / 1000).toFixed(0)} s`,
          '',
          tableMarkdown(rows, skill),
          '',
        ].join('\n'),
      );
      console.log(`\n${tableMarkdown(rows, skill)}`);
    }
    const md = [
      `# Reflex bot — skill ${skill}, ${seeds} seed(s), bikes ${bikes.join(' + ')}, src ${srcFingerprint()}, ${started.toISOString()}, wall ${((Date.now() - started.getTime()) / 1000).toFixed(0)} s`,
      '',
      `Reaction ${SKILLS[skill].reactionS.map((s) => `${(s * 1000).toFixed(0)}`).join('–')} ms, glances ${SKILLS[skill].perceiveHz} Hz, pitch noise ±${SKILLS[skill].pitchNoiseDeg}°, speed noise ±${(SKILLS[skill].speedNoiseFrac * 100).toFixed(0)}%, taps ${(SKILLS[skill].tapS * 1000).toFixed(0)} ms, lapses every ~${SKILLS[skill].lapseMeanS} s. attempts = 1 + faults (all reasons); cap ${flagNum(flags, 'attempts-cap', 50)}; sim cap ${flagNum(flags, 'max-sim-seconds', 300)} s. Rookie = \`<track>.reflex.json\`, Pro = \`<track>.pro.reflex.json\`; the band is authored for the tier's default bike.`,
      '',
      ...sections,
      `## Calibration against the stranger sessions (Rookie)`,
      '',
      calibrationMarkdown(CALIBRATION_TRACKS, skill),
      '',
    ].join('\n');
    fs.writeFileSync(path.join(METRICS_DIR, 'reflex.md'), md);
    console.log(`\nreflex sweep: harness/out/metrics/reflex.md bikes=${bikes.join(',')} wall=${((Date.now() - started.getTime()) / 1000).toFixed(0)}s`);
    return;
  }
  const trackId = positional[0];
  if (!trackId) fail('usage: harness/reflex/reflex.ts <trackId> [--skill novice|average|good] [--seeds N] [--attempts-cap 50] [--browser N] | --all-tracks | --calibrate');
  const skills: SkillName[] = flagBool(flags, 'all-skills') ? ['novice', 'average', 'good'] : [skill];
  const bike = bikes.length === 1 ? bikes[0]! : fail('--bike both is for --all-tracks; pick rookie or pro for one track');
  const { metrics } = await runTrack(trackId, skills, seeds, flags, bike);
  console.log(`\n${tableMarkdown([metrics], skills[0]!)}`);
  console.log(`metrics: ${path.relative(process.cwd(), reflexMetricsFile(trackId, bike))} ${metrics.bySkill.map((s) => `${s.skill}:${s.medianAttempts}`).join(' ')}${metrics.browser ? ` browser:${metrics.browser.medianAttempts} (fps ${metrics.browser.fps.map((f) => f.toFixed(0)).join('/')}, roundTrip ${metrics.browser.roundTrips.every(Boolean) ? 'all' : 'SOME FAIL'})` : ''}`);
}

const isEntry = process.argv[1] !== undefined && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname;
if (isEntry) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
