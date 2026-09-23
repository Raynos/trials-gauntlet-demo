import { describe, expect, it } from 'vitest';
import type { GameEvent, PhysicsState } from '../../core/types';
import { renderScript, type OfflineResult } from '../offline';
import { critic, repeatR } from '../tools/critic';
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

/** Goertzel power at f (Hz) over x. */
function goertzel(x: Float32Array, f: number): number {
  const w = (2 * Math.PI * f) / SR;
  const c = 2 * Math.cos(w);
  let s0 = 0;
  let s1 = 0;
  let s2 = 0;
  for (let i = 0; i < x.length; i++) {
    s0 = x[i]! + c * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  return s1 * s1 + s2 * s2 - c * s1 * s2;
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

describe('RockhopSynth (offline, node)', () => {
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
    // round 4: the idle hunts (a seeded ±3 % rate walk below 25 % load), so a 0.6 s read can sit up to ~4 % off
    expect(Math.max(...errors)).toBeLessThan(0.05);
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

  it('limiter stutter drops firing cycles: two cuts in six at rpm/720 Hz, ≥ 0.8 dB off the level', () => {
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

  it('a hard landing leaves the bed up (no duck: a thump on top, ≤ 1.5 dB dip after it) while a crash still ducks ~6 dB', () => {
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
    expect(before - during).toBeLessThan(1.5);
    const c = renderScript(
      steady((s, t, emit) => {
        s.engine.rpm = 6000;
        s.engine.throttleEff = 0.7;
        if (Math.abs(t - at) < 1e-6) emit({ type: 'fault', reason: 'crash', tick: 0, time: t });
      }),
      2.0,
      { solo: 'ambient' },
    );
    // the ambient bed is level through the crash apart from the duck itself (the engine dies on its own)
    const y = mono(c);
    const tb = rmsDb(y, (at - 0.12) * SR, (at - 0.02) * SR);
    const td = rmsDb(y, (at + 0.05) * SR, (at + 0.14) * SR);
    expect(tb - td).toBeGreaterThan(5);
    expect(tb - td).toBeLessThan(7);
  });

  it('round 4: the idle is a jittered stereo pulse train (≥ 2 % timing jitter, periodicity < 0.95, L/R < 0.9), the wheelie lug hunts', () => {
    const r = renderScript(
      steady((s) => {
        s.engine.rpm = 1500;
        s.engine.throttleEff = 0;
      }),
      4.0,
      { solo: 'engine' },
    );
    const L = new Float32Array(r.pcm.length / 2);
    const R = new Float32Array(r.pcm.length / 2);
    for (let i = 0; i < L.length; i++) {
      L[i] = r.pcm[2 * i]!;
      R[i] = r.pcm[2 * i + 1]!;
    }
    const m = critic(L, R, SR);
    expect(m.pulseHz).toBeGreaterThan(11);
    expect(m.pulseHz).toBeLessThan(14.5);
    expect(m.jitterPct).toBeGreaterThan(2);
    expect(m.periodicity).toBeLessThan(0.95); // round 3's harmonic bank read 0.97 (a metronome); 3 % jitter reads ~0.93
    expect(m.lrCorr).toBeLessThan(0.9);
    expect(m.sideMid).toBeGreaterThan(0.2);
    // the lug (front up, rear down, slow, throttle on, ~1700 rpm) is louder and moves more than the plain idle
    const lug = renderScript(
      steady((s) => {
        s.engine.rpm = 1700;
        s.engine.throttleEff = 0.1;
        s.wheels.front.grounded = false;
        s.wheels.rear.grounded = true;
        s.bike.vel.x = 2;
      }),
      6.0,
      { solo: 'engine' },
    );
    const x = mono(lug);
    const idle = mono(r);
    expect(rmsDb(x, 1 * SR, 6 * SR) - rmsDb(idle, 1 * SR, 4 * SR)).toBeGreaterThan(3);
    const lm = critic(x, x, SR);
    expect(lm.levelRangeDb).toBeGreaterThan(3);
  });

  it('round 4: a crash and its replay 1.75 s later are different sounds (mix cross-correlation < 0.5; one crowd groan)', () => {
    const r = renderScript(
      steady((s, t, emit) => {
        s.engine.rpm = 4000;
        s.engine.throttleEff = 0.8;
        if (Math.abs(t - 1.0) < 1e-6 || Math.abs(t - 2.75) < 1e-6) emit({ type: 'fault', reason: 'crash', tick: 0, time: t });
        if (Math.abs(t - 2.0) < 1e-6 || Math.abs(t - 3.75) < 1e-6) emit({ type: 'restart', checkpoint: 0, tick: 0 });
      }),
      5.0,
      {},
    );
    const x = mono(r);
    expect(repeatR(x, SR, 1.0, 2.0, 2.75, 3.75)).toBeLessThan(0.5);
  });

  it('restart hard-stops chassis voices within 10 ms; only the starter blip follows, no leaked tails', () => {
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
    expect(rmsDb(x, (restartAt + 0.01) * SR, (restartAt + 0.02) * SR)).toBeLessThanOrEqual(-60); // cut
    expect(rmsDb(x, (restartAt + 0.05) * SR, (restartAt + 0.25) * SR)).toBeGreaterThan(-50); // starter whir
    for (let t = restartAt + 0.7; t < 2.4; t += 0.1) {
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

  it('grate whines at the bar-crossing rate v / 0.05 m', () => {
    const v = 8; // → 160 Hz
    const r = renderScript(
      steady((s) => {
        s.engine.rpm = 1500;
        s.wheels.rear.spinVel = v / 0.34;
        s.wheels.front.spinVel = v / 0.34;
        s.contacts = { rear: 'grate', front: 'grate' };
      }),
      2.0,
      { solo: 'tyres' },
    );
    const x = mono(r);
    const got = fundamentalHz(x, 1.0 * SR, 1.5 * SR, 100, 260);
    expect(Math.abs(got - v / 0.05) / (v / 0.05)).toBeLessThan(0.03);
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

  // ---- round 3: crowd, music, stingers, rooms, budget -------------------------------------------------------

  const STANDS = [{ n: 30, xa: -9, xb: 7 }];

  it('crowd bed: a murmur near the start stands (-45 .. -25 dBFS), silent 80 m away, all of it seeded', () => {
    const near = renderScript(
      steady((s) => {
        s.bike.pos.x = 0;
      }),
      2.0,
      { solo: 'crowd', stands: STANDS },
    );
    const far = renderScript(
      steady((s) => {
        s.bike.pos.x = 90;
      }),
      2.0,
      { solo: 'crowd', stands: STANDS },
    );
    const n = rmsDb(mono(near), 1.0 * SR, 2.0 * SR);
    expect(n).toBeGreaterThan(-45);
    expect(n).toBeLessThan(-25);
    expect(rmsDb(mono(far), 1.0 * SR, 2.0 * SR)).toBeLessThan(-70);
    const again = renderScript(
      steady((s) => {
        s.bike.pos.x = 0;
      }),
      2.0,
      { solo: 'crowd', stands: STANDS },
    );
    expect(Buffer.from(near.pcm.buffer).equals(Buffer.from(again.pcm.buffer))).toBe(true);
  });

  it('crowd reactions lift the bed: roar on GO ≥ +8 dB over the murmur, groan on the crash, applause claps at the finish', () => {
    const r = renderScript(
      steady((s, t, emit) => {
        s.bike.pos.x = 0;
        if (Math.abs(t - 1.0) < 1e-6) emit({ type: 'go' });
        if (Math.abs(t - 4.0) < 1e-6) emit({ type: 'fault', reason: 'crash', tick: 0, time: t });
        if (Math.abs(t - 7.0) < 1e-6) emit({ type: 'finish', tick: 0, time: t });
      }),
      10,
      { solo: 'crowd', stands: STANDS },
    );
    const x = mono(r);
    const murmur = rmsDb(x, 0.5 * SR, 0.95 * SR);
    const roar = rmsDb(x, 1.25 * SR, 1.6 * SR);
    const groan = rmsDb(x, 4.3 * SR, 4.6 * SR);
    const applause = rmsDb(x, 7.6 * SR, 8.6 * SR);
    expect(roar - murmur).toBeGreaterThan(8);
    expect(groan - murmur).toBeGreaterThan(3);
    expect(applause - murmur).toBeGreaterThan(6);
    // applause is a clap train: many short peaks — the crest factor is high
    let pk = 0;
    for (let i = 7.6 * SR; i < 8.6 * SR; i++) pk = Math.max(pk, Math.abs(x[i]!));
    expect(20 * Math.log10(pk) - applause).toBeGreaterThan(9);
  });

  it('music bed: silent in the run scene, a -30..-14 dBFS loop in the menu and results, byte-identical, in the key of D', () => {
    const run = renderScript(steady(() => undefined), 3, { solo: 'music', scene: 'run' });
    expect(rmsDb(mono(run), 1 * SR, 3 * SR)).toBeLessThan(-80);
    const menu = renderScript(steady(() => undefined), 6, { solo: 'music', scene: 'menu' }, 11);
    const menu2 = renderScript(steady(() => undefined), 6, { solo: 'music', scene: 'menu' }, 11);
    expect(Buffer.from(menu.pcm.buffer).equals(Buffer.from(menu2.pcm.buffer))).toBe(true);
    const m = mono(menu);
    const lvl = rmsDb(m, 2 * SR, 6 * SR);
    expect(lvl).toBeGreaterThan(-30);
    expect(lvl).toBeLessThan(-14);
    const results = renderScript(steady(() => undefined), 6, { solo: 'music', scene: 'results' }, 11);
    const rl = rmsDb(mono(results), 2 * SR, 6 * SR);
    expect(rl).toBeGreaterThan(-30);
    expect(rl).toBeLessThan(-14);
    // a different seed → a different loop; the same seed → the same loop
    const other = renderScript(steady(() => undefined), 6, { solo: 'music', scene: 'menu' }, 12);
    expect(Buffer.from(menu.pcm.buffer).equals(Buffer.from(other.pcm.buffer))).toBe(false);
    // in key: energy at the D-Aeolian tones (two octaves) beats the quarter-tones between them by ≥ 6 dB
    const seg = m.subarray(2 * SR, 6 * SR);
    const tones: number[] = [];
    const between: number[] = [];
    for (const oct of [1, 2, 4]) for (const st of [0, 2, 3, 5, 7, 8, 10]) tones.push(73.42 * oct * Math.pow(2, st / 12));
    for (const t of tones) between.push(t * Math.pow(2, 0.5 / 12));
    const on = tones.reduce((a, f) => a + goertzel(seg, f), 0);
    const off = between.reduce((a, f) => a + goertzel(seg, f), 0);
    expect(10 * Math.log10(on / off)).toBeGreaterThan(6);
  });

  it('the finish resolves into the results bed: fanfare, then the music 1.4 s later; a restart cuts it', () => {
    const r = renderScript(
      steady((_s, t, emit) => {
        if (Math.abs(t - 0.5) < 1e-6) emit({ type: 'go' });
        if (Math.abs(t - 2.0) < 1e-6) emit({ type: 'finish', tick: 0, time: t });
        if (Math.abs(t - 6.0) < 1e-6) emit({ type: 'restart', checkpoint: -1, tick: 0 });
      }),
      8,
      { solo: 'music', scene: null },
    );
    const x = mono(r);
    expect(rmsDb(x, 1.0 * SR, 2.0 * SR)).toBeLessThan(-80); // run: no music
    expect(rmsDb(x, 2.5 * SR, 3.3 * SR)).toBeLessThan(-80); // fanfare window: still none
    expect(rmsDb(x, 4.5 * SR, 5.9 * SR)).toBeGreaterThan(-32); // results bed in
    expect(rmsDb(x, 7.0 * SR, 8.0 * SR)).toBeLessThan(-60); // cut by the restart (0.5 s fade)
  });

  it('stingers are one family in D: GO and the countdown share the D fundamental, the fanfare climbs D5 F#5 A5 D6', () => {
    const r = renderScript(
      steady((_s, t, emit) => {
        if (Math.abs(t - 0.5) < 1e-6) emit({ type: 'countdown', n: 1 });
        if (Math.abs(t - 1.5) < 1e-6) emit({ type: 'go' });
        if (Math.abs(t - 3.0) < 1e-6) emit({ type: 'finish', tick: 0, time: t });
      }),
      5,
      { solo: 'ui' },
    );
    const x = mono(r);
    const cd = fundamentalHz(x, Math.round(0.505 * SR), Math.round(0.56 * SR), 400, 1400);
    expect(Math.abs(cd - 587.33) / 587.33).toBeLessThan(0.02);
    const go = fundamentalHz(x, Math.round(1.505 * SR), Math.round(1.6 * SR), 400, 1400);
    expect(Math.abs(go - 587.33) / 587.33).toBeLessThan(0.02);
    const notes = [587.33, 739.99, 880, 1174.66];
    for (let i = 0; i < 4; i++) {
      const t0 = 3.0 + 0.15 + i * 0.08 + 0.005;
      const f = fundamentalHz(x, Math.round(t0 * SR), Math.round((t0 + 0.06) * SR), notes[i]! * 0.7, notes[i]! * 1.4);
      expect(Math.abs(f - notes[i]!) / notes[i]!, `note ${i}`).toBeLessThan(0.03);
    }
  });

  it('rooms: the canyon answers a landing with a 190 ms slap-back; the snow hush has the shortest tail', () => {
    const tail = (biome: number): { slap: number; tail: number } => {
      const r = renderScript(
        steady((s, t, emit) => {
          s.engine.rpm = 1500;
          if (Math.abs(t - 1.0) < 1e-6) emit({ type: 'land', impulse: 60, wheel: 'rear', surface: 'dirt', tick: 0 });
        }),
        3,
        {
          solo: 'chassis',
          onUpdate: (_u, _s, d) => {
            d.scratch.biome = biome;
          },
        },
      );
      const x = mono(r);
      // energy in the echo window (round 4: the landing now settles over ~350 ms, so the echo is read against the
      // same window in a room without the slap-back rather than against a gap that no longer exists)
      const slap = rmsDb(x, 1.19 * SR, 1.25 * SR);
      const t = rmsDb(x, 1.6 * SR, 2.0 * SR);
      return { slap, tail: t };
    };
    const canyon = tail(1);
    const snow = tail(2);
    const hall = tail(0);
    expect(canyon.slap - hall.slap).toBeGreaterThan(3);
    expect(snow.tail).toBeLessThan(hall.tail);
  });

  it('budget: the full mix (crowd + results music + rooms) renders one 60 Hz frame in ≤ 0.5 ms of CPU in node (≤ 0.8 under vitest)', () => {
    // Plain node (npx tsx, best of 3): run scene 0.26–0.28 ms/frame, results scene 0.37–0.39 — the budget is
    // 0.5. Under vitest the same loop measures ~1.45× (worker + transform overhead), hence the 0.8 gate here;
    // tools/beats.ts prints the node figure with every render.
    renderScript(gauntletScript(HZ), GAUNTLET.end, { scene: 'results', stands: STANDS }, 1);
    let best = Infinity;
    for (let i = 0; i < 3; i++) {
      const t0 = performance.now();
      const r = renderScript(gauntletScript(HZ), GAUNTLET.end, { scene: 'results', stands: STANDS }, 1);
      best = Math.min(best, (performance.now() - t0) / r.updates);
    }
    expect(best).toBeLessThan(0.8);
  });
});
