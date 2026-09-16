/**
 * Single-cylinder 250 cc 4-stroke trials engine (Montesa 4RT / Beta Evo 4T character), round 4:
 * **per-firing resonator excitation** instead of a harmonic bank.
 *
 *   fFire = rpm / 120           (one power stroke per two revolutions)
 *   idle 1500 rpm → 12.5 Hz, redline 10 000 rpm → 83.3 Hz
 *
 * Every combustion event is a seeded, jittered excitation — never the same twice:
 *   timing      the period of each cycle × (1 + j·n), j = 5 % at idle → 2.2 % at full load (+1.5 % lugging),
 *               plus a seeded "hunt" (per-cycle random walk, ~17-cycle memory, ±3 % rate / ±2.4 dB level; ±6 % / ±8 dB
 *               lugging) below 25 % load — the surge and sag of a single at a balance point
 *   amplitude   × (1 + 0.15·n) (±15 %), misfire at idle (p 0.05: a weak pop, no exhaust burst), overrun pops
 *               (closed throttle above 2500 rpm, p 0.18: × 2.2 with a long burble burst)
 *   excitation  a 0.7 ms burst (DC kick + 60 % noise) into three resonators whose centres move with rpm and load
 *               and are re-jittered ±2.5 % per firing:
 *                 pipe 1  95 Hz · (1 + 0.35·rev + 0.12·load)   Q 5 → 7 lugging   (the exhaust note)
 *                 pipe 2  2.37 × pipe 1                        Q 4               (second pipe mode, inharmonic)
 *                 body    330 + 260·load + 60·rev Hz           Q 3               (airbox / muffler can honk)
 *               then the muffler lowpass 1400 + 3800·load Hz and the 40 Hz highpass
 *   exhaust burst  per firing, noise × exp(−t/τ), τ 2.5 + 3·load ms, HP 1.5 kHz → LP 2.5 + 5.5·load kHz:
 *               the "shh" of each pulse, energy to 6–8 kHz under load
 * Continuous bed (so the spectrum never drops to nothing between pulses):
 *   intake      two decorrelated noise → BP 600 + 1600·load Hz (Q 0.9), −46 + 14·load dB, gulped once per cycle
 *   mechanical  noise → BP 1.1 kHz (Q 0.6) −46 dB; valve-train ticks at 2·fFire −36 dB
 *   clutch slip gated 2.8 kHz whine with 30 Hz chatter while the auto-clutch holds the crank (round 2)
 * Level law (dB, before the bus trim): −5 + 5·√load + torque + speed + 4·lug − 8·overrun, on a per-pulse energy of
 *   4·(0.5 + 0.35·load + 0.15·lug) / (1 + 3·rev) — the pulse density (6.7× idle → redline) carries the rpm loudness:
 *   measured on the engine bus, idle ≈ −30 dBFS, full load at 3000 ≈ −20, redline WOT ≈ −14, overrun ≈ −36 with pops —
 *   three states ≥ 6 dB apart with their own centroids.
 * `lug` (model: front wheel up, rear down, < 6 m/s, throttle on, rpm < 2600 — the v2 wheelie is a 2 m/s clutch
 * balance at ~1700 rpm) voices load, not rpm: +4 dB, heavier pulses, higher pipe Q, the deep hunt, more misfires, muffler +2.5 kHz, burst +8 dB.
 * Stereo: the dry voice slightly left (pan −0.15); the exhaust path also feeds a 30 ms tapped line whose taps
 * return mostly right (5.9 / 13.7 / 27 ms) and some left (9.3 / 19.1 ms), damped — early reflections off the
 * course; the intake hiss is independent noise per channel. Rev limiter: two cycles in every six emit nothing (an ignition-cut stutter).
 * All randomness from the seeded NoiseRng; no allocation after construction.
 */
import { Biquad, NoiseRng, TWO_PI, clamp, dbToGain, smoothCoef } from './util';

const IDLE = 1500;
const REDLINE = 10000;
/** Early-reflection taps (ms) and their L / R gains. */
const TAPS_MS = [5.9, 9.3, 13.7, 19.1, 27.0] as const;
const TAPS_L = [0.06, 0.24, 0.05, 0.16, 0.04] as const;
const TAPS_R = [0.38, 0.05, 0.28, 0.04, 0.12] as const;

