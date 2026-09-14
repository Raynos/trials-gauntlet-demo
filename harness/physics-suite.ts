/**
 * Physics acceptance suite — every instrument the harness owns, against whatever
 * `src/physics` exports right now, in one command, one JSON + one markdown.
 *
 *   pnpm harness:physics-suite [--bike rookie|pro|both] [--tag v1] [--quick] [--build]
 *                              [--skip feel,sweep,clears,reflex,clip,stranger] [--out harness/out/physics-suite]
 *
 * Sections (each PASS/FAIL/INFO, the exit code is the number of FAILs):
 *   identity      physics implementation name, src fingerprint, git, bike classes exported
 *   feel          `vitest run src/physics`: the `FEEL <quantity> = <value> [band]` lines, band-checked where the band parses
 *   determinism   D1–D8 (+ D4c foreign snapshot) on the fingerprint-matched flat-test golden per class, plus the
 *                 snapshot-probe (rollouts + restore never change the next tick)
 *   sweep         the naive track sweep: bot skill 2, one seed, wall-capped, every registered track (best %, clears, first blocker)
 *   clears        bot skill 3 on b1/e1/m1/h1/x1 (attempts, finish), each golden browser-verified (node hash == page hash)
 *   reflex        reflex bot `average`, 3 seeds, b1–e3: attempts per seed, median, clears, deaths
 *   camera        harness:clip on the b3 golden: the per-frame camera box assertion (bike inside [0.2, 0.8], no roll)
 *   stranger      stranger CLI smoke on flat-test: start, look, play, crash → auto-respawn, restart, reset, status; the session
 *                 recording replays node == browser; the session is removed afterwards (never a stranger result)
 *
 * `--bike both` runs determinism / clears / reflex on both classes (sweep on the default class only unless
 * `--sweep-bike pro`). `--quick` shortens the walls (bot 90 s per run, sweep 30 s per track, 2 reflex seeds,
 * clip at 20 fps low). Output: `<out>/<stamp>-<physics>-<tag>.{json,md}` and `<out>/latest.{json,md}`.
 *
 * To accept physics v2 side by side with v1: run once on v1, once on v2, diff the two JSONs (same tag scheme).
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DEFAULT_BIKE, type BikeClass } from '../src/core/types';
import { flagBool, flagNum, flagStr, parseArgs } from './lib/args';
import { runOnce as botRunOnce, sweep as botSweep } from './bot/bot';
import { runDeterminism } from './gate/determinism';
import { snapshotProbe } from './gate/snapshot-probe';
import { chooseGolden } from './lib/golden';
import { median, runMeta, srcFingerprint } from './lib/metrics';
import { HARNESS_DIR, REPO_ROOT } from './lib/paths';
import { loadRecording } from './lib/recording';
import { writeJson } from './lib/report';
import type { DeterminismReport, ReflexRunReport, RunMeta, SweepRow } from './lib/schema';
import { createSim, parseBike } from './lib/sim';
import { BrowserVerifier } from './lib/verify';
import { runOnce as reflexRunOnce } from './reflex/reflex';

type Verdict = 'PASS' | 'FAIL' | 'INFO' | 'SKIP';

interface SuiteCheck {
  section: string;
  id: string;
  verdict: Verdict;
  value: number | string | boolean | null;
  note: string;
}

interface FeelLine {
  name: string;
  value: number | string;
  band: string;
  /** null = band not machine-readable (info). */
  pass: boolean | null;
}

