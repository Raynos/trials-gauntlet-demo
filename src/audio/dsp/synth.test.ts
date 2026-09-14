import { describe, expect, it } from 'vitest';
import type { GameEvent, PhysicsState } from '../../core/types';
import { renderScript, type OfflineResult } from '../offline';
import { GAUNTLET, blankState, gauntletScript } from '../tools/fixture';

const SR = 48000;
const HZ = 60;

function mono(r: OfflineResult): Float32Array {
  const out = new Float32Array(r.pcm.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = 0.5 * (r.pcm[2 * i]! + r.pcm[2 * i + 1]!);
  return out;
}

function rmsDb(x: Float32Array, from: number, to: number): number {
  let s = 0;
  const a = Math.max(0, Math.floor(from));
  const b = Math.min(x.length, Math.floor(to));
  for (let i = a; i < b; i++) s += x[i]! * x[i]!;
  return 10 * Math.log10(s / Math.max(1, b - a) + 1e-20);
}

function peak(x: Float32Array): number {
  let p = 0;
  for (let i = 0; i < x.length; i++) p = Math.max(p, Math.abs(x[i]!));
  return p;
}

/** Fundamental via normalised autocorrelation over [lo, hi] Hz. */
function fundamentalHz(x: Float32Array, from: number, to: number, lo: number, hi: number): number {
  const seg = x.subarray(from, to);
  const n = seg.length;
  let mean = 0;
  for (let i = 0; i < n; i++) mean += seg[i]!;
  mean /= n;
  const minLag = Math.floor(SR / hi);
  const maxLag = Math.ceil(SR / lo);
  let bestLag = minLag;
  let best = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let s = 0;
    for (let i = 0; i + lag < n; i++) s += (seg[i]! - mean) * (seg[i + lag]! - mean);
    if (s > best) {
      best = s;
      bestLag = lag;
    }
  }
  return SR / bestLag;
}

/** Script helper: constant state with overrides per update. */
function steady(fn: (s: PhysicsState, t: number, emit: (e: GameEvent) => void) => void) {
  const s = blankState();
  return (u: number, t: number, emit: (e: GameEvent) => void): PhysicsState => {
    s.time = t;
    s.tick = u * 2;
    fn(s, t, emit);
    return s;
  };
}

