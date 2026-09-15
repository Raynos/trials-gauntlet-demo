/**
 * Node driver: the reflex controller against `createSim` (the game rules +
 * physics, no browser). Time is the sim clock (ticks / hz), so a run is fully
 * deterministic for (track, seed, skill) and the recording it leaves behind
 * replays to the same finish byte for byte — there is no search and no
 * snapshot/restore, the frames *are* the play.
 */
import { quantizeInput } from '../../src/core/replay';
import type { FaultReason, InputFrame, PhysicsState } from '../../src/core/types';
import { countedFaults, type TimedEvent } from '../lib/metrics';
import type { Sim } from '../lib/sim';
import { ReflexController, type Intent, type Keys, type SkillName, type SkillParams } from './controller';
import { SectionMemory } from './memory';
import { perceive } from './perceive';
import { buildProfile, type GroundProfile } from './profile';

export interface ReflexFault {
  attempt: number;
  reason: FaultReason;
  tick: number;
  simTime: number;
  runTime: number;
  x: number;
  checkpoint: number;
  pitchDeg: number;
  speed: number;
  airborne: boolean;
  /** Rule the player was executing (from the last glance acted on). */
  rule: string;
  /** Nearest placed obstacle within [-2, +8] m, or null = open ground. */
  obstacle: { kind: string; x: number; index: number } | null;
  /** What the memory changed after this fault. */
  lesson: string[];
}

export interface ReflexPlayResult {
  outcome: 'finished' | 'maxAttempts' | 'timeout';
  frames: InputFrame[];
  /** Physics hash after each tick (same index as frames). */
  finalHash: string;
  attempts: number;
  faults: ReflexFault[];
  finishTime: number | null;
  maxX: number;
  events: TimedEvent[];
  reactionS: number;
  glances: number;
  rules: Record<string, number>;
  memory: ReturnType<SectionMemory['snapshot']>;
  finalState: PhysicsState;
}

export interface ReflexPlayOptions {
  skill: SkillName;
  seed: number;
  attemptsCap?: number;
  maxSimSeconds?: number;
  params?: Partial<SkillParams>;
  memory?: SectionMemory;
  log?: (line: string) => void;
  /** Per-tick tap (round 9 tracing): the rule the rider is executing and the intent behind the keys. */
  onTick?: (tick: number, intent: Intent, keys: Keys) => void;
}

export function keysToFrame(k: Keys): InputFrame {
  return quantizeInput({
    throttle: k.up ? 1 : 0,
    brake: k.down ? 1 : 0,
    lean: (k.right ? 1 : 0) - (k.left ? 1 : 0),
    restart: k.restart,
  });
}

/** Nearest placed obstacle within [-2, +8] m ahead of x, or null (open ground). */
export function nearestObstacle(sim: Sim, x: number): ReflexFault['obstacle'] {
  let best: ReflexFault['obstacle'] = null;
  let bestD = Infinity;
  sim.compiled.placed.forEach((o, index) => {
    const d = o.pos.x - x;
    if (d < -2 || d > 8) return;
    if (Math.abs(d) < bestD) {
      bestD = Math.abs(d);
      best = { kind: o.kind, x: o.pos.x, index };
    }
  });
  return best;
}

export function faultContext(st: PhysicsState, profile: GroundProfile, reason: string, seen: ReturnType<ReflexController['lastActed']>) {
  const x = st.bike.pos.x;
  const gAhead = profile.heightAt(x + 1.5, st);
  return {
    x,
    reason,
    seen,
    pitchDeg: (st.bike.angle * 180) / Math.PI,
    airborne: !st.wheels.rear.grounded && !st.wheels.front.grounded,
    speed: st.bike.vel.x,
    belowAhead: Number.isFinite(gAhead) ? st.bike.pos.y - 0.34 - gAhead : 0,
  };
}

