/**
 * MusicBed — a procedural loop for the front end (scene 1) and results (scene 2), composed at
 * construction from the seed and rendered sample by sample. No audio files: the choice over a CC0
 * download is documented in docs/design/audio.md §11.
 *
 *   92 bpm, 8 bars of 16ths (128 steps), key of D — the same key as the stinger family, so the
 *   finish fanfare (D5 F#5 A5 D6) resolves into the results bed.
 *   menu     D Aeolian; one of three progressions (i VI III VII · i VII VI VII · i iv VI v), 2 bars each;
 *            pad (3 notes × 2 detuned saws → LP swept 600–1400 Hz at 0.08 Hz), bass (sine + saw → LP 250 Hz)
 *            on a seeded euclidean E(5,16), pluck arpeggio on a seeded 5-of-16 pattern over the chord tones.
 *   results  D Mixolydian; (I V vi IV · I IV I V · I vi IV V); the same voices plus drums — kick on 1 and 3,
 *            hats on the off-8ths, a clap on 2 and 4 — and a denser (8-of-16) brighter pluck.
 *   scene 0  silent; scene changes fade over 0.8 s in / 0.5 s out and restart the loop at step 0, so the
 *            menu always opens the same way for a seed.
 */
import { Biquad, NoiseRng, TWO_PI, dbToGain, smoothCoef } from './util';

const BPM = 92;
const STEPS = 128;
const PAD_VOICES = 3;
const PLUCKS = 4;
const D2 = 73.416;

// scale degrees in semitones from D
const AEOLIAN = [0, 2, 3, 5, 7, 8, 10];
const MIXOLYDIAN = [0, 2, 4, 5, 7, 9, 10];
// progressions as scale-degree roots (0-based) with a triad quality from the scale
const MENU_PROGS = [
  [0, 5, 2, 6],
  [0, 6, 5, 6],
  [0, 3, 5, 4],
];
const RESULTS_PROGS = [
  [0, 4, 5, 3],
  [0, 3, 0, 4],
  [0, 5, 3, 4],
];

const semi = (base: number, s: number): number => base * Math.pow(2, s / 12);

function euclid(k: number, n: number, rot: number): boolean[] {
  const out: boolean[] = [];
  let bucket = 0;
  for (let i = 0; i < n; i++) {
    bucket += k;
    if (bucket >= n) {
      bucket -= n;
      out.push(true);
    } else out.push(false);
  }
  const r: boolean[] = [];
  for (let i = 0; i < n; i++) r.push(out[(i + rot) % n]!);
  return r;
}

interface Arrangement {
  scale: number[];
  prog: number[];
  bassPattern: boolean[];
  pluckPattern: boolean[];
  pluckDegrees: number[];
  drums: boolean;
}

export class MusicBed {
  private readonly sr: number;
  private readonly rng: NoiseRng;
  private readonly seed: number;
  private scene = 0;
  private arr: Arrangement | null = null;
  private gain = 0;
  private gainTarget = 0;
  private readonly kIn: number;
  private readonly kOut: number;
  private readonly spStep: number;
  private stepCountdown = 0;
  private step = 0;
  // pad
  private readonly padPhase = new Float64Array(PAD_VOICES * 2);
  private readonly padInc = new Float64Array(PAD_VOICES * 2);
  private readonly padIncTarget = new Float64Array(PAD_VOICES * 2);
  private readonly padLp: Biquad;
  private lfo = 0;
  private lpCountdown = 0;
  // bass
  private bassPhase = 0;
  private bassInc = 0;
  private bassEnv = 0;
  private readonly bassDecay: number;
  private readonly bassLp: Biquad;
  // plucks
  private readonly plPhase = new Float64Array(PLUCKS);
  private readonly plInc = new Float64Array(PLUCKS);
  private readonly plEnv = new Float64Array(PLUCKS);
  private readonly plPan = new Float64Array(PLUCKS);
  private plNext = 0;
  private readonly plDecay: number;
  private readonly plLp: Biquad;
  // drums
  private kickPhase = 0;
  private kickF = 0;
  private kickEnv = 0;
  private hatEnv = 0;
  private clapEnv = 0;
  private readonly hatHp: Biquad;
  private readonly clapBp: Biquad;

