/**
 * RockhopSynth — the whole soundscape as one sample-rate process.
 *
 *   engine ─┐
 *   tyres ──┤
 *   chassis ┼─► game (duck) ──┬─► master ─► limiter ─► softclip
 *   ambient ┤                  │
 *   crowd ──┘                  │
 *   ui ────────────────────────┤
 *   music ─────────────────────┤
 *   reverb (sends: ui, chassis, crowd; room per biome) ┤
 *   slap-back (canyon: engine + chassis, 190 ms) ──────┘
 *
 * Reads only packed AudioParams (see params.ts) so the same code runs inside
 * an AudioWorkletProcessor, an OfflineAudioContext, and plain node.
 */
import {
  P_AIRBORNE,
  P_AMBIENT_GAIN,
  P_BIKE,
  P_BIOME,
  P_CLUTCH,
  P_CROWD,
  P_SCENE,
  P_TORQUE,
  P_SCRAPE,
  P_SPEED,
  P_CHAIN_HZ,
  P_DUCK_DB,
  P_ENGINE_GAIN,
  P_HEADER,
  P_LIMITER,
  P_LOAD,
  P_LUG,
  P_RPM,
  P_SKID,
  P_TRANSIENT_COUNT,
  P_TRANSIENT_STRIDE,
  P_TYRE_SPEED,
  P_TYRE_SURFACE,
  P_WIND,
} from '../params';
import { Ambience } from './ambience';
import { Crowd } from './crowd';
import { EngineVoice } from './engine';
import { MusicBed } from './music';
import { ChainVoice, SkidVoice, TyreVoice } from './tyres';
import { Biquad, Fdn, clamp, dbToGain, panGains, smoothCoef } from './util';
import { VoicePool, type Trigger } from './voices';

const BLOCK = 128;

export const TRIMS = {
  engine: dbToGain(-6),
  tyres: dbToGain(-2),
  chassis: dbToGain(0),
  ambient: dbToGain(-4),
  crowd: dbToGain(-3),
  ui: dbToGain(0),
  music: dbToGain(-4),
  master: dbToGain(0),
  reverbUi: 0.3,
  reverbChassis: 0.15,
  reverbCrowd: 0.25,
  /** Canyon slap-back: engine + chassis into a 190 ms echo, fb 0.35, LP 2.5 kHz. */
  slapSend: dbToGain(-9),
  slapDelayS: 0.19,
  slapFeedback: 0.35,
  /** Limiter threshold and soft-clip ceiling (linear). */
  limiterThreshold: dbToGain(-2.5),
  ceiling: 0.85,
} as const;

export interface SynthOptions {
  seed?: number;
  /** Solo one bus for analysis (others muted). */
  solo?: 'engine' | 'tyres' | 'chassis' | 'ambient' | 'ui' | 'crowd' | 'music' | null;
}

/** Room per biome (params.BIOMES order): FDN feedback and damping. */
const ROOMS: readonly { fb: number; lp: number }[] = [
  { fb: 0.74, lp: 2800 }, // industrial: a hall — long, dark tail
  { fb: 0.6, lp: 3500 }, // canyon: open air + the slap-back below
  { fb: 0.35, lp: 3000 }, // snow: hush, almost no room
  { fb: 0.55, lp: 3500 }, // nightCity: street-canyon
  { fb: 0.7, lp: 2000 }, // foundry: big, hot, very damped
];

