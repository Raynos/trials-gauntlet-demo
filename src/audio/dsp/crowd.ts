/**
 * Crowd — the stands the gates kit builds (start 30, checkpoint 7, finish 34 people), heard as
 *
 *   bed        three "vowel" bands of pink noise (280 / 520 / 900 Hz, Q 2) each under its own seeded
 *              random-walk amplitude (τ 0.35 s) — a murmur; level −30 dB × density, silent far from a stand
 *   roar       (GO) the bed jumps +14 dB with a 4th band at 1.5 kHz, A 120 ms, hold 500, D 1.4 s
 *   cheer      (clean landing after ≥ 0.5 s air) +11 dB, brighter (bands ×1.25), A 60 ms, hold 250, D 0.9 s,
 *              two or three seeded whistles (2.3–2.9 kHz sines with 6 Hz vibrato, 250 ms)
 *   groan      (crash) the bands glide down ×0.72 with the 350 Hz "ooh" up +8 dB, A 50 ms, hold 200, D 0.8 s
 *   applause   (finish) a seeded clap train: rate 18 → 70 → 0 claps/s over 3.2 s, each clap a 3 ms burst
 *              through BP 1.9 kHz Q 1.1 alternating ±0.5 pan, plus the bed +9 dB for the first second
 *
 * Every reaction is scaled by the density the model measured when the event fired (`gain`), so a crash
 * 80 m from the nearest stand is met by nothing. All randomness is the per-voice xorshift; two renders
 * are byte-identical.
 */
import { Biquad, NoiseColour, NoiseRng, TWO_PI, clamp, dbToGain, smoothCoef } from './util';

const BANDS = [280, 520, 900] as const;
const WHISTLES = 3;

export class Crowd {
  private readonly sr: number;
  private readonly rng: NoiseRng;
  private readonly colour = new NoiseColour();
  private readonly bands: Biquad[] = [];
  private readonly bright: Biquad;
  private readonly ooh: Biquad;
  private readonly clapBp: Biquad;
  private readonly walk = new Float64Array(BANDS.length);
  private readonly walkTarget = new Float64Array(BANDS.length);
  private readonly kWalk: number;
  private walkCountdown = 0;
  private densityTarget = 0;
  private density = 0;
  private readonly kDensity: number;
  // reaction envelope (shared by roar / cheer / groan / applause bed lift)
  private reactKind = 0; // 0 none 1 roar 2 cheer 3 groan 4 applause
  private reactGain = 0;
  private reactEnv = 0;
  private reactT = 0;
  private reactAtt = 1;
  private reactHold = 0;
  private reactDec = 1;
  private reactPending = 0; // samples until onset
  private pendingKind = 0;
  private pendingGain = 0;
  private bandShift = 1;
  private bandShiftTarget = 1;
  private readonly kShift: number;
  // whistles
  private readonly wPhase = new Float64Array(WHISTLES);
  private readonly wFreq = new Float64Array(WHISTLES);
  private readonly wEnv = new Float64Array(WHISTLES);
  private readonly wDelay = new Float64Array(WHISTLES);
  private readonly wGain = new Float64Array(WHISTLES);
  private wVib = 0;
  // applause
  private clapT = 0;
  private clapLeft = 0;
  private clapEnv = 0;
  private clapDecay = 1;
  private clapPan = 1;
  private clapGain = 0;
  private clapNext = 0;
  private clapOn = false;

  constructor(sr: number, seed: number) {
    this.sr = sr;
    this.rng = new NoiseRng(seed);
    for (const f of BANDS) {
      const b = new Biquad(sr);
      b.bandpass(f, 2);
      this.bands.push(b);
    }
    this.bright = new Biquad(sr);
    this.bright.bandpass(1500, 1.5);
    this.ooh = new Biquad(sr);
    this.ooh.peaking(350, 3, 0);
    this.clapBp = new Biquad(sr);
    this.clapBp.bandpass(1900, 1.1);
    this.kWalk = smoothCoef(0.35, sr);
    this.kDensity = smoothCoef(0.25, sr);
    this.kShift = smoothCoef(0.12, sr);
    this.clapDecay = Math.exp(-1 / (0.003 * sr));
    for (let i = 0; i < BANDS.length; i++) {
      this.walk[i] = 0.6;
      this.walkTarget[i] = 0.6;
    }
  }

