/**
 * Committed play: plan → commit the first `commit` macro-actions for real →
 * re-plan. A fault during committed play may not be rewound (skills 0–3):
 * the bot logs the fault, mashes restart like a player, and continues from
 * the checkpoint the sim placed it at. `attempts = 1 + faults` (CONTRACT §3);
 * the restart mash after a crash is not a second fault.
 *
 * Player memory: a fault bans the action prefix that led to it *from the
 * state the plan was made in* (keyed by state hash). After the respawn the
 * bot is back in a state it has seen, so it tries something else instead of
 * repeating the identical crash 49 times.
 *
 * `oracle`: unlimited rewinds. On fault, restore the snapshot taken
 * `2 * commit` actions earlier, blacklist that action prefix and re-plan.
 * Produces the 0-fault reference replay (bot par).
 */
import type { InputFrame, PhysicsState } from '../../src/core/types';
import type { BeamConfig, FaultEvent, Skill } from '../lib/schema';
import { countedFaults, type TimedEvent } from '../lib/metrics';
import type { Sim } from '../lib/sim';
import { COAST, RESTART_FRAME, macroFrameAt, macroTicks, type MacroCtx } from './actions';
import { plan, type Plan } from './beam';
import { DEFAULT_WEIGHTS, type ScoreWeights } from './score';

export const SKILLS: Record<0 | 1 | 2 | 3, BeamConfig> = {
  0: { width: 4, depth: 8, commit: 4, budgetMs: 200, cells: [0.5, 1, 0.2] }, // 1.0 s lookahead
  1: { width: 8, depth: 16, commit: 4, budgetMs: 500, cells: [0.5, 1, 0.2] }, // 2.0 s
  2: { width: 16, depth: 24, commit: 2, budgetMs: 1500, cells: [0.25, 0.5, 0.1] }, // 3.0 s
  3: { width: 32, depth: 32, commit: 1, budgetMs: 4000, cells: [0.25, 0.5, 0.1] }, // 4.0 s
};

export function configFor(skill: Skill, budgetMs?: number): BeamConfig {
  const base = skill === 'oracle' ? SKILLS[3] : SKILLS[skill];
  return budgetMs !== undefined ? { ...base, budgetMs } : { ...base };
}

export interface PlayLimits {
  maxAttempts: number;
  maxSimSeconds: number;
  maxRewinds: number;
  /** Wall-clock cap for the whole run (ms); exceeded -> outcome 'wallTimeout'. */
  maxWallMs: number;
}
export const DEFAULT_LIMITS: PlayLimits = { maxAttempts: 50, maxSimSeconds: 300, maxRewinds: 200, maxWallMs: 600_000 };

export interface PlayResult {
  outcome: 'finished' | 'maxAttempts' | 'timeout' | 'wallTimeout' | 'stuck';
  frames: InputFrame[];
  /** Physics hash after each committed tick (same index as `frames`): lets the caller prove a replay of `frames` retraces the play. */
  hashes: string[];
  /** Furthest bike x reached during committed play (m). */
  maxX: number;
  wallMs: number;
  events: TimedEvent[];
  faults: FaultEvent[];
  attempts: number;
  /** Run-clock seconds at the finish crossing. */
  finishTime: number | null;
  segmentFinishTime: number | null;
  finalState: PhysicsState;
  rewinds: number;
  forcedResets: number;
  plans: Plan[];
  ticksSimulated: number;
}

export interface PlayOptions {
  skill: Skill;
  config?: BeamConfig;
  weights?: ScoreWeights;
  limits?: Partial<PlayLimits>;
  log?: (line: string) => void;
}

interface HistoryEntry {
  snap: ReturnType<Sim['snap']>;
  framesLen: number;
  eventsLen: number;
  runTicks: number;
  aid: number;
  /** State hash at this entry (the root a re-plan from here would use). */
  rootHash: string;
}

