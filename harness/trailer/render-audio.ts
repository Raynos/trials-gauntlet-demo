/**
 * Per-beat game audio (engine / tyres / impacts / crowd / UI) through the real physics,
 * sliced to the same tick window as the captured frames.
 *
 *   npx tsx harness/trailer/render-audio.ts harness/trailer/beats.json [--only a,b] [--out harness/out/trailer/beats]
 *
 * Writes <out>/<id>/audio.wav (16-bit stereo 48 kHz), exactly (endTick-startTick)/hz seconds,
 * sample-aligned with frame 0 of the beat. Countdown beats include the 3-2-1-GO preroll.
 */
import fs from 'node:fs';
import path from 'node:path';
import { encodeWav16, renderRecording } from '../../src/audio/offline';
import { bikePhysicsFactory } from '../../src/physics';
import { flagStr, parseArgs } from '../lib/args';
import { loadRecording } from '../lib/recording';

interface Beat {
  id: string;
  recording: string;
  startTick: number;
  endTick: number;
  countdown?: boolean;
}

async function main(): Promise<void> {
  const { positional, flags } = parseArgs();
  const beats = JSON.parse(fs.readFileSync(positional[0]!, 'utf8')) as Beat[];
  const only = typeof flags['only'] === 'string' ? new Set(flags['only'].split(',')) : null;
  const outRoot = path.resolve(flagStr(flags, 'out', 'harness/out/trailer/beats'));
  for (const beat of beats) {
    if (only && !only.has(beat.id)) continue;
    const t0 = performance.now();
    const json = fs.readFileSync(beat.recording, 'utf8');
    const rec = loadRecording(beat.recording);
    const hz = rec.header.physicsHz;
    const seconds = beat.endTick / hz + 0.1;
    const r = await renderRecording(json, seconds, bikePhysicsFactory, { countdown: beat.countdown ?? false });
    const sr = r.sampleRate;
    const s0 = Math.round((beat.startTick / hz) * sr) * 2;
    const s1 = Math.round((beat.endTick / hz) * sr) * 2;
    const slice = r.pcm.subarray(s0, Math.min(s1, r.pcm.length));
    const dir = path.join(outRoot, beat.id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'audio.wav'), encodeWav16(slice, sr, 2));
    let peak = 0;
    for (let i = 0; i < slice.length; i++) peak = Math.max(peak, Math.abs(slice[i]!));
    console.log(`audio ${beat.id}: ${(slice.length / 2 / sr).toFixed(2)} s peak=${(20 * Math.log10(Math.max(peak, 1e-9))).toFixed(1)} dBFS in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
