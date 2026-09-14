/**
 * Per-biome ambience beds + speed wind. Biome index order matches
 * params.BIOMES: 0 industrial, 1 canyon, 2 snow, 3 nightCity, 4 foundry.
 * Sparse events (creak, bird, clank, crackle) go through the voice pool on
 * the ambient bus with seeded timers.
 */
import { Biquad, NoiseColour, NoiseRng, TWO_PI, clamp, dbToGain, smoothCoef } from './util';
import type { VoicePool } from './voices';

export class Ambience {
  private readonly sr: number;
  private readonly rng: NoiseRng;
  private readonly colour = new NoiseColour();
  private readonly colour2 = new NoiseColour();
  private readonly bedLp: Biquad;
  private readonly bedLp2: Biquad;
  private readonly hiss: Biquad;
  private readonly neonLp: Biquad;
  private readonly windHp: Biquad;
  private biome = -1;
  private gainTarget = 1;
  private gain = 0;
  private readonly kGain: number;
  private windTarget = 0;
  private wind = 0;
  private readonly kWind: number;
  private lfo1 = 0;
  private lfo2 = 0;
  private hum1 = 0;
  private hum2 = 0;
  private neon = 0;
  private cricket = 0;
  private cricketGate = 0;
  private nextEvent = 0;
  private crackleRate = 0;
  private sinceLfo = 0;
  private bedGain = 0;
  private bedGain2 = 0;
  private lfoGain = 1;

  constructor(sr: number, seed: number) {
    this.sr = sr;
    this.rng = new NoiseRng(seed);
    this.bedLp = new Biquad(sr);
    this.bedLp2 = new Biquad(sr);
    this.hiss = new Biquad(sr);
    this.neonLp = new Biquad(sr);
    this.neonLp.lowpass(400, 0.7);
    this.windHp = new Biquad(sr);
    this.windHp.highpass(1200, 0.7);
    this.kGain = smoothCoef(0.05, sr);
    this.kWind = smoothCoef(0.03, sr);
  }

  set(biome: number, ambientGain: number, wind: number, airborne: boolean): void {
    if (biome !== this.biome) {
      this.biome = biome;
      this.configure();
    }
    this.gainTarget = clamp(ambientGain, 0, 1);
    this.windTarget = dbToGain(-40 + 16 * clamp(wind, 0, 1) + (airborne ? 6 : 0)) * (wind > 0.01 ? 1 : 0);
  }

  private configure(): void {
    this.nextEvent = 0;
    this.crackleRate = 0;
    this.bedGain2 = 0;
    switch (this.biome) {
      case 0: // industrial: hum + room tone + HVAC
        this.bedLp.lowpass(1200, 0.7);
        this.bedGain = dbToGain(-33);
        this.bedLp2.lowpass(180, 0.7);
        this.bedGain2 = dbToGain(-36);
        break;
      case 1: // canyon wind
        this.bedLp.lowpass(320, 0.7);
        this.bedGain = dbToGain(-27);
        break;
      case 2: // snow wind + hiss
        this.bedLp.lowpass(500, 0.7);
        this.bedGain = dbToGain(-29);
        this.hiss.highpass(6000, 0.7);
        break;
      case 3: // night city traffic bed
        this.bedLp.lowpass(140, 0.7);
        this.bedGain = dbToGain(-25);
        break;
      default: // foundry roar
        this.bedLp.lowpass(220, 0.7);
        this.bedGain = dbToGain(-22);
        this.crackleRate = 4 / this.sr;
        break;
    }
  }

  private scheduleEvent(pool: VoicePool): void {
    const b = this.biome;
    if (b === 0) {
      pool.trigger({ kind: 100, gain: 1, pitch: 0, pan: this.rng.range2(-0.5, 0.5), delay: 0 });
      this.nextEvent = this.rng.range2(9, 17) * this.sr;
    } else if (b === 1) {
      pool.trigger({ kind: 101, gain: 1, pitch: 0, pan: this.rng.range2(-0.6, 0.6), delay: 0 });
      this.nextEvent = this.rng.range2(6, 14) * this.sr;
    } else if (b === 4) {
      pool.trigger({ kind: 102, gain: 1, pitch: 0, pan: this.rng.range2(-0.4, 0.4), delay: 0 });
      this.nextEvent = this.rng.range2(5, 11) * this.sr;
    } else {
      this.nextEvent = 30 * this.sr;
    }
  }