export class EngineVoice {
  private readonly sr: number;
  private readonly rng: NoiseRng;
  // firing scheduler
  private phase = 0;
  private cycle = 0;
  private periodMul = 1;
  private hunt = 0;
  // per-firing excitation
  private excEnv = 0;
  private burstEnv = 0;
  private burstDecay = 0;
  private gulp = 0;
  private gulpDecay = 0;
  private valveEnv = 0;
  // targets / smoothed
  private rpmTarget = IDLE;
  private loadTarget = 0;
  private gainTarget = 1;
  private clutchTarget = 0;
  private speedTarget = 0;
  private torqueTarget = 0;
  private lugTarget = 0;
  private bike = 0;
  private limiter = false;
  private rpm = IDLE;
  private load = 0;
  private gain = 1;
  private clutch = 0;
  private speed = 0;
  private torque = 0;
  private lug = 0;
  private readonly kRpm: number;
  private readonly kLoad: number;
  private readonly kGain: number;
  private readonly kSlow: number;
  // resonators + filters
  private readonly pipe1: Biquad;
  private readonly pipe2: Biquad;
  private readonly body: Biquad;
  private readonly lp: Biquad;
  private readonly hp: Biquad;
  private readonly burstHp: Biquad;
  private readonly burstLp: Biquad;
  private readonly intakeL: Biquad;
  private readonly intakeR: Biquad;
  private readonly mech: Biquad;
  private readonly whineBp: Biquad;
  private whinePhase = 0;
  private chatterPhase = 0;
  private whineDetune = 1;
  // early reflections
  private readonly refl: Float32Array;
  private reflPos = 0;
  private readonly tapOff: Int32Array;
  private reflLpL = 0;
  private reflLpR = 0;
  // block coefficients
  private level = 0;
  private intakeGain = 0;
  private burstGain = 0;
  private pulseAmp = 0;
  private overrun = false;
  private f1 = 95;
  private f3 = 330;
  private q1 = 5;

  constructor(sr: number, seed: number) {
    this.sr = sr;
    this.rng = new NoiseRng(seed);
    this.kRpm = smoothCoef(0.008, sr);
    this.kLoad = smoothCoef(0.004, sr);
    this.kGain = smoothCoef(0.005, sr);
    this.kSlow = smoothCoef(0.03, sr);
    this.pipe1 = new Biquad(sr);
    this.pipe2 = new Biquad(sr);
    this.body = new Biquad(sr);
    this.lp = new Biquad(sr);
    this.hp = new Biquad(sr);
    this.hp.highpass(40, 0.7);
    this.burstHp = new Biquad(sr);
    this.burstHp.highpass(1500, 0.7);
    this.burstLp = new Biquad(sr);
    this.intakeL = new Biquad(sr);
    this.intakeR = new Biquad(sr);
    this.mech = new Biquad(sr);
    this.mech.bandpass(1100, 0.6);
    this.whineBp = new Biquad(sr);
    this.whineBp.bandpass(2800, 6);
    const maxTap = Math.ceil((TAPS_MS[TAPS_MS.length - 1]! / 1000) * sr) + 2;
    this.refl = new Float32Array(maxTap);
    this.tapOff = new Int32Array(TAPS_MS.length);
    for (let i = 0; i < TAPS_MS.length; i++) this.tapOff[i] = Math.round((TAPS_MS[i]! / 1000) * sr);
    this.setBlockCoefs();
    this.retune(1);
  }

  set(rpm: number, load: number, limiter: boolean, gain: number, clutch = 0, speed = 0, torque = load, bike = 0, lug = 0): void {
    this.rpmTarget = clamp(rpm, 150, 14000);
    this.loadTarget = clamp(load, 0, 1);
    this.limiter = limiter;
    this.gainTarget = clamp(gain, 0, 1);
    this.clutchTarget = clamp(clutch, 0, 1);
    this.speedTarget = clamp(speed, 0, 1);
    this.torqueTarget = clamp(torque, 0, 1);
    this.lugTarget = clamp(lug, 0, 1);
    this.bike = bike;
  }

  /** Current smoothed rpm (for tests). */
  get currentRpm(): number {
    return this.rpm;
  }

