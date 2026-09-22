/**
 * Measure a beat the way the round-11 audio critics did (audio round 4, docs/design/audio.md §11): per WAV,
 *
 *   jitter %      cycle-to-cycle timing jitter of the combustion pulse train — the low-band envelope's onsets over the
 *                 steadiest 2 s window: std / mean of the inter-pulse intervals; r1 = the envelope's autocorrelation
 *                 at the firing period (1.00 = a metronome)
 *   level range   dB: p95 − p5 of the 200 ms RMS series over the whole cut (the "4.6 dB window" tell)
 *   centroid      Hz: p10 / p90 of the per-frame spectral centroid (4096-pt Hann, frames above −55 dBFS)
 *   L/R corr      Pearson correlation of the two channels; S/M = side RMS / mid RMS (mono reads 1.00 / 0.00)
 *   > 3 kHz       dB: energy above 3 kHz relative to the whole (the "nothing above 3 kHz" tell)
 *   thump         the biggest 60–120 Hz onset: band energy in the 150 ms after vs the 150 ms before (dB), and the
 *                 400 ms RMS envelope after it in eight 50 ms steps (dB re the peak step) — reference cuts 12 / 14
 *   repeat r      max normalised cross-correlation between two given windows (the crash and its replay) — the
 *                 "deterministic re-trigger" tell (r = 0.67 in round 11)
 *
 *   npx tsx src/audio/tools/critic.ts <wav> [--repeat a0,a1,b0,b1] [--json]
 */
import fs from 'node:fs';

export interface CriticMeasure {
  seconds: number;
  rmsDb: number;
  jitterPct: number;
  pulseHz: number;
  /** Envelope autocorrelation at the firing period: 1.00 = a metronome. */
  periodicity: number;
  levelRangeDb: number;
  centroidP10: number;
  centroidP90: number;
  lrCorr: number;
  sideMid: number;
  hi3kDb: number;
  thumpAt: number;
  thumpGainDb: number;
  thumpEnv: number[];
  repeatR: number | null;
}

export function readWavStereo(file: string): { L: Float32Array; R: Float32Array; sr: number } {
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
      const L = new Float32Array(frames);
      const R = new Float32Array(frames);
      let p = o + 8;
      for (let i = 0; i < frames; i++) {
        L[i] = dv.getInt16(p, true) / 32768;
        R[i] = ch > 1 ? dv.getInt16(p + 2, true) / 32768 : L[i]!;
        p += 2 * ch;
      }
      return { L, R, sr };
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

/** Biquad bandpass (constant 0 dB peak) over a whole buffer. */
function bandpass(x: Float32Array, sr: number, f: number, q: number): Float32Array {
  const w = (2 * Math.PI * f) / sr;
  const alpha = Math.sin(w) / (2 * q);
  const a0 = 1 + alpha;
  const b0 = alpha / a0;
  const b2 = -alpha / a0;
  const a1 = (-2 * Math.cos(w)) / a0;
  const a2 = (1 - alpha) / a0;
  const y = new Float32Array(x.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = x[i]!;
    const o = b0 * v + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = v;
    y2 = y1;
    y1 = o;
    y[i] = o;
  }
  return y;
}

const db = (v: number): number => 20 * Math.log10(v + 1e-12);
const pct = (arr: number[], p: number): number => {
  if (arr.length === 0) return 0;
  const a = [...arr].sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.floor(p * a.length))]!;
};

function rmsSeries(x: Float32Array, sr: number, winS: number): number[] {
  const w = Math.round(winS * sr);
  const out: number[] = [];
  for (let o = 0; o + w <= x.length; o += w) {
    let s = 0;
    for (let i = 0; i < w; i++) s += x[o + i]! * x[o + i]!;
    out.push(Math.sqrt(s / w));
  }
  return out;
}