interface SuiteReport extends RunMeta {
  kind: 'physics-suite';
  tag: string;
  bikes: BikeClass[];
  quick: boolean;
  identity: { physics: string; srcFingerprint: string; bikeClasses: string[]; loadTrackOpts: boolean };
  feel: { lines: FeelLine[]; vitest: { passed: number; failed: number; exitCode: number | null } } | null;
  determinism: Array<{ bike: BikeClass; golden: string | null; fresh: boolean | null; report: DeterminismReport | null; probe: { pass: boolean; note: string } | null }>;
  sweep: { bike: BikeClass; skill: number; trackWallS: number; rows: SweepRow[] } | null;
  clears: Array<{ bike: BikeClass; trackId: string; attempts: number; outcome: string; finishTime: number | null; maxX: number; progress: number; nodeHash: string; browserHash: string | null; verified: boolean | null; wallS: number }>;
  reflex: Array<{ bike: BikeClass; trackId: string; band: [number, number] | null; attempts: number[]; median: number; clears: number; seeds: number; medianFinish: number | null; deaths: string[] }>;
  camera: { trackId: string; golden: string | null; pass: boolean | null; line: string | null; clip: string | null } | null;
  stranger: { sessionId: string; steps: Array<{ cmd: string; ok: boolean; ms: number; summary: string }>; pass: boolean } | null;
  checks: SuiteCheck[];
  failed: number;
  pass: boolean;
  loadavg: { start: number[]; end: number[]; cores: number };
}

const CLEAR_TRACKS = ['b1-first-ride', 'e1-uphill-weight', 'm1-hop-up', 'h1-wheelie-wire', 'x1-vertical-limit'] as const;
const REFLEX_TRACKS = ['b1-first-ride', 'b2-lean-back', 'b3-kicker-row', 'e1-uphill-weight', 'e2-rear-wheel-first', 'e3-stairway'] as const;
const CAMERA_TRACK = 'b3-kicker-row';

function stamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
}

function run(cmd: string, args: string[], opts: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number } = {}): Promise<{ code: number | null; stdout: string; stderr: string; ms: number }> {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const child = spawn(cmd, args, { cwd: opts.cwd ?? REPO_ROOT, env: { ...process.env, ...(opts.env ?? {}) }, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d: Buffer) => (stdout += d.toString()));
    child.stderr.on('data', (d: Buffer) => (stderr += d.toString()));
    const timer = opts.timeoutMs ? setTimeout(() => child.kill('SIGKILL'), opts.timeoutMs) : null;
    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      resolve({ code, stdout, stderr, ms: performance.now() - t0 });
    });
  });
}

const TSX = path.join(REPO_ROOT, 'node_modules', '.bin', 'tsx');

/** `[a-b]`, `[< x]`, `[<= x]`, `[> x]`, `[>= x]`, `[|q| < x]`, `[x-y unit]`; anything else (`info`, prose) → null. */
export function bandPass(value: number | string, band: string): boolean | null {
  if (typeof value !== 'number') return null;
  const b = band.trim();
  if (/^info\b/i.test(b)) return null;
  const abs = /^\|[^|]+\|\s*(<=?|>=?)\s*(-?[\d.]+)/.exec(b);
  if (abs) return cmp(Math.abs(value), abs[1]!, Number(abs[2]));
  const rel = /^(<=?|>=?)\s*(-?[\d.]+)/.exec(b);
  if (rel) return cmp(value, rel[1]!, Number(rel[2]));
  const range = /^(-?[\d.]+)\s*[-–]\s*(-?[\d.]+)/.exec(b);
  if (range) return value >= Number(range[1]) && value <= Number(range[2]);
  return null;
}

function cmp(v: number, op: string, x: number): boolean {
  return op === '<' ? v < x : op === '<=' ? v <= x : op === '>' ? v > x : v >= x;
}

export function parseFeelLines(text: string): FeelLine[] {
  const out: FeelLine[] = [];
  for (const m of text.matchAll(/^FEEL\s+(\S+)\s*=\s*(.+?)\s*\[(.*)\]\s*$/gm)) {
    const raw = m[2]!.trim();
    const num = Number(raw);
    const value: number | string = Number.isFinite(num) && /^-?[\d.]+$/.test(raw) ? num : raw;
    out.push({ name: m[1]!, value, band: m[3]!, pass: bandPass(value, m[3]!) });
  }
  return out;
}