  private setBlockCoefs(): void {
    const load = this.load;
    const pro = this.bike === 1;
    const lug = this.lug;
    const revNorm = clamp((this.rpm - IDLE) / (REDLINE - IDLE), 0, 1);
    this.overrun = load < 0.08 && this.rpm > 2500;
    this.lp.lowpass(1400 + 3800 * load + 2500 * lug + (pro ? 700 : 0), 0.8);
    this.burstLp.lowpass(2500 + 5500 * load + (pro ? 800 : 0), 0.7);
    const fi = 600 + 1600 * load;
    this.intakeL.bandpass(fi, 0.9);
    this.intakeR.bandpass(fi * 1.07, 0.9);
    this.intakeGain = dbToGain(-46 + 14 * load + 6 * lug + (pro ? 2 : 0));
    this.burstGain = dbToGain(-34 + 10 * load + 8 * lug + (pro ? 3 : 0));
    // per-pulse energy: up with load and lug, down with rev (the pulse density carries the loudness: 6.7× more
    // firings at redline than at idle), 4 = the exciter gain that puts the idle pulse's ring at −12 dB
    this.pulseAmp = ((4 * (0.5 + 0.35 * load + 0.15 * lug)) / (1 + 3 * revNorm)) * (pro ? 1.1 : 1);
    this.f1 = 95 * (1 + 0.35 * revNorm + 0.12 * load) * (pro ? 1.12 : 1);
    this.f3 = 330 + 260 * load + 60 * revNorm + (pro ? 50 : 0);
    this.q1 = 5 + 2 * lug;
    this.level =
      dbToGain(-5 + 5 * Math.sqrt(load) + this.torque + this.speed + 4 * lug - (this.overrun ? 8 : 0) + (80 + 60 * lug) * this.hunt) *
      this.gain;
  }

  /** Per-firing retune of the resonators: centres jittered ±2.5 %, Q with the load. */
  private retune(j: number): void {
    const f1 = this.f1 * j;
    this.pipe1.bandpass(f1, this.q1);
    this.pipe2.bandpass(f1 * 2.37 * (2 - j), 4);
    this.body.bandpass(this.f3 * (0.5 + 0.5 * j), 3);
  }

