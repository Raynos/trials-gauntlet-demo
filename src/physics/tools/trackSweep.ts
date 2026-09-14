/**
 * Smoke sweep of the authored curriculum with the naive physics controllers
 * (CONTRACT §3: the harness bot is the real judge; this only tells the parent
 * and the tracks owner which obstacles are physically impossible right now
 * versus merely hard). For every track and controller it reports how far the
 * bike gets before the first fault, what killed it, and the obstacle it was on.
 *
 *   npx tsx src/physics/tools/trackSweep.ts            # all curriculum tracks
 *   npx tsx src/physics/tools/trackSweep.ts b1 m2      # by id prefix
 */
import type { CompiledTrack, PhysicsState, TrackDef } from '../../core/types';
import { compileTrack } from '../../tracks/compile';
import { CURRICULUM } from '../../tracks/courses';
import { createBikePhysicsV2, type BikePhysicsWorld } from '../index';
import type { BikeClass } from '../index';

/** Bike class row to sweep (physics v2): `TRIALS_BIKE=pro|rookie npx tsx src/physics/tools/trackSweep.ts` (default rookie, the game's default). */
const BIKE: BikeClass = process.env.TRIALS_BIKE === 'pro' ? 'pro' : 'rookie';
import { cruise, fullThrottle, runController, type Controller, type Observation } from '../controllers';

const HZ = 120;

export interface SweepRow {
  track: string;
  controller: string;
  /** Front-axle x reached (max), metres. */
  reachX: number;
  /** Fraction of the start->finish distance covered. */
  progress: number;
  finished: boolean;
  finishTime: number | null;
  fault: string | null;
  faultAt: number;
  crashCause: string | null;
  /** Obstacle (kind@x) under or just ahead of the bike at the fault, or 'ground'. */
  obstacle: string;
  /** What the bike was doing at the fault. */
  how: string;
}

/** Full throttle with a mild forward lean (a stranger holding both). */
const stranger: Controller = () => ({ throttle: 1, lean: 0.4 });

/** Speed-limited cruise with a bit of forward lean: does the geometry alone kill you at 7 m/s? */
const steady7 = cruise(7, 0.3);

/**
 * "Trials rider" heuristic: cruise at 6 m/s, back off and lean forward when the nose comes up,
 * lean back and gas when a drop unloads the front, brake when pitching nose-down in the air.
 */
const rider: Controller = (o: Observation) => {
  const base = cruise(6, 0.25)(o);
  if (o.airborne) {
    if (o.pitchDeg < -10) return { brake: 0, throttle: 1, lean: -1 };
    if (o.pitchDeg > 25) return { brake: 1, throttle: 0, lean: 1 };
    return { throttle: 0.3, lean: 0 };
  }
  if (o.pitchDeg > 30) return { throttle: 0, lean: 1, brake: o.pitchRateDeg > 60 ? 0.5 : 0 };
  if (o.pitchDeg > 15) return { throttle: Math.min(base.throttle ?? 0.3, 0.4), lean: 0.8 };
  if (o.pitchDeg < -15 && !o.frontGrounded) return { throttle: 1, lean: -0.6 };
  return base;
};

const CONTROLLERS: [string, Controller][] = [
  ['stranger thr1 lean0.4', stranger],
  ['fullThrottle (anti-loop)', fullThrottle],
  ['cruise 7 m/s', steady7],
  ['rider heuristic', rider],
];

function obstacleAt(def: TrackDef, x: number): string {
  let best: { kind: string; x: number } | null = null;
  for (const ob of def.obstacles) {
    const len = Number(ob.params?.length ?? ob.params?.width ?? 2 * Number(ob.params?.radius ?? 1)) || 2;
    if (x >= ob.pos.x - 1.5 && x <= ob.pos.x + len + 1.5) {
      if (!best || Math.abs(ob.pos.x - x) < Math.abs(best.x - x)) best = { kind: ob.kind, x: ob.pos.x };
    }
  }
  return best ? `${best.kind}@${best.x.toFixed(0)}` : 'ground';
}