  set(density: number): void {
    this.densityTarget = clamp(density, 0, 1);
  }

  /** Current smoothed density (tests). */
  get level(): number {
    return this.density;
  }

  /** kind: 1 roar 2 cheer 3 groan 4 applause; gain = density at the event; delayS from now. */
  trigger(kind: number, gain: number, delayS: number): void {
    if (gain <= 0.001) return;
    this.pendingKind = kind;
    this.pendingGain = clamp(gain, 0, 1);
    this.reactPending = Math.max(1, Math.round(delayS * this.sr));
  }

  /** Cut every reaction (restart). The bed follows density on its own. */
  kill(): void {
    this.reactKind = 0;
    this.reactEnv = 0;
    this.reactPending = 0;
    this.clapOn = false;
    for (let i = 0; i < WHISTLES; i++) this.wEnv[i] = 0;
  }

  private start(kind: number, gain: number): void {
    const sr = this.sr;
    this.reactKind = kind;
    this.reactGain = gain;
    this.reactT = 0;
    this.reactEnv = 0;
    this.bandShiftTarget = 1;
    if (kind === 1) {
      this.reactAtt = 0.12 * sr;
      this.reactHold = 0.5 * sr;
      this.reactDec = Math.exp(-1 / (1.4 * sr));
    } else if (kind === 2) {
      this.reactAtt = 0.06 * sr;
      this.reactHold = 0.25 * sr;
      this.reactDec = Math.exp(-1 / (0.9 * sr));
      this.bandShiftTarget = 1.25;
      const n = 2 + (this.rng.u() < 0.5 ? 1 : 0);
      for (let i = 0; i < WHISTLES; i++) {
        this.wEnv[i] = i < n ? 1 : 0;
        this.wFreq[i] = this.rng.range2(2300, 2900);
        this.wDelay[i] = Math.round(this.rng.range2(0.05, 0.4) * sr);
        this.wGain[i] = dbToGain(-30 + this.rng.range2(-4, 2)) * gain;
      }
    } else if (kind === 3) {
      this.reactAtt = 0.05 * sr;
      this.reactHold = 0.2 * sr;
      this.reactDec = Math.exp(-1 / (0.8 * sr));
      this.bandShiftTarget = 0.72;
      this.ooh.peaking(350, 3, 8);
    } else {
      this.reactAtt = 0.15 * sr;
      this.reactHold = 0.8 * sr;
      this.reactDec = Math.exp(-1 / (1.0 * sr));
      this.clapOn = true;
      this.clapT = 0;
      this.clapLeft = Math.round(3.2 * sr);
      this.clapNext = 0;
      this.clapGain = dbToGain(-16) * gain;
    }
  }