  /** Adds `n` samples into L / R starting at `off`. */
  process(L: Float32Array, R: Float32Array, off: number, n: number): void {
    this.rpm += (this.rpmTarget - this.rpm) * (1 - Math.pow(1 - this.kRpm, n));
    this.load += (this.loadTarget - this.load) * (1 - Math.pow(1 - this.kLoad, n));
    this.gain += (this.gainTarget - this.gain) * (1 - Math.pow(1 - this.kGain, n));
    this.clutch += (this.clutchTarget - this.clutch) * (1 - Math.pow(1 - this.kSlow, n));
    this.speed += (this.speedTarget - this.speed) * (1 - Math.pow(1 - this.kSlow, n));
    this.torque += (this.torqueTarget - this.torque) * (1 - Math.pow(1 - this.kLoad, n));
    this.lug += (this.lugTarget - this.lug) * (1 - Math.pow(1 - this.kSlow, n));
    this.setBlockCoefs();
    if (this.level < 1e-5 && this.clutch < 1e-3) return;

    const sr = this.sr;
    const dt = 1 / sr;
    const fFire = this.rpm / 120;
    const load = this.load;
    const lug = this.lug;
    const level = this.level;
    const intakeGain = this.intakeGain;
    const burstGain = this.burstGain;
    const mechGain = dbToGain(-46);
    const valveGain = dbToGain(-36);
    const valveDecay = Math.exp(-dt / 0.0008);
    const excDecay = Math.exp(-dt / 0.0007);
    const jitter = 0.05 - 0.028 * load + 0.015 * lug;
    const huntOn = load < 0.25 || lug > 0.3;
    const whineGain = dbToGain(-30) * this.clutch;
    if (this.clutch > 1e-3) this.whineDetune = clamp(this.whineDetune + 0.002 * this.rng.n(), 0.97, 1.03);
    const dWhine = (2800 * this.whineDetune) / sr;
    const dChatter = 30 / sr;
    const refl = this.refl;
    const reflLen = refl.length;
    const taps = this.tapOff;
    const dryL = 0.79;
    const dryR = 0.61;

    for (let i = 0; i < n; i++) {
      // -- firing cycle ---------------------------------------------------------
      const prev = this.phase;
      this.phase += (fFire * this.periodMul * (1 + this.hunt)) / sr;
      if (this.phase >= 1) {
        this.phase -= 1;
        this.cycle++;
        // next period: per-cycle timing jitter and the slow hunt
        this.periodMul = 1 + jitter * this.rng.n();
        // the hunt: a per-cycle random walk (time constant ~17 cycles), ±4 % of rate, deeper under lug
        if (huntOn) this.hunt = clamp(this.hunt * 0.94 + (0.01 + 0.008 * lug) * this.rng.n(), -0.03 - 0.03 * lug, 0.03 + 0.03 * lug);
        else this.hunt *= 0.9;
        // rev limiter: two consecutive cuts in every six cycles (1/3 duty, a 24 ms gap at redline the early reflections
        // cannot bridge — one cut in three was smeared over by the 6–27 ms taps)
        const cut = this.limiter && this.cycle % 6 < 2;
        if (cut) {
          // ignition cut: no charge, no intake gulp; the pipe ring is damped so the gap is heard (the limiter stutter)
          this.gulp = -0.6;
          this.pipe1.reset();
          this.pipe2.reset();
          this.body.reset();
        } else {
          let amp = this.pulseAmp * (1 + 0.15 * this.rng.n());
          let burst = 1;
          let tauB = 0.0025 + 0.003 * load;
          if (load < 0.12 && this.rpm < 2200 && this.rng.u() < 0.05 + 0.03 * lug) {
            amp *= 0.2; // misfire: a weak pop, no exhaust burst
            burst = 0;
          } else if (this.overrun && this.rng.u() < 0.18) {
            amp *= 2.2; // overrun pop / burble
            burst = 2.5;
            tauB = 0.012;
          }
          this.excEnv = amp;
          this.burstEnv = amp * burst;
          this.burstDecay = Math.exp(-dt / tauB);
          this.retune(1 + 0.025 * this.rng.n());
        }
        if (!cut) this.gulp = 1;
        this.gulpDecay = Math.exp(-dt / (0.3 / Math.max(5, fFire)));
        this.valveEnv = 1;
      }
      if (prev < 0.5 && this.phase >= 0.5) this.valveEnv = 0.7;

      // -- excitation → resonators → muffler --------------------------------------
      let exc = 0;
      let burst = 0;
      if (this.excEnv > 1e-4) {
        exc = this.excEnv * (1 + 0.6 * this.rng.n());
        this.excEnv *= excDecay;
      }
      if (this.burstEnv > 1e-4) {
        burst = this.burstEnv * this.rng.n();
        this.burstEnv *= this.burstDecay;
      }
      let ex = this.pipe1.process(exc) * 5.5 + this.pipe2.process(exc) * 2.0 + this.body.process(exc) * 1.4;
      ex = this.hp.process(this.lp.process(ex));
      ex += this.burstLp.process(this.burstHp.process(burst)) * burstGain * 6;

      // -- continuous bed: intake (decorrelated), mechanical, valve train ---------------
      const g = (0.45 + 0.55 * this.gulp) * intakeGain;
      this.gulp *= this.gulpDecay;
      const inL = this.intakeL.process(this.rng.n()) * g;
      const inR = this.intakeR.process(this.rng.n()) * g;
      let bed = this.mech.process(this.rng.n()) * mechGain;
      if (this.valveEnv > 1e-3) {
        bed += this.valveEnv * this.rng.n() * valveGain;
        this.valveEnv *= valveDecay;
      }

      // -- clutch slip whine -----------------------------------------------------
      let whine = 0;
      if (whineGain > 1e-6) {
        this.whinePhase += dWhine;
        if (this.whinePhase >= 1) this.whinePhase -= 1;
        this.chatterPhase += dChatter;
        if (this.chatterPhase >= 1) this.chatterPhase -= 1;
        const chatter = 0.6 + 0.4 * Math.sin(this.chatterPhase * TWO_PI);
        whine = (Math.sin(this.whinePhase * TWO_PI) * 0.5 + this.whineBp.process(this.rng.n()) * 2) * chatter * whineGain;
      }

      // -- stereo: dry slightly left, early reflections of the exhaust path -----------
      const dry = (ex + bed) * level + whine;
      refl[this.reflPos] = ex * level;
      let rl = 0;
      let rr = 0;
      for (let k = 0; k < 5; k++) {
        let p = this.reflPos - taps[k]!;
        if (p < 0) p += reflLen;
        const v = refl[p]!;
        rl += v * TAPS_L[k]!;
        rr += v * TAPS_R[k]!;
      }
      if (++this.reflPos >= reflLen) this.reflPos = 0;
      this.reflLpL += (rl - this.reflLpL) * 0.3;
      this.reflLpR += (rr - this.reflLpR) * 0.3;

      L[off + i] = L[off + i]! + dry * dryL + this.reflLpL + inL * level;
      R[off + i] = R[off + i]! + dry * dryR + this.reflLpR + inR * level;
    }
  }
}
