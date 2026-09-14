/**
 * One-shot voice pool and recipes. A voice = up to 4 gliding partials + one
 * filtered noise layer (+ optional grunt formants) under an A/H/D envelope,
 * with a start delay, a bus (0 chassis / 1 ui / 2 ambient) and a reverb send.
 * Recipes are pure functions of (kind, gain, pitch, pan).
 */
import { Biquad, NoiseColour, NoiseRng, TWO_PI, clamp, dbToGain, decayCoef, panGains } from './util';

export const BUS_CHASSIS = 0;
export const BUS_UI = 1;
export const BUS_AMBIENT = 2;

const MAX_PARTIALS = 4;
const KILL_S = 0.005;

class Voice {
  active = false;
  bus = 0;
  send = 0;
  delay = 0; // samples until onset
  t = 0; // samples since onset
  gl = 1;
  gr = 0;
  gain = 1;
  att = 1;
  hold = 0;
  dec = 1;
  env = 0;
  life = 0;
  killing = false;
  killStep = 0;
  killGain = 1;
  // partials
  np = 0;
  readonly pAmp = new Float64Array(MAX_PARTIALS);
  readonly pDecay = new Float64Array(MAX_PARTIALS);
  readonly pF = new Float64Array(MAX_PARTIALS);
  readonly pFEnd = new Float64Array(MAX_PARTIALS);
  readonly pGlide = new Float64Array(MAX_PARTIALS);
  readonly pPhase = new Float64Array(MAX_PARTIALS);
  readonly pWave = new Uint8Array(MAX_PARTIALS); // 0 sine 1 saw 2 triangle
  readonly pDelay = new Float64Array(MAX_PARTIALS); // onset offset samples (for arpeggios)
  // noise
  nAmp = 0;
  nDecay = 1;
  nColour = 0; // 0 white 1 pink 2 brown
  nFilter = 0; // 0 none 1 lp 2 bp 3 hp
  nF = 1000;
  nFEnd = 1000;
  nGlide = 0;
  nQ = 1;
  nAtt = 1; // samples of noise-only attack (whooshes)
  readonly nBq: Biquad;
  readonly colour = new NoiseColour();
  // grunt formants
  formant = false;
  readonly f1: Biquad;
  readonly f2: Biquad;
  readonly f3: Biquad;
  readonly flp: Biquad;
  // amplitude modulation (creak) — Hz, depth
  amHz = 0;
  amDepth = 0;
  amPhase = 0;
  // gating (cricket)
  gateHz = 0;
  gateDuty = 1;
  gatePhase = 0;

  constructor(sr: number) {
    this.nBq = new Biquad(sr);
    this.f1 = new Biquad(sr);
    this.f2 = new Biquad(sr);
    this.f3 = new Biquad(sr);
    this.flp = new Biquad(sr);
    this.flp.lowpass(1200, 0.7);
  }
}

export interface Trigger {
  kind: number;
  gain: number;
  pitch: number;
  pan: number;
  delay: number;
}

export class VoicePool {
  private readonly sr: number;
  private readonly rng: NoiseRng;
  private readonly voices: Voice[] = [];
  private readonly pg: [number, number] = [1, 0];
  /** Ordered onset log (sample index of first non-delayed sample), for tests. */
  readonly onsetLog: { kind: number; sample: number }[] = [];
  logOnsets = false;
  private sampleClock = 0;

  constructor(sr: number, seed: number, size = 16) {
    this.sr = sr;
    this.rng = new NoiseRng(seed);
    for (let i = 0; i < size; i++) this.voices.push(new Voice(sr));
  }

  get activeCount(): number {
    let n = 0;
    for (const v of this.voices) if (v.active) n++;
    return n;
  }

