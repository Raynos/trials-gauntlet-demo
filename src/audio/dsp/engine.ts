/**
 * Single-cylinder 4-stroke trials-bike engine.
 *
 *   fFire = rpm / 120           (one power stroke per two revolutions)
 *   idle 1500 rpm → 12.5 Hz, redline 10 000 rpm → 83.3 Hz
 *
 * Per firing cycle: an exhaust pulse (decaying sine + noise) through a body
 * resonance and the expansion-chamber formants; underneath it a phase-
 * continuous harmonic bank whose spectral tilt opens with load; intake noise
 * (bandpass, load-dependent). The rev limiter drops every third cycle.
 * All randomness comes from the seeded NoiseRng.
 */
import { Biquad, NoiseRng, TWO_PI, clamp, dbToGain, smoothCoef } from './util';

const PARTIALS = 10;
const IDLE = 1500;
const REDLINE = 10000;

export class EngineVoice {
  private readonly sr: number;
  private readonly rng: NoiseRng;
  private phase = 0;
  private cycle = 0;
  private pulseEnv = 0;
  private pulseDecay = 0;
  private pulseT = 0;
  private pulseF = 190;
  private rpmTarget = IDLE;
  private loadTarget = 0;
  private gainTarget = 1;
  private limiter = false;
  private rpm = IDLE;
  private load = 0;
  private gain = 1;
  private readonly kRpm: number;
  private readonly kLoad: number;
  private readonly kGain: number;
  private readonly harmGain = new Float64Array(PARTIALS);
  private readonly body: Biquad;
  private readonly f240: Biquad;
  private readonly f620: Biquad;
  private readonly lp: Biquad;
  private readonly hp: Biquad;
  private readonly intake: Biquad;
  private intakeGain = 0;
  private level = 0;
  private harmLevel = 0;

  constructor(sr: number, seed: number) {
    this.sr = sr;
    this.rng = new NoiseRng(seed);
    this.kRpm = smoothCoef(0.008, sr);
    this.kLoad = smoothCoef(0.004, sr);
    this.kGain = smoothCoef(0.005, sr);
    this.body = new Biquad(sr);
    this.body.peaking(110, 8, 4);
    this.f240 = new Biquad(sr);
    this.f240.peaking(240, 5, 9);
    this.f620 = new Biquad(sr);
    this.f620.peaking(620, 4, 6);
    this.lp = new Biquad(sr);
    this.hp = new Biquad(sr);
    this.hp.highpass(45, 0.7);
    this.intake = new Biquad(sr);
    this.setBlockCoefs();
  }

  set(rpm: number, load: number, limiter: boolean, gain: number): void {
    this.rpmTarget = clamp(rpm, 300, 14000);
    this.loadTarget = clamp(load, 0, 1);
    this.limiter = limiter;
    this.gainTarget = clamp(gain, 0, 1);
  }

  /** Current smoothed rpm (for tests). */
  get currentRpm(): number {
    return this.rpm;
  }

  private setBlockCoefs(): void {
    const load = this.load;
    this.lp.lowpass(2600 + 3800 * load, 0.7);
    this.intake.bandpass(900 + 1800 * load, 0.9);
    this.intakeGain = dbToGain(-22 + 10 * load);
    const k = 1.4 - 0.7 * load;
    let sum = 0;
    for (let n = 1; n <= PARTIALS; n++) {
      let g = Math.pow(n, -k);
      if ((n & 1) === 0) g *= 0.8;
      this.harmGain[n - 1] = g;
      sum += g;
    }
    this.harmLevel = 0.9 / sum;
    const revNorm = clamp((this.rpm - IDLE) / (REDLINE - IDLE), 0, 1);
    this.level = dbToGain(-19 + 12 * load + 2 * revNorm) * this.gain;
  }

  /** Adds `n` mono samples into `out` starting at `off`. */
  process(out: Float32Array, off: number, n: number): void {
    // Block-rate smoothing of the slow targets, then coefficient refresh.
    this.rpm += (this.rpmTarget - this.rpm) * (1 - Math.pow(1 - this.kRpm, n));
    this.load += (this.loadTarget - this.load) * (1 - Math.pow(1 - this.kLoad, n));
    this.gain += (this.gainTarget - this.gain) * (1 - Math.pow(1 - this.kGain, n));
    this.setBlockCoefs();
    if (this.level < 1e-5) return;

    const sr = this.sr;
    const fFire = this.rpm / 120;
    const dPhase = fFire / sr;
    const hg = this.harmGain;
    const harmLevel = this.harmLevel;
    const pulseAmp = 0.35 + 0.65 * this.load;
    const pulseFTarget = 190 + 60 * this.load;
    const level = this.level;
    const intakeGain = this.intakeGain;
    const dt = 1 / sr;

    for (let i = 0; i < n; i++) {
      // -- firing cycle -------------------------------------------------------
      this.phase += dPhase;
      if (this.phase >= 1) {
        this.phase -= 1;
        this.cycle++;
        const cut = this.limiter && this.cycle % 3 === 0;
        if (!cut) {
          let amp = pulseAmp * (1 + 0.08 * this.rng.n());
          let tau = 0.0045;
          // off-throttle pop (misfire) on the overrun
          if (this.load < 0.08 && this.rpm > 3200 && this.rng.u() < 0.12) {
            amp *= 2.2;
            tau = 0.009;
          }
          this.pulseEnv = amp;
          this.pulseDecay = Math.exp(-dt / tau);
          this.pulseT = 0;
          this.pulseF = pulseFTarget;
        }
      }
      // -- exhaust pulse ------------------------------------------------------
      let pulse = 0;
      if (this.pulseEnv > 1e-4) {
        pulse = this.pulseEnv * (0.6 * Math.sin(TWO_PI * this.pulseF * this.pulseT) + 0.4 * this.rng.n());
        this.pulseEnv *= this.pulseDecay;
        this.pulseT += dt;
      }
      pulse = this.body.process(pulse);

      // -- harmonic bank ------------------------------------------------------
      let h = 0;
      const ph = this.phase * TWO_PI;
      for (let k = 0; k < PARTIALS; k++) h += hg[k]! * Math.sin(ph * (k + 1));
      h *= harmLevel;

      // -- chamber formants ---------------------------------------------------
      let x = pulse * 1.6 + h * 0.7;
      x = this.f240.process(x);
      x = this.f620.process(x);
      x = this.lp.process(x);
      x = this.hp.process(x);

      // -- intake -------------------------------------------------------------
      x += this.intake.process(this.rng.n()) * intakeGain;

      out[off + i] = out[off + i]! + x * level;
    }
  }
}