function describeHow(s: PhysicsState, prev: PhysicsState | null): string {
  const pitch = (s.bike.angle * 180) / Math.PI;
  const wrapped = ((pitch + 180) % 360 + 360) % 360 - 180;
  const speed = Math.hypot(s.bike.vel.x, s.bike.vel.y);
  const air = !s.wheels.rear.grounded && !s.wheels.front.grounded;
  const parts: string[] = [];
  if (wrapped > 60) parts.push('looped out (nose up)');
  else if (wrapped < -45) parts.push('endo / nose-dived');
  else if (s.bike.vel.y < -6) parts.push('hard landing');
  else if (air) parts.push('airborne hit');
  else parts.push('ground hit');
  parts.push(`pitch ${wrapped.toFixed(0)} deg, ${speed.toFixed(1)} m/s${prev && prev.bike.vel.y < -4 ? ', falling' : ''}`);
  return parts.join('; ');
}

export function sweepTrack(def: TrackDef, seconds = 40): SweepRow[] {
  const track: CompiledTrack = compileTrack(def);
  const rows: SweepRow[] = [];
  for (const [name, ctrl] of CONTROLLERS) {
    const w: BikePhysicsWorld = createBikePhysicsV2(HZ);
    w.loadTrack(track, 1, { bike: BIKE });
    let reachX = -Infinity;
    let prev: PhysicsState | null = null;
    let last: PhysicsState | null = null;
    runController(w, ctrl, {
      ticks: HZ * seconds,
      decisionHz: 60,
      latencyMs: 50,
      onTick: (s) => {
        reachX = Math.max(reachX, s.wheels.front.pos.x);
        prev = last;
        last = s;
      },
      stopWhen: (s) => s.faulted !== null || s.finished,
    });
    const s = w.getState();
    const span = def.finishX - def.start.pos.x;
    rows.push({
      track: def.id,
      controller: name,
      reachX,
      progress: Math.max(0, Math.min(1, (reachX - def.start.pos.x) / span)),
      finished: s.finishTime !== null,
      finishTime: s.finishTime,
      fault: s.faulted,
      faultAt: s.faulted ? s.time : -1,
      crashCause: w.debug().crashCause,
      obstacle: s.faulted ? obstacleAt(def, s.wheels.front.pos.x) : '-',
      how: s.faulted ? describeHow(s, prev) : s.finishTime !== null ? 'finished' : 'stalled / timed out',
    });
  }
  return rows;
}

export function formatRows(rows: SweepRow[]): string {
  const lines = ['track | controller | reach x | progress | result | where | how'];
  for (const r of rows) {
    const result = r.finished ? `FINISH ${r.finishTime!.toFixed(1)} s` : r.fault ? `${r.fault}${r.crashCause ? `/${r.crashCause}` : ''} @${r.faultAt.toFixed(1)} s` : 'no finish';
    lines.push(`${r.track} | ${r.controller} | ${r.reachX.toFixed(1)} | ${(r.progress * 100).toFixed(0)}% | ${result} | ${r.obstacle} | ${r.how}`);
  }
  return lines.join('\n');
}

function main(): void {
  const filters = process.argv.slice(2).map((a) => a.toLowerCase());
  const tracks = CURRICULUM.filter((t) => filters.length === 0 || filters.some((f) => t.id.toLowerCase().startsWith(f)));
  const all: SweepRow[] = [];
  for (const def of tracks) {
    const rows = sweepTrack(def);
    all.push(...rows);
    console.log(formatRows(rows));
    console.log('');
  }
  // summary: best progress per track
  console.log('SUMMARY (best controller per track)');
  for (const def of tracks) {
    const rows = all.filter((r) => r.track === def.id);
    const best = rows.reduce((a, b) => (b.finished || b.progress > a.progress ? b : a));
    console.log(`${def.id.padEnd(14)} ${best.finished ? 'CLEARED' : `${(best.progress * 100).toFixed(0)}%`.padEnd(7)} by ${best.controller.padEnd(26)} ${best.finished ? '' : `first fault: ${best.fault ?? 'none'} at ${best.obstacle} (${best.how})`}`);
  }
}

if (process.argv[1] && /trackSweep\.ts$/.test(process.argv[1])) main();
