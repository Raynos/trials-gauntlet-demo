/**
 * Battery anchor finder (round 12, MEGA_PLAN P5: the 38-pair battery).
 *
 *   tsx harness/compare/battery.mts <recording.json> [<recording.json> ...] [--climb-deg 30] [--climb-hold 0.6] [--out harness/out/compare/battery/plan.json]
 *
 * Replays each recording in node (`createSimFor` + `expandFrames`, the same sim `harness:clip` uses),
 * samples the physics state every tick and prints the candidate anchors per manoeuvre with the
 * recording-global tick, x, t (= tick / hz, the time `harness:clip --from-tick` counts from) so a
 * capture window can be chosen by hand. The pure detectors (`detectManoeuvres`) take a sampled
 * trace and are unit-tested in `battery.test.ts`.
 *
 * Definitions (the builder brief):
 *   wheelie  rear grounded, front off, pitch >= 20 deg held >= 0.5 s; anchor = the lift tick
 *   hop      both wheels leave near-flat ground, airtime 0.2..0.7 s, apex rise < 1.2 m; anchor = takeoff
 *   landing  touchdown after airtime >= 0.8 s; anchor = the touchdown tick
 *   crash    a `fault` event; anchor = the fault tick
 *   climb    the rear wheel rolls up a path >= 30 deg for >= 0.6 s (read from its own trajectory); anchor = the run's first tick
 *   flight   airborne >= 1.0 s; anchor = takeoff
 * Anchors inside the first 0.5 s after a spawn (GO or a respawn) are dropped: riding must be visible.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expandFrames } from '../../src/core/replay';
import { flagNum, flagStr, parseArgs } from '../lib/args';
import { OUT_DIR } from '../lib/paths';
import { loadRecording } from '../lib/recording';
import { fail, writeJson } from '../lib/report';
import { createSimFor } from '../lib/sim';

export type Manoeuvre = 'wheelie' | 'hop' | 'landing' | 'crash' | 'climb' | 'flight';
export const MANOEUVRES: readonly Manoeuvre[] = ['wheelie', 'hop', 'landing', 'crash', 'climb', 'flight'];

/** One tick of the replay, the fields the detectors read. */
export interface TraceSample {
  /** Recording-global tick index (1-based: the state after applying frame i is tick i + 1). */
  tick: number;
  x: number;
  y: number;
  /** Bike pitch in degrees, nose-up positive. */
  pitchDeg: number;
  rearGrounded: boolean;
  frontGrounded: boolean;
  frontY: number;
  rearY: number;
  frontX: number;
  rearX: number;
  /** A `fault` event was drained on this tick. */
  fault: boolean;
  /** A `restart` event (respawn / full restart) was drained on this tick. Tick 0 counts as a spawn. */
  spawn: boolean;
}

export interface Anchor {
  manoeuvre: Manoeuvre;
  tick: number;
  t: number;
  x: number;
  /** Detector-specific detail: held seconds, airtime, apex rise, slope. */
  detail: string;
  /** Recording-global tick of the end of the manoeuvre (touchdown, respawn, wheelie drop). */
  endTick: number;
}

const RAD = 180 / Math.PI;
const SPAWN_GUARD_S = 0.5;

export interface DetectOptions {
  /** Path slope a climb must hold (deg, default 30). `--climb-deg` lowers it to survey what a track offers. */
  climbMinDeg?: number;
  /** Seconds a climb must hold (default 0.6). `--climb-hold` shortens it for the survey. */
  climbHoldS?: number;
}

