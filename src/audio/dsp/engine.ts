/**
 * Single-cylinder 250 cc 4-stroke trials engine (Montesa 4RT / Beta Evo 4T
 * character): a soft, low "putt-putt" thump at 1500 rpm idle, a hard throaty
 * bark with intake honk when the throttle opens, muffled top end, no
 * two-stroke ring.
 *
 *   fFire = rpm / 120           (one power stroke per two revolutions)
 *   idle 1500 rpm → 12.5 Hz, redline 10 000 rpm → 83.3 Hz
 *
 * Per firing cycle:
 *   exhaust pulse   A·exp(−t/τ)·(0.7·sin(2π·fp·t) + noise), τ 10 ms at idle → 4 ms at load,
 *                   fp 120 + 90·load Hz, through muffler resonances 130 / 380 Hz and a
 *                   load-opened lowpass (1400 + 3200·load Hz)
 *   intake honk     the same pulse train into an airbox resonator (380 + 300·load Hz, Q 5),
 *                   gain ∝ load² — silent at idle, the "honk" of a blip
 *   harmonic bank   partials 1..8 at n·fFire, tilt k = 1.6 − 0.8·load, weight 0.4 + 0.6·load
 *   valve train     1 ms click at 2·fFire (cam), −34 dB — the mechanical ticking under idle
 *   intake noise    white → BP 700 + 1200·load Hz, −26 + 12·load dB
 * Rev limiter: every 3rd cycle emits nothing. Clutch slip: gated 2.8 kHz whine with 30 Hz
 * chatter while the auto-clutch holds the crank. All randomness from the seeded NoiseRng.
 *
 * Round 3 (v2): `torque` (throttleEff × the class thrust curve at the rim speed) drives the bark —
 * pulse amplitude, honk and 3 dB of level — so the engine goes from torque-y at 5 m/s to a thinner,
 * higher scream at 18 m/s where v2's curve has fallen to 0.4 (the harmonic brightness follows rpm as
 * before). `bike` 1 = Pro voicing: shorter pulses (τ × 0.75), fp +25 Hz, more noise in the pulse, the
 * lowpass 700 Hz more open, the 380 Hz chamber up at 430 Hz, a flatter harmonic tilt — raspier; the
 * limiter rpm is physics' (10 000 on both classes; the Pro reaches it at 21 m/s through its gearing).
 */
import { Biquad, NoiseRng, TWO_PI, clamp, dbToGain, smoothCoef } from './util';