  /** Hard-stop every voice on the given buses within 5 ms and drop pending ones. */
  killBuses(chassis: boolean, ui: boolean, ambient = false): void {
    for (const v of this.voices) {
      if (!v.active) continue;
      if ((v.bus === BUS_CHASSIS && chassis) || (v.bus === BUS_UI && ui) || (v.bus === BUS_AMBIENT && ambient)) {
        if (v.t === 0 && v.delay > 0) {
          v.active = false;
          continue;
        }
        v.killing = true;
        v.killStep = 1 / Math.max(1, KILL_S * this.sr);
      }
    }
  }

  private alloc(): Voice {
    let best: Voice | null = null;
    let oldest = -1;
    for (const v of this.voices) {
      if (!v.active) return this.blank(v);
      if (v.t > oldest) {
        oldest = v.t;
        best = v;
      }
    }
    return this.blank(best!);
  }

  private blank(v: Voice): Voice {
    v.active = true;
    v.bus = BUS_CHASSIS;
    v.send = 0;
    v.delay = 0;
    v.t = 0;
    v.gain = 1;
    v.att = 1;
    v.hold = 0;
    v.dec = 1;
    v.env = 0;
    v.life = this.sr * 2;
    v.killing = false;
    v.killGain = 1;
    v.np = 0;
    v.pDelay.fill(0);
    v.nAmp = 0;
    v.nDecay = 1;
    v.nColour = 0;
    v.nFilter = 0;
    v.nGlide = 0;
    v.nAtt = 1;
    v.nQ = 1;
    v.nBq.reset();
    v.formant = false;
    v.amHz = 0;
    v.amDepth = 0;
    v.gateHz = 0;
    v.gateDuty = 1;
    return v;
  }

  private partial(v: Voice, amp: number, f: number, fEnd: number, glideS: number, decayS: number, wave = 0, delayS = 0): void {
    if (v.np >= MAX_PARTIALS) return;
    const i = v.np++;
    v.pAmp[i] = amp;
    v.pF[i] = f;
    v.pFEnd[i] = fEnd;
    v.pGlide[i] = glideS > 0 ? 1 - Math.exp(-1 / (glideS * this.sr * 0.3)) : 1;
    v.pDecay[i] = decayCoef(decayS, this.sr);
    v.pPhase[i] = 0;
    v.pWave[i] = wave;
    v.pDelay[i] = Math.round(delayS * this.sr);
  }

  private noise(v: Voice, amp: number, decayS: number, colour: number, filter: number, f: number, q: number, fEnd = f, glideS = 0, attS = 0): void {
    v.nAmp = amp;
    v.nDecay = decayCoef(decayS, this.sr);
    v.nColour = colour;
    v.nFilter = filter;
    v.nF = f;
    v.nFEnd = fEnd;
    v.nQ = q;
    v.nGlide = glideS > 0 ? 1 - Math.exp(-1 / (glideS * this.sr * 0.3)) : 1;
    v.nAtt = Math.max(1, Math.round(attS * this.sr));
  }

  private env(v: Voice, attS: number, holdS: number, decayS: number, lifeS: number): void {
    v.att = Math.max(1, Math.round(attS * this.sr));
    v.hold = Math.round(holdS * this.sr);
    v.dec = decayCoef(decayS, this.sr);
    v.life = Math.round(lifeS * this.sr);
  }

  private finish(v: Voice, gainDb: number, gain: number, pan: number, delayS: number, bus: number, send = 0): void {
    v.gain = dbToGain(gainDb) * gain;
    panGains(pan, this.pg);
    v.gl = this.pg[0];
    v.gr = this.pg[1];
    v.delay = Math.max(0, Math.round(delayS * this.sr));
    v.bus = bus;
    v.send = send;
  }

  // ---------------------------------------------------------------------------
  // Recipes (kind indices match params.TRANSIENT_KINDS)
  // ---------------------------------------------------------------------------

