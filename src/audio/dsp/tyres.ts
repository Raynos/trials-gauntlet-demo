/**
 * Tyre roll noise per surface, rear skid, chain whine.
 * Surface index order matches params.SURFACES:
 *   0 dirt, 1 wood, 2 metal, 3 concrete, 4 rubber, 5 grate, 6 stone, 7 snow
 */
import { Biquad, NoiseColour, NoiseRng, TWO_PI, clamp, dbToGain, smoothCoef } from './util';

/** base gain dB at 10 m/s per surface */
const BASE_DB = [-18, -20, -22, -20, -24, -19, -19, -20];
/** grain rate per second at 0 m/s and per m/s, grain length s, grain centre Hz, Q */
const GRAINS: readonly (readonly [number, number, number, number, number] | null)[] = [
  [25, 6, 0.003, 1800, 2], // dirt crackle
  null,
  null,
  null,
  null,
  null,
  [12, 4, 0.002, 2500, 3], // stone clatter
  [50, 12, 0.004, 1200, 1.5], // snow crunch
];

const GRATE_MAX = 4096;

export class TyreVoice {
  private readonly sr: number;
  private readonly rng: NoiseRng;
  private readonly colour = new NoiseColour();
  private readonly f1: Biquad;
  private readonly f2: Biquad;
  private readonly grainBp: Biquad;
  private readonly hiss: Biquad;
  private readonly grate = new Float32Array(GRATE_MAX);
  private grateIdx = 0;
  private grateDelay = 100;
  private surface = -1;
  private gainTarget = 0;
  private gain = 0;
  private readonly kGain: number;
  private grainRate = 0;
  private grainEnv = 0;
  private grainDecay = 0;
  private hissGain = 0;
  private noiseKind = 0; // 0 white 1 pink 2 brown

  constructor(sr: number, seed: number) {
    this.sr = sr;
    this.rng = new NoiseRng(seed);
    this.f1 = new Biquad(sr);
    this.f2 = new Biquad(sr);
    this.grainBp = new Biquad(sr);
    this.hiss = new Biquad(sr);
    this.hiss.highpass(6000, 0.7);
    this.kGain = smoothCoef(0.01, sr);
  }

  set(speed: number, surface: number): void {
    if (surface !== this.surface) {
      this.surface = surface;
      this.f1.reset();
      this.f2.reset();
    }
    if (surface < 0 || speed <= 0) {
      this.gainTarget = 0;
      return;
    }
    const v = speed;
    this.gainTarget = dbToGain(BASE_DB[surface] ?? -20) * Math.pow(v / 10, 0.7);
    this.hissGain = 0;
    this.noiseKind = 0;
    switch (surface) {
      case 0: // dirt
        this.noiseKind = 2;
        this.f1.lowpass(900 + 60 * v, 0.6);
        this.f2.bypass();
        break;
      case 1: // wood
        this.noiseKind = 1;
        this.f1.bandpass(300 + 25 * v, 1.2);
        this.f2.peaking(220, 6, 8);
        break;
      case 2: // metal
        this.f1.highpass(700, 0.7);
        this.f2.peaking(1850, 8, 4);
        break;
      case 3: // concrete
        this.noiseKind = 1;
        this.f1.highpass(250, 0.7);
        this.f2.lowpass(4000, 0.7);
        break;
      case 4: // rubber
        this.noiseKind = 2;
        this.f1.lowpass(500, 0.7);
        this.f2.peaking(95, 4, 6);
        break;
      case 5: // grate: comb buzz at v / 0.05 m
        this.f1.peaking(2400, 8, 6);
        this.f2.bypass();
        this.grateDelay = clamp(Math.round((0.05 / Math.max(v, 0.5)) * this.sr), 8, GRATE_MAX - 1);
        break;
      case 6: // stone
        this.noiseKind = 1;
        this.f1.highpass(200, 0.7);
        this.f2.lowpass(3000, 0.7);
        break;
      default: // snow
        this.noiseKind = 2;
        this.f1.lowpass(700, 0.7);
        this.f2.bypass();
        this.hissGain = dbToGain(-20);
        break;
    }
    const g = GRAINS[surface] ?? null;
    if (g) {
      this.grainRate = (g[0] + g[1] * v) / this.sr;
      this.grainDecay = Math.pow(0.01, 1 / (g[2] * this.sr));
      this.grainBp.bandpass(g[3], g[4]);
    } else {
      this.grainRate = 0;
    }
  }