export function detectManoeuvres(trace: readonly TraceSample[], hz: number, opts: DetectOptions = {}): Anchor[] {
  const climbMinDeg = opts.climbMinDeg ?? 30;
  const climbHoldS = opts.climbHoldS ?? 0.6;
  const out: Anchor[] = [];
  const t = (tick: number): number => tick / hz;
  const spawnTicks: number[] = [0];
  for (const s of trace) if (s.spawn) spawnTicks.push(s.tick);
  const afterSpawn = (tick: number): boolean => spawnTicks.some((sp) => tick >= sp && tick - sp < SPAWN_GUARD_S * hz);
  const push = (a: Anchor): void => {
    if (!afterSpawn(a.tick)) out.push(a);
  };
  const air = (s: TraceSample): boolean => !s.rearGrounded && !s.frontGrounded;

  // crash: every fault tick
  for (const s of trace) if (s.fault) push({ manoeuvre: 'crash', tick: s.tick, t: t(s.tick), x: s.x, detail: 'fault', endTick: s.tick });

  // airtime runs -> hop / flight / landing
  let i = 0;
  while (i < trace.length) {
    if (!air(trace[i]!)) {
      i++;
      continue;
    }
    const start = i;
    let apex = -Infinity;
    let crashed = false;
    while (i < trace.length && air(trace[i]!)) {
      apex = Math.max(apex, trace[i]!.y);
      if (trace[i]!.fault || trace[i]!.spawn) crashed = true;
      i++;
    }
    if (crashed || i >= trace.length) continue; // ended in a fault / respawn or the recording end: no touchdown
    const takeoff = trace[Math.max(0, start - 1)]!;
    const touchdown = trace[i]!;
    const airS = (touchdown.tick - takeoff.tick) / hz;
    const rise = apex - takeoff.y;
    const takeoffSlope = Math.abs(takeoff.pitchDeg);
    if (airS >= 0.2 && airS <= 0.7 && rise < 1.2 && takeoffSlope < 12) {
      push({ manoeuvre: 'hop', tick: takeoff.tick, t: t(takeoff.tick), x: takeoff.x, detail: `air ${airS.toFixed(2)} s rise ${rise.toFixed(2)} m pitch ${takeoff.pitchDeg.toFixed(0)}`, endTick: touchdown.tick });
    }
    if (airS >= 0.8) {
      push({ manoeuvre: 'landing', tick: touchdown.tick, t: t(touchdown.tick), x: touchdown.x, detail: `air ${airS.toFixed(2)} s rise ${rise.toFixed(2)} m`, endTick: touchdown.tick });
    }
    if (airS >= 1.0) {
      push({ manoeuvre: 'flight', tick: takeoff.tick, t: t(takeoff.tick), x: takeoff.x, detail: `air ${airS.toFixed(2)} s rise ${rise.toFixed(2)} m`, endTick: touchdown.tick });
    }
  }

  // wheelie: rear on, front off, pitch >= 20 held >= 0.5 s
  i = 0;
  const wheelieUp = (s: TraceSample): boolean => s.rearGrounded && !s.frontGrounded;
  while (i < trace.length) {
    if (!wheelieUp(trace[i]!)) {
      i++;
      continue;
    }
    const start = i;
    let held = 0;
    let maxPitch = -Infinity;
    let faulted = false;
    while (i < trace.length && wheelieUp(trace[i]!) && !faulted) {
      if (trace[i]!.pitchDeg >= 20) held++;
      maxPitch = Math.max(maxPitch, trace[i]!.pitchDeg);
      faulted = trace[i]!.fault;
      i++;
    }
    if (held / hz >= 0.5) {
      const s = trace[start]!;
      push({ manoeuvre: 'wheelie', tick: s.tick, t: t(s.tick), x: s.x, detail: `held ${(held / hz).toFixed(2)} s max ${maxPitch.toFixed(0)} deg`, endTick: trace[i - 1]!.tick });
    }
  }

  // climb: the rear wheel rolls (grounded) up a path >= 30 deg for >= 0.6 s. The slope is read from the rear
  // wheel's own trajectory over the last ~0.1 s (the ground under it), so a wheelie on the flat does not count
  // and a front wheel lifted on the face still does. Anchor = the tick the run starts (the front is on the face).
  i = 0;
  const lag = Math.max(1, Math.round(hz * 0.1));
  const pathSlope = (k: number): number => {
    const a = trace[Math.max(0, k - lag)]!;
    const b = trace[k]!;
    const dx = b.rearX - a.rearX;
    const dy = b.rearY - a.rearY;
    if (Math.hypot(dx, dy) < 0.02) return 0;
    return Math.atan2(dy, dx) * RAD;
  };
  const climbing = (k: number): boolean => trace[k]!.rearGrounded && pathSlope(k) >= climbMinDeg;
  while (i < trace.length) {
    if (!climbing(i)) {
      i++;
      continue;
    }
    const start = i;
    let maxSlope = -Infinity;
    let faulted = false;
    let gap = 0;
    while (i < trace.length && !faulted && gap <= hz * 0.1) {
      if (climbing(i)) {
        gap = 0;
        maxSlope = Math.max(maxSlope, pathSlope(i));
      } else gap++;
      faulted = trace[i]!.fault;
      i++;
    }
    const s0 = trace[start]!;
    const s1 = trace[Math.max(start, i - 1 - gap)]!;
    const held = (s1.tick - s0.tick) / hz;
    if (held >= climbHoldS && s1.rearY > s0.rearY) {
      push({ manoeuvre: 'climb', tick: s0.tick, t: t(s0.tick), x: s0.x, detail: `held ${held.toFixed(2)} s max ${maxSlope.toFixed(0)} deg rise ${(s1.rearY - s0.rearY).toFixed(1)} m`, endTick: s1.tick });
    }
  }

  out.sort((a, b) => a.tick - b.tick);
  return out;
}

