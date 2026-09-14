/**
 * TrialsSynth — the whole soundscape as one sample-rate process.
 *
 *   engine ─┐
 *   tyres ──┤
 *   chassis ┼─► game (duck) ──┬─► master ─► limiter ─► softclip
 *   ambient ┘                  │
 *   ui ────────────────────────┤
 *   reverb (sends: ui, chassis)┘
 *
 * Reads only packed AudioParams (see params.ts) so the same code runs inside
 * an AudioWorkletProcessor, an OfflineAudioContext, and plain node.
 */
import {
  P_AIRBORNE,
  P_AMBIENT_GAIN,
  P_BIOME,
  P_CHAIN_HZ,
  P_DUCK_DB,
  P_ENGINE_GAIN,
  P_HEADER,
  P_LIMITER,
  P_LOAD,
  P_RPM,
  P_SKID,
  P_TRANSIENT_COUNT,
  P_TRANSIENT_STRIDE,
  P_TYRE_SPEED,
  P_TYRE_SURFACE,
  P_WIND,
} from '../params';
import { Ambience } from './ambience';
import { EngineVoice } from './engine';
import { ChainVoice, SkidVoice, TyreVoice } from './tyres';
import { Fdn, clamp, dbToGain, panGains, smoothCoef } from './util';
import { VoicePool, type Trigger } from './voices';

const BLOCK = 128;

export const TRIMS = {
  engine: dbToGain(-6),
  tyres: dbToGain(-5),
  chassis: dbToGain(0),
  ambient: dbToGain(-4),
  ui: dbToGain(-4),
  master: dbToGain(0),
  reverbUi: 0.3,
  reverbChassis: 0.15,
  /** Limiter threshold and soft-clip ceiling (linear). */
  limiterThreshold: dbToGain(-2.5),
  ceiling: 0.85,
} as const;

export interface SynthOptions {
  seed?: number;
  /** Solo one bus for analysis (others muted). */
  solo?: 'engine' | 'tyres' | 'chassis' | 'ambient' | 'ui' | null;
}

export class TrialsSynth {
  readonly sampleRate: number;
  readonly engine: EngineVoice;
  readonly tyres: [TyreVoice, TyreVoice];
  readonly skid: SkidVoice;
  readonly chain: ChainVoice;
  readonly pool: VoicePool;
  readonly ambience: Ambience;
  private readonly reverb: Fdn;
  private solo: SynthOptions['solo'];
  private masterGain = 1;
  private masterTarget = 1;
  private readonly kMaster: number;
  private duckGain = 1;
  private duckTarget = 1;
  private readonly kDuckAtt: number;
  private readonly kDuckRel: number;
  private limEnv = 0;
  private readonly limRel: number;
  // scratch buffers (mono + stereo per bus)
  private readonly bEngine = new Float32Array(BLOCK);
  private readonly bTyreR = new Float32Array(BLOCK);
  private readonly bTyreF = new Float32Array(BLOCK);
  private readonly bChain = new Float32Array(BLOCK);
  private readonly bChassis: [Float32Array, Float32Array] = [new Float32Array(BLOCK), new Float32Array(BLOCK)];
  private readonly bUi: [Float32Array, Float32Array] = [new Float32Array(BLOCK), new Float32Array(BLOCK)];
  private readonly bAmbient: [Float32Array, Float32Array] = [new Float32Array(BLOCK), new Float32Array(BLOCK)];
  private readonly buses: [Float32Array, Float32Array][];
  private readonly panR: [number, number] = [1, 1];
  private readonly panF: [number, number] = [1, 1];
  private readonly trig: Trigger = { kind: 0, gain: 0, pitch: 0, pan: 0, delay: 0 };
  private biome = 0;
  /** Samples left of reverb mute after a hard stop (then the tail is cleared). */
  private reverbHold = 0;
  /** Samples rendered so far. */
  samples = 0;

  constructor(sampleRate: number, opts: SynthOptions = {}) {
    const seed = (opts.seed ?? 0xa0d10) >>> 0;
    this.sampleRate = sampleRate;
    this.solo = opts.solo ?? null;
    this.engine = new EngineVoice(sampleRate, seed ^ 0x1111);
    this.tyres = [new TyreVoice(sampleRate, seed ^ 0x2222), new TyreVoice(sampleRate, seed ^ 0x3333)];
    this.skid = new SkidVoice(sampleRate, seed ^ 0x4444);
    this.chain = new ChainVoice(sampleRate, seed ^ 0x5555);
    this.pool = new VoicePool(sampleRate, seed ^ 0x6666);
    this.ambience = new Ambience(sampleRate, seed ^ 0x7777);
    this.reverb = new Fdn(sampleRate, [23, 29, 37, 43], 0.55, 3500);
    this.buses = [this.bChassis, this.bUi, this.bAmbient];
    panGains(-0.15, this.panR);
    panGains(0.15, this.panF);
    this.kMaster = smoothCoef(0.02, sampleRate);
    this.kDuckAtt = smoothCoef(0.015, sampleRate);
    this.kDuckRel = smoothCoef(0.12, sampleRate);
    this.limRel = Math.exp(-1 / (0.08 * sampleRate));
  }

  setMaster(v: number): void {
    this.masterTarget = clamp(v, 0, 1);
  }

  setSolo(solo: SynthOptions['solo']): void {
    this.solo = solo;
  }

