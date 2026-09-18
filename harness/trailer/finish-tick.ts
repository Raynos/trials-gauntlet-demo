/**
 * Does a recording still finish on the current src, and on which tick?
 *
 * The trailer's finish/results beat is a tick window around the finish, so the cut needs
 * the tick, and needs to know the golden was not restamped past its physics (the v0.2.0
 * cut list's warning about the committed Pro goldens).
 *
 *   npx tsx harness/trailer/finish-tick.ts harness/inputs/b1-first-ride/bot-3.json
 */
import { expandFrames } from '../../src/core/replay';
import { loadRecording } from '../lib/recording';
import { createSimFor } from '../lib/sim';

const file = process.argv[2];
if (!file) throw new Error('usage: finish-tick.ts <recording.json>');
const rec = loadRecording(file);
const sim = await createSimFor(rec);
const frames = expandFrames(rec);
let finishTick = -1;
for (let i = 0; i < frames.length; i++) {
  sim.step(frames[i]!);
  if (finishTick < 0 && sim.phase() === 'finished') finishTick = i;
}
console.log(
  JSON.stringify(
    {
      track: rec.header.trackId,
      bike: rec.header.bike ?? 'rookie',
      hz: rec.header.physicsHz,
      ticks: frames.length,
      finishTick,
      phase: sim.phase(),
      runTime: sim.runTime(),
      faults: sim.faults(),
      hash: sim.hash(),
    },
    null,
    1,
  ),
);
