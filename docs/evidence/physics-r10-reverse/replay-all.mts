// Replay every harness/inputs/<track>/bot-3*.json golden in node: hash, finish, ticks, and whether the input
// ever holds brake (>0) with throttle 0 while |vx| < 0.5 and the rear wheel is grounded (the reverse gate).
import fs from 'node:fs';
import path from 'node:path';
import { expandFrames } from '../../../src/core/replay';
import { loadRecording } from '../../../harness/lib/recording';
import { createSimFor } from '../../../harness/lib/sim';
import { goldenBike } from '../../../harness/lib/golden';

const root = new URL('../../../harness/inputs', import.meta.url).pathname;
const out: Record<string, unknown> = {};
for (const track of fs.readdirSync(root).sort()) {
  const dir = path.join(root, track);
  if (!fs.statSync(dir).isDirectory()) continue;
  for (const name of ['bot-3.json', 'bot-3-pro.json']) {
    const file = path.join(dir, name);
    if (!fs.existsSync(file)) continue;
    const rec = loadRecording(file);
    if (!rec.header.bike) rec.header.bike = goldenBike(file);
    const sim = await createSimFor(rec);
    const frames = expandFrames(rec);
    let faults = 0;
    let brakeAtRest = 0;
    const brakeAtRestTicks: number[] = [];
    let tick = 0;
    for (const f of frames) {
      const s = sim.state();
      if (f.brake > 0 && f.throttle === 0 && Math.abs(s.bike.vel.x) < 0.5 && s.wheels.rear.grounded && !s.faulted && !s.finishTime) {
        brakeAtRest++;
        if (brakeAtRestTicks.length < 5) brakeAtRestTicks.push(tick);
      }
      for (const e of sim.step(f)) if (e.type === 'fault') faults++;
      tick++;
    }
    const key = `${track}/${name}`;
    out[key] = { hash: sim.hash(), finish: sim.phase() === 'finished' ? sim.runTime() : null, ticks: frames.length, faults, brakeAtRest, brakeAtRestTicks, x: sim.state().bike.pos.x };
    console.log(key.padEnd(40), JSON.stringify(out[key]));
  }
}
fs.writeFileSync(process.argv[2] ?? 'replay.json', JSON.stringify(out, null, 1));
