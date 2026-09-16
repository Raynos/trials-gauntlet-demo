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
import { ACTIONS, COAST, RESTART_FRAME, macroFrameAt, macroTicks, type MacroCtx } from './actions';

/** Openings played when the beam returns no actions: gas, half-gas-back, gas-fwd, coast, brake, lean-back, hop (action ids). */
export const NO_PLAN_FALLBACKS: readonly number[] = [1, 5, 3, 0, 7, 10, 13];
import { Rng } from '../../src/core/rng';
import { plan, type Plan } from './beam';
import { DEFAULT_WEIGHTS, type ScoreWeights } from './score';

/**
 * Round 11 (tracks r9 bot request): the fallback cycle alone did not break x1's 60 identical faults at a convex crest —
 * seven openings from the same spawn, each into the same wall at the same metre. When the same root has faulted
 * `PERTURB.after` times within `PERTURB.sameM` of one another, the opening is PERTURBED: the base fallback's length is
 * jittered +-30 % (1..3 slots of 125 ms), a lean offset (back / none / forward) and a throttle re-draw follow it, all drawn
 * from `Rng(seed, banCount, identicalCount)` so a seed replays byte-identically and successive attempts differ. From
 * `PERTURB.widenAfter` identical faults the beam at that root also runs twice as wide and 8 deeper, and the approach speed
 * is re-drawn with 0..3 brake or coast slots before the opening.
 */
export const PERTURB = { after: 3, widenAfter: 6, sameM: 0.5 } as const;

/** Lean offsets appended to a perturbed opening (lean-back, coast, lean-fwd) and the throttle re-draw (half-gas, gas, tap). */
const PERTURB_LEANS: readonly number[] = [10, 0, 11];
const PERTURB_THROTTLES: readonly number[] = [4, 1, 12];
const PERTURB_SPEEDS: readonly number[] = [7, 0];

/** Trailing run of fault positions within `sameM` of the latest one (0 when none). */
export function identicalFaults(xs: readonly number[], sameM: number = PERTURB.sameM): number {
  if (xs.length === 0) return 0;
  const last = xs[xs.length - 1]!;
  let n = 0;
  for (let i = xs.length - 1; i >= 0 && Math.abs(xs[i]! - last) <= sameM; i--) n++;
  return n;
}

/**
 * The opening played from a root the beam has no plan for: the plain cycle below `PERTURB.after` identical faults, a
 * seeded perturbation of it above. Pure in (seed, bans, identical) — the recording is the play, so it replays.
 */
export function fallbackOpening(seed: number, bans: number, identical: number): number[] {
  const base = NO_PLAN_FALLBACKS[bans % NO_PLAN_FALLBACKS.length]!;
  if (identical < PERTURB.after) return [base];
  const rng = new Rng(((seed ^ (bans * 0x9e3779b1) ^ (identical * 0x85ebca6b)) >>> 0) || 1);
  const out: number[] = [];
  if (identical >= PERTURB.widenAfter) {
    // Approach speed re-draw: 0..3 slots of brake or coast before the opening.
    const speedSlots = Math.floor(rng.next() * 4);
    const speedMacro = PERTURB_SPEEDS[Math.floor(rng.next() * PERTURB_SPEEDS.length)]!;
    for (let i = 0; i < speedSlots; i++) out.push(speedMacro);
  }
  // Duration jitter: a 2-slot opening +-30 % -> 1..3 slots (the hop macro is its own 5-slot script; it plays once).
  const slots = base === 13 ? 1 : 1 + Math.floor(rng.next() * 3);
  for (let i = 0; i < slots; i++) out.push(base);
  out.push(PERTURB_LEANS[Math.floor(rng.next() * PERTURB_LEANS.length)]!);
  out.push(PERTURB_THROTTLES[Math.floor(rng.next() * PERTURB_THROTTLES.length)]!);
  return out;
}

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
  /** Fault x per plan-root (round 11): identical positions from one root switch the fallback to a perturbed opening. */
  const faultXByRoot = new Map<string, number[]>();
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
    const identical = identicalFaults(faultXByRoot.get(rootHash) ?? []);
    // Round 11: a root that has faulted at the same metre `widenAfter` times gets a wider, deeper beam.
    const cfgHere = identical >= PERTURB.widenAfter ? { ...cfg, width: cfg.width * 2, depth: cfg.depth + 8 } : cfg;
    const p = plan(sim, cfgHere, w, { banned: bannedByRoot.get(rootHash) ?? [] });
    plans.push(p);
    const committedSinceRoot: number[] = [];
    // No plan from a root the player memory has banned every line at: a perturbed fallback, not plain gas (tracks r8:
    // from the x3 CP5 spawn plain gas drove the identical launch into the 60 deg face 47 times). The opening cycles
    // with the number of bans at this root, so each retry from the same root starts differently and stays deterministic;
    // from `PERTURB.after` identical fault positions it is a seeded perturbation of the cycle (round 11).
    const bansHere = bannedByRoot.get(rootHash)?.length ?? 0;
    const fallback = fallbackOpening(sim.seed, bansHere, identical);
    // A root that keeps faulting at the same metre WITH a plan is the same lock (m1 skill 1: 17 faults at 31.1 m, a plan
    // every time; x1's 60 at the crest): the beam's best line from here is the wall, so the perturbed opening replaces it
    // and the beam re-plans from wherever the opening leaves the bike.
    const perturbed = p.actions.length === 0 || (identical >= PERTURB.after && !p.finishes);
    const toPlay = perturbed ? fallback : p.finishes ? p.actions : p.actions.slice(0, cfg.commit);
    if (perturbed) log(`${p.actions.length === 0 ? `plan returned no actions (allFault=${p.allFault})` : 'plan from a root locked on one fault'}: bans here=${bansHere}, identical faults=${identical}${identical >= PERTURB.widenAfter ? ', beam widened' : ''}; playing ${fallback.map((a) => ACTIONS[a]!.code).join(' ')}`);

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
          faultXByRoot.set(rootHash, [...(faultXByRoot.get(rootHash) ?? []), stateBefore.bike.pos.x]);
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