  process(out: Float32Array, off: number, n: number): void {
    if (this.gain < 1e-5 && this.gainTarget < 1e-5) {
      this.gain = this.gainTarget;
      return;
    }
    const isGrate = this.surface === 5;
    const grainRate = this.grainRate;
    for (let i = 0; i < n; i++) {
      this.gain += (this.gainTarget - this.gain) * this.kGain;
      const w = this.rng.n();
      let x = this.noiseKind === 1 ? this.colour.pink(w) : this.noiseKind === 2 ? this.colour.brownian(w) : w;
      if (isGrate) {
        const rd = (this.grateIdx - this.grateDelay + GRATE_MAX) % GRATE_MAX;
        const d = this.grate[rd]!;
        const y = x + d * 0.6;
        this.grate[this.grateIdx] = y;
        this.grateIdx = (this.grateIdx + 1) % GRATE_MAX;
        x = y * 0.6;
      }
      x = this.f2.process(this.f1.process(x));
      if (grainRate > 0) {
        if (this.rng.u() < grainRate) this.grainEnv = 0.8 + 0.4 * this.rng.u();
        let g = 0;
        if (this.grainEnv > 1e-3) {
          g = this.grainEnv * this.rng.n();
          this.grainEnv *= this.grainDecay;
        }
        x += this.grainBp.process(g) * 1.5;
      }
      if (this.hissGain > 0) x += this.hiss.process(w) * this.hissGain;
      out[off + i] = out[off + i]! + x * this.gain;
    }
  }
}

export class SkidVoice {
  private readonly rng: NoiseRng;
  private readonly bp: Biquad;
  private gainTarget = 0;
  private gain = 0;
  private readonly kGain: number;

  constructor(sr: number, seed: number) {
    this.rng = new NoiseRng(seed);
    this.bp = new Biquad(sr);
    this.kGain = smoothCoef(0.01, sr);
  }

  set(slip: number): void {
    if (slip < 0.25) {
      this.gainTarget = 0;
      return;
    }
    this.bp.bandpass(1200 + 1400 * slip, 3);
    this.gainTarget = dbToGain(-30 + 22 * slip);
  }

  process(out: Float32Array, off: number, n: number): void {
    if (this.gain < 1e-5 && this.gainTarget < 1e-5) return;
    for (let i = 0; i < n; i++) {
      this.gain += (this.gainTarget - this.gain) * this.kGain;
      out[off + i] = out[off + i]! + this.bp.process(this.rng.n()) * this.gain;
    }
  }
}

/** Two sines at the sprocket tooth frequency through a soft cubic + mesh peak. */
export class ChainVoice {
  private readonly sr: number;
  private readonly rng: NoiseRng;
  private readonly mesh: Biquad;
  private ph1 = 0;
  private ph2 = 0;
  private hz = 0;
  private jitter = 1;
  private gainTarget = 0;
  private gain = 0;
  private readonly kGain: number;
  private sinceJitter = 0;

  constructor(sr: number, seed: number) {
    this.sr = sr;
    this.rng = new NoiseRng(seed);
    this.mesh = new Biquad(sr);
    this.mesh.peaking(1600, 3, 6);
    this.kGain = smoothCoef(0.02, sr);
  }

  set(chainHz: number, airborne: boolean): void {
    this.hz = chainHz;
    if (chainHz <= 0) {
      this.gainTarget = 0;
      return;
    }
    // v = chainHz / 42 teeth * 2πR
    const v = (chainHz / 42) * TWO_PI * 0.34;
    if (v < 1.5) {
      this.gainTarget = 0;
      return;
    }
    let g = dbToGain(-34 + 20 * Math.log10(v / 10));
    if (airborne) g *= 0.5;
    this.gainTarget = g;
  }

  process(out: Float32Array, off: number, n: number): void {
    if (this.gain < 1e-5 && this.gainTarget < 1e-5) return;
    this.sinceJitter += n;
    if (this.sinceJitter >= this.sr / 4) {
      this.sinceJitter = 0;
      this.jitter = clamp(this.jitter + 0.003 * this.rng.n(), 0.99, 1.01);
    }
    const d1 = (this.hz * this.jitter) / this.sr;
    const d2 = d1 * 2;
    const g2 = dbToGain(-8);
    for (let i = 0; i < n; i++) {
      this.gain += (this.gainTarget - this.gain) * this.kGain;
      this.ph1 += d1;
      if (this.ph1 >= 1) this.ph1 -= 1;
      this.ph2 += d2;
      if (this.ph2 >= 1) this.ph2 -= 1;
      let x = Math.sin(this.ph1 * TWO_PI) + g2 * Math.sin(this.ph2 * TWO_PI);
      x = x + 0.3 * x * x * x;
      out[off + i] = out[off + i]! + this.mesh.process(x) * this.gain;
    }
  }
}
