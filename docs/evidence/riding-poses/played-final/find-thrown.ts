/** Find an input-only overload from a real ridden prefix; every emitted recording
 * is independently replayed from track start. No manufactured pose enters evidence. */
import fs from 'node:fs';
import { decodeJSON, encodeJSON, expandFrames, InputRecorder, quantizeInput } from '../../../../src/core/replay';
import { createProductionSim, equalProductionSnapshots } from '../../../../harness/lib/production-sim';
import { chooseGolden } from '../../../../harness/lib/golden';
import { srcFingerprint } from '../../../../harness/lib/metrics';
const out = process.argv[2];
if (!out || fs.existsSync(out)) throw new Error('Provide a fresh output directory');
fs.mkdirSync(out, { recursive: true });
const report: unknown[] = [];
for (const bike of ['rookie', 'pro'] as const) {
  let tries = 0, found = false;
  for (const track of ['h2-gap-chain', 'h3-fire-line', 'x3-gauntlet', 'b3-kicker-row', 'p2-canyon-run']) {
    const golden = chooseGolden(track, bike);
    if (!golden?.fresh) continue;
    const rec = decodeJSON(fs.readFileSync(golden.file, 'utf8')), inputs = expandFrames(rec);
    const main = createProductionSim(track, bike, rec.header.seed), probe = createProductionSim(track, bike, rec.header.seed);
    for (let i = 0; i < inputs.length && !found; i++) {
      main.step(inputs[i]!);
      const s = main.state();
      if (s.faulted || s.finished || i % 24 || (s.wheels.front.grounded && s.wheels.rear.grounded)) continue;
      for (const input of [{ lean: -1 }, { lean: 1 }, { throttle: 1, lean: -1 }, { brake: 1, lean: 1 }]) {
        tries++; probe.restore(main.snap());
        const q = quantizeInput(input), tail = [];
        for (let j = 0; j < 120; j++) {
          probe.step(q); tail.push(q);
          if (probe.state().faulted || probe.state().finished) break;
        }
        if (probe.world.debug().crashCause !== 'thrown') continue;
        const recording = new InputRecorder({ ...rec.header, note: `Input-only overload; src=${srcFingerprint()}; searched ${tries} real-prefix branches.` });
        for (const f of inputs.slice(0, i + 1)) recording.push(f);
        for (const f of tail) recording.push(f);
        const faultTick = recording.frameCount;
        for (let j = 0; j < 60; j++) { const f = quantizeInput({}); recording.push(f); probe.step(f); }
        const replay = createProductionSim(track, bike, rec.header.seed);
        for (const f of expandFrames(recording.toRecording())) replay.step(f);
        if (!equalProductionSnapshots(probe.snap(), replay.snap())) throw new Error('Recorded branch does not replay exactly');
        fs.writeFileSync(`${out}/thrown-${bike}.json`, encodeJSON(recording.toRecording()) + '\n');
        report.push({ bike, track, tries, prefixTicks: i + 1, faultTick, totalTicks: recording.frameCount, cause: probe.world.debug().crashCause, exactReplay: true });
        found = true; break;
      }
    }
    if (found) break;
  }
  if (!found) report.push({ bike, tries, found: false });
}
fs.writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2) + '\n');
console.info(report);