async function main(): Promise<void> {
  const { flags } = parseArgs();
  const started = new Date();
  const quick = flagBool(flags, 'quick');
  const tag = flagStr(flags, 'tag', 'v1');
  const bikes: BikeClass[] = flags.bike === 'both' ? ['rookie', 'pro'] : [parseBike(flags.bike)];
  const skip = new Set(typeof flags.skip === 'string' ? flags.skip.split(',').map((s) => s.trim()) : []);
  const outDir = path.resolve(flagStr(flags, 'out', path.join(HARNESS_DIR, 'out', 'physics-suite')));
  fs.mkdirSync(outDir, { recursive: true });
  const checks: SuiteCheck[] = [];
  const check = (c: SuiteCheck): void => {
    checks.push(c);
    const v = typeof c.value === 'number' ? (Number.isInteger(c.value) ? String(c.value) : c.value.toFixed(3)) : String(c.value);
    console.log(`${c.verdict.padEnd(4)}  ${`${c.section}.${c.id}`.padEnd(40)} ${v}${c.note ? `  ${c.note}` : ''}`);
  };
  const loadStart = os.loadavg();
  console.log(`physics-suite: tag=${tag} bikes=${bikes.join(',')} quick=${quick} src=${srcFingerprint()} loadavg=${loadStart.map((x) => x.toFixed(1)).join('/')} cores=${os.cpus().length}`);

  // identity
  const probe = await createSim('flat-test');
  const physMod = (await import('../src/physics')) as unknown as Record<string, unknown>;
  const bikeClasses = Array.isArray(physMod.BIKE_CLASSES) ? (physMod.BIKE_CLASSES as string[]) : [];
  const identity = { physics: probe.physicsName, srcFingerprint: srcFingerprint(), bikeClasses, loadTrackOpts: bikeClasses.length > 0 };
  check({ section: 'identity', id: 'physics', verdict: 'INFO', value: identity.physics, note: `src ${identity.srcFingerprint}; bike classes exported: ${bikeClasses.join(',') || 'none'}` });
  for (const b of bikes) {
    if (b !== DEFAULT_BIKE && !bikeClasses.includes(b)) check({ section: 'identity', id: `bike.${b}`, verdict: 'FAIL', value: false, note: `src/physics does not export BIKE_CLASSES containing '${b}'` });
  }

  const verifier = new BrowserVerifier({ build: flagBool(flags, 'build'), verbose: flagBool(flags, 'verbose') });
  const report: Partial<SuiteReport> = { identity, determinism: [], clears: [], reflex: [], feel: null, sweep: null, camera: null, stranger: null };
  try {
    // feel
    if (!skip.has('feel')) {
      const r = await run(path.join(REPO_ROOT, 'node_modules', '.bin', 'vitest'), ['run', 'src/physics', '--reporter=basic'], { timeoutMs: 15 * 60_000 });
      const lines = parseFeelLines(r.stdout + '\n' + r.stderr);
      const passed = Number(/(\d+) passed/.exec(r.stdout + r.stderr)?.[1] ?? 0);
      const failed = Number(/(\d+) failed/.exec(r.stdout + r.stderr)?.[1] ?? 0);
      report.feel = { lines, vitest: { passed, failed, exitCode: r.code } };
      const inBand = lines.filter((l) => l.pass === true).length;
      const outBand = lines.filter((l) => l.pass === false);
      check({ section: 'feel', id: 'vitest', verdict: r.code === 0 ? 'PASS' : 'FAIL', value: `${passed} passed, ${failed} failed`, note: `src/physics tests exit ${r.code} (${(r.ms / 1000).toFixed(0)} s)` });
      check({ section: 'feel', id: 'envelope', verdict: outBand.length ? 'FAIL' : lines.length ? 'PASS' : 'INFO', value: `${inBand}/${lines.filter((l) => l.pass !== null).length} in band, ${lines.filter((l) => l.pass === null).length} info`, note: outBand.length ? `out of band: ${outBand.map((l) => `${l.name}=${typeof l.value === 'number' ? l.value.toFixed(3) : l.value} [${l.band}]`).join('; ')}` : `${lines.length} FEEL lines` });
    }

    // determinism per class: fingerprint-matched flat-test golden, D1–D8 + D4c, plus the snapshot probe
    for (const bike of bikes) {
      const g = chooseGolden('flat-test', bike);
      if (!g) {
        report.determinism!.push({ bike, golden: null, fresh: null, report: null, probe: null });
        check({ section: 'determinism', id: bike, verdict: 'FAIL', value: null, note: `no ${bike} golden under harness/inputs/flat-test/ (pnpm harness:bot flat-test --bike ${bike})` });
        continue;
      }
      const rec = loadRecording(g.file);
      if (!rec.header.bike) rec.header.bike = bike;
      const det = await runDeterminism(rec, g.file, { loads: quick ? 2 : 3, pin: false, verifier, log: (l) => console.log(`      ${l}`) });
      const pr = await snapshotProbe(rec, 15, 600);
      report.determinism!.push({ bike, golden: g.file, fresh: g.fresh, report: det, probe: { pass: pr.pass, note: pr.note } });
      const ids = det.checks.map((c) => `${c.id}${c.pass ? '' : '!'}`).join(' ');
      check({ section: 'determinism', id: `${bike}.D1-D8`, verdict: det.pass ? 'PASS' : 'FAIL', value: `${det.checks.filter((c) => c.pass).length}/${det.checks.length}`, note: `${path.basename(g.file)}${g.fresh ? '' : ` (STALE src=${g.stamp ?? 'unstamped'})`} ${ids}` });
      check({ section: 'determinism', id: `${bike}.snapshot-probe`, verdict: pr.pass ? 'PASS' : 'FAIL', value: pr.divergedAt ?? pr.ticks, note: pr.note });
    }

    // naive sweep (default class unless --sweep-bike)
    if (!skip.has('sweep')) {
      const sweepBike = parseBike(flags['sweep-bike'], bikes[0]!);
      const wall = flagNum(flags, 'sweep-wall-s', quick ? 30 : 90);
      const sw = await botSweep({ 'track-wall-s': String(wall), bike: sweepBike, ...(typeof flags.tracks === 'string' ? { tracks: flags.tracks } : {}) }, 1, 2);
      report.sweep = { bike: sweepBike, skill: 2, trackWallS: wall, rows: sw.report.rows };
      const clears = sw.report.rows.filter((r) => r.clears > 0).length;
      const blocked = sw.report.rows.filter((r) => r.clears === 0).map((r) => `${r.trackId} ${r.bestPct.toFixed(0)}%${r.firstBlocker ? ` @${r.firstBlocker.x.toFixed(0)}m ${r.firstBlocker.reason}` : ''}`);
      check({ section: 'sweep', id: `${sweepBike}.skill2`, verdict: 'INFO', value: `${clears}/${sw.report.rows.length} tracks cleared`, note: `${wall} s wall per track, 1 seed${blocked.length ? `; not cleared: ${blocked.join(', ')}` : ''}` });
    }

    // bot skill-3 clears on the five representative tracks, browser-verified
    const botWall = flagNum(flags, 'bot-wall-s', quick ? 90 : 600);
    for (const bike of skip.has('clears') ? [] : bikes) {
      for (const trackId of CLEAR_TRACKS) {
        const t0 = performance.now();
        const seed = (await createSim(trackId)).seed;
        const r = await botRunOnce(trackId, seed, 3, { maxWallMs: botWall * 1000, bike });
        let browserHash: string | null = null;
        let verified: boolean | null = null;
        if (r.report.outcome === 'finished') {
          const b = await verifier.run(r.recording);
          browserHash = b.hash;
          verified = b.hash === r.report.nodeHash;
        }
        const row = { bike, trackId, attempts: r.report.attempts, outcome: r.report.outcome, finishTime: r.report.finishTime, maxX: r.report.maxX, progress: r.report.progress, nodeHash: r.report.nodeHash, browserHash, verified, wallS: (performance.now() - t0) / 1000 };
        report.clears!.push(row);
        const cleared = r.report.outcome === 'finished';
        check({
          section: 'clears',
          id: `${bike}.${trackId.split('-')[0]}`,
          verdict: cleared && verified !== false ? 'PASS' : cleared ? 'FAIL' : 'INFO',
          value: cleared ? `${r.report.attempts} attempt(s), ${r.report.finishTime?.toFixed(3)} s` : `${r.report.outcome} at ${(r.report.progress * 100).toFixed(0)}%`,
          note: `${cleared ? `node ${r.report.nodeHash} browser ${browserHash} ${verified ? 'IDENTICAL' : 'MISMATCH'}; ` : ''}${row.wallS.toFixed(0)} s wall${r.report.playReplayDivergence ? `; PLAY/REPLAY DIVERGENCE at tick ${r.report.playReplayDivergence.tick}` : ''}`,
        });
      }
    }

    // reflex average, b1–e3
    const seeds = quick ? 2 : 3;
    for (const bike of skip.has('reflex') ? [] : bikes) {
      for (const trackId of REFLEX_TRACKS) {
        const sim = await createSim(trackId, undefined, undefined, { bike });
        const reps: ReflexRunReport[] = [];
        for (let k = 0; k < seeds; k++) reps.push((await reflexRunOnce(trackId, (sim.seed + k) >>> 0, 'average', { bike })).report);
        const attempts = reps.map((r) => r.attempts);
        const fin = reps.map((r) => r.finishTime).filter((t): t is number => t !== null);
        const deaths = new Map<string, number>();
        for (const r of reps) for (const d of r.deaths) {
          const key = `${d.obstacle ? d.obstacle.kind : d.reason} @ ${d.x.toFixed(0)} m`;
          deaths.set(key, (deaths.get(key) ?? 0) + 1);
        }
        const top = [...deaths.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => `${k} ×${n}`);
        const band = sim.track.meta?.attemptsBand ?? null;
        const med = median(attempts);
        report.reflex!.push({ bike, trackId, band, attempts, median: med, clears: fin.length, seeds, medianFinish: fin.length ? median(fin) : null, deaths: top });
        const within = band ? med <= 1.5 * band[1] : null;
        check({
          section: 'reflex',
          id: `${bike}.${trackId.split('-')[0]}`,
          verdict: bike !== DEFAULT_BIKE ? 'INFO' : within === false || fin.length < seeds ? 'FAIL' : 'PASS',
          value: `${attempts.join(',')} → ${med}`,
          note: `band ${band ? `${band[0]}–${band[1]}` : '—'}, ${fin.length}/${seeds} cleared${fin.length ? `, ${median(fin).toFixed(1)} s` : ''}${top.length ? `; died: ${top.join('; ')}` : ''}${bike !== DEFAULT_BIKE ? ' (Pro: informational, the band is Rookie’s)' : ''}`,
        });
      }
    }

    // camera box on the b3 golden (child process: the clip renderer)
    if (!skip.has('clip')) {
      const g = chooseGolden(CAMERA_TRACK, DEFAULT_BIKE);
      const clipDir = path.join(outDir, 'clip-' + CAMERA_TRACK);
      const args = [path.join(HARNESS_DIR, 'clip.ts'), CAMERA_TRACK, '--out', clipDir, '--fps', quick ? '20' : '30', '--quality', quick ? 'low' : 'high'];
      if (g) args.push('--recording', g.file);
      const r = await run(TSX, args, { timeoutMs: 40 * 60_000 });
      const line = /^camera: .*$/m.exec(r.stdout + r.stderr)?.[0] ?? null;
      const pass = line ? line.startsWith('camera: PASS') : null;
      report.camera = { trackId: CAMERA_TRACK, golden: g?.file ?? null, pass, line, clip: fs.existsSync(path.join(clipDir, 'clip.mp4')) ? path.join(clipDir, 'clip.mp4') : null };
      check({ section: 'camera', id: CAMERA_TRACK.split('-')[0]!, verdict: pass === true ? 'PASS' : pass === false ? 'FAIL' : 'FAIL', value: pass, note: line ? `${line.slice(0, 220)} (${(r.ms / 1000).toFixed(0)} s)` : `no camera line; clip exit ${r.code}: ${(r.stderr || r.stdout).trim().split('\n').slice(-2).join(' | ')}` });
    }

    // stranger-readiness smoke: the CLI a fresh agent would drive, end to end, on flat-test
    if (!skip.has('stranger')) {
      const sessionId = `physics-suite-${stamp(started)}`;
      const steps: SuiteReport['stranger'] extends infer T ? (T extends { steps: infer S } ? S : never) : never = [];
      const cli = path.join(HARNESS_DIR, 'stranger', 'cli.ts');
      const call = async (label: string, args: string[]): Promise<boolean> => {
        const r = await run(TSX, [cli, ...args, '--track', 'flat-test', '--session', sessionId, '--agent', 'physics-suite'], { timeoutMs: 120_000 });
        let summary = '';
        let ok = r.code === 0;
        try {
          const last = r.stdout.trim().split('\n').filter((l) => l.startsWith('{')).pop();
          const j = last ? (JSON.parse(last) as Record<string, unknown>) : null;
          if (j && 'error' in j) ok = false;
          summary = j ? Object.entries(j).filter(([k]) => ['x', 'phase', 'attempts', 'faulted', 'finished', 'finishTime', 'cleared', 'strangerAttempts', 'error', 'sessionId', 'runTime'].includes(k)).map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : String(v)}`).join(' ') : (r.stderr || r.stdout).trim().split('\n').pop() ?? '';
        } catch {
          summary = (r.stdout + r.stderr).trim().split('\n').pop() ?? '';
        }
        steps.push({ cmd: label, ok, ms: r.ms, summary: summary.slice(0, 200) });
        return ok;
      };
      let ok = await call('start', ['start']);
      ok = (await call('look', ['look'])) && ok;
      ok = (await call('play g8 gb4 c2', ['play', 'g8 gb4 c2'])) && ok;
      ok = (await call('play gb40 (crash → auto-respawn)', ['play', 'gb40'])) && ok;
      ok = (await call('restart', ['restart'])) && ok;
      ok = (await call('play g16', ['play', 'g16'])) && ok;
      ok = (await call('reset', ['reset'])) && ok;
      ok = (await call('status', ['status'])) && ok;
      // `done` is deliberately not called: it merges the session into the committed out/metrics/<track>.stranger.json,
      // and a smoke session is not a stranger result. The session dir itself is removed below for the same reason.
      // The session recording must replay in node to the same state the CLI left (D3-in-node).
      const recFile = path.join(HARNESS_DIR, 'inputs', 'flat-test', `stranger-${sessionId}.json`);
      let replayNote = 'no recording written';
      if (fs.existsSync(recFile)) {
        const rec = loadRecording(recFile);
        const sim = await createSim(rec.header.trackId, rec.header.seed, rec.header.physicsHz, { bike: rec.header.bike });
        const { expandFrames } = await import('../src/core/replay');
        const res = sim.run(expandFrames(rec));
        const b = await verifier.run(rec);
        const same = b.hash === res.hash;
        ok = ok && same;
        replayNote = `${res.ticks} ticks, node ${res.hash} browser ${b.hash} ${same ? 'IDENTICAL' : 'MISMATCH'}`;
        // Keep the tree clean: the smoke session's recording is not a stranger result.
        fs.rmSync(recFile);
      }
      const sessionDir = path.join(HARNESS_DIR, 'out', 'stranger', 'flat-test', sessionId);
      if (sessionId.startsWith('physics-suite-') && fs.existsSync(sessionDir)) fs.rmSync(sessionDir, { recursive: true });
      report.stranger = { sessionId, steps, pass: ok };
      check({ section: 'stranger', id: 'smoke', verdict: ok ? 'PASS' : 'FAIL', value: `${steps.filter((s) => s.ok).length}/${steps.length} calls ok`, note: `${steps.map((s) => `${s.cmd.split(' ')[0]}${s.ok ? '' : '!'}`).join(' ')}; ${replayNote}` });
    }
  } finally {
    await verifier.close();
  }

  const failed = checks.filter((c) => c.verdict === 'FAIL').length;
  const full: SuiteReport = {
    ...runMeta('physics-suite', started, { physics: identity.physics }),
    kind: 'physics-suite',
    tag,
    bikes,
    quick,
    identity,
    feel: report.feel ?? null,
    determinism: report.determinism ?? [],
    sweep: report.sweep ?? null,
    clears: report.clears ?? [],
    reflex: report.reflex ?? [],
    camera: report.camera ?? null,
    stranger: report.stranger ?? null,
    checks,
    failed,
    pass: failed === 0,
    loadavg: { start: loadStart, end: os.loadavg(), cores: os.cpus().length },
  };
  const base = `${stamp(started)}-${identity.physics}-${tag}`;
  writeJson(path.join(outDir, `${base}.json`), full);
  const md = suiteMarkdown(full);
  fs.writeFileSync(path.join(outDir, `${base}.md`), md);
  writeJson(path.join(outDir, 'latest.json'), full);
  fs.writeFileSync(path.join(outDir, 'latest.md'), md);
  console.log(`\n${failed === 0 ? 'ACCEPT' : 'REJECT'}: ${checks.filter((c) => c.verdict === 'PASS').length} pass, ${failed} fail, ${checks.filter((c) => c.verdict === 'INFO').length} info; physics=${identity.physics} src=${identity.srcFingerprint} wall=${(full.wallMs / 1000).toFixed(0)}s loadavg ${loadStart[0]!.toFixed(1)} → ${os.loadavg()[0]!.toFixed(1)}`);
  console.log(`report: ${path.join(outDir, `${base}.md`)} (+ .json, latest.*)`);
  process.exitCode = failed;
}

export function suiteMarkdown(r: SuiteReport): string {
  const L: string[] = [];
  L.push(`# Physics suite — ${r.tag}: ${r.identity.physics}, src ${r.identity.srcFingerprint}, git ${r.git}, ${r.startedAt}`);
  L.push('');
  L.push(`${r.pass ? 'ACCEPT' : 'REJECT'} — ${r.checks.filter((c) => c.verdict === 'PASS').length} pass, ${r.failed} fail, ${r.checks.filter((c) => c.verdict === 'INFO').length} info. Bikes ${r.bikes.join(' + ')}${r.quick ? ', --quick' : ''}. Wall ${(r.wallMs / 1000).toFixed(0)} s, loadavg ${r.loadavg.start[0]!.toFixed(1)} → ${r.loadavg.end[0]!.toFixed(1)} on ${r.loadavg.cores} cores.`);
  L.push('');
  L.push('| section | check | verdict | value | note |');
  L.push('|---|---|---|---|---|');
  for (const c of r.checks) L.push(`| ${c.section} | ${c.id} | ${c.verdict} | ${typeof c.value === 'number' ? (Number.isInteger(c.value) ? c.value : c.value.toFixed(3)) : String(c.value)} | ${c.note.replace(/\|/g, '\\|')} |`);
  if (r.feel) {
    L.push('', `## Feel envelope (\`vitest run src/physics\`: ${r.feel.vitest.passed} passed, ${r.feel.vitest.failed} failed)`, '', '| quantity | value | band | in band |', '|---|---:|---|---|');
    for (const f of r.feel.lines) L.push(`| ${f.name} | ${typeof f.value === 'number' ? f.value.toFixed(3) : f.value} | ${f.band} | ${f.pass === null ? 'info' : f.pass ? 'yes' : '**no**'} |`);
  }
  for (const d of r.determinism) {
    L.push('', `## Determinism — ${d.bike} (${d.golden ? path.relative(REPO_ROOT, d.golden) : 'no golden'}${d.fresh === false ? ', STALE stamp' : ''})`, '');
    if (d.report) {
      L.push('| check | pass | hashes | note |', '|---|---|---|---|');
      for (const c of d.report.checks) L.push(`| ${c.id} ${c.name} | ${c.pass ? 'PASS' : 'FAIL'} | ${c.hashes.slice(0, 2).join(' ')} | ${(c.note ?? '').replace(/\|/g, '\\|')} |`);
    }
    if (d.probe) L.push('', `snapshot-probe: ${d.probe.pass ? 'PASS' : 'FAIL'} — ${d.probe.note}`);
  }
  if (r.sweep) {
    L.push('', `## Naive sweep — ${r.sweep.bike}, skill ${r.sweep.skill}, ${r.sweep.trackWallS} s wall per track`, '', '| track | tier | best % | clears | attempts | finish | first blocker |', '|---|---|---:|---|---|---|---|');
    for (const s of r.sweep.rows) L.push(`| ${s.trackId} | ${s.tier} | ${s.bestPct.toFixed(0)}% | ${s.clears}/${s.seeds.length} | ${s.attempts.join(',')} | ${s.finishTimes.map((t) => (t === null ? '—' : t.toFixed(1))).join(',')} | ${s.firstBlocker ? `${s.firstBlocker.reason} @ ${s.firstBlocker.x.toFixed(1)} m${s.firstBlocker.obstacle ? ` (${s.firstBlocker.obstacle.kind} @ ${s.firstBlocker.obstacle.x.toFixed(1)})` : ''}` : '—'} |`);
  }
  if (r.clears.length) {
    L.push('', '## Bot skill 3 clears (browser-verified)', '', '| bike | track | attempts | outcome | finish | progress | node == browser | wall |', '|---|---|---:|---|---:|---:|---|---:|');
    for (const c of r.clears) L.push(`| ${c.bike} | ${c.trackId} | ${c.attempts} | ${c.outcome} | ${c.finishTime === null ? '—' : c.finishTime.toFixed(3)} | ${(c.progress * 100).toFixed(0)}% | ${c.verified === null ? '—' : c.verified ? 'yes' : '**NO**'} | ${c.wallS.toFixed(0)} s |`);
  }
  if (r.reflex.length) {
    L.push('', '## Reflex bot `average`', '', '| bike | track | band | attempts | median | clears | time to clear | where it died |', '|---|---|---|---|---:|---|---:|---|');
    for (const x of r.reflex) L.push(`| ${x.bike} | ${x.trackId} | ${x.band ? `${x.band[0]}–${x.band[1]}` : '—'} | ${x.attempts.join(', ')} | ${x.median} | ${x.clears}/${x.seeds} | ${x.medianFinish === null ? '—' : `${x.medianFinish.toFixed(1)} s`} | ${x.deaths.join('; ') || '—'} |`);
  }
  if (r.camera) L.push('', `## Camera box — ${r.camera.trackId}`, '', r.camera.line ?? 'no camera line', r.camera.clip ? `clip: ${r.camera.clip}` : '');
  if (r.stranger) {
    L.push('', `## Stranger smoke — session ${r.stranger.sessionId}: ${r.stranger.pass ? 'PASS' : 'FAIL'}`, '', '| call | ok | ms | summary |', '|---|---|---:|---|');
    for (const s of r.stranger.steps) L.push(`| ${s.cmd} | ${s.ok ? 'yes' : '**no**'} | ${s.ms.toFixed(0)} | ${s.summary.replace(/\|/g, '\\|')} |`);
  }
  L.push('');
  return L.join('\n');
}

const isEntry = process.argv[1] !== undefined && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname;
if (isEntry) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