export interface RecordingPlan {
  recording: string;
  trackId: string;
  bike: string;
  hz: number;
  ticks: number;
  seconds: number;
  faults: number;
  finished: boolean;
  anchors: Anchor[];
}

export async function traceRecording(file: string, opts: DetectOptions = {}): Promise<RecordingPlan> {
  const rec = loadRecording(file);
  const sim = await createSimFor(rec);
  const frames = expandFrames(rec);
  const hz = rec.header.physicsHz;
  const trace: TraceSample[] = [];
  let faults = 0;
  for (let i = 0; i < frames.length; i++) {
    const events = sim.step(frames[i]!);
    const st = sim.state();
    let fault = false;
    let spawn = false;
    for (const e of events) {
      if (e.type === 'fault') {
        fault = true;
        faults++;
      }
      if (e.type === 'restart') spawn = true;
    }
    trace.push({
      tick: i + 1,
      x: st.bike.pos.x,
      y: st.bike.pos.y,
      pitchDeg: st.bike.angle * RAD,
      rearGrounded: st.wheels.rear.grounded,
      frontGrounded: st.wheels.front.grounded,
      frontY: st.wheels.front.pos.y,
      rearY: st.wheels.rear.pos.y,
      frontX: st.wheels.front.pos.x,
      rearX: st.wheels.rear.pos.x,
      fault,
      spawn,
    });
  }
  const st = sim.state();
  return {
    recording: file,
    trackId: rec.header.trackId,
    bike: rec.header.bike ?? 'rookie',
    hz,
    ticks: frames.length,
    seconds: frames.length / hz,
    faults,
    finished: st.finishTime !== null,
    anchors: detectManoeuvres(trace, hz, opts),
  };
}

async function main(): Promise<void> {
  const { positional, flags } = parseArgs();
  if (positional.length === 0) fail('usage: battery.mts <recording.json> [...] [--out plan.json]');
  const out = flagStr(flags, 'out', path.join(OUT_DIR, 'compare', 'battery', 'plan.json'));
  const climbMinDeg = flagNum(flags, 'climb-deg', 30);
  const climbHoldS = flagNum(flags, 'climb-hold', 0.6);
  const plans: RecordingPlan[] = [];
  for (const file of positional) {
    const plan = await traceRecording(file, { climbMinDeg, climbHoldS });
    plans.push(plan);
    console.log(`\n== ${plan.trackId} ${path.basename(file)} bike=${plan.bike} ticks=${plan.ticks} (${plan.seconds.toFixed(2)} s) faults=${plan.faults} finished=${plan.finished}`);
    for (const m of MANOEUVRES) {
      const list = plan.anchors.filter((a) => a.manoeuvre === m);
      if (list.length === 0) {
        console.log(`  ${m.padEnd(8)} -`);
        continue;
      }
      for (const a of list) console.log(`  ${m.padEnd(8)} tick ${String(a.tick).padStart(6)}  t ${a.t.toFixed(2).padStart(7)} s  x ${a.x.toFixed(1).padStart(6)} m  end t ${(a.endTick / plan.hz).toFixed(2)} s  ${a.detail}`);
    }
  }
  writeJson(out, { plans });
  console.log(`\nplan: ${out}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}