  constructor(sr: number, seed: number) {
    this.sr = sr;
    this.seed = seed >>> 0;
    this.rng = new NoiseRng(seed);
    this.kIn = smoothCoef(0.8 / 4.6, sr);
    this.kOut = smoothCoef(0.5 / 4.6, sr);
    this.spStep = Math.round((sr * 60) / BPM / 4);
    this.padLp = new Biquad(sr);
    this.padLp.lowpass(900, 0.9);
    this.bassLp = new Biquad(sr);
    this.bassLp.lowpass(250, 0.8);
    this.bassDecay = Math.exp(-1 / (0.35 * sr));
    this.plDecay = Math.exp(-1 / (0.22 * sr));
    this.plLp = new Biquad(sr);
    this.plLp.lowpass(3000, 0.7);
    this.hatHp = new Biquad(sr);
    this.hatHp.highpass(7000, 0.7);
    this.clapBp = new Biquad(sr);
    this.clapBp.bandpass(1200, 1);
  }

  /** 0 silent, 1 menu, 2 results. */
  setScene(scene: number): void {
    const s = scene === 1 || scene === 2 ? scene : 0;
    if (s === this.scene) return;
    this.scene = s;
    this.gainTarget = s === 0 ? 0 : 1;
    if (s !== 0) {
      this.arr = this.compose(s);
      this.step = 0;
      this.stepCountdown = 0;
    }
  }

  get currentScene(): number {
    return this.scene;
  }

  /** Deterministic arrangement for a scene: a fresh rng from (seed, scene) so each scene's loop is stable. */
  private compose(scene: number): Arrangement {
    const r = new NoiseRng((this.seed ^ (scene * 0x9e3779b9)) >>> 0);
    const menu = scene === 1;
    const scale = menu ? AEOLIAN : MIXOLYDIAN;
    const progs = menu ? MENU_PROGS : RESULTS_PROGS;
    const prog = progs[Math.floor(r.u() * progs.length) % progs.length]!;
    const bassPattern = euclid(menu ? 5 : 6, 16, Math.floor(r.u() * 16));
    const pluckPattern = euclid(menu ? 5 : 8, 16, Math.floor(r.u() * 16));
    const pluckDegrees: number[] = [];
    for (let i = 0; i < 16; i++) pluckDegrees.push(Math.floor(r.u() * 5)); // chord tone index 0..4 (root 3rd 5th 8ve 10th)
    return { scale, prog, bassPattern, pluckPattern, pluckDegrees, drums: !menu };
  }

  private chordAt(step: number): { root: number; third: number; fifth: number } {
    const a = this.arr!;
    const deg = a.prog[Math.floor(step / 32) % 4]!;
    const s = a.scale;
    const d = (k: number): number => s[(deg + k) % 7]! + 12 * Math.floor((deg + k) / 7);
    return { root: d(0), third: d(2), fifth: d(4) };
  }

  private onStep(step: number): void {
    const a = this.arr!;
    const sr = this.sr;
    const ch = this.chordAt(step);
    const menu = this.scene === 1;
    // pad: retune on chord changes (glide via padInc smoothing)
    if (step % 32 === 0) {
      const notes = [ch.root, ch.third, ch.fifth];
      for (let v = 0; v < PAD_VOICES; v++) {
        const f = semi(D2 * 2, notes[v]!);
        this.padIncTarget[2 * v] = (f * 1.004) / sr;
        this.padIncTarget[2 * v + 1] = (f * 0.996) / sr;
        if (step === 0) {
          this.padInc[2 * v] = this.padIncTarget[2 * v]!;
          this.padInc[2 * v + 1] = this.padIncTarget[2 * v + 1]!;
        }
      }
    }
    // bass
    if (a.bassPattern[step % 16]) {
      const oct = step % 32 === 24 && !menu ? 12 : 0;
      this.bassInc = semi(D2, ch.root + oct) / sr;
      this.bassEnv = 1;
    }
    // pluck
    if (a.pluckPattern[step % 16]) {
      const tone = a.pluckDegrees[step % 16]!;
      const tones = [ch.root, ch.third, ch.fifth, ch.root + 12, ch.third + 12];
      const f = semi(D2 * 4, tones[tone]!) * (menu ? 1 : 2);
      const k = this.plNext;
      this.plNext = (this.plNext + 1) % PLUCKS;
      this.plInc[k] = f / sr;
      this.plPhase[k] = 0;
      this.plEnv[k] = menu ? 0.7 : 1;
      this.plPan[k] = (step % 4) / 3 - 0.5;
    }
    // drums (results)
    if (a.drums) {
      const s16 = step % 16;
      if (s16 === 0 || s16 === 8 || (s16 === 11 && step % 32 >= 16)) {
        this.kickEnv = 1;
        this.kickF = 130;
        this.kickPhase = 0;
      }
      if (s16 % 4 === 2) this.hatEnv = s16 % 8 === 2 ? 0.8 : 0.55;
      if (s16 === 4 || s16 === 12) this.clapEnv = 1;
    }
  }