export class RockhopSynth {
  readonly sampleRate: number;
  readonly engine: EngineVoice;
  readonly tyres: [TyreVoice, TyreVoice];
  readonly skid: SkidVoice;
  readonly scrape: SkidVoice;
  readonly chain: ChainVoice;
  readonly pool: VoicePool;
  readonly ambience: Ambience;
  readonly crowd: Crowd;
  readonly music: MusicBed;
  private readonly reverb: Fdn;
  private readonly slap: Float32Array;
  private slapPos = 0;
  private slapOn = false;
  private slapGain = 0;
  private readonly slapLp: Biquad;
  private solo: SynthOptions['solo'];
  private masterGain = 1;
  private masterTarget = 1;
  private readonly kMaster: number;
  private duckGain = 1;
  private duckTarget = 1;
  /** Procedural music bed gate: 0 while a recorded cue (src/audio/music) carries the scene. */
  private bedGain = 1;
  private bedTarget = 1;
  private readonly kDuckAtt: number;
  private readonly kDuckRel: number;
  private limEnv = 0;
  private readonly limRel: number;
  // scratch buffers (mono + stereo per bus)
  private readonly bEngine: [Float32Array, Float32Array] = [new Float32Array(BLOCK), new Float32Array(BLOCK)];
  private readonly bTyreR = new Float32Array(BLOCK);
  private readonly bTyreF = new Float32Array(BLOCK);
  private readonly bChain = new Float32Array(BLOCK);
  private readonly bChassis: [Float32Array, Float32Array] = [new Float32Array(BLOCK), new Float32Array(BLOCK)];
  private readonly bUi: [Float32Array, Float32Array] = [new Float32Array(BLOCK), new Float32Array(BLOCK)];
  private readonly bAmbient: [Float32Array, Float32Array] = [new Float32Array(BLOCK), new Float32Array(BLOCK)];
  private readonly bCrowd: [Float32Array, Float32Array] = [new Float32Array(BLOCK), new Float32Array(BLOCK)];
  private readonly bMusic: [Float32Array, Float32Array] = [new Float32Array(BLOCK), new Float32Array(BLOCK)];
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
    this.scrape = new SkidVoice(sampleRate, seed ^ 0x4445);
    this.chain = new ChainVoice(sampleRate, seed ^ 0x5555);
    this.pool = new VoicePool(sampleRate, seed ^ 0x6666);
    this.ambience = new Ambience(sampleRate, seed ^ 0x7777);
    this.crowd = new Crowd(sampleRate, seed ^ 0x8888);
    this.music = new MusicBed(sampleRate, seed ^ 0x9999);
    this.reverb = new Fdn(sampleRate, [23, 29, 37, 43], ROOMS[0]!.fb, ROOMS[0]!.lp);
    this.slap = new Float32Array(Math.round(TRIMS.slapDelayS * sampleRate));
    this.slapLp = new Biquad(sampleRate);
    this.slapLp.lowpass(2500, 0.7);
    this.buses = [this.bChassis, this.bUi, this.bAmbient];
    // round 4: the tyres sit apart by their travel — rear left, front right
    panGains(-0.35, this.panR);
    panGains(0.35, this.panF);
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

  /** Recorded music is playing (false) or not (true): the procedural bed yields over ~0.3 s. */
  setBed(on: boolean): void {
    this.bedTarget = on ? 1 : 0;
  }

  /** Music scene without a params frame (the front end posts no frames): 0 run, 1 menu, 2 results. */
  setScene(scene: number): void {
    this.music.setScene(Math.round(scene));
  }

