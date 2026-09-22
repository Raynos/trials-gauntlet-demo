/**
 * Measured, not posed (audio round 3, MEGA_PLAN P6): four beats rendered offline through the real v2
 * physics — start gate, wheelie, 2 m landing, crash + respawn — each twice (sha256 must match), written
 * as WAV + spectrogram, and measured against the reference corpus' audio for the same beats (cut from
 * the local-only reference gameplay videos under `reference/`, with ffmpeg).
 *
 *   npx tsx src/audio/tools/beats.ts <outDir> [--ref <dir with ref WAVs>] [--bike pro]
 *
 * Prints a markdown table: RMS dBFS, peak dBFS, crest dB, spectral centroid Hz (energy-weighted mean over
 * 4096-pt Hann frames above −50 dBFS) for ours and each reference cut, plus the CPU per 60 Hz frame.
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { quantizeInput } from '../../core/replay';
import type { BikeClass, InputFrame } from '../../core/types';
import { createBikePhysics, bikePhysicsFactory } from '../../physics';
import { observe, wheelieHoldV3 } from '../../physics/controllers';
import { compileTrack, getTrack } from '../../tracks';
import { encodeWav16, renderRecording, renderWorld, type OfflineResult } from '../offline';

const FFMPEG = ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/usr/bin/ffmpeg'].find((p) => fs.existsSync(p)) ?? 'ffmpeg';
const HZ = 120;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const sha256 = (u8: Uint8Array): string => createHash('sha256').update(u8).digest('hex');

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

export interface Measure {
  rmsDb: number;
  peakDb: number;
  crestDb: number;
  centroidHz: number;
  seconds: number;
}

/** 16-bit PCM WAV → mono Float32Array + sample rate (what ffmpeg and encodeWav16 write). */
export function readWavMono(file: string): { x: Float32Array; sr: number } {
  const b = fs.readFileSync(file);
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let o = 12;
  let sr = 48000;
  let ch = 2;
  let bits = 16;
  while (o + 8 <= b.length) {
    const id = b.toString('ascii', o, o + 4);
    const size = dv.getUint32(o + 4, true);
    if (id === 'fmt ') {
      ch = dv.getUint16(o + 10, true);
      sr = dv.getUint32(o + 12, true);
      bits = dv.getUint16(o + 22, true);
    } else if (id === 'data') {
      if (bits !== 16) throw new Error(`${file}: ${bits}-bit WAV not supported`);
      const frames = Math.floor(size / (2 * ch));
      const x = new Float32Array(frames);
      let p = o + 8;
      for (let i = 0; i < frames; i++) {
        let s = 0;
        for (let c = 0; c < ch; c++, p += 2) s += dv.getInt16(p, true) / 32768;
        x[i] = s / ch;
      }
      return { x, sr };
    }
    o += 8 + size + (size & 1);
  }
  throw new Error(`${file}: no data chunk`);
}

function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i]!;
      re[i] = re[j]!;
      re[j] = t;
      t = im[i]!;
      im[i] = im[j]!;
      im[j] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b]! * cr - im[b]! * ci;
        const ti = re[b]! * ci + im[b]! * cr;
        re[b] = re[a]! - tr;
        im[b] = im[a]! - ti;
        re[a] = re[a]! + tr;
        im[a] = im[a]! + ti;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

export function measure(x: Float32Array, sr: number, from = 0, to = x.length): Measure {
  let s = 0;
  let pk = 0;
  for (let i = from; i < to; i++) {
    const v = x[i]!;
    s += v * v;
    if (Math.abs(v) > pk) pk = Math.abs(v);
  }
  const rms = Math.sqrt(s / Math.max(1, to - from));
  const N = 4096;
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  const win = new Float64Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);
  let num = 0;
  let den = 0;
  for (let o = from; o + N <= to; o += N / 2) {
    let e = 0;
    for (let i = 0; i < N; i++) {
      const v = x[o + i]! * win[i]!;
      re[i] = v;
      im[i] = 0;
      e += v * v;
    }
    if (10 * Math.log10(e / N + 1e-20) < -50) continue;
    fft(re, im);
    for (let k = 1; k < N / 2; k++) {
      const p = re[k]! * re[k]! + im[k]! * im[k]!;
      num += p * ((k * sr) / N);
      den += p;
    }
  }
  return {
    rmsDb: 20 * Math.log10(rms + 1e-12),
    peakDb: 20 * Math.log10(pk + 1e-12),
    crestDb: 20 * Math.log10((pk + 1e-12) / (rms + 1e-12)),
    centroidHz: den > 0 ? num / den : 0,
    seconds: (to - from) / sr,
  };
}