describe('TrialsSynth (offline, node)', () => {
  it('renders the gauntlet byte-identically twice, under the -1 dBTP ceiling, faster than realtime', () => {
    const t0 = performance.now();
    const a = renderScript(gauntletScript(HZ), GAUNTLET.end, {}, 1);
    const ms = performance.now() - t0;
    const b = renderScript(gauntletScript(HZ), GAUNTLET.end, {}, 1);
    expect(Buffer.from(a.pcm.buffer).equals(Buffer.from(b.pcm.buffer))).toBe(true);
    expect(peak(a.pcm)).toBeLessThan(Math.pow(10, -1 / 20));
    expect(peak(a.pcm)).toBeGreaterThan(0.1);
    expect(ms).toBeLessThan(GAUNTLET.end * 1000 * 0.25); // ≥ 4× realtime even on a cold JIT
  });

  it('engine fundamental tracks rpm/120 within 3 % from idle to the limiter', () => {
    const targets = [1500, 3000, 5000, 7000, 9000, 9900];
    const stepS = 1.0;
    const r = renderScript(
      steady((s, t) => {
        const i = Math.min(targets.length - 1, Math.floor(t / stepS));
        s.engine.rpm = targets[i]!;
        s.engine.throttleEff = i === 0 ? 0 : 0.8;
      }),
      targets.length * stepS,
      { solo: 'engine' },
    );
    const x = mono(r);
    const errors: number[] = [];
    targets.forEach((rpm, i) => {
      const from = Math.floor((i * stepS + 0.4) * SR);
      const to = Math.floor((i + 1) * stepS * SR);
      const want = rpm / 120;
      const got = fundamentalHz(x, from, to, want * 0.6, want * 1.6);
      errors.push(Math.abs(got - want) / want);
    });
    expect(Math.max(...errors)).toBeLessThan(0.03);
  });

  it('responds to a throttle blip within 20 ms', () => {
    const blipAt = 1.0;
    const r = renderScript(
      steady((s, t) => {
        s.engine.rpm = 3000;
        s.engine.throttleEff = t >= blipAt ? 1 : 0;
      }),
      2.0,
      { solo: 'engine' },
    );
    const x = mono(r);
    const before = rmsDb(x, (blipAt - 0.2) * SR, blipAt * SR);
    const after = rmsDb(x, (blipAt + 0.2) * SR, (blipAt + 0.4) * SR);
    expect(after - before).toBeGreaterThan(6);
    const half = before + (after - before) * 0.5;
    let reached = -1;
    for (let ms = 0; ms < 60; ms += 2) {
      const t = blipAt + ms / 1000;
      if (rmsDb(x, t * SR, (t + 0.005) * SR) >= half) {
        reached = ms;
        break;
      }
    }
    expect(reached).toBeGreaterThanOrEqual(0);
    expect(reached).toBeLessThan(20);
  });

  it('limiter stutter drops firing cycles: level modulates at rpm/360 Hz', () => {
    const r = renderScript(
      steady((s, t) => {
        s.engine.rpm = 9900;
        s.engine.throttleEff = 1;
        s.engine.limiter = t >= 1;
      }),
      2.0,
      { solo: 'engine' },
    );
    const x = mono(r);
    const clean = rmsDb(x, 0.5 * SR, 1.0 * SR);
    const cut = rmsDb(x, 1.5 * SR, 2.0 * SR);
    expect(clean - cut).toBeGreaterThan(0.8); // 2/3 duty → ~ -1.8 dB
  });

  it('countdown ticks land within 8 ms of their event and 1.000 ± 0.002 s apart', () => {
    const r = renderScript(
      steady((s, t, emit) => {
        s.engine.rpm = 1500;
        if (Math.abs(t - 0) < 1e-6) emit({ type: 'countdown', n: 3 });
        if (Math.abs(t - 1) < 1e-6) emit({ type: 'countdown', n: 2 });
        if (Math.abs(t - 2) < 1e-6) emit({ type: 'countdown', n: 1 });
        if (Math.abs(t - 3) < 1e-6) emit({ type: 'go' });
      }),
      4.0,
      { solo: 'ui' },
    );
    const x = mono(r);
    const onsets: number[] = [];
    const thr = 0.005;
    let i = 0;
    while (i < x.length) {
      if (Math.abs(x[i]!) > thr) {
        onsets.push(i / SR);
        i += Math.floor(0.5 * SR);
      } else i++;
    }
    expect(onsets).toHaveLength(4);
    onsets.forEach((o, k) => expect(Math.abs(o - k)).toBeLessThan(0.008));
    expect(Math.abs(onsets[1]! - onsets[0]! - 1)).toBeLessThan(0.002);
    expect(Math.abs(onsets[2]! - onsets[1]! - 1)).toBeLessThan(0.002);
  });

  it('ducks the game bus by ~6 dB on a hard landing', () => {
    const at = 1.0;
    const r = renderScript(
      steady((s, t, emit) => {
        s.engine.rpm = 6000;
        s.engine.throttleEff = 0.7;
        if (Math.abs(t - at) < 1e-6) emit({ type: 'land', impulse: 900, wheel: 'rear', surface: 'dirt', tick: 0 });
      }),
      2.0,
      { solo: 'engine' },
    );
    const x = mono(r);
    const before = rmsDb(x, (at - 0.12) * SR, (at - 0.02) * SR);
    const during = rmsDb(x, (at + 0.05) * SR, (at + 0.14) * SR);
    const after = rmsDb(x, (at + 0.8) * SR, (at + 0.95) * SR);
    expect(before - during).toBeGreaterThan(5);
    expect(before - during).toBeLessThan(7);
    expect(Math.abs(before - after)).toBeLessThan(1);
  });

  it('restart hard-stops chassis voices: ≤ -60 dBFS within 10 ms, no leaked tails', () => {
    const crashAt = 1.0;
    const restartAt = 1.3;
    const r = renderScript(
      steady((s, t, emit) => {
        s.engine.rpm = 5000;
        if (Math.abs(t - crashAt) < 1e-6) emit({ type: 'fault', reason: 'crash', tick: 0, time: t });
        if (Math.abs(t - restartAt) < 1e-6) emit({ type: 'restart', checkpoint: 0, tick: 0 });
      }),
      2.5,
      { solo: 'chassis' },
    );
    const x = mono(r);
    expect(rmsDb(x, (restartAt - 0.1) * SR, restartAt * SR)).toBeGreaterThan(-50); // crash ring was audible
    for (let t = restartAt + 0.01; t < 2.4; t += 0.1) {
      expect(rmsDb(x, t * SR, (t + 0.1) * SR)).toBeLessThanOrEqual(-60);
    }
  });

  it('every biome ambience bed is present and quiet (-45 .. -20 dBFS RMS)', () => {
    for (let b = 0; b < 5; b++) {
      const r = renderScript(
        steady((s) => {
          s.engine.rpm = 1500;
        }),
        2.0,
        {
          solo: 'ambient',
          onUpdate: (_u, _s, d) => {
            d.scratch.biome = b;
          },
        },
      );
      const x = mono(r);
      const db = rmsDb(x, 1.0 * SR, 2.0 * SR);
      expect(db, `biome ${b}`).toBeGreaterThan(-45);
      expect(db, `biome ${b}`).toBeLessThan(-20);
    }
  });

  it('tyre roll is silent at rest and grows with speed on every surface', () => {
    for (let surf = 0; surf < 8; surf++) {
      const names = ['dirt', 'wood', 'metal', 'concrete', 'rubber', 'grate', 'stone', 'snow'] as const;
      const r = renderScript(
        steady((s, t) => {
          s.engine.rpm = 1500;
          const v = t < 1 ? 0 : t < 2 ? 4 : 14;
          s.wheels.rear.spinVel = v / 0.34;
          s.wheels.front.spinVel = v / 0.34;
          s.contacts.rear = names[surf]!;
          s.contacts.front = names[surf]!;
        }),
        3.0,
        { solo: 'tyres' },
      );
      const x = mono(r);
      const rest = rmsDb(x, 0.5 * SR, 1.0 * SR);
      const slow = rmsDb(x, 1.5 * SR, 2.0 * SR);
      const fast = rmsDb(x, 2.5 * SR, 3.0 * SR);
      expect(rest, names[surf]).toBeLessThan(-80);
      expect(slow, names[surf]).toBeGreaterThan(-60);
      expect(fast - slow, names[surf]).toBeGreaterThan(3);
    }
  });
});