  /** Adds stereo into L/R. */
  process(L: Float32Array, R: Float32Array, off: number, n: number, pool: VoicePool): void {
    // LFO update at block rate (cheap; ~0.1..6 Hz content)
    const blockDt = n / this.sr;
    this.sinceLfo += n;
    const b = this.biome;
    if (b === 1 || b === 2) {
      this.lfo1 += TWO_PI * 0.13 * blockDt;
      this.lfo2 += TWO_PI * 0.31 * blockDt;
      this.lfoGain = dbToGain(6 * Math.sin(this.lfo1) + 3 * Math.sin(this.lfo2));
    } else if (b === 3) {
      this.lfo1 += TWO_PI * 0.05 * blockDt;
      this.lfoGain = dbToGain(4 * Math.sin(this.lfo1));
    } else if (b === 4) {
      this.lfo1 += TWO_PI * 6 * blockDt;
      this.lfoGain = dbToGain(3 * Math.sin(this.lfo1));
    } else {
      this.lfoGain = 1;
    }
    if (this.lfo1 > TWO_PI) this.lfo1 -= TWO_PI;
    if (this.lfo2 > TWO_PI) this.lfo2 -= TWO_PI;

    if (this.gain > 1e-4 || this.gainTarget > 1e-4) {
      this.nextEvent -= n;
      if (this.nextEvent <= 0) this.scheduleEvent(pool);
    }

    const sr = this.sr;
    const humG = dbToGain(-40);
    const neonG = dbToGain(-42);
    const cricketG = dbToGain(-40);
    const hissG = dbToGain(-46);
    const crackleRate = this.crackleRate;
    for (let i = 0; i < n; i++) {
      this.gain += (this.gainTarget - this.gain) * this.kGain;
      this.wind += (this.windTarget - this.wind) * this.kWind;
      const wL = this.rng.n();
      const wR = this.rng.n();
      let l = 0;
      let r = 0;
      const g = this.gain;
      if (g > 1e-4) {
        const bed = this.bedLp.process(this.colour.brownian(wL)) * this.bedGain * this.lfoGain;
        l += bed;
        r += bed;
        if (b === 0) {
          this.hum1 += (TWO_PI * 60) / sr;
          this.hum2 += (TWO_PI * 120) / sr;
          const hum = (Math.sin(this.hum1) + 0.6 * Math.sin(this.hum2)) * humG;
          const hvac = this.bedLp2.process(this.colour2.pink(wR)) * this.bedGain2;
          l += hum + hvac;
          r += hum + hvac;
        } else if (b === 2) {
          const h = this.hiss.process(wR) * hissG;
          l += h;
          r += h * 0.8;
        } else if (b === 3) {
          this.neon += 120 / sr;
          if (this.neon >= 1) this.neon -= 1;
          const nz = this.neonLp.process((2 * this.neon - 1) + Math.sin(this.neon * TWO_PI * 2)) * neonG;
          this.cricket += (TWO_PI * 4200) / sr;
          this.cricketGate += 18 / sr;
          if (this.cricketGate >= 1) this.cricketGate -= 1;
          const cr = this.cricketGate < 0.6 ? Math.sin(this.cricket) * cricketG : 0;
          l += nz + cr * 0.4;
          r += nz + cr;
        } else if (b === 4 && crackleRate > 0 && this.rng.u() < crackleRate) {
          pool.trigger({ kind: 103, gain: 1, pitch: 0, pan: this.rng.range2(-0.7, 0.7), delay: 0 });
        }
        l *= g;
        r *= g;
      }
      // speed wind (not gated by ambientGain: it belongs to the bike)
      const wind = this.windHp.process(wR) * this.wind;
      l += wind;
      r += wind;
      L[off + i] = L[off + i]! + l;
      R[off + i] = R[off + i]! + r;
    }
    if (this.hum1 > TWO_PI) this.hum1 -= TWO_PI;
    if (this.hum2 > TWO_PI) this.hum2 -= TWO_PI;
    if (this.cricket > TWO_PI) this.cricket -= TWO_PI;
  }
}