/**
 * Pulse-train rate and jitter from the low-band envelope over the steadiest 2 s (lowest RMS variance of 200 ms
 * windows): the envelope's normalised autocorrelation peaks at the firing period T and its multiples; per-cycle
 * timing error random-walks the phase, so the peak heights decay r_k ≈ r_1·exp(−2π²σ²(k−1)) — σ (fraction of a
 * period) is fitted from k = 1..6 and reported as jitter %. A metronomic train reads < 1 %.
 */
function pulseJitter(x: Float32Array, sr: number): { jitterPct: number; pulseHz: number; r1: number } {
  const lo = bandpass(x, sr, 150, 0.5);
  // envelope: rectify + two one-pole LPs at 45 Hz (follows the firing rate, 12–85 Hz, not the ~130 Hz pipe tone)
  const k = 1 - Math.exp(-(2 * Math.PI * 45) / sr);
  const ds = Math.max(1, Math.floor(sr / 2000));
  const esr = sr / ds;
  const env = new Float32Array(Math.floor(lo.length / ds));
  let e = 0;
  let e2 = 0;
  for (let i = 0; i < lo.length; i++) {
    e += (Math.abs(lo[i]!) - e) * k;
    e2 += (e - e2) * k;
    if (i % ds === 0 && i / ds < env.length) env[i / ds] = e2;
  }
  // steadiest 2 s window
  const win = Math.round(2 * sr);
  const hop = Math.round(0.25 * sr);
  let best = 0;
  let bestVar = Infinity;
  for (let o = 0; o + win <= x.length; o += hop) {
    const series = rmsSeries(x.subarray(o, o + win), sr, 0.2).map(db);
    const m = series.reduce((a, b) => a + b, 0) / series.length;
    const v = series.reduce((a, b) => a + (b - m) * (b - m), 0) / series.length;
    if (m > -60 && v < bestVar) {
      bestVar = v;
      best = o;
    }
  }
  const s0 = Math.floor(best / ds);
  const n = Math.floor(win / ds);
  const seg = new Float64Array(n);
  let mean = 0;
  for (let i = 0; i < n; i++) mean += env[s0 + i] ?? 0;
  mean /= n;
  for (let i = 0; i < n; i++) seg[i] = (env[s0 + i] ?? 0) - mean;
  const ac = (lag: number): number => {
    let s = 0;
    for (let i = 0; i + lag < n; i++) s += seg[i]! * seg[i + lag]!;
    return s / (n - lag);
  };
  const r0 = ac(0);
  if (r0 <= 0) return { jitterPct: NaN, pulseHz: NaN, r1: NaN };
  const minLag = Math.round(0.009 * esr);
  const maxLag = Math.round(0.12 * esr);
  const r = new Float64Array(maxLag + 1);
  for (let l = minLag; l <= maxLag; l++) r[l] = ac(l) / r0;
  // the fundamental lag: the first local maximum whose height is within 85 % of the tallest one (the tallest may
  // be a multiple when the pulses alternate)
  let tallest = 0;
  for (let l = minLag + 1; l < maxLag; l++) if (r[l]! > r[l - 1]! && r[l]! >= r[l + 1]! && r[l]! > tallest) tallest = r[l]!;
  if (tallest < 0.05) return { jitterPct: NaN, pulseHz: NaN, r1: NaN };
  let T = 0;
  for (let l = minLag + 1; l < maxLag; l++) {
    if (r[l]! > r[l - 1]! && r[l]! >= r[l + 1]! && r[l]! >= 0.85 * tallest) {
      T = l;
      break;
    }
  }
  if (T === 0) return { jitterPct: NaN, pulseHz: NaN, r1: NaN };
  const r1 = r[T]!;
  // per-cycle jitter, directly: pulse onsets = the envelope crossing 45 % of its p99 upward (re-armed below 20 %),
  // intervals kept within 0.6–1.6 T (a misfire or a double trigger is not timing jitter), std / mean
  const segSorted = [...seg].sort((a, b) => a - b);
  const p99 = segSorted[Math.floor(0.99 * (n - 1))]! + mean;
  const onsets: number[] = [];
  let armed = true;
  for (let i = 0; i < n; i++) {
    const v = seg[i]! + mean;
    if (armed && v > 0.45 * p99) {
      onsets.push(i);
      armed = false;
    } else if (!armed && v < 0.2 * p99) armed = true;
  }
  const ivs: number[] = [];
  for (let i = 1; i < onsets.length; i++) {
    const d = onsets[i]! - onsets[i - 1]!;
    if (d > 0.6 * T && d < 1.6 * T) ivs.push(d);
  }
  if (ivs.length < 6) return { jitterPct: NaN, pulseHz: esr / T, r1 };
  const mi = ivs.reduce((a, b) => a + b, 0) / ivs.length;
  const sd = Math.sqrt(ivs.reduce((a, b) => a + (b - mi) * (b - mi), 0) / ivs.length);
  return { jitterPct: (100 * sd) / mi, pulseHz: esr / T, r1 };
}