  /** Adds stereo into L/R. */
  process(L: Float32Array, R: Float32Array, off: number, n: number): void {
    const sr = this.sr;
    const bedBase = dbToGain(-27);
    const LIFT = [1, dbToGain(14), dbToGain(11), dbToGain(6), dbToGain(9)];
    for (let i = 0; i < n; i++) {
      this.density += (this.densityTarget - this.density) * this.kDensity;
      // pending reaction
      if (this.reactPending > 0 && --this.reactPending === 0) this.start(this.pendingKind, this.pendingGain);
      // reaction envelope
      let react = 0;
      if (this.reactKind !== 0) {
        if (this.reactT < this.reactAtt) this.reactEnv = this.reactT / this.reactAtt;
        else if (this.reactT < this.reactAtt + this.reactHold) this.reactEnv = 1;
        else this.reactEnv *= this.reactDec;
        this.reactT++;
        react = this.reactEnv * this.reactGain;
        if (this.reactEnv < 1e-3 && this.reactT > this.reactAtt + this.reactHold) {
          this.reactKind = 0;
          this.ooh.peaking(350, 3, 0);
        }
      }
      this.bandShift += (this.bandShiftTarget - this.bandShift) * this.kShift;
      if (this.reactKind === 0 && Math.abs(this.bandShift - 1) > 1e-3) this.bandShiftTarget = 1;

      const audible = this.density > 1e-3 || react > 1e-3;
      let l = 0;
      let r = 0;
      if (audible) {
        // random-walk band amplitudes, retargeted every ~120 ms
        if (--this.walkCountdown <= 0) {
          this.walkCountdown = Math.round(0.12 * sr);
          for (let b = 0; b < BANDS.length; b++) this.walkTarget[b] = this.rng.range2(0.25, 1);
          if ((this.walkCountdown & 1) === 0 && Math.abs(this.bandShift - 1) > 0.01) {
            for (let b = 0; b < BANDS.length; b++) this.bands[b]!.bandpass(BANDS[b]! * this.bandShift, 2);
          }
        }
        const w = this.rng.n();
        const pk = this.colour.pink(w);
        let bed = 0;
        for (let b = 0; b < BANDS.length; b++) {
          const wk = this.walk[b]! + (this.walkTarget[b]! - this.walk[b]!) * this.kWalk;
          this.walk[b] = wk;
          bed += this.bands[b]!.process(pk) * wk;
        }
        bed = this.ooh.process(bed);
        // lift by the reaction: roar +14, cheer +11, groan +6, applause +9 dB
        const lift = 1 + (LIFT[this.reactKind]! - 1) * react;
        const bright = this.reactKind === 1 || this.reactKind === 2 ? this.bright.process(w) * 0.5 * react : 0;
        const mono = (bed + bright) * bedBase * lift * Math.max(this.density, react * 0.8);
        // a wide crowd: slight L/R decorrelation from the second noise draw
        const spread = this.rng.n() * 0.15 * bedBase * lift * Math.max(this.density, react * 0.8);
        l = mono + spread;
        r = mono - spread;
      }
      // whistles (cheer)
      if (this.reactKind === 2) {
        this.wVib += (TWO_PI * 6) / sr;
        if (this.wVib > TWO_PI) this.wVib -= TWO_PI;
        for (let k = 0; k < WHISTLES; k++) {
          if (this.wEnv[k]! <= 1e-3) continue;
          if (this.wDelay[k]! > 0) {
            this.wDelay[k] = this.wDelay[k]! - 1;
            continue;
          }
          const f = this.wFreq[k]! * (1 + 0.012 * Math.sin(this.wVib + k));
          this.wPhase[k] = this.wPhase[k]! + f / sr;
          if (this.wPhase[k]! >= 1) this.wPhase[k] = this.wPhase[k]! - 1;
          const s = Math.sin(this.wPhase[k]! * TWO_PI) * this.wEnv[k]! * this.wGain[k]!;
          this.wEnv[k] = this.wEnv[k]! * (1 - 1 / (0.25 * sr));
          l += s * (k === 1 ? 0.4 : 0.8);
          r += s * (k === 1 ? 0.8 : 0.4);
        }
      }
      // applause
      if (this.clapOn) {
        const t = this.clapT / sr;
        // rate: 18 → 70 claps/s in the first 0.8 s, holds to 2 s, fades to 0 by 3.2 s
        const rate = t < 0.8 ? 18 + (52 * t) / 0.8 : t < 2 ? 70 : 70 * Math.max(0, (3.2 - t) / 1.2);
        if (--this.clapNext <= 0) {
          this.clapNext = Math.max(1, Math.round((sr / Math.max(rate, 1)) * this.rng.range2(0.5, 1.5)));
          this.clapEnv = this.rng.range2(0.5, 1);
          this.clapPan = this.rng.u() < 0.5 ? -0.5 : 0.5;
        }
        let clap = 0;
        if (this.clapEnv > 1e-3) {
          clap = this.clapBp.process(this.rng.n()) * this.clapEnv * this.clapGain;
          this.clapEnv *= this.clapDecay;
        }
        l += clap * (1 - this.clapPan * 0.5);
        r += clap * (1 + this.clapPan * 0.5);
        this.clapT++;
        if (--this.clapLeft <= 0) this.clapOn = false;
      }
      L[off + i] = L[off + i]! + l;
      R[off + i] = R[off + i]! + r;
    }
  }
}
