/** Input-only motion fixtures, driven through the production Game. No teleports,
 * injected body transforms or hidden state edits. Run after freezing the physics:
 * tsx harness/riding-pose-recordings.ts <new-output-directory>
 */
import fs from 'node:fs';
import path from 'node:path';
import { encodeJSON, InputRecorder, iterateFrames, quantizeInput } from '../src/core/replay';
import type { InputFrame } from '../src/core/types';
import { createProductionSim, equalProductionSnapshots } from './lib/production-sim';
import { srcFingerprint } from './lib/metrics';

const output = process.argv[2];
if (!output || fs.existsSync(output)) throw new Error('Provide a new output directory; previous evidence is never overwritten');
fs.mkdirSync(output, { recursive: true });
const rows = [];
for (const bike of ['rookie', 'pro'] as const) {
  for (const motion of ['hop', 'crash-restart'] as const) {
    const sim = createProductionSim('flat-test', bike);
    const recorder = new InputRecorder({ version: 1, trackId: 'flat-test', seed: 1, physicsHz: 120, physics: 'v2', bike,
      note: `Played ${motion}; src=${srcFingerprint()}; production Game, quantized controls only.` });
    const events: { tick: number; event: unknown }[] = [];
    let crashTick: number | null = null, restartTick: number | null = null;
    let rearApex = 0, bothOffTicks = 0, releaseTicks = 0;
    const step = (input: Partial<InputFrame>, ticks: number) => {
      const q = quantizeInput(input);
      for (let i = 0; i < ticks; i++) {
        recorder.push(q);
        for (const event of sim.step(q)) events.push({ tick: recorder.frameCount, event });
        const s = sim.state();
        if (s.faulted && crashTick === null) crashTick = recorder.frameCount;
        if (s.ragdoll) releaseTicks++;
      }
    };
    step({}, 240);
    const groundY = sim.state().wheels.rear.pos.y;
    if (motion === 'hop') {
      // Match the handling fixture's t < .3 + .22 boundary: 27 snap ticks.
      for (const [ticks, input] of [
        [36, { throttle: .3, lean: -1 }],
        [27, { throttle: .3, lean: 1 }],
        [12, { throttle: .2, lean: -1 }],
        [285, { throttle: .2, lean: 0 }],
      ] as [number, Partial<InputFrame>][]) {
        for (let i = 0; i < ticks; i++) {
          step(input, 1);
          const s = sim.state();
          rearApex = Math.max(rearApex, s.wheels.rear.pos.y - groundY);
          if (!s.wheels.front.grounded && !s.wheels.rear.grounded && !s.faulted) bothOffTicks++;
        }
      }
    } else {
      for (let i = 0; i < 480 && crashTick === null; i++) step({ throttle: 1, lean: -1 }, 1);
      if (crashTick === null) throw new Error(`${bike}: held rear lean did not produce a crash`);
      step({}, 60);
      restartTick = recorder.frameCount + 1;
      step({ restart: true }, 1);
      if (sim.state().faulted || sim.state().ragdoll) throw new Error(`${bike}: restart did not recover in one input tick`);
      step({ throttle: .3 }, 180);
    }
    const recording = recorder.toRecording();
    const replay = createProductionSim('flat-test', bike);
    for (const input of iterateFrames(recording)) replay.step(input);
    if (!equalProductionSnapshots(sim.snap(), replay.snap())) throw new Error(`${bike}/${motion}: replay bytes differ`);
    fs.writeFileSync(path.join(output, `${motion}-${bike}.json`), encodeJSON(recording) + '\n');
    rows.push({ bike, motion, ticks: recorder.frameCount, crashTick, restartTick, releaseTicks,
      rearApex, bothOffTicks, finalFault: sim.state().faulted, finalHash: sim.hash(), nodeReplayBytesIdentical: true, events });
  }
}
fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ src: srcFingerprint(), rows }, null, 2) + '\n');
console.log(JSON.stringify({ output, rows }, null, 2));
