/**
 * Fallback graph for browsers where the AudioWorklet module fails to load
 * (old iOS, blocked module URL): a native oscillator-bank engine, a looping
 * seeded-noise tyre bed, and oscillator/noise one-shots. Reads the same
 * packed AudioParams as the worklet; deliberately simple and allocation-light.
 */
import {
  P_DUCK_DB,
  P_ENGINE_GAIN,
  P_HEADER,
  P_LIMITER,
  P_LOAD,
  P_RPM,
  P_TRANSIENT_COUNT,
  P_TRANSIENT_STRIDE,
  P_TYRE_SPEED,
  P_TYRE_SURFACE,
  P_WIND,
  TK,
} from '../params';
import { NoiseRng, clamp, dbToGain } from '../dsp/util';

export class FallbackGraph {
  private readonly ctx: BaseAudioContext;
  private readonly master: GainNode;
  private readonly game: GainNode;
  private readonly engineGain: GainNode;
  private readonly engineLp: BiquadFilterNode;
  private readonly saw: OscillatorNode;
  private readonly sq: OscillatorNode;
  private readonly sqGain: GainNode;
  private readonly tyreGain: GainNode;
  private readonly tyreLp: BiquadFilterNode;
  private readonly windGain: GainNode;
  private readonly noise: AudioBuffer;
  private limiterPhase = 0;

  constructor(ctx: BaseAudioContext, destination: AudioNode) {
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = dbToGain(-6);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -6;
    comp.knee.value = 0;
    comp.ratio.value = 20;
    comp.attack.value = 0.001;
    comp.release.value = 0.08;
    this.master.connect(comp).connect(destination);
    this.game = ctx.createGain();
    this.game.connect(this.master);

    // engine: saw at 4·fFire + square at 2·fFire → lowpass
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineLp = ctx.createBiquadFilter();
    this.engineLp.type = 'lowpass';
    this.engineLp.frequency.value = 600;
    this.engineLp.Q.value = 1.5;
    this.saw = ctx.createOscillator();
    this.saw.type = 'sawtooth';
    this.sq = ctx.createOscillator();
    this.sq.type = 'square';
    this.sqGain = ctx.createGain();
    this.sqGain.gain.value = 0.4;
    this.saw.connect(this.engineLp);
    this.sq.connect(this.sqGain).connect(this.engineLp);
    this.engineLp.connect(this.engineGain).connect(this.game);
    this.saw.start();
    this.sq.start();

    // tyres + wind: looping seeded noise
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    const rng = new NoiseRng(0x7a1e5);
    for (let i = 0; i < d.length; i++) d[i] = rng.n();
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    this.tyreLp = ctx.createBiquadFilter();
    this.tyreLp.type = 'lowpass';
    this.tyreLp.frequency.value = 900;
    this.tyreGain = ctx.createGain();
    this.tyreGain.gain.value = 0;
    src.connect(this.tyreLp).connect(this.tyreGain).connect(this.game);
    const windHp = ctx.createBiquadFilter();
    windHp.type = 'highpass';
    windHp.frequency.value = 1200;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    src.connect(windHp).connect(this.windGain).connect(this.game);
    src.start();
  }

  setMaster(v: number): void {
    this.master.gain.setTargetAtTime(dbToGain(-6) * v, this.ctx.currentTime, 0.02);
  }

