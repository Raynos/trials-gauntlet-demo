/**
 * Beam search over macro-actions using the node sim's snapshot/restore.
 *
 * Per depth, every frontier node is restored and every action rolled out for
 * HOLD ticks. Children are deduped on a coarse (x, vx, angle, grounded) cell
 * keeping the best score, then the top `width` survive. A child that
 * finishes ends the search immediately (earliest finish on the run clock
 * wins). A child whose rollout emitted a `fault` is kept but scored
 * `fault + x`, so it only survives when every alternative faults too.
 */
import type { PhysicsState } from '../../src/core/types';
import type { BeamConfig } from '../lib/schema';
import type { Sim, SimSnapshot } from '../lib/sim';
import { ACTIONS, HOLD, macroFrameAt, macroTicks, type MacroCtx } from './actions';
import { score, type ScoreWeights } from './score';

export type { BeamConfig } from '../lib/schema';

export interface Plan {
  actions: number[];
  score: number;
  expanded: number;
  ticks: number;
  wallMs: number;
  finishes: boolean;
  /** Every child of the root faulted: the situation is already lost. */
  allFault: boolean;
  depthReached: number;
  /** Run-clock tick of the finish in the plan, when `finishes`. */
  finishRunTick: number | null;
}

interface Node {
  snap: SimSnapshot;
  actions: number[];
  score: number;
  faulted: boolean;
  runTicks: number;
  state: PhysicsState;
  /**
   * A technique macro still in flight (round 8): multi-slot macros are rolled HOLD ticks per depth so a depth
   * stays 125 ms of run time for every node and the dedup compares like with like; a pending node does not
   * branch, it only advances its macro (the ctx carries the controller's scratch across depths).
   */
  pending?: { aid: number; at: number; ctx: MacroCtx };
}

export interface PlanOptions {
  /** Action prefixes that are known to fault; children matching one are dropped. */
  banned?: number[][];
  /** Restrict to these action ids (e.g. skill 0 vocabulary). */
  allowed?: readonly number[];
}

function isBanned(actions: number[], banned: number[][] | undefined): boolean {
  if (!banned) return false;
  for (const b of banned) {
    if (b.length > actions.length) continue;
    let eq = true;
    for (let i = 0; i < b.length; i++) {
      if (b[i] !== actions[i]) {
        eq = false;
        break;
      }
    }
    if (eq) return true;
  }
  return false;
}

export function plan(sim: Sim, cfg: BeamConfig, w: ScoreWeights, opts: PlanOptions = {}): Plan {
  const t0 = performance.now();
  const root = sim.snap();
  const rootTicks = sim.runTicks();
  const rootState = sim.state();
  const allowed = opts.allowed ?? ACTIONS.map((a) => a.id);
  let frontier: Node[] = [{ snap: root, actions: [], score: score(rootState, w, rootTicks, sim.hz), faulted: false, runTicks: rootTicks, state: rootState }];
  let expanded = 0;
  let ticks = 0;
  let best: Node = frontier[0]!;
  let finishes = false;
  let finishRunTick: number | null = null;
  let allFault = false;
  let depthReached = 0;
  const [cx, cvx, ca] = cfg.cells;

  outer: for (let d = 0; d < cfg.depth; d++) {
    if (d > 0 && performance.now() - t0 > cfg.budgetMs) break;
    const cells = new Map<string, Node>();
    const finishedChildren: Node[] = [];
    let anyClean = false;
    for (const node of frontier) {
      if (node.faulted) continue; // do not expand past a fault; the fault is real
      const choices = node.pending ? [node.pending.aid] : allowed;
      for (const aid of choices) {
        const actions = node.pending ? node.actions : [...node.actions, aid];
        if (!node.pending && isBanned(actions, opts.banned)) continue;
        sim.restore(node.snap);
        const total = macroTicks(aid);
        const from = node.pending ? node.pending.at : 0;
        const to = Math.min(total, from + HOLD);
        const n = to - from;
        const ctx: MacroCtx = node.pending ? { ...node.pending.ctx } : {};
        let faulted = false;
        let finishedAt = -1;
        for (let i = from; i < to; i++) {
          const ev = sim.step(macroFrameAt(aid, i, sim.state, ctx));
          ticks++;
          for (const e of ev) {
            if (e.type === 'fault') faulted = true;
            else if (e.type === 'finish') finishedAt = i;
          }
          if (finishedAt >= 0) break;
        }
        expanded++;
        const st = sim.state();
        const runTicks = node.runTicks + (finishedAt >= 0 ? finishedAt + 1 - from : n);
        const finished = finishedAt >= 0 && !faulted;
        const sc = faulted ? w.fault + st.bike.pos.x : score(st, w, runTicks, sim.hz);
        const child: Node = { snap: finished ? node.snap : sim.snap(), actions, score: sc, faulted, runTicks, state: st };
        if (to < total && !finished && !faulted) child.pending = { aid, at: to, ctx };
        if (finished) {
          finishedChildren.push(child);
          continue;
        }
        if (!faulted) anyClean = true;
        const key = `${Math.round(st.bike.pos.x / cx)}|${Math.round(st.bike.vel.x / cvx)}|${Math.round(st.bike.angle / ca)}|${st.wheels.rear.grounded || st.wheels.front.grounded ? 1 : 0}|${faulted ? 1 : 0}${child.pending ? `|p${child.pending.aid}:${child.pending.at}` : ''}`;
        const prev = cells.get(key);
        if (!prev || child.score > prev.score) cells.set(key, child);
      }
    }
    depthReached = d + 1;
    if (finishedChildren.length > 0) {
      finishedChildren.sort((a, b) => a.runTicks - b.runTicks || b.score - a.score);
      best = finishedChildren[0]!;
      finishes = true;
      finishRunTick = best.runTicks;
      break outer;
    }
    const next = [...cells.values()].sort((a, b) => b.score - a.score).slice(0, cfg.width);
    if (next.length === 0) break;
    if (d === 0 && !anyClean) allFault = true;
    frontier = next;
    best = next[0]!;
    if (allFault) break; // nothing survives the first step; commit to the best x anyway
  }

  sim.restore(root);
  return {
    actions: best.actions,
    score: best.score,
    expanded,
    ticks,
    wallMs: performance.now() - t0,
    finishes,
    allFault,
    depthReached,
    finishRunTick,
  };
}