function monoOf(r: OfflineResult): Float32Array {
  const out = new Float32Array(r.pcm.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = 0.5 * (r.pcm[2 * i]! + r.pcm[2 * i + 1]!);
  return out;
}

// ---------------------------------------------------------------------------
// The four beats
// ---------------------------------------------------------------------------

const ROOT = process.cwd();
const read = (p: string): string => fs.readFileSync(path.join(ROOT, p), 'utf8');

async function startGate(bike: BikeClass): Promise<OfflineResult> {
  // 3-2-1-GO then the v2 launch: the clutch climb to 3500, the hold to 7 m/s, the long pull toward the limiter
  const json = read('harness/inputs/flat-test-clear.json');
  const rec = JSON.parse(json) as { header: { bike?: string } };
  rec.header.bike = bike;
  return renderRecording(JSON.stringify(rec), 9, bikePhysicsFactory, { countdown: true });
}

function wheelie(bike: BikeClass): OfflineResult {
  // lab-flat-200: wheelieHoldV3(40, 4) as r3.test.ts drives it — v2's wheelie is a 2 m/s balance on the clutch (~1700 rpm)
  const def = getTrack('lab-flat-200');
  if (!def) throw new Error('lab-flat-200 missing');
  const track = compileTrack(def);
  const physics = createBikePhysics(HZ);
  physics.loadTrack(track, def.seed, { bike });
  const ctrl = wheelieHoldV3(40, 4);
  let current: InputFrame = quantizeInput({});
  const nextFrame = (tick: number): InputFrame => {
    if (tick % 2 === 0) current = quantizeInput(ctrl(observe(physics, physics.getState())));
    return current;
  };
  return renderWorld({ physics, track, seed: def.seed, physicsHz: HZ, bike, nextFrame }, 8);
}

function landing(bike: BikeClass): OfflineResult {
  // lab-flat-200 with the bike teleported 2 m up at 8 m/s, throttle 0.2 (the R3 landing table's row): both
  // wheels bottom the rear (100 %) and ride away; then a second, higher drop (3 m) at 12 m/s four seconds later
  const def = getTrack('lab-flat-200');
  if (!def) throw new Error('lab-flat-200 missing');
  const track = compileTrack(def);
  const physics = createBikePhysics(HZ);
  physics.loadTrack(track, def.seed, { bike });
  const drops = [
    { at: 60, h: 2, v: 8 },
    { at: 4 * HZ + 60, h: 3, v: 12 },
  ];
  const nextFrame = (tick: number): InputFrame => {
    for (const d of drops) {
      if (tick === d.at) {
        const s = physics.getState();
        physics.teleport({ pos: { x: s.wheels.rear.pos.x, y: s.wheels.rear.pos.y + d.h }, angle: (5 * Math.PI) / 180, vel: { x: d.v, y: 0 } });
      }
    }
    return quantizeInput({ throttle: 0.2 });
  };
  return renderWorld({ physics, track, seed: def.seed, physicsHz: HZ, bike, nextFrame }, 8);
}

async function crashRespawn(bike: BikeClass): Promise<OfflineResult> {
  const json = read('harness/inputs/flat-test/crash.json');
  const rec = JSON.parse(json) as { header: { bike?: string } };
  rec.header.bike = bike;
  return renderRecording(JSON.stringify(rec), 7, bikePhysicsFactory, {});
}

// ---------------------------------------------------------------------------

function ffmpeg(args: string[]): void {
  spawnSync(FFMPEG, ['-hide_banner', '-nostdin', '-y', ...args], { encoding: 'utf8' });
}

async function main(): Promise<void> {
  const outDir = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'harness/out/audio-beats';
  fs.mkdirSync(outDir, { recursive: true });
  const refDir = arg('ref');
  const bike = (arg('bike') ?? 'rookie') as BikeClass;
  const beats: { name: string; render: () => Promise<OfflineResult> | OfflineResult; refs: string[] }[] = [
    { name: 'start-gate', render: () => startGate(bike), refs: ['start-01', 'start-08'] },
    { name: 'wheelie', render: () => wheelie(bike), refs: ['wheelie-02', 'wheelie-05'] },
    { name: 'landing-2m', render: () => landing(bike), refs: ['landing-12', 'landing-14'] },
    { name: 'crash-respawn', render: () => crashRespawn(bike), refs: ['crash-04', 'crash-13'] },
  ];
  const rows: string[] = [];
  const report: Record<string, unknown> = { bike, ffmpeg: FFMPEG };
  let cpuMs = 0;
  let cpuUpdates = 0;
  rows.push('| beat | clip | s | RMS dBFS | peak dBFS | crest dB | centroid Hz | sha256 (ours, 2 renders) |');
  rows.push('|--|--|--|--|--|--|--|--|');
  for (const b of beats) {
    const t0 = performance.now();
    const a = await b.render();
    const ms = performance.now() - t0;
    const a2 = await b.render();
    const wavA = encodeWav16(a.pcm, a.sampleRate, 2);
    const wavB = encodeWav16(a2.pcm, a2.sampleRate, 2);
    const hA = sha256(wavA);
    const hB = sha256(wavB);
    const file = path.join(outDir, `${b.name}-${bike}.wav`);
    fs.writeFileSync(file, wavA);
    ffmpeg(['-i', file, '-lavfi', 'showspectrumpic=s=1600x480:legend=1:scale=log:fscale=log:start=20:stop=12000', file.replace(/\.wav$/, '.spectrogram.png')]);
    cpuMs += ms;
    cpuUpdates += a.updates;
    const m = measure(monoOf(a), a.sampleRate);
    const same = hA === hB ? 'identical' : 'DIFFER';
    rows.push(`| ${b.name} | ours (${bike}) | ${m.seconds.toFixed(1)} | ${m.rmsDb.toFixed(1)} | ${m.peakDb.toFixed(1)} | ${m.crestDb.toFixed(1)} | ${m.centroidHz.toFixed(0)} | ${hA.slice(0, 12)} ${same} |`);
    const refMs: Record<string, Measure> = {};
    if (refDir) {
      for (const r of b.refs) {
        const rf = path.join(refDir, `${r}.wav`);
        if (!fs.existsSync(rf)) continue;
        const w = readWavMono(rf);
        const rm = measure(w.x, w.sr);
        refMs[r] = rm;
        rows.push(`| ${b.name} | ref ${r} | ${rm.seconds.toFixed(1)} | ${rm.rmsDb.toFixed(1)} | ${rm.peakDb.toFixed(1)} | ${rm.crestDb.toFixed(1)} | ${rm.centroidHz.toFixed(0)} | — |`);
        ffmpeg(['-i', rf, '-lavfi', 'showspectrumpic=s=1600x480:legend=1:scale=log:fscale=log:start=20:stop=12000', path.join(outDir, `ref-${r}.spectrogram.png`)]);
      }
    }
    report[b.name] = { file, sha256: hA, deterministic: hA === hB, ours: m, refs: refMs, renderMs: ms, updates: a.updates };
  }
  const perFrame = cpuMs / cpuUpdates;
  report['cpuMsPerFrame'] = perFrame;
  fs.writeFileSync(path.join(outDir, `report-${bike}.json`), JSON.stringify(report, null, 2));
  console.log(rows.join('\n'));
  console.log(`\nCPU: ${perFrame.toFixed(3)} ms per 60 Hz update over ${cpuUpdates} updates (${(1000 / 60 / perFrame).toFixed(0)}× realtime, first render of each beat, cold JIT included)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