  setParams(p: Float32Array): void {
    const t = this.ctx.currentTime;
    const rpm = p[P_RPM]!;
    const load = clamp(p[P_LOAD]!, 0, 1);
    const fFire = rpm / 120;
    this.saw.frequency.setTargetAtTime(fFire * 4, t, 0.01);
    this.sq.frequency.setTargetAtTime(fFire * 2, t, 0.01);
    this.engineLp.frequency.setTargetAtTime(400 + 3000 * load, t, 0.01);
    let level = dbToGain(-22 + 12 * load + 2 * clamp((rpm - 1500) / 8500, 0, 1)) * p[P_ENGINE_GAIN]!;
    if (p[P_LIMITER]! > 0.5) {
      this.limiterPhase = (this.limiterPhase + 1) % 3;
      if (this.limiterPhase === 0) level *= 0.2;
    }
    this.engineGain.gain.setTargetAtTime(level, t, 0.004);
    const v = Math.max(p[P_TYRE_SPEED]!, p[P_TYRE_SPEED + 1]!);
    const on = p[P_TYRE_SURFACE]! >= 0 || p[P_TYRE_SURFACE + 1]! >= 0;
    this.tyreGain.gain.setTargetAtTime(on && v > 0 ? dbToGain(-20) * Math.pow(v / 10, 0.7) : 0, t, 0.02);
    this.tyreLp.frequency.setTargetAtTime(600 + 60 * v, t, 0.02);
    this.windGain.gain.setTargetAtTime(dbToGain(-40 + 16 * p[P_WIND]!) * (p[P_WIND]! > 0.01 ? 1 : 0), t, 0.03);
    this.game.gain.setTargetAtTime(dbToGain(-p[P_DUCK_DB]!), t, 0.03);
    const count = Math.round(p[P_TRANSIENT_COUNT]!);
    for (let i = 0; i < count; i++) {
      const o = P_HEADER + i * P_TRANSIENT_STRIDE;
      this.oneShot(Math.round(p[o]!), p[o + 1]!, p[o + 2]!, t + p[o + 4]!);
    }
  }

  private blip(f0: number, f1: number, dur: number, db: number, at: number, type: OscillatorType = 'sine'): void {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, at);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), at + dur * 0.5);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(dbToGain(db), at + 0.003);
    g.gain.exponentialRampToValueAtTime(1e-4, at + dur);
    o.connect(g).connect(this.master);
    o.start(at);
    o.stop(at + dur + 0.01);
  }

  private burst(f: number, q: number, dur: number, db: number, at: number, type: BiquadFilterType = 'bandpass'): void {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    const bq = this.ctx.createBiquadFilter();
    bq.type = type;
    bq.frequency.value = f;
    bq.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(dbToGain(db), at);
    g.gain.exponentialRampToValueAtTime(1e-4, at + dur);
    s.connect(bq).connect(g).connect(this.master);
    s.start(at);
    s.stop(at + dur + 0.01);
  }

  private oneShot(kind: number, gain: number, pitch: number, at: number): void {
    const g = 20 * Math.log10(Math.max(gain, 0.01));
    switch (kind) {
      case TK.landing:
      case TK.thunk:
      case TK.bottomOut:
        this.blip(180, 55, 0.2, -14 + g, at);
        this.burst(600, 0.7, 0.05, -20 + g, at, 'lowpass');
        break;
      case TK.impact:
        this.blip(95, 40, 0.3, -10 + g, at);
        this.burst(800, 1, 0.1, -14 + g, at);
        break;
      case TK.grunt:
        this.blip(130, 95, 0.2, -16 + g, at, 'sawtooth');
        break;
      case TK.fault:
        this.burst(2200, 0.8, 0.04, -12 + g, at);
        this.blip(60, 60, 0.1, -10 + g, at);
        break;
      case TK.countdown:
        this.blip(880, 880, 0.12, -14 + g, at);
        break;
      case TK.go:
      case TK.finishTick:
        this.blip(1320, 1320, 0.25, -12 + g, at);
        this.blip(1760, 1760, 0.25, -14 + g, at);
        break;
      case TK.checkpoint:
        this.blip(1046.5, 1046.5, 0.4, -14 + g, at, 'triangle');
        this.blip(1318.5, 1318.5, 0.4, -14 + g, at + 0.09, 'triangle');
        break;
      case TK.restart:
        this.burst(3000, 2, 0.01, -20, at);
        this.burst(1500, 1, 0.18, -16, at);
        break;
      case TK.fanfare: {
        const notes = [523.3, 659.3, 784.0, 1046.5];
        this.blip(notes[clamp(Math.round(pitch * 4), 0, 3)]!, notes[clamp(Math.round(pitch * 4), 0, 3)]!, 0.6, -12 + g, at, 'triangle');
        break;
      }
      case TK.firework:
        this.blip(300, 80, 0.1, -18 + g, at);
        this.burst(2000, 0.7, 0.4, -22 + g, at, 'lowpass');
        break;
      case TK.hazard:
        this.burst(600, 0.7, 0.6, -12 + g, at);
        break;
      default:
        break;
    }
  }
}