const PARTIALS = 8;
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
  private pulseF = 150;
  private pulseNoise = 0.3;
  private honkEnv = 0;
  private honkDecay = 0;
  private valveEnv = 0;
  private rpmTarget = IDLE;
  private loadTarget = 0;
  private gainTarget = 1;
  private clutchTarget = 0;
  private speedTarget = 0;
  private torqueTarget = 0;
  private bike = 0;
  private limiter = false;
  private rpm = IDLE;
  private load = 0;
  private gain = 1;
  private clutch = 0;
  private speed = 0;
  private torque = 0;
  private readonly kRpm: number;
  private readonly kLoad: number;
  private readonly kGain: number;
  private readonly kSlow: number;
  private readonly harmGain = new Float64Array(PARTIALS);
  private readonly r130: Biquad;
  private readonly r260: Biquad;
  private readonly r380: Biquad;
  private readonly lp: Biquad;
  private readonly hp: Biquad;
  private readonly honk: Biquad;
  private readonly intake: Biquad;
  private readonly whineBp: Biquad;
  private whinePhase = 0;
  private chatterPhase = 0;
  private whineDetune = 1;
  private intakeGain = 0;
  private honkGain = 0;
  private level = 0;
  private harmLevel = 0;

  constructor(sr: number, seed: number) {
    this.sr = sr;
    this.rng = new NoiseRng(seed);
    this.kRpm = smoothCoef(0.008, sr);
    this.kLoad = smoothCoef(0.004, sr);
    this.kGain = smoothCoef(0.005, sr);
    this.kSlow = smoothCoef(0.03, sr);
    this.r130 = new Biquad(sr);
    this.r130.peaking(130, 3, 4);
    // round 3: a second chamber resonance at 260 Hz — the reference start-gate spectrogram carries its engine energy
    // in moving 200–500 Hz ridges, ours sat in a too-smooth 100–250 Hz band (beats table / spectrograms)
    this.r260 = new Biquad(sr);
    this.r260.peaking(260, 2.5, 5);
    this.r380 = new Biquad(sr);
    this.r380.peaking(380, 2.5, 3);
    this.lp = new Biquad(sr);
    this.hp = new Biquad(sr);
    this.hp.highpass(40, 0.7);
    this.honk = new Biquad(sr);
    this.intake = new Biquad(sr);
    this.whineBp = new Biquad(sr);
    this.whineBp.bandpass(2800, 6);
    this.setBlockCoefs();
  }

  set(rpm: number, load: number, limiter: boolean, gain: number, clutch = 0, speed = 0, torque = load, bike = 0): void {
    this.rpmTarget = clamp(rpm, 200, 14000);
    this.loadTarget = clamp(load, 0, 1);
    this.limiter = limiter;
    this.gainTarget = clamp(gain, 0, 1);
    this.clutchTarget = clamp(clutch, 0, 1);
    this.speedTarget = clamp(speed, 0, 1);
    this.torqueTarget = clamp(torque, 0, 1);
    if (bike !== this.bike) {
      this.bike = bike;
      this.r380.peaking(bike === 1 ? 430 : 380, 2.5, bike === 1 ? 4 : 3);
    }
  }

  /** Current smoothed rpm (for tests). */
  get currentRpm(): number {
    return this.rpm;
  }

  private setBlockCoefs(): void {
    const load = this.load;
    const pro = this.bike === 1;
    const torque = this.torque;
    this.lp.lowpass(1400 + 3200 * load + (pro ? 700 : 0), 0.8);
    this.honk.bandpass(380 + 300 * load, 5);
    this.honkGain = 1.8 * load * load * (0.55 + 0.45 * torque);
    this.intake.bandpass(700 + 1200 * load, 1);
    // intake noise 6 dB lower than v1 (−32 + 12·load): the flat 500 Hz–8 kHz wash was the loudest synthetic tell
    this.intakeGain = dbToGain(-32 + 12 * load + (pro ? 2 : 0));
    const k = 1.6 - 0.8 * load - (pro ? 0.15 : 0);
    let sum = 0;
    for (let n = 1; n <= PARTIALS; n++) {
      let g = Math.pow(n, -k);
      if ((n & 1) === 0) g *= 0.8;
      this.harmGain[n - 1] = g;
      sum += g;
    }
    this.harmLevel = ((0.4 + 0.6 * load) * 0.8) / sum;
    const revNorm = clamp((this.rpm - IDLE) / (REDLINE - IDLE), 0, 1);
    // closed-throttle floor −14 dB (v1 −18): the reference wheelie / coast beats keep the engine present (beats table)
    this.level = dbToGain(-14 + 6 * load + 3 * torque + 2 * revNorm + 2 * this.speed) * this.gain;
  }

  /** Adds `n` mono samples into `out` starting at `off`. */
  process(out: Float32Array, off: number, n: number): void {
    this.rpm += (this.rpmTarget - this.rpm) * (1 - Math.pow(1 - this.kRpm, n));
    this.load += (this.loadTarget - this.load) * (1 - Math.pow(1 - this.kLoad, n));
    this.gain += (this.gainTarget - this.gain) * (1 - Math.pow(1 - this.kGain, n));
    this.clutch += (this.clutchTarget - this.clutch) * (1 - Math.pow(1 - this.kSlow, n));
    this.speed += (this.speedTarget - this.speed) * (1 - Math.pow(1 - this.kSlow, n));
    this.torque += (this.torqueTarget - this.torque) * (1 - Math.pow(1 - this.kLoad, n));
    this.setBlockCoefs();
    if (this.level < 1e-5 && this.clutch < 1e-3) return;

    const sr = this.sr;
    const dt = 1 / sr;
    const fFire = this.rpm / 120;
    const dPhase = fFire / sr;
    const hg = this.harmGain;
    const harmLevel = this.harmLevel;
    const load = this.load;
    const pro = this.bike === 1;
    const pulseAmp = 0.45 + 0.3 * load + 0.25 * this.torque;
    const tau = (0.01 - 0.006 * load) * (pro ? 0.75 : 1);
    const pulseFTarget = 120 + 90 * load + (pro ? 25 : 0);
    const pulseNoiseBase = pro ? 0.25 : 0.15;
    const level = this.level;
    const intakeGain = this.intakeGain;
    const honkGain = this.honkGain;
    const valveGain = dbToGain(-34);
    const valveDecay = Math.exp(-dt / 0.0008);
    const whineGain = dbToGain(-30) * this.clutch;
    if (this.clutch > 1e-3) {
      this.whineDetune = clamp(this.whineDetune + 0.002 * this.rng.n(), 0.97, 1.03);
    }
    const dWhine = (2800 * this.whineDetune) / sr;
    const dChatter = 30 / sr;

    for (let i = 0; i < n; i++) {
      // -- firing cycle ---------------------------------------------------------
      const prev = this.phase;
      this.phase += dPhase;
      if (this.phase >= 1) {
        this.phase -= 1;
        this.cycle++;
        const cut = this.limiter && this.cycle % 3 === 0;
        if (!cut) {
          let amp = pulseAmp * (1 + 0.08 * this.rng.n());
          let t = tau;
          // overrun pop on a closed throttle
          if (load < 0.08 && this.rpm > 3200 && this.rng.u() < 0.12) {
            amp *= 2.0;
            t *= 1.6;
          }
          this.pulseEnv = amp;
          this.pulseDecay = Math.exp(-dt / t);
          this.pulseT = 0;
          this.pulseF = pulseFTarget;
          this.pulseNoise = pulseNoiseBase + 0.3 * load;
          this.honkEnv = amp;
          this.honkDecay = Math.exp(-dt / 0.003);
        }
        this.valveEnv = 1;
      }
      // second valve click mid-cycle (exhaust cam)
      if (prev < 0.5 && this.phase >= 0.5) this.valveEnv = 0.7;

      // -- exhaust pulse --------------------------------------------------------
      let pulse = 0;
      let honkIn = 0;
      if (this.pulseEnv > 1e-4) {
        const w = this.rng.n();
        pulse = this.pulseEnv * (0.7 * Math.sin(TWO_PI * this.pulseF * this.pulseT) + this.pulseNoise * w);
        this.pulseEnv *= this.pulseDecay;
        this.pulseT += dt;
        if (this.honkEnv > 1e-4) {
          honkIn = this.honkEnv * w;
          this.honkEnv *= this.honkDecay;
        }
      }

      // -- harmonic bank --------------------------------------------------------
      let h = 0;
      const ph = this.phase * TWO_PI;
      for (let k = 0; k < PARTIALS; k++) h += hg[k]! * Math.sin(ph * (k + 1));
      h *= harmLevel;

      // -- exhaust path ---------------------------------------------------------
      // more pulse than bank (v1 1.7 / 0.6): the dotted pulse texture of a single is what the spectrogram shows
      let x = pulse * 2.0 + h * 0.45;
      x = this.r130.process(x);
      x = this.r260.process(x);
      x = this.r380.process(x);
      x = this.lp.process(x);
      x = this.hp.process(x);

      // -- intake: honk resonator + noise -----------------------------------------
      x += this.honk.process(honkIn) * honkGain;
      x += this.intake.process(this.rng.n()) * intakeGain;

      // -- valve train ----------------------------------------------------------
      if (this.valveEnv > 1e-3) {
        x += this.valveEnv * this.rng.n() * valveGain;
        this.valveEnv *= valveDecay;
      }
      x *= level;

      // -- clutch slip whine -----------------------------------------------------
      if (whineGain > 1e-6) {
        this.whinePhase += dWhine;
        if (this.whinePhase >= 1) this.whinePhase -= 1;
        this.chatterPhase += dChatter;
        if (this.chatterPhase >= 1) this.chatterPhase -= 1;
        const chatter = 0.6 + 0.4 * Math.sin(this.chatterPhase * TWO_PI);
        const tone = Math.sin(this.whinePhase * TWO_PI) * 0.5 + this.whineBp.process(this.rng.n()) * 2;
        x += tone * chatter * whineGain;
      }

      out[off + i] = out[off + i]! + x;
    }
  }
}