  trigger(tr: Trigger): void {
    const { kind, gain, pitch, pan, delay } = tr;
    const surf = Math.round(pitch * 8);
    switch (kind) {
      case 0: // landing
        this.landing(gain, surf, pan, delay);
        break;
      case 1: // thunk
        this.landing(gain * 0.5, 0, pan, delay);
        break;
      case 2: {
        // bottomOut
        const v = this.alloc();
        this.partial(v, 1, 2200, 2200, 0, 0.18);
        this.partial(v, 0.8, 3100, 3100, 0, 0.12);
        this.partial(v, 0.6, 4700, 4700, 0, 0.08);
        this.env(v, 0.001, 0, 0.2, 0.4);
        this.finish(v, -16, gain, pan, delay, BUS_CHASSIS, 0.15);
        this.landing(1, 0, pan, delay);
        break;
      }
      case 3: {
        // impact
        const v = this.alloc();
        this.partial(v, 1, 95, 40, 0.12, 0.25);
        this.noise(v, 0.6, 0.08, 0, 2, 800, 1);
        this.env(v, 0.001, 0, 0.3, 0.6);
        this.finish(v, -10, gain, pan, delay, BUS_CHASSIS, 0.2);
        const r = this.alloc();
        const det = 1 + (pitch - 0.5) * 0.008;
        this.partial(r, 1, 1320 * det, 1320 * det, 0, 0.42);
        this.partial(r, 0.7, 2070 * det, 2070 * det, 0, 0.3);
        this.partial(r, 0.5, 3410 * det, 3410 * det, 0, 0.2);
        this.env(r, 0.001, 0, 0.45, 0.8);
        this.finish(r, -22, gain, pan, delay, BUS_CHASSIS, 0.3);
        break;
      }
      case 4: {
        // debris grain
        const v = this.alloc();
        this.noise(v, 1, 0.012, 0, 2, 1000 + 3000 * pitch, 2);
        this.env(v, 0.0005, 0.004, 0.012, 0.05);
        this.finish(v, -24, gain, pan, delay, BUS_CHASSIS, 0.1);
        break;
      }
      case 5: {
        // grunt: glottal saw → formants
        const v = this.alloc();
        const second = pitch > 0.2;
        const f0 = second ? 115 : 130;
        const f1 = second ? 90 : 95;
        const len = second ? 0.12 : 0.18;
        this.partial(v, 1, f0 * (1 + 0.03 * this.rng.n()), f1, len, 1, 1);
        v.formant = true;
        v.f1.peaking(620, 8, 12);
        v.f2.peaking(1150, 10, 8);
        v.f3.peaking(2500, 12, 4);
        v.flp.lowpass(1200, 0.7);
        this.env(v, 0.008, 0.06, 0.14, len + 0.25);
        this.finish(v, -14, gain, pan, delay, BUS_CHASSIS, 0.1);
        break;
      }
      case 6: {
        // fault stamp: slap + sub tap
        const v = this.alloc();
        this.noise(v, 1, 0.03, 0, 2, 2200, 0.8);
        this.partial(v, 0.8, 60, 60, 0, 0.09);
        this.env(v, 0.001, 0.01, 0.09, 0.25);
        this.finish(v, -10, gain, pan, delay, BUS_UI, 0.1);
        break;
      }
      case 7: {
        // tick: wood joint (surf 1) / drum ridge (surf 2)
        const v = this.alloc();
        if (surf === 2) {
          this.partial(v, 1, 1850, 1850, 0, 0.06);
          this.noise(v, 0.5, 0.003, 0, 3, 3000, 0.7);
          this.env(v, 0.0005, 0, 0.06, 0.12);
          this.finish(v, -24, gain, pan, delay, BUS_CHASSIS);
        } else {
          this.noise(v, 1, 0.004, 0, 2, 1500, 2);
          this.partial(v, 0.5, 220, 220, 0, 0.03);
          this.env(v, 0.0005, 0, 0.03, 0.08);
          this.finish(v, -22, gain, pan, delay, BUS_CHASSIS);
        }
        break;
      }
      case 8: {
        // skid chirp
        const v = this.alloc();
        this.partial(v, 1, 2400, 1100, 0.09, 0.2);
        this.env(v, 0.005, 0, 0.08, 0.2);
        this.finish(v, -20, gain, pan, delay, BUS_CHASSIS);
        break;
      }
      case 9: {
        // countdown tick 880 Hz
        const v = this.alloc();
        this.partial(v, 1, 880, 880, 0, 0.3);
        this.env(v, 0.003, 0.01, 0.07, 0.3);
        this.finish(v, -14, gain, pan, delay, BUS_UI, 0.1);
        break;
      }
      case 10: // go
        this.goChord(-10, gain, pan, delay, true);
        break;
      case 11: {
        // checkpoint: C6 → E6 triangle + flame-jet whoosh
        const a = this.alloc();
        this.partial(a, 1, 1046.5, 1046.5, 0, 0.4, 2);
        this.env(a, 0.003, 0.02, 0.4, 0.6);
        this.finish(a, -14, gain, pan, delay, BUS_UI, 0.3);
        const b = this.alloc();
        this.partial(b, 1, 1318.5, 1318.5, 0, 0.4, 2);
        this.env(b, 0.003, 0.02, 0.4, 0.6);
        this.finish(b, -14, gain, pan, delay + 0.09, BUS_UI, 0.3);
        const w = this.alloc();
        this.noise(w, 1, 0.35, 0, 2, 400, 0.8, 1500, 0.3, 0.03);
        this.env(w, 0.03, 0.05, 0.35, 0.6);
        this.finish(w, -18, gain, pan, delay, BUS_UI, 0.2);
        break;
      }
      case 12: {
        // restart: hard stop + click + whoosh
        this.killBuses(true, true);
        const c = this.alloc();
        this.noise(c, 1, 0.002, 0, 2, 3000, 2);
        this.env(c, 0.0003, 0.001, 0.002, 0.02);
        this.finish(c, -20, gain, pan, delay + 0.001, BUS_UI);
        const w = this.alloc();
        this.noise(w, 1, 0.14, 0, 2, 400, 1, 4000, 0.18, 0.04);
        this.env(w, 0.04, 0, 0.14, 0.3);
        this.finish(w, -16, gain, pan, delay + 0.001, BUS_UI);
        break;
      }
      case 13: // finish tick
        this.goChord(-16, gain, pan, delay, false);
        break;
      case 14: {
        // fanfare note
        const notes = [523.3, 659.3, 784.0, 1046.5];
        const f = notes[clamp(Math.round(pitch * 4), 0, 3)]!;
        const v = this.alloc();
        this.partial(v, 0.7, f, f, 0, 0.6, 2);
        this.partial(v, 0.5, f, f, 0, 0.6, 0);
        this.env(v, 0.004, 0.05, 0.6, 1.0);
        this.finish(v, -12, gain, pan, delay, BUS_UI, 0.4);
        break;
      }
      case 15: {
        // firework pop
        const v = this.alloc();
        this.partial(v, 1, 300 + 100 * pitch, 80, 0.06, 0.1);
        this.noise(v, 0.5, 0.4, 0, 1, 2000, 0.7);
        this.env(v, 0.001, 0, 0.4, 0.7);
        this.finish(v, -18, gain, pan, delay, BUS_UI, 0.35);
        break;
      }
      case 16: {
        // crowd swell
        const v = this.alloc();
        this.noise(v, 1, 0.7, 1, 2, 1100, 0.5);
        this.env(v, 0.3, 0.5, 0.7, 1.8);
        this.finish(v, -24, gain, pan, delay, BUS_UI, 0.4);
        break;
      }
      case 17: {
        // hazard whoosh (fire / water)
        const v = this.alloc();
        this.noise(v, 1, 0.6, 2, 2, 300, 0.7, 2500, 0.4, 0.02);
        this.partial(v, 0.6, 50, 35, 0.3, 0.5);
        this.env(v, 0.02, 0.1, 0.6, 1.0);
        this.finish(v, -12, gain, pan, delay, BUS_CHASSIS, 0.3);
        break;
      }
      case 18: // kill
        this.killBuses(true, true, true);
        break;
      // -- internal ambience events (>= 100) ------------------------------------
      case 100: {
        // metal creak
        const v = this.alloc();
        this.partial(v, 1, 680, 540, 0.3, 0.3);
        v.amHz = 7;
        v.amDepth = 0.6;
        this.env(v, 0.03, 0.2, 0.15, 0.5);
        this.finish(v, -34, gain, pan, delay, BUS_AMBIENT, 0.3);
        break;
      }
      case 101: {
        // bird chirp (FM-ish via fast glide)
        const v = this.alloc();
        this.partial(v, 1, 2800, 3400, 0.05, 0.12);
        v.gateHz = 40;
        v.gateDuty = 0.5;
        this.env(v, 0.005, 0.08, 0.05, 0.16);
        this.finish(v, -36, gain, pan, delay, BUS_AMBIENT, 0.25);
        break;
      }
      case 102: {
        // foundry clank (bottom-out at -20)
        const v = this.alloc();
        this.partial(v, 1, 2200, 2200, 0, 0.18);
        this.partial(v, 0.8, 3100, 3100, 0, 0.12);
        this.partial(v, 0.4, 180, 55, 0.06, 0.14);
        this.env(v, 0.001, 0, 0.2, 0.4);
        this.finish(v, -36, gain, pan, delay, BUS_AMBIENT, 0.4);
        break;
      }
      case 103: {
        // fire crackle grain
        const v = this.alloc();
        this.noise(v, 1, 0.005, 0, 2, 3000, 2);
        this.env(v, 0.0005, 0, 0.005, 0.02);
        this.finish(v, -32, gain, pan, delay, BUS_AMBIENT);
        break;
      }
    }
  }