export function playReflex(sim: Sim, o: ReflexPlayOptions): ReflexPlayResult {
  const hz = sim.hz;
  const profile = buildProfile(sim.compiled);
  const memory = o.memory ?? new SectionMemory();
  const ctrl = new ReflexController({ skill: o.skill, seed: o.seed, memory, bike: sim.bike, ...(o.params ? { params: o.params } : {}) });
  const log = o.log ?? (() => undefined);
  const cap = o.attemptsCap ?? 50;
  const maxTicks = Math.round((o.maxSimSeconds ?? 300) * hz);
  const frames: InputFrame[] = [];
  const events: TimedEvent[] = [];
  const faults: ReflexFault[] = [];
  let outcome: ReflexPlayResult['outcome'] | null = null;
  let finishTime: number | null = null;
  let maxX = sim.state().bike.pos.x;
  let glances = 0;
  let tick = 0;
  let finishedAt = -1;
  let attemptsSoFar = 1;

  while (outcome === null) {
    const t = tick / hz;
    const before = sim.state();
    if (before.bike.pos.x > maxX) maxX = before.bike.pos.x;
    if (ctrl.glanceDue(t)) {
      ctrl.observe(perceive(before, sim.phase(), t, profile, sim.track));
      glances++;
    }
    const keys = ctrl.keysAt(t);
    o.onTick?.(tick, ctrl.currentIntent(), keys);
    const frame = keysToFrame(keys);
    const ev = sim.step(frame);
    frames.push(frame);
    tick++;
    for (const e of ev) {
      const te = { event: e, runTick: sim.runTicks() };
      events.push(te);
      if (e.type === 'fault') {
        const ctx = faultContext(before, profile, e.reason, ctrl.lastActed());
        const lesson = ctrl.learn(ctx);
        const f: ReflexFault = {
          attempt: attemptsSoFar,
          reason: e.reason,
          tick: e.tick,
          simTime: e.time,
          runTime: te.runTick / hz,
          x: before.bike.pos.x,
          checkpoint: before.checkpoint,
          pitchDeg: ctx.pitchDeg,
          speed: ctx.speed,
          airborne: ctx.airborne,
          // A `restart` fault while riding is the rider's own stall-restart (`stuck-restart`): label it so, whatever
          // intent a newer glance wrote while the key was held (round 11).
          rule: e.reason === 'restart' ? 'stuck-restart' : ctrl.currentIntent().rule,
          obstacle: nearestObstacle(sim, before.bike.pos.x),
          lesson,
        };
        faults.push(f);
        attemptsSoFar++;
        log(`fault #${faults.length} ${e.reason} at x=${f.x.toFixed(1)} pitch=${f.pitchDeg.toFixed(0)} v=${f.speed.toFixed(1)} ${f.airborne ? 'air' : 'ground'} rule=${f.rule} ${f.obstacle ? `${f.obstacle.kind}@${f.obstacle.x.toFixed(0)}` : 'ground'} run t=${f.runTime.toFixed(2)} → ${lesson.join('; ')}`);
        if (attemptsSoFar > cap) outcome = 'maxAttempts';
      } else if (e.type === 'restart') {
        ctrl.respawned(tick / hz);
      } else if (e.type === 'finish') {
        finishTime = te.runTick / hz;
        finishedAt = tick;
        log(`finish at run t=${finishTime.toFixed(3)} attempts=${1 + countedFaults(events).length}`);
      }
    }
    // Let the player see the finish (reaction + a few glances), then stop.
    if (finishedAt >= 0 && tick - finishedAt >= Math.round(0.5 * hz)) outcome = 'finished';
    if (tick >= maxTicks && outcome === null) outcome = 'timeout';
  }
  const rules: Record<string, number> = {};
  for (const [k, v] of ctrl.ruleCounts) rules[k] = v;
  return {
    outcome,
    frames,
    finalHash: sim.hash(),
    attempts: 1 + countedFaults(events).length,
    faults,
    finishTime,
    maxX: Math.max(maxX, sim.state().bike.pos.x),
    events,
    reactionS: ctrl.reactionS,
    glances,
    rules,
    memory: memory.snapshot(),
    finalState: sim.state(),
  };
}
