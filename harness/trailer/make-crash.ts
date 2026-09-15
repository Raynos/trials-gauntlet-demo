/**
 * Deliberate crash recording for the trailer's crash -> hard-cut respawn beat.
 * Follows a golden for `--until` seconds (so the bike is at speed, mid-track), then
 * full gas + full lean back until the loop-out crash, holds 1.6 s of ragdoll, then
 * taps restart and resumes the golden's inputs from the checkpoint it respawns at
 * (any input works: the beat cuts away 1 s after the respawn).
 *
 *   npx tsx harness/trailer/make-crash.ts <trackId> --until 6 --out harness/inputs/<track>/trailer-crash.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { InputRecorder, expandFrames } from '../../src/core/replay';
import type { InputFrame } from '../../src/core/types';
import { flagNum, flagStr, parseArgs } from '../lib/args';
import { loadRecording, saveRecording } from '../lib/recording';
import { createSim } from '../lib/sim';
import { srcFingerprint } from '../lib/metrics';

async function main(): Promise<void> {
  const { positional, flags } = parseArgs();
  const trackId = positional[0]!;
  const golden = loadRecording(flagStr(flags, 'golden', `harness/inputs/${trackId}/bot-3.json`));
  const until = flagNum(flags, 'until', 6);
  const holdS = flagNum(flags, 'hold', 1.6);
  const hz = golden.header.physicsHz;
  const base = expandFrames(golden);
  // The golden's bike class and solver (v0.2.0: the hard/extreme goldens are Pro on physics v2).
  const bike = golden.header.bike;
  const sim = await createSim(trackId, golden.header.seed, hz, { bike });
  const rec = new InputRecorder({ version: 1, trackId, seed: golden.header.seed, physicsHz: hz, ...(bike ? { bike } : {}), ...(golden.header.physics ? { physics: golden.header.physics } : {}), note: `trailer crash bike=${bike ?? 'rookie'} src=${srcFingerprint()}` });
  const frames: InputFrame[] = [];
  const push = (f: InputFrame): void => {
    frames.push(f);
    rec.push(f);
    sim.step(f);
  };
  let i = 0;
  for (; i < Math.round(until * hz) && i < base.length; i++) push(base[i]!);
  // Loop out (or, mid-air, over-rotate: `--lean` -1 = back, 1 = forward).
  const lean = flagNum(flags, 'lean', -1);
  let crashTick = -1;
  for (let k = 0; k < 6 * hz; k++) {
    push({ throttle: 1, brake: 0, lean });
    if (sim.state().faulted) {
      crashTick = frames.length;
      break;
    }
  }
  if (crashTick < 0) throw new Error('never crashed');
  // Ragdoll hold (the game auto-respawns at 1.0 s; the restart tap here is the player's, for the record).
  for (let k = 0; k < Math.round(holdS * hz); k++) push({ throttle: 0, brake: 0, lean: 0 });
  push({ throttle: 0, brake: 0, lean: 0, restart: true });
  // Resume: gas + whatever the golden did from a similar point (2 s is all the beat needs).
  const cp = sim.state().checkpoint;
  for (let k = 0; k < 3 * hz; k++) push({ throttle: 1, brake: 0, lean: 0.2 });
  const st = sim.state();
  const out = flagStr(flags, 'out', `harness/inputs/${trackId}/trailer-crash.json`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  saveRecording(out, rec.toRecording());
  console.log(`crash at tick ${crashTick} (${(crashTick / hz).toFixed(2)} s) x=${frames.length} frames; respawn cp=${cp}; end x=${st.bike.pos.x.toFixed(1)} faulted=${st.faulted} -> ${out}`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