export function playTrack(sim: Sim, opts: PlayOptions): PlayResult {
  const cfg = opts.config ?? configFor(opts.skill);
  const w = opts.weights ?? DEFAULT_WEIGHTS;
  const limits: PlayLimits = { ...DEFAULT_LIMITS, ...opts.limits };
  const oracle = opts.skill === 'oracle';
  const log = opts.log ?? (() => undefined);
  const hz = sim.hz;

  const frames: InputFrame[] = [];
  const hashes: string[] = [];
  const events: TimedEvent[] = [];
  const faults: FaultEvent[] = [];
  const plans: Plan[] = [];
  const history: HistoryEntry[] = [];
  /** Banned action prefixes per plan-root state hash (player memory / oracle blacklist). */
  const bannedByRoot = new Map<string, number[][]>();
  const ban = (rootHash: string, prefix: number[]): void => {
    if (prefix.length === 0) return;
    const list = bannedByRoot.get(rootHash) ?? [];
    list.push(prefix);
    bannedByRoot.set(rootHash, list);
  };
  let rewinds = 0;
  let forcedResets = 0;
  let outcome: PlayResult['outcome'] | null = null;
  let finishTime: number | null = null;
  let segmentFinishTime: number | null = null;
  let lastRewindIdx = -1;
  let rewindExtra = 0;
  let ticksSimulated = 0;
  const startTotal = sim.totalTicks();
  const wall0 = performance.now();
  let maxX = sim.state().bike.pos.x;

  const stepPlay = (f: InputFrame): { fault: TimedEvent | null; finish: TimedEvent | null } => {
    const ev = sim.step(f);
    frames.push(f);
    hashes.push(sim.hash());
    let fault: TimedEvent | null = null;
    let finish: TimedEvent | null = null;
    for (const e of ev) {
      const te = { event: e, runTick: sim.runTicks() };
      events.push(te);
      if (e.type === 'fault' && !fault) fault = te;
      if (e.type === 'finish' && !finish) finish = te;
    }
    return { fault, finish };
  };

  while (outcome === null) {
    if (sim.runTime() > limits.maxSimSeconds) {
      outcome = 'timeout';
      break;
    }
    if (performance.now() - wall0 > limits.maxWallMs) {
      outcome = 'wallTimeout';
      break;
    }
    const rootHash = sim.hash();
    const p = plan(sim, cfg, w, { banned: bannedByRoot.get(rootHash) ?? [] });
    plans.push(p);
    const committedSinceRoot: number[] = [];
    const toPlay = p.actions.length === 0 ? [1] : p.finishes ? p.actions : p.actions.slice(0, cfg.commit);
    if (p.actions.length === 0) log(`plan returned no actions (allFault=${p.allFault}); playing gas`);

    let replan = false;
    for (const aid of toPlay) {
      committedSinceRoot.push(aid);
      if (oracle) history.push({ snap: sim.snap(), framesLen: frames.length, eventsLen: events.length, runTicks: sim.runTicks(), aid, rootHash: sim.hash() });
      const macroLen = macroTicks(aid);
      const ctx: MacroCtx = {};
      for (let i = 0; i < macroLen && !replan; i++) {
        const stateBefore = sim.state();
        if (stateBefore.bike.pos.x > maxX) maxX = stateBefore.bike.pos.x;
        const { fault, finish } = stepPlay(macroFrameAt(aid, i, () => stateBefore, ctx));
        if (finish && !fault) {
          const st = sim.state();
          finishTime = finish.runTick / hz;
          segmentFinishTime = st.finishTime;
          outcome = 'finished';
          replan = true;
          break;
        }
        if (fault) {
          const fe = fault.event as Extract<TimedEvent['event'], { type: 'fault' }>;
          if (oracle) {
            // Rewind: 2*commit actions back (further each time the same point recurs).
            let idx = Math.max(0, history.length - 2 * cfg.commit - rewindExtra);
            if (idx === lastRewindIdx) {
              rewindExtra += cfg.commit;
              idx = Math.max(0, history.length - 2 * cfg.commit - rewindExtra);
            } else rewindExtra = 0;
            lastRewindIdx = idx;
            const h = history[idx]!;
            ban(h.rootHash, history.slice(idx).map((e) => e.aid));
            sim.restore(h.snap);
            frames.length = h.framesLen;
            hashes.length = h.framesLen;
            events.length = h.eventsLen;
            history.length = idx;
            rewinds++;
            log(`oracle rewind #${rewinds} to action ${idx} (run t=${(h.runTicks / hz).toFixed(2)}s) after ${fe.reason} at x=${stateBefore.bike.pos.x.toFixed(1)}; banned here=${bannedByRoot.get(h.rootHash)?.length ?? 0}`);
            if (rewinds >= limits.maxRewinds) outcome = 'stuck';
            replan = true;
            break;
          }
          // Committed play: the fault is real. Log it, mash restart, carry on.
          faults.push({
            attempt: faults.length + 1,
            reason: fe.reason,
            tick: fe.tick,
            simTime: fe.time,
            runTime: fault.runTick / hz,
            x: stateBefore.bike.pos.x,
            checkpoint: stateBefore.checkpoint,
          });
          log(`fault #${faults.length} ${fe.reason} at x=${stateBefore.bike.pos.x.toFixed(1)} cp=${stateBefore.checkpoint} run t=${(fault.runTick / hz).toFixed(2)}s`);
          ban(rootHash, [...committedSinceRoot]); // player memory: not that again from here
          if (sim.phase() === 'crashed') {
            // A player's restart mash: edge -> respawn on the next tick (no second fault).
            stepPlay(RESTART_FRAME);
            stepPlay(COAST);
            if (sim.phase() !== 'riding') {
              forcedResets++;
              log(`WARNING phase ${sim.phase()} after restart mash`);
            }
          }
          if (faults.length + 1 >= limits.maxAttempts) outcome = 'maxAttempts';
          replan = true;
          break;
        }
      }
      if (replan) break;
    }
  }

  ticksSimulated = sim.totalTicks() - startTotal;
  const counted = countedFaults(events);
  const last = sim.state();
  if (last.bike.pos.x > maxX) maxX = last.bike.pos.x;
  return {
    outcome,
    frames,
    hashes,
    maxX,
    wallMs: performance.now() - wall0,
    events,
    faults,
    attempts: 1 + counted.length,
    finishTime,
    segmentFinishTime,
    finalState: sim.state(),
    rewinds,
    forcedResets,
    plans,
    ticksSimulated,
  };
}