  private landing(gain: number, surf: number, pan: number, delay: number): void {
    const dirt = surf === 0 || surf === 7;
    const metal = surf === 2 || surf === 5;
    const v = this.alloc();
    this.partial(v, dirt ? 0.7 : 1, 180, 55, 0.06, 0.14);
    this.partial(v, 0.4, 92, 92, 0, 0.26);
    this.noise(v, dirt ? 1.0 : 0.5, 0.04, 2, 1, 600, 0.7);
    this.env(v, 0.002, 0, 0.3, 0.5);
    this.finish(v, -12, gain, pan, delay, BUS_CHASSIS, 0.1);
    if (metal) {
      const r = this.alloc();
      this.partial(r, 1, 1850, 1850, 0, 0.2);
      this.env(r, 0.001, 0, 0.2, 0.3);
      this.finish(r, -24, gain, pan, delay, BUS_CHASSIS, 0.2);
    }
  }

  private goChord(db: number, gain: number, pan: number, delay: number, whoosh: boolean): void {
    const v = this.alloc();
    this.partial(v, 1, 1320, 1320, 0, 0.22);
    this.partial(v, 0.8, 1760, 1760, 0, 0.22);
    this.env(v, 0.002, 0.06, 0.22, 0.5);
    this.finish(v, db, gain, pan, delay, BUS_UI, 0.2);
    if (whoosh) {
      const w = this.alloc();
      this.noise(w, 1, 0.2, 0, 2, 600, 1, 5000, 0.25, 0.02);
      this.env(w, 0.02, 0.05, 0.2, 0.4);
      this.finish(w, -20, gain, pan, delay, BUS_UI, 0.2);
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  /** Adds into per-bus stereo buffers: bus[b] = [L, R]. */
  process(bus: readonly [Float32Array, Float32Array][], off: number, n: number): void {
    for (const v of this.voices) {
      if (!v.active) continue;
      this.renderVoice(v, bus[v.bus]!, off, n);
    }
    this.sampleClock += n;
  }

  private renderVoice(v: Voice, out: [Float32Array, Float32Array], off: number, n: number): void {
    const L = out[0];
    const R = out[1];
    let i = 0;
    if (v.delay > 0) {
      const skip = Math.min(v.delay, n);
      v.delay -= skip;
      i = skip;
      if (v.delay > 0) return;
    }
    if (i < n && v.t === 0 && this.logOnsets) this.onsetLog.push({ kind: v.bus, sample: this.sampleClock + i });
    if (v.nFilter !== 0) this.setNoiseFilter(v);
    const sr = this.sr;
    for (; i < n; i++) {
      // envelope
      if (v.t < v.att) v.env = v.t / v.att;
      else if (v.t < v.att + v.hold) v.env = 1;
      else v.env *= v.dec;
      let x = 0;
      for (let k = 0; k < v.np; k++) {
        if (v.pDelay[k]! > v.t) continue;
        const f = v.pF[k]!;
        v.pF[k] = f + (v.pFEnd[k]! - f) * v.pGlide[k]!;
        let ph = v.pPhase[k]! + f / sr;
        if (ph >= 1) ph -= 1;
        v.pPhase[k] = ph;
        const w = v.pWave[k];
        const s = w === 0 ? Math.sin(ph * TWO_PI) : w === 1 ? 2 * ph - 1 : 4 * Math.abs(ph - 0.5) - 1;
        x += s * v.pAmp[k]!;
        v.pAmp[k] = v.pAmp[k]! * v.pDecay[k]!;
      }
      if (v.formant) {
        x = v.flp.process(v.f1.process(x) * 0.5 + v.f2.process(x) * 0.35 + v.f3.process(x) * 0.25);
      }
      if (v.nAmp > 1e-5) {
        const w = this.rng.n();
        let nz = v.nColour === 1 ? v.colour.pink(w) : v.nColour === 2 ? v.colour.brownian(w) : w;
        if (v.nGlide < 1 && (v.t & 63) === 63) {
          v.nF += (v.nFEnd - v.nF) * v.nGlide * 64;
          this.setNoiseFilter(v);
        }
        if (v.nFilter !== 0) nz = v.nBq.process(nz);
        const nAtt = v.t < v.nAtt ? v.t / v.nAtt : 1;
        x += nz * v.nAmp * nAtt;
        if (v.t >= v.att + v.hold) v.nAmp *= v.nDecay;
      }
      if (v.amHz > 0) {
        v.amPhase += v.amHz / sr;
        if (v.amPhase >= 1) v.amPhase -= 1;
        x *= 1 - v.amDepth * 0.5 * (1 + Math.sin(v.amPhase * TWO_PI));
      }
      if (v.gateHz > 0) {
        v.gatePhase += v.gateHz / sr;
        if (v.gatePhase >= 1) v.gatePhase -= 1;
        if (v.gatePhase > v.gateDuty) x = 0;
      }
      let g = v.env * v.gain;
      if (v.killing) {
        v.killGain -= v.killStep;
        if (v.killGain <= 0) {
          v.active = false;
          return;
        }
        g *= v.killGain;
      }
      x *= g;
      L[off + i] = L[off + i]! + x * v.gl;
      R[off + i] = R[off + i]! + x * v.gr;
      v.t++;
    }
    if (v.t >= v.life) v.active = false;
  }

  private setNoiseFilter(v: Voice): void {
    const f = clamp(v.nF, 20, this.sr * 0.45);
    if (v.nFilter === 1) v.nBq.lowpass(f, v.nQ);
    else if (v.nFilter === 2) v.nBq.bandpass(f, v.nQ);
    else if (v.nFilter === 3) v.nBq.highpass(f, v.nQ);
  }

  /** Reverb send mix of currently active voices is applied by the synth via sendGain(). */
  sendGainOf(bus: number): number {
    let s = 0;
    for (const v of this.voices) if (v.active && v.bus === bus && v.send > s) s = v.send;
    return s;
  }
}
