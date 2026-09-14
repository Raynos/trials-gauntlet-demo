/**
 * Generate a synthetic input recording for the harness to chew on.
 *
 *   pnpm harness:gen-input [--out harness/inputs/flat-test-10s.json] [--seconds 10]
 *                          [--track flat-test] [--seed N] [--hz 120] [--style throttle|wiggle]
 *
 * `.json` writes the readable encoding, `.bin`/`.trin` the binary one.
 */
import path from 'node:path';
import { DEFAULT_PHYSICS_HZ } from '../src/core/types';
import { seedFromString } from '../src/core/rng';
import { flagNum, flagStr, parseArgs } from './lib/args';
import { HARNESS_DIR } from './lib/paths';
import { describeRecording, saveRecording } from './lib/recording';
import { synthesizeRecording, type SynthStyle } from './lib/synth';

function main(): void {
  const { flags } = parseArgs();
  const seconds = flagNum(flags, 'seconds', 10);
  const physicsHz = flagNum(flags, 'hz', DEFAULT_PHYSICS_HZ);
  const trackId = flagStr(flags, 'track', 'flat-test');
  const seed = flagNum(flags, 'seed', seedFromString(trackId));
  const style = flagStr(flags, 'style', 'wiggle') as SynthStyle;
  const out = flagStr(flags, 'out', path.join(HARNESS_DIR, 'inputs', `${trackId}-${seconds}s.json`));
  const recording = synthesizeRecording({ trackId, seed, physicsHz, seconds, style });
  saveRecording(out, recording);
  console.log(`wrote ${out}`);
  console.log(describeRecording(recording));
}

main();