function centroids(x: Float32Array, sr: number): { p10: number; p90: number; hi3kDb: number } {
  const N = 4096;
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  const win = new Float64Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);
  const cs: number[] = [];
  let hi = 0;
  let all = 0;
  for (let o = 0; o + N <= x.length; o += N / 2) {
    let e = 0;
    for (let i = 0; i < N; i++) {
      const v = x[o + i]! * win[i]!;
      re[i] = v;
      im[i] = 0;
      e += v * v;
    }
    if (10 * Math.log10(e / N + 1e-20) < -55) continue;
    fft(re, im);
    let num = 0;
    let den = 0;
    for (let k = 1; k < N / 2; k++) {
      const p = re[k]! * re[k]! + im[k]! * im[k]!;
      const f = (k * sr) / N;
      num += p * f;
      den += p;
      all += p;
      if (f >= 3000) hi += p;
    }
    if (den > 0) cs.push(num / den);
  }
  return { p10: pct(cs, 0.1), p90: pct(cs, 0.9), hi3kDb: 10 * Math.log10(hi / (all + 1e-20) + 1e-20) };
}

function thump(x: Float32Array, sr: number): { at: number; gainDb: number; env: number[] } {
  const lo = bandpass(x, sr, 85, 0.6); // 60–120 Hz
  const w = Math.round(0.4 * sr);
  const step = Math.round(0.05 * sr);
  const eLo = rmsSeries(lo, sr, 0.05);
  let bestI = 0;
  let bestGain = -Infinity;
  for (let i = 3; i + 8 <= eLo.length; i++) {
    let before = 0;
    let after = 0;
    for (let k = 0; k < 3; k++) {
      before += eLo[i - 1 - k]! ** 2;
      after += eLo[i + k]! ** 2;
    }
    const g = 10 * Math.log10((after + 1e-20) / (before + 1e-20));
    if (g > bestGain) {
      bestGain = g;
      bestI = i;
    }
  }
  const at = bestI * step;
  const env: number[] = [];
  let peak = 0;
  for (let k = 0; k < 8; k++) {
    let s = 0;
    const o = at + k * step;
    for (let i = o; i < Math.min(x.length, o + step); i++) s += x[i]! * x[i]!;
    const r = Math.sqrt(s / step);
    env.push(r);
    if (r > peak) peak = r;
  }
  void w;
  return { at: at / sr, gainDb: bestGain, env: env.map((r) => Math.round(db(r) - db(peak))) };
}

/** Max normalised cross-correlation of x[a0..a1) against x[b0..b1) over ±20 ms of lag (seconds in). */
export function repeatR(x: Float32Array, sr: number, a0: number, a1: number, b0: number, b1: number): number {
  const n = Math.min(Math.round((a1 - a0) * sr), Math.round((b1 - b0) * sr));
  const A = x.subarray(Math.round(a0 * sr), Math.round(a0 * sr) + n);
  const B0 = Math.round(b0 * sr);
  const maxLag = Math.round(0.02 * sr);
  const hop = 4;
  let ea = 0;
  for (let i = 0; i < n; i += hop) ea += A[i]! * A[i]!;
  let best = 0;
  for (let lag = -maxLag; lag <= maxLag; lag += 8) {
    let s = 0;
    let eb = 0;
    for (let i = 0; i < n; i += hop) {
      const b = x[B0 + lag + i] ?? 0;
      s += A[i]! * b;
      eb += b * b;
    }
    const r = Math.abs(s) / Math.sqrt(ea * eb + 1e-20);
    if (r > best) best = r;
  }
  return best;
}

