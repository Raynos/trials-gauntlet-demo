/**
 * Snapshot fidelity under search load (the bot's real access pattern).
 *
 *   pnpm harness:snapshot-probe <recording> [--every 15] [--max-ticks 600]
 *
 * Sim A replays the recording straight. Sim B replays the same frames but every
 * `--every` ticks does what beam search does at a plan root: snapshot, roll every
 * macro-action out for 15 ticks, restore the root. If B's next tick differs from A's,
 * physics keeps state outside snapshot()/restore() (or the hash) — the committed play
 * the bot reports is then a trajectory no replay reproduces (bot.ts warns with
 * `playReplayDivergence`). Prints the first divergent tick, x, and the state paths.
 * Exit 1 on divergence. `snapshotProbe()` is the same check as a function
 * (harness:physics-suite runs it on the flat-test golden).
 */
import path from 'node:path';
import { expandFrames, type InputRecording } from '../../src/core/replay';
import { ACTIONS, macroFrameAt, macroTicks, type MacroCtx } from '../bot/actions';
import { flagNum, parseArgs } from '../lib/args';
import { diffState } from '../lib/metrics';
import { loadRecording } from '../lib/recording';
import { fail } from '../lib/report';
import { createSimFor } from '../lib/sim';

export interface SnapshotProbeResult {
  pass: boolean;
  ticks: number;
  physics: string;
  /** First tick at which the rollout sim differs from the straight one (null when it never does). */
  divergedAt: number | null;
  x: number;
  diffPaths: string[];
  note: string;
}

export async function snapshotProbe(rec: InputRecording, every = 15, maxTicksCap = 600): Promise<SnapshotProbeResult> {
  const frames = expandFrames(rec);
  const maxTicks = Math.min(frames.length, maxTicksCap);
  const A = await createSimFor(rec);
  const B = await createSimFor(rec);
  for (let t = 0; t < maxTicks; t++) {
    if (t % every === 0) {
      const root = B.snap();
      for (let a = 0; a < ACTIONS.length; a++) {
        B.restore(root);
        const ctx: MacroCtx = {};
        for (let i = 0; i < macroTicks(a); i++) B.step(macroFrameAt(a, i, B.state, ctx));
      }
      B.restore(root);
      if (A.hash() !== B.hash()) {
        const paths = diffState(A.state(), B.state());
        return { pass: false, ticks: maxTicks, physics: A.physicsName, divergedAt: t, x: A.state().bike.pos.x, diffPaths: paths, note: `restore(root) != root at tick ${t}: ${paths.slice(0, 6).join(', ')}` };
      }
    }
    A.step(frames[t]!);
    B.step(frames[t]!);
    if (A.hash() !== B.hash()) {
      const s = A.state();
      const paths = diffState(A.state(), B.state());
      return {
        pass: false,
        ticks: maxTicks,
        physics: A.physicsName,
        divergedAt: t + 1,
        x: s.bike.pos.x,
        diffPaths: paths,
        note: `diverge on the tick after a restore: tick ${t + 1} x=${s.bike.pos.x.toFixed(2)} grounded=${s.wheels.rear.grounded}/${s.wheels.front.grounded}: ${paths.slice(0, 6).join(', ')} => physics keeps state outside snapshot()/restore()`,
      };
    }
  }
  return { pass: true, ticks: maxTicks, physics: A.physicsName, divergedAt: null, x: A.state().bike.pos.x, diffPaths: [], note: `${maxTicks} ticks: rollouts + restore never change the next tick (x=${A.state().bike.pos.x.toFixed(1)})` };
}

async function main(): Promise<void> {
  const { positional, flags } = parseArgs();
  const file = positional[0];
  if (!file) fail('usage: snapshot-probe.ts <recording> [--every 15] [--max-ticks 600]');
  const rec = loadRecording(file!);
  const every = Math.max(1, flagNum(flags, 'every', 15));
  const r = await snapshotProbe(rec, every, flagNum(flags, 'max-ticks', 600));
  console.log(`snapshot-probe ${rec.header.trackId} bike=${rec.header.bike ?? 'rookie'} physics=${r.physics} ticks=${r.ticks} rollouts every ${every} ticks x ${ACTIONS.length} actions`);
  if (!r.pass) {
    console.log(`FAIL ${r.note}`);
    console.log(`  state paths that differ (straight vs after-rollouts): ${JSON.stringify(r.diffPaths)}`);
    process.exit(1);
  }
  console.log(`PASS ${r.note}`);
}

const isEntry = process.argv[1] !== undefined && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname;
if (isEntry) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