  /** Apply one packed AudioParams frame; transients are queued immediately. */
  setParams(p: Float32Array): void {
    this.engine.set(p[P_RPM]!, p[P_LOAD]!, p[P_LIMITER]! > 0.5, p[P_ENGINE_GAIN]!, p[P_CLUTCH]!, p[P_SPEED]!, p[P_TORQUE]!, Math.round(p[P_BIKE]!), p[P_LUG]!);
    this.tyres[0].set(p[P_TYRE_SPEED]!, p[P_TYRE_SURFACE]!);
    this.tyres[1].set(p[P_TYRE_SPEED + 1]!, p[P_TYRE_SURFACE + 1]!);
    this.skid.set(p[P_SKID]!);
    this.scrape.setScrape(p[P_SCRAPE]!);
    const airborne = p[P_AIRBORNE]! > 0.5;
    this.chain.set(p[P_CHAIN_HZ]!, airborne);
    const biome = Math.round(p[P_BIOME]!);
    if (biome !== this.biome) {
      this.biome = biome;
      const room = ROOMS[biome] ?? ROOMS[0]!;
      this.reverb.setFeedback(room.fb);
      this.reverb.setDamping(room.lp);
      this.slapOn = biome === 1;
      if (!this.slapOn) this.slap.fill(0);
    }
    this.ambience.set(biome, p[P_AMBIENT_GAIN]!, p[P_WIND]!, airborne);
    this.crowd.set(p[P_CROWD]!);
    this.music.setScene(Math.round(p[P_SCENE]!));
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
      if (t.kind === 12 || t.kind === 18) {
        this.reverbHold = Math.round(0.007 * this.sampleRate);
        this.crowd.kill();
        this.slap.fill(0);
      }
      if (t.kind >= 21 && t.kind <= 24) this.crowd.trigger(t.kind - 20, t.gain, t.delay);
      else if (t.kind === 16) this.crowd.trigger(4, t.gain, t.delay);
      else this.pool.trigger(t);
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
    const bEL = this.bEngine[0];
    const bER = this.bEngine[1];
    const bR = this.bTyreR;
    const bF = this.bTyreF;
    const bC = this.bChain;
    bEL.fill(0, 0, n);
    bER.fill(0, 0, n);
    bR.fill(0, 0, n);
    bF.fill(0, 0, n);
    bC.fill(0, 0, n);
    for (const b of this.buses) {
      b[0].fill(0, 0, n);
      b[1].fill(0, 0, n);
    }
    this.bCrowd[0].fill(0, 0, n);
    this.bCrowd[1].fill(0, 0, n);
    this.bMusic[0].fill(0, 0, n);
    this.bMusic[1].fill(0, 0, n);
    this.engine.process(bEL, bER, 0, n);
    this.tyres[0].process(bR, 0, n);
    this.tyres[1].process(bF, 0, n);
    this.skid.process(bR, 0, n);
    this.scrape.process(this.bChassis[0], 0, n);
    this.scrape.process(this.bChassis[1], 0, n);
    this.chain.process(bC, 0, n);
    this.ambience.process(this.bAmbient[0], this.bAmbient[1], 0, n, this.pool);
    this.crowd.process(this.bCrowd[0], this.bCrowd[1], 0, n);
    this.music.process(this.bMusic[0], this.bMusic[1], 0, n);
    this.pool.process(this.buses, 0, n);

    const solo = this.solo;
    const gE = solo === null || solo === 'engine' ? TRIMS.engine : 0;
    const gT = solo === null || solo === 'tyres' ? TRIMS.tyres : 0;
    const gC = solo === null || solo === 'chassis' ? TRIMS.chassis : 0;
    const gA = solo === null || solo === 'ambient' ? TRIMS.ambient : 0;
    const gU = solo === null || solo === 'ui' ? TRIMS.ui : 0;
    const gCr = solo === null || solo === 'crowd' ? TRIMS.crowd : 0;
    const gM = solo === null || solo === 'music' ? TRIMS.music : 0;
    const crL = this.bCrowd[0];
    const crR = this.bCrowd[1];
    const mL = this.bMusic[0];
    const mR = this.bMusic[1];
    const slap = this.slap;
    const slapLen = slap.length;
    const slapOn = this.slapOn;
    const slapTargetGain = slapOn ? 1 : 0;
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

      const eL = bEL[i]! * gE;
      const eR = bER[i]! * gE;
      const e = (eL + eR) * 0.5;
      const tyre = (bR[i]! + bC[i]!) * gT;
      const tyreF = bF[i]! * gT;
      const crowdL = crL[i]! * gCr;
      const crowdR = crR[i]! * gCr;
      // canyon slap-back: the engine and chassis come back off the far wall 190 ms later
      let echo = 0;
      this.slapGain += (slapTargetGain - this.slapGain) * 0.0005;
      if (this.slapGain > 1e-4) {
        const rd = slap[this.slapPos]!;
        echo = rd * this.slapGain;
        slap[this.slapPos] = this.slapLp.process((e + (cL[i]! + cR[i]!) * 0.5 * gC) * TRIMS.slapSend + rd * TRIMS.slapFeedback);
        if (++this.slapPos >= slapLen) this.slapPos = 0;
      }
      const gameL = eL + tyre * pr[0] + tyreF * pf[0] + cL[i]! * gC + aL[i]! * gA + crowdL + echo * 0.8;
      const gameR = eR + tyre * pr[1] + tyreF * pf[1] + cR[i]! * gC + aR[i]! * gA + crowdR + echo;
      const uiL = uL[i]! * gU;
      const uiR = uR[i]! * gU;
      let send = (uiL + uiR) * TRIMS.reverbUi + (cL[i]! + cR[i]!) * gC * TRIMS.reverbChassis + (crowdL + crowdR) * TRIMS.reverbCrowd;
      if (this.reverbHold > 0) {
        send = 0;
        if (--this.reverbHold === 0) this.reverb.clear();
      }
      const rev = this.reverbHold > 0 ? 0 : this.reverb.process(send);
      this.bedGain += (this.bedTarget - this.bedGain) * this.kDuckRel;
      const musL = mL[i]! * gM * this.bedGain;
      const musR = mR[i]! * gM * this.bedGain;

      let l = (gameL * this.duckGain + uiL + rev + musL) * TRIMS.master * this.masterGain;
      let r = (gameR * this.duckGain + uiR + rev + musR) * TRIMS.master * this.masterGain;

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