  /** Apply one packed AudioParams frame; transients are queued immediately. */
  setParams(p: Float32Array): void {
    this.engine.set(p[P_RPM]!, p[P_LOAD]!, p[P_LIMITER]! > 0.5, p[P_ENGINE_GAIN]!);
    this.tyres[0].set(p[P_TYRE_SPEED]!, p[P_TYRE_SURFACE]!);
    this.tyres[1].set(p[P_TYRE_SPEED + 1]!, p[P_TYRE_SURFACE + 1]!);
    this.skid.set(p[P_SKID]!);
    const airborne = p[P_AIRBORNE]! > 0.5;
    this.chain.set(p[P_CHAIN_HZ]!, airborne);
    const biome = Math.round(p[P_BIOME]!);
    if (biome !== this.biome) {
      this.biome = biome;
      this.reverb.setFeedback(biome === 1 ? 0.78 : 0.55);
    }
    this.ambience.set(biome, p[P_AMBIENT_GAIN]!, p[P_WIND]!, airborne);
    this.duckTarget = dbToGain(-Math.max(0, p[P_DUCK_DB]!));
    const count = Math.min(Math.round(p[P_TRANSIENT_COUNT]!), (p.length - P_HEADER) / P_TRANSIENT_STRIDE);
    for (let i = 0; i < count; i++) {
      const o = P_HEADER + i * P_TRANSIENT_STRIDE;
      const t = this.trig;
      t.kind = Math.round(p[o]!);
      t.gain = p[o + 1]!;
      t.pitch = p[o + 2]!;
      t.pan = p[o + 3]!;
      t.delay = p[o + 4]!;
      if (t.kind === 12 || t.kind === 18) this.reverbHold = Math.round(0.007 * this.sampleRate);
      this.pool.trigger(t);
    }
  }

  /** Render `n` stereo samples into L/R at `off` (overwrites). Any n. */
  process(L: Float32Array, R: Float32Array, off: number, n: number): void {
    let done = 0;
    while (done < n) {
      const m = Math.min(BLOCK, n - done);
      this.block(L, R, off + done, m);
      done += m;
    }
  }

  private block(L: Float32Array, R: Float32Array, off: number, n: number): void {
    const bE = this.bEngine;
    const bR = this.bTyreR;
    const bF = this.bTyreF;
    const bC = this.bChain;
    bE.fill(0, 0, n);
    bR.fill(0, 0, n);
    bF.fill(0, 0, n);
    bC.fill(0, 0, n);
    for (const b of this.buses) {
      b[0].fill(0, 0, n);
      b[1].fill(0, 0, n);
    }
    this.engine.process(bE, 0, n);
    this.tyres[0].process(bR, 0, n);
    this.tyres[1].process(bF, 0, n);
    this.skid.process(bR, 0, n);
    this.chain.process(bC, 0, n);
    this.ambience.process(this.bAmbient[0], this.bAmbient[1], 0, n, this.pool);
    this.pool.process(this.buses, 0, n);

    const solo = this.solo;
    const gE = solo === null || solo === 'engine' ? TRIMS.engine : 0;
    const gT = solo === null || solo === 'tyres' ? TRIMS.tyres : 0;
    const gC = solo === null || solo === 'chassis' ? TRIMS.chassis : 0;
    const gA = solo === null || solo === 'ambient' ? TRIMS.ambient : 0;
    const gU = solo === null || solo === 'ui' ? TRIMS.ui : 0;
    const pr = this.panR;
    const pf = this.panF;
    const cL = this.bChassis[0];
    const cR = this.bChassis[1];
    const uL = this.bUi[0];
    const uR = this.bUi[1];
    const aL = this.bAmbient[0];
    const aR = this.bAmbient[1];
    const thr = TRIMS.limiterThreshold;
    const ceil = TRIMS.ceiling;
    const kA = this.kDuckAtt;
    const kR = this.kDuckRel;

    for (let i = 0; i < n; i++) {
      this.masterGain += (this.masterTarget - this.masterGain) * this.kMaster;
      const dt = this.duckTarget;
      this.duckGain += (dt - this.duckGain) * (dt < this.duckGain ? kA : kR);

      const e = bE[i]! * gE;
      const tyre = (bR[i]! + bC[i]!) * gT;
      const tyreF = bF[i]! * gT;
      const gameL = e + tyre * pr[0] + tyreF * pf[0] + cL[i]! * gC + aL[i]! * gA;
      const gameR = e + tyre * pr[1] + tyreF * pf[1] + cR[i]! * gC + aR[i]! * gA;
      const uiL = uL[i]! * gU;
      const uiR = uR[i]! * gU;
      let send = (uiL + uiR) * TRIMS.reverbUi + (cL[i]! + cR[i]!) * gC * TRIMS.reverbChassis;
      if (this.reverbHold > 0) {
        send = 0;
        if (--this.reverbHold === 0) this.reverb.clear();
      }
      const rev = this.reverbHold > 0 ? 0 : this.reverb.process(send);

      let l = (gameL * this.duckGain + uiL + rev) * TRIMS.master * this.masterGain;
      let r = (gameR * this.duckGain + uiR + rev) * TRIMS.master * this.masterGain;

      // limiter: peak follower, instant attack, 80 ms release
      const peak = Math.max(Math.abs(l), Math.abs(r));
      this.limEnv = peak > this.limEnv ? peak : this.limEnv * this.limRel;
      if (this.limEnv > thr) {
        const g = thr / this.limEnv;
        l *= g;
        r *= g;
      }
      // soft clip toward the ceiling
      L[off + i] = ceil * Math.tanh(l / ceil);
      R[off + i] = ceil * Math.tanh(r / ceil);
    }
    this.samples += n;
  }
}