  /** Adds stereo into L/R. */
  process(L: Float32Array, R: Float32Array, off: number, n: number): void {
    if (this.gain < 1e-4 && this.gainTarget === 0) return;
    const sr = this.sr;
    const padG = dbToGain(-22);
    const bassG = dbToGain(-16);
    const plG = dbToGain(-19);
    const kickG = dbToGain(-14);
    const hatG = dbToGain(-30);
    const clapG = dbToGain(-24);
    const kickDecay = Math.exp(-1 / (0.18 * sr));
    const hatDecay = Math.exp(-1 / (0.03 * sr));
    const clapDecay = Math.exp(-1 / (0.08 * sr));
    const kGlide = smoothCoef(0.05, sr);
    for (let i = 0; i < n; i++) {
      this.gain += (this.gainTarget - this.gain) * (this.gainTarget > this.gain ? this.kIn : this.kOut);
      if (this.arr === null) continue;
      if (this.gainTarget > 0 || this.gain > 1e-4) {
        if (--this.stepCountdown <= 0) {
          this.stepCountdown = this.spStep;
          this.onStep(this.step);
          this.step = (this.step + 1) % STEPS;
        }
      }
      // pad
      if (--this.lpCountdown <= 0) {
        this.lpCountdown = 256;
        this.lfo += (TWO_PI * 0.08 * 256) / sr;
        if (this.lfo > TWO_PI) this.lfo -= TWO_PI;
        this.padLp.lowpass(1000 + 400 * Math.sin(this.lfo), 0.9);
      }
      let pad = 0;
      for (let v = 0; v < PAD_VOICES * 2; v++) {
        this.padInc[v] = this.padInc[v]! + (this.padIncTarget[v]! - this.padInc[v]!) * kGlide;
        let ph = this.padPhase[v]! + this.padInc[v]!;
        if (ph >= 1) ph -= 1;
        this.padPhase[v] = ph;
        pad += 2 * ph - 1;
      }
      pad = this.padLp.process(pad / (PAD_VOICES * 2)) * padG;
      // bass
      let bass = 0;
      if (this.bassEnv > 1e-4) {
        this.bassPhase += this.bassInc;
        if (this.bassPhase >= 1) this.bassPhase -= 1;
        bass = (Math.sin(this.bassPhase * TWO_PI) + 0.3 * (2 * this.bassPhase - 1)) * this.bassEnv;
        this.bassEnv *= this.bassDecay;
      }
      bass = this.bassLp.process(bass) * bassG;
      // plucks
      let plL = 0;
      let plR = 0;
      for (let k = 0; k < PLUCKS; k++) {
        const e = this.plEnv[k]!;
        if (e <= 1e-4) continue;
        let ph = this.plPhase[k]! + this.plInc[k]!;
        if (ph >= 1) ph -= 1;
        this.plPhase[k] = ph;
        const tri = 4 * Math.abs(ph - 0.5) - 1;
        const s = (tri + 0.3 * Math.sin(ph * 2 * TWO_PI)) * e;
        this.plEnv[k] = e * this.plDecay;
        const p = this.plPan[k]!;
        plL += s * (0.5 - p * 0.5);
        plR += s * (0.5 + p * 0.5);
      }
      const plMono = this.plLp.process(plL + plR) * plG;
      const plSide = (plL - plR) * plG * 0.5;
      // drums
      let dr = 0;
      if (this.kickEnv > 1e-4) {
        this.kickF += (42 - this.kickF) * (1 - Math.exp(-1 / (0.03 * sr)));
        this.kickPhase += this.kickF / sr;
        if (this.kickPhase >= 1) this.kickPhase -= 1;
        dr += Math.sin(this.kickPhase * TWO_PI) * this.kickEnv * kickG;
        this.kickEnv *= kickDecay;
      }
      if (this.hatEnv > 1e-4 || this.clapEnv > 1e-4) {
        const w = this.rng.n();
        if (this.hatEnv > 1e-4) {
          dr += this.hatHp.process(w) * this.hatEnv * hatG;
          this.hatEnv *= hatDecay;
        }
        if (this.clapEnv > 1e-4) {
          dr += this.clapBp.process(w) * this.clapEnv * clapG;
          this.clapEnv *= clapDecay;
        }
      }
      const g = this.gain;
      const mono = (pad + bass + plMono + dr) * g;
      const side = plSide * g;
      L[off + i] = L[off + i]! + mono + side;
      R[off + i] = R[off + i]! + mono - side;
    }
  }
}

export const MUSIC_BPM = BPM;
export const MUSIC_STEPS = STEPS;
