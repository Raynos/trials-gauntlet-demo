/**
 * Small DSP primitives shared by every voice. No allocation after
 * construction; all state is plain numbers so the same code runs in an
 * AudioWorklet and in node.
 */

export const TWO_PI = Math.PI * 2;

export const dbToGain = (db: number): number => Math.pow(10, db / 20);
export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/** Time (s) to fall to -40 dB → per-sample multiplier. */
export const decayCoef = (seconds: number, sr: number): number =>
  seconds <= 0 ? 0 : Math.pow(0.01, 1 / Math.max(1, seconds * sr));

/** One-pole smoothing coefficient for time constant `tau` seconds. */
export const smoothCoef = (tau: number, sr: number): number => (tau <= 0 ? 1 : 1 - Math.exp(-1 / (tau * sr)));

/** xorshift32 — deterministic noise source, one per consumer. */
export class NoiseRng {
  private s: number;
  constructor(seed: number) {
    this.s = (seed >>> 0) || 0x9e3779b9;
  }
  /** Re-seed (per-event variation: the same event index always draws the same values). */
  reseed(seed: number): void {
    let x = (seed >>> 0) || 0x9e3779b9;
    // one mixing round so neighbouring seeds do not start neighbouring sequences
    x ^= x >>> 16;
    x = Math.imul(x, 0x7feb352d) >>> 0;
    x ^= x >>> 15;
    x = Math.imul(x, 0x846ca68b) >>> 0;
    x ^= x >>> 16;
    this.s = x || 0x9e3779b9;
  }
  /** Uniform in [0, 1). */
  u(): number {
    let x = this.s;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.s = x >>> 0;
    return this.s / 4294967296;
  }
  /** Uniform in [-1, 1). */
  n(): number {
    return this.u() * 2 - 1;
  }
  /** Uniform in [lo, hi). */
  range2(lo: number, hi: number): number {
    return lo + (hi - lo) * this.u();
  }
}

/** Pink (Paul Kellet economy) and brown colourers fed from white noise. */
export class NoiseColour {
  private b0 = 0;
  private b1 = 0;
  private b2 = 0;
  private brown = 0;
  pink(w: number): number {
    this.b0 = 0.99765 * this.b0 + w * 0.099046;
    this.b1 = 0.963 * this.b1 + w * 0.2965164;
    this.b2 = 0.57 * this.b2 + w * 1.0526913;
    return (this.b0 + this.b1 + this.b2 + w * 0.1848) * 0.25;
  }
  brownian(w: number): number {
    this.brown = (this.brown + 0.02 * w) / 1.02;
    return this.brown * 3.5;
  }
}

/** Biquad, transposed direct form II. Coefficients set per block. */
export class Biquad {
  private b0 = 1;
  private b1 = 0;
  private b2 = 0;
  private a1 = 0;
  private a2 = 0;
  private z1 = 0;
  private z2 = 0;

  constructor(private readonly sr: number) {}

  reset(): void {
    this.z1 = this.z2 = 0;
  }

  bypass(): void {
    this.b0 = 1;
    this.b1 = this.b2 = this.a1 = this.a2 = 0;
  }

  process(x: number): number {
    const y = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * y + this.z2;
    this.z2 = this.b2 * x - this.a2 * y;
    return y;
  }

  private clampF(f: number): number {
    return clamp(f, 10, this.sr * 0.45);
  }

  lowpass(f: number, q: number): void {
    const w = (TWO_PI * this.clampF(f)) / this.sr;
    const cw = Math.cos(w);
    const alpha = Math.sin(w) / (2 * q);
    const a0 = 1 + alpha;
    this.b0 = (1 - cw) / 2 / a0;
    this.b1 = (1 - cw) / a0;
    this.b2 = this.b0;
    this.a1 = (-2 * cw) / a0;
    this.a2 = (1 - alpha) / a0;
  }

  highpass(f: number, q: number): void {
    const w = (TWO_PI * this.clampF(f)) / this.sr;
    const cw = Math.cos(w);
    const alpha = Math.sin(w) / (2 * q);
    const a0 = 1 + alpha;
    this.b0 = (1 + cw) / 2 / a0;
    this.b1 = -(1 + cw) / a0;
    this.b2 = this.b0;
    this.a1 = (-2 * cw) / a0;
    this.a2 = (1 - alpha) / a0;
  }

  /** Constant 0 dB peak gain bandpass. */
  bandpass(f: number, q: number): void {
    const w = (TWO_PI * this.clampF(f)) / this.sr;
    const cw = Math.cos(w);
    const alpha = Math.sin(w) / (2 * q);
    const a0 = 1 + alpha;
    this.b0 = alpha / a0;
    this.b1 = 0;
    this.b2 = -alpha / a0;
    this.a1 = (-2 * cw) / a0;
    this.a2 = (1 - alpha) / a0;
  }

  peaking(f: number, q: number, db: number): void {
    const A = Math.pow(10, db / 40);
    const w = (TWO_PI * this.clampF(f)) / this.sr;
    const cw = Math.cos(w);
    const alpha = Math.sin(w) / (2 * q);
    const a0 = 1 + alpha / A;
    this.b0 = (1 + alpha * A) / a0;
    this.b1 = (-2 * cw) / a0;
    this.b2 = (1 - alpha * A) / a0;
    this.a1 = (-2 * cw) / a0;
    this.a2 = (1 - alpha / A) / a0;
  }
}

/** Equal-power pan: returns [gl, gr] into the given tuple. */
export function panGains(pan: number, out: [number, number]): void {
  const p = (clamp(pan, -1, 1) + 1) * 0.25 * Math.PI;
  out[0] = Math.cos(p);
  out[1] = Math.sin(p);
}

/** Simple feedback-delay-network reverb (4 lines, Householder mix). */
export class Fdn {
  private readonly lines: Float32Array[];
  private readonly lens: number[];
  private readonly idx = [0, 0, 0, 0];
  private readonly lp: Biquad;
  private fb: number;
  private readonly tmp = [0, 0, 0, 0];

  constructor(sr: number, delaysMs: readonly number[], fb: number, lpHz: number) {
    this.lens = delaysMs.map((ms) => Math.max(1, Math.round((ms / 1000) * sr)));
    this.lines = this.lens.map((n) => new Float32Array(n));
    this.fb = fb;
    this.lp = new Biquad(sr);
    this.lp.lowpass(lpHz, 0.7);
  }

  setFeedback(fb: number): void {
    this.fb = fb;
  }

  /** Damping lowpass on the input (room brightness). */
  setDamping(lpHz: number): void {
    this.lp.lowpass(lpHz, 0.7);
  }

  /** Hard cut: drop the tail (restart). */
  clear(): void {
    for (const l of this.lines) l.fill(0);
    this.lp.reset();
  }

  process(x: number): number {
    const t = this.tmp;
    let sum = 0;
    for (let i = 0; i < 4; i++) {
      const v = this.lines[i]![this.idx[i]!]!;
      t[i] = v;
      sum += v;
    }
    const h = sum * 0.5; // Householder: y_i = v_i - 0.5*sum
    const inp = this.lp.process(x);
    let out = 0;
    for (let i = 0; i < 4; i++) {
      const y = (t[i]! - h) * this.fb + inp;
      this.lines[i]![this.idx[i]!] = y;
      this.idx[i] = (this.idx[i]! + 1) % this.lens[i]!;
      out += t[i]!;
    }
    return out * 0.35;
  }
}
