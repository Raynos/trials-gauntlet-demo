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
 * Exit 1 on divergence.
 */
import { expandFrames } from '../../src/core/replay';
import { ACTIONS, framesOf } from '../bot/actions';
import { flagNum, parseArgs } from '../lib/args';
import { diffState } from '../lib/metrics';
import { loadRecording } from '../lib/recording';
import { fail } from '../lib/report';
import { createSim } from '../lib/sim';

async function main(): Promise<void> {
  const { positional, flags } = parseArgs();
  const file = positional[0];
  if (!file) fail('usage: snapshot-probe.ts <recording> [--every 15] [--max-ticks 600]');
  const rec = loadRecording(file!);
  const frames = expandFrames(rec);
  const every = Math.max(1, flagNum(flags, 'every', 15));
  const maxTicks = Math.min(frames.length, flagNum(flags, 'max-ticks', 600));
  const A = await createSim(rec.header.trackId, rec.header.seed, rec.header.physicsHz);
  const B = await createSim(rec.header.trackId, rec.header.seed, rec.header.physicsHz);
  console.log(`snapshot-probe ${rec.header.trackId} physics=${A.physicsName} ticks=${maxTicks} rollouts every ${every} ticks x ${ACTIONS.length} actions`);
  for (let t = 0; t < maxTicks; t++) {
    if (t % every === 0) {
      const root = B.snap();
      for (let a = 0; a < ACTIONS.length; a++) {
        B.restore(root);
        for (const f of framesOf(a)) B.step(f);
      }
      B.restore(root);
      if (A.hash() !== B.hash()) {
        console.log(`FAIL restore(root) != root at tick ${t} x=${A.state().bike.pos.x.toFixed(2)}: ${JSON.stringify(diffState(A.state(), B.state()))}`);
        process.exit(1);
      }
    }
    A.step(frames[t]!);
    B.step(frames[t]!);
    if (A.hash() !== B.hash()) {
      const s = A.state();
      console.log(`FAIL diverge on the tick after a restore: tick ${t + 1} x=${s.bike.pos.x.toFixed(2)} grounded=${s.wheels.rear.grounded}/${s.wheels.front.grounded} faulted=${s.faulted}`);
      console.log(`  state paths that differ (straight vs after-rollouts): ${JSON.stringify(diffState(A.state(), B.state()))}`);
      console.log('  => physics keeps state outside snapshot()/restore(): a search that restores a snapshot does not resume the same world.');
      process.exit(1);
    }
  }
  console.log(`PASS ${maxTicks} ticks: rollouts + restore never change the next tick (x=${A.state().bike.pos.x.toFixed(1)})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