export function critic(L: Float32Array, R: Float32Array, sr: number, repeat?: [number, number, number, number]): CriticMeasure {
  const n = L.length;
  const M = new Float32Array(n);
  let sl = 0;
  let sr2 = 0;
  let slr = 0;
  let sm = 0;
  let ss = 0;
  for (let i = 0; i < n; i++) {
    const l = L[i]!;
    const r = R[i]!;
    M[i] = 0.5 * (l + r);
    sl += l * l;
    sr2 += r * r;
    slr += l * r;
    sm += M[i]! * M[i]!;
    ss += 0.25 * (l - r) * (l - r);
  }
  const series = rmsSeries(M, sr, 0.2)
    .map(db)
    .filter((v) => v > -70);
  const c = centroids(M, sr);
  const j = pulseJitter(M, sr);
  const t = thump(M, sr);
  return {
    seconds: n / sr,
    rmsDb: db(Math.sqrt(sm / n)),
    jitterPct: j.jitterPct,
    pulseHz: j.pulseHz,
    periodicity: j.r1,
    levelRangeDb: pct(series, 0.95) - pct(series, 0.05),
    centroidP10: c.p10,
    centroidP90: c.p90,
    lrCorr: slr / Math.sqrt(sl * sr2 + 1e-20),
    sideMid: Math.sqrt(ss / (sm + 1e-20)),
    hi3kDb: c.hi3kDb,
    thumpAt: t.at,
    thumpGainDb: t.gainDb,
    thumpEnv: t.env,
    repeatR: repeat ? repeatR(M, sr, ...repeat) : null,
  };
}

export function criticRow(name: string, m: CriticMeasure): string {
  const f = (v: number, d = 1): string => (Number.isFinite(v) ? v.toFixed(d) : '—');
  return `| ${name} | ${f(m.seconds)} | ${f(m.rmsDb)} | ${f(m.jitterPct)} @ ${f(m.pulseHz)} Hz, r1 ${f(m.periodicity, 2)} | ${f(m.levelRangeDb)} | ${f(m.centroidP10, 0)}–${f(m.centroidP90, 0)} | ${f(m.lrCorr, 2)} / ${f(m.sideMid, 2)} | ${f(m.hi3kDb)} | +${f(m.thumpGainDb)} @ ${f(m.thumpAt, 2)} s [${m.thumpEnv.join(' ')}] | ${m.repeatR === null ? '—' : f(m.repeatR, 2)} |`;
}

export const CRITIC_HEADER = [
  '| clip | s | RMS dBFS | jitter % @ pulse, r1 | level range dB (p95−p5, 200 ms) | centroid Hz p10–p90 | L/R corr / S/M | > 3 kHz dB | thump 60–120 Hz dB @ t [env dB re peak, 50 ms steps] | repeat r |',
  '|--|--|--|--|--|--|--|--|--|--|',
].join('\n');

if (process.argv[1] && process.argv[1].endsWith('critic.ts')) {
  const file = process.argv[2];
  if (!file) throw new Error('usage: critic.ts <wav> [--repeat a0,a1,b0,b1] [--json]');
  const ri = process.argv.indexOf('--repeat');
  const rep = ri >= 0 ? (process.argv[ri + 1]!.split(',').map(Number) as [number, number, number, number]) : undefined;
  const w = readWavStereo(file);
  const m = critic(w.L, w.R, w.sr, rep);
  if (process.argv.includes('--json')) console.log(JSON.stringify(m));
  else console.log(`${CRITIC_HEADER}\n${criticRow(file, m)}`);
}
