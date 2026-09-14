/**
 * Headless listening: render the gauntlet fixture (and optionally a recording
 * through MockPhysics) to WAV, then let ffmpeg draw the spectrogram/waveform
 * and measure loudness. Nobody can hear this machine — look at the pictures.
 *
 *   npx tsx src/audio/tools/renderDemo.ts <outDir> [--solo engine|tyres|chassis|ambient|ui]
 *                                          [--recording harness/inputs/flat-test-clear.json --seconds 12 --physics bike|mock]
 *                                          [--biome canyon]
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { MockPhysics } from '../../game/mockPhysics';
import { bikePhysicsFactory } from '../../physics';
import { BIOMES } from '../params';
import { encodeWav16, renderRecording, renderScript, type OfflineOptions, type OfflineResult } from '../offline';
import { GAUNTLET, gauntletScript } from './fixture';

const FFMPEG = ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/usr/bin/ffmpeg'].find((p) => fs.existsSync(p)) ?? 'ffmpeg';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function sha256(u8: Uint8Array): string {
  return createHash('sha256').update(u8).digest('hex');
}

function ffmpeg(args: string[]): string {
  const r = spawnSync(FFMPEG, ['-hide_banner', '-nostdin', '-y', ...args], { encoding: 'utf8' });
  return (r.stdout ?? '') + (r.stderr ?? '');
}

function analyse(wav: string): { lufs: number | null; peakDbtp: number | null; lra: number | null } {
  const out = ffmpeg(['-i', wav, '-af', 'ebur128=peak=true', '-f', 'null', '-']);
  const tail = out.slice(out.lastIndexOf('Summary:'));
  const num = (re: RegExp): number | null => {
    const m = tail.match(re);
    return m ? Number(m[1]) : null;
  };
  return { lufs: num(/I:\s+(-?[\d.]+) LUFS/), peakDbtp: num(/Peak:\s+(-?[\d.]+) dBFS/), lra: num(/LRA:\s+(-?[\d.]+) LU/) };
}

function pictures(wav: string, base: string): void {
  ffmpeg(['-i', wav, '-lavfi', 'showspectrumpic=s=1920x640:legend=1:scale=log:fscale=log:start=20:stop=12000', `${base}.spectrogram.png`]);
  ffmpeg(['-i', wav, '-lavfi', 'showwavespic=s=1920x300:split_channels=1', `${base}.wave.png`]);
}

async function main(): Promise<void> {
  const outDir = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'harness/out/audio';
  fs.mkdirSync(outDir, { recursive: true });
  const solo = (arg('solo') ?? null) as OfflineOptions['solo'];
  const biome = arg('biome');
  const opts: OfflineOptions = { solo };
  const report: Record<string, unknown> = { ffmpeg: FFMPEG };

  const recording = arg('recording');
  let a: OfflineResult;
  let b: OfflineResult;
  let name: string;
  const t0 = performance.now();
  if (recording) {
    const json = fs.readFileSync(recording, 'utf8');
    const seconds = Number(arg('seconds') ?? 12);
    const make = arg('physics') === 'mock' ? (hz: number): MockPhysics => new MockPhysics(hz) : bikePhysicsFactory;
    a = await renderRecording(json, seconds, make, { ...opts, countdown: true });
    b = await renderRecording(json, seconds, make, { ...opts, countdown: true });
    name = recording.replace(/^.*harness\/inputs\//, '').replace(/\.\w+$/, '').replace(/\//g, '.');
  } else {
    const script = gauntletScript(60);
    const seed = biome ? BIOMES.indexOf(biome as (typeof BIOMES)[number]) : 1;
    const withBiome: OfflineOptions = {
      ...opts,
      onUpdate: (_u, _s, d) => {
        if (biome) d.scratch.biome = Math.max(0, seed);
      },
    };
    a = renderScript(script, GAUNTLET.end, withBiome, 1);
    b = renderScript(gauntletScript(60), GAUNTLET.end, withBiome, 1);
    name = 'gauntlet';
  }
  const renderMs = (performance.now() - t0) / 2;
  if (solo) name += `.${solo}`;
  if (biome) name += `.${biome}`;
  const wavA = encodeWav16(a.pcm, a.sampleRate, 2);
  const wavB = encodeWav16(b.pcm, b.sampleRate, 2);
  const hashA = sha256(wavA);
  const hashB = sha256(wavB);
  const wavPath = path.join(outDir, `${name}.wav`);
  fs.writeFileSync(wavPath, wavA);
  let peak = 0;
  for (let i = 0; i < a.pcm.length; i++) peak = Math.max(peak, Math.abs(a.pcm[i]!));
  pictures(wavPath, path.join(outDir, name));
  const seconds = a.pcm.length / 2 / a.sampleRate;
  Object.assign(report, {
    wav: wavPath,
    spectrogram: path.join(outDir, `${name}.spectrogram.png`),
    seconds,
    deterministic: hashA === hashB,
    sha256: hashA,
    samplePeakDbfs: 20 * Math.log10(Math.max(peak, 1e-9)),
    renderMs,
    realtimeRatio: (seconds * 1000) / renderMs,
    ...analyse(wavPath),
  });
  fs.writeFileSync(path.join(outDir, `${name}.report.json`), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

void main();
