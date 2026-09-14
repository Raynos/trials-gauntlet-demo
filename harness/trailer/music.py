#!/usr/bin/env python3
"""Trailer music bed: 124 BPM dark driving electronic, pure numpy, deterministic.

    python3 harness/trailer/music.py out.wav --seconds 58 [--bpm 124] [--drops 4,14] [--breaks 12,22] [--end 26]

Kick / snare / hats / low saw-bass riff (E minor) / risers before each drop / sub drone.
Sections are bar-indexed: intro (sparse), drops (full), breaks (filtered, riser), outro (drone).
Stems are written next to the mix (<out>.kick.wav etc.) so the editor can re-balance; the
mix is peak-normalised here and loudness-matched (-14 LUFS) by the edit script.
"""
import argparse
import math
import struct
import sys
import wave

import numpy as np

SR = 48000


def write_wav(path, stereo):
    x = np.clip(stereo, -1, 1)
    pcm = (x * 32767).astype('<i2')
    with wave.open(path, 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


def env_exp(n, tau):
    t = np.arange(n) / SR
    return np.exp(-t / tau)


def onepole_lp(x, cutoff):
    """One-pole lowpass; cutoff may be an array (per-sample) for sweeps."""
    y = np.empty_like(x)
    if np.isscalar(cutoff):
        a = math.exp(-2 * math.pi * cutoff / SR)
        acc = 0.0
        for i in range(len(x)):
            acc = a * acc + (1 - a) * x[i]
            y[i] = acc
        return y
    a = np.exp(-2 * np.pi * np.asarray(cutoff) / SR)
    acc = 0.0
    for i in range(len(x)):
        acc = a[i] * acc + (1 - a[i]) * x[i]
        y[i] = acc
    return y


def lp_fast(x, cutoff):
    """Vectorised 2x cascaded one-pole via lfilter-free recurrence (scipy-free): use FFT brickwall-ish smoothing."""
    # Frequency-domain gentle lowpass (12 dB/oct approx) — good enough for hats/noise shaping.
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    H = 1 / np.sqrt(1 + (f / max(cutoff, 1)) ** 4)
    return np.fft.irfft(X * H, n=len(x))


def hp_fast(x, cutoff):
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    H = 1 / np.sqrt(1 + (max(cutoff, 1) / np.maximum(f, 1e-3)) ** 4)
    return np.fft.irfft(X * H, n=len(x))


def kick(n=int(0.45 * SR)):
    t = np.arange(n) / SR
    f = 42 + 130 * np.exp(-t / 0.035)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-t / 0.22)
    click = (np.random.RandomState(1).randn(n) * np.exp(-t / 0.004)) * 0.6
    x = np.tanh(1.8 * (body + click))
    return x * 0.95


def snare(n=int(0.3 * SR), seed=2):
    t = np.arange(n) / SR
    noise = np.random.RandomState(seed).randn(n)
    noise = hp_fast(lp_fast(noise, 7000), 900) * np.exp(-t / 0.09)
    body = np.sin(2 * np.pi * 185 * t) * np.exp(-t / 0.05) * 0.7
    return np.tanh(2.2 * (noise * 1.2 + body)) * 0.7


def hat(n=int(0.06 * SR), seed=3, open_=False):
    if open_:
        n = int(0.25 * SR)
    t = np.arange(n) / SR
    noise = np.random.RandomState(seed).randn(n)
    noise = hp_fast(noise, 7500) * np.exp(-t / (0.06 if open_ else 0.014))
    return noise * (0.35 if open_ else 0.45)


def saw(freq, n, detune=0.0):
    t = np.arange(n) / SR
    out = np.zeros(n)
    for d in (-detune, 0.0, detune):
        ph = (t * freq * (1 + d)) % 1.0
        out += 2 * ph - 1
    return out / 3


def clap(n=int(0.25 * SR), seed=5):
    t = np.arange(n) / SR
    rs = np.random.RandomState(seed)
    x = np.zeros(n)
    for k, off in enumerate((0.0, 0.011, 0.022, 0.034)):
        i = int(off * SR)
        e = np.exp(-(t[: n - i]) / (0.008 if k < 3 else 0.09))
        x[i:] += rs.randn(n - i) * e
    return hp_fast(lp_fast(x, 6000), 1200) * 0.45


def add(buf, x, at):
    i = int(at)
    if i >= len(buf):
        return
    m = min(len(x), len(buf) - i)
    buf[i : i + m] += x[:m]


def riser(n_bars, bar_s, seed=7):
    n = int(n_bars * bar_s * SR)
    t = np.arange(n) / SR
    u = t / (n / SR)
    rs = np.random.RandomState(seed)
    noise = rs.randn(n)
    # Rising HP noise sweep
    X = np.fft.rfft(noise)
    f = np.fft.rfftfreq(n, 1 / SR)
    noise = np.fft.irfft(X / np.sqrt(1 + (300 / np.maximum(f, 1e-3)) ** 4), n=n)
    amp = (u ** 2.2) * 0.5
    # Pitched saw rising an octave
    ph = 2 * np.pi * np.cumsum(82.4 * 2 ** (u * 1.0)) / SR
    tone = (np.sin(ph) + 0.5 * np.sin(2 * ph)) * (u ** 3) * 0.35
    # 16th-note gating that tightens toward the end
    gate = (np.sin(2 * np.pi * t * (4 / (bar_s / 4)) * (1 + 3 * u ** 2)) > -0.2).astype(float)
    return (noise * amp * (0.5 + 0.5 * gate) + tone) * 0.9


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('out')
    ap.add_argument('--seconds', type=float, default=58)
    ap.add_argument('--bpm', type=float, default=124)
    ap.add_argument('--drops', default='4,14', help='bars at which full drops start')
    ap.add_argument('--breaks', default='12,22', help='bars at which the music pulls back (until next drop / end)')
    ap.add_argument('--end', type=float, default=26, help='bar at which the outro drone starts')
    ap.add_argument('--seed', type=int, default=11)
    a = ap.parse_args()

    bpm = a.bpm
    beat = 60 / bpm
    bar = 4 * beat
    step = beat / 4
    n = int(a.seconds * SR)
    nbars = int(math.ceil(a.seconds / bar))
    drops = [float(x) for x in a.drops.split(',') if x]
    breaks = [float(x) for x in a.breaks.split(',') if x]

    def intensity(b):
        """0 intro, 1 break, 2 drop, 3 outro for bar b."""
        if b >= a.end:
            return 3
        lvl = 0
        events = sorted([(d, 2) for d in drops] + [(k, 1) for k in breaks])
        for at, v in events:
            if b >= at:
                lvl = v
        return lvl

    K = np.zeros(n)
    S = np.zeros(n)
    H = np.zeros(n)
    B = np.zeros(n)
    R = np.zeros(n)
    D = np.zeros(n)

    kk = kick()
    sn = snare()
    cl = clap()
    hc = hat()
    ho = hat(open_=True)

    # Riff in E minor, 16 steps per bar, (semitone offset from E1, gate len in steps); -1 = rest
    riffA = [0, 0, -1, 0, 0, -1, 3, -1, 0, 0, -1, 0, 5, -1, 3, -1]
    riffB = [0, 0, -1, 0, 0, -1, 3, -1, 0, 0, -1, 7, -1, 5, 3, 2]
    E1 = 41.203

    rs = np.random.RandomState(a.seed)
    for b in range(nbars):
        lvl = intensity(b)
        t0 = b * bar
        # Drums
        for q in range(4):
            tb = t0 + q * beat
            if lvl == 2 or (lvl == 0 and q == 0) or (lvl == 3 and q == 0 and b % 2 == 0):
                add(K, kk * (1.0 if lvl == 2 else 0.8), tb * SR)
            if lvl == 2 and q in (1, 3):
                add(S, sn, tb * SR)
                add(S, cl * 0.8, tb * SR)
            if lvl == 1 and q in (1, 3):
                add(S, cl * 0.5, tb * SR)
        # Extra kick pickup on the last 8th of every 4th drop bar
        if lvl == 2 and int(b - drops[0]) % 4 == 3:
            add(K, kk * 0.8, (t0 + 3.5 * beat) * SR)
        # Hats
        if lvl in (1, 2):
            for s in range(16 if lvl == 2 else 8):
                ts = t0 + s * (step if lvl == 2 else 2 * step)
                vel = 1.0 if s % 4 == 0 else (0.55 if s % 2 == 0 else 0.4)
                add(H, hc * vel * (1 if lvl == 2 else 0.6), ts * SR)
            if lvl == 2:
                for q in range(4):
                    add(H, ho, (t0 + (q + 0.5) * beat) * SR)
        # Bass riff
        if lvl in (1, 2):
            riff = riffA if (b // 2) % 2 == 0 else riffB
            for s, semi in enumerate(riff):
                if semi < 0:
                    continue
                freq = E1 * 2 ** (semi / 12)
                ln = int(step * SR * 0.95)
                x = saw(freq, ln, detune=0.006) + 0.6 * np.sin(2 * np.pi * freq * np.arange(ln) / SR)
                env = np.minimum(1, np.arange(ln) / (0.004 * SR)) * np.exp(-np.arange(ln) / (SR * 0.35))
                add(B, x * env * (1.0 if lvl == 2 else 0.6), (t0 + s * step) * SR)
        # Sub drone (intro / break / outro)
        if lvl in (0, 1, 3):
            ln = int(bar * SR)
            t = np.arange(ln) / SR
            drone = np.sin(2 * np.pi * E1 * t) * 0.5 + 0.25 * np.sin(2 * np.pi * E1 * 2 * t + 0.3 * np.sin(2 * np.pi * 0.5 * t))
            fade = np.minimum(1, t / 0.05) * np.minimum(1, (bar - t) / 0.05)
            add(D, drone * fade * (0.5 if lvl != 3 else 0.6), t0 * SR)

    # Risers: 2 bars before each drop
    for d in drops:
        start = max(0, d - 2)
        if d - start > 0.25:
            add(R, riser(d - start, bar), start * bar * SR)

    # Bass: lowpass + drive, and a kick sidechain pump
    B = np.tanh(2.5 * lp_fast(B, 900)) * 0.8
    pump = np.ones(n)
    kick_len = int(0.18 * SR)
    kick_times = np.flatnonzero(np.abs(K) > 0.5)
    prev = -10 ** 9
    for i in kick_times:
        if i - prev < int(0.1 * SR):
            continue
        prev = i
        seg = np.linspace(0.25, 1.0, kick_len) ** 1.5
        m = min(kick_len, n - i)
        pump[i : i + m] = np.minimum(pump[i : i + m], seg[:m])
    B *= pump
    D *= pump

    # Stereo: hats/risers wide, bass/kick centre
    def st(x, w=0.0):
        L = x.copy()
        Rr = x.copy()
        if w:
            d = int(0.0007 * SR)
            Rr = np.roll(x, d) * (1 - w * 0.2)
            L = L * (1 - w * 0.2)
        return np.stack([L, Rr], axis=1)

    stems = {
        'kick': (K, 1.0, 0.0),
        'snare': (S, 0.9, 0.2),
        'hats': (H, 0.55, 1.0),
        'bass': (B, 0.9, 0.0),
        'riser': (R, 0.32, 1.0),
        'drone': (D, 0.8, 0.0),
    }
    mix = np.zeros((n, 2))
    for name, (x, g, w) in stems.items():
        s = st(x * g, w)
        mix += s
        write_wav(a.out.replace('.wav', f'.{name}.wav'), s / max(1e-6, np.abs(s).max()) * 0.9)
    # Glue: soft clip + peak normalise
    mix = np.tanh(1.3 * mix / max(1e-6, np.abs(mix).max()))
    mix = mix / np.abs(mix).max() * 0.95
    write_wav(a.out, mix)
    # Cut grid for the editor
    grid = {'bpm': bpm, 'beat_s': beat, 'bar_s': bar, 'bars': nbars, 'drops': drops, 'breaks': breaks, 'end': a.end}
    import json

    with open(a.out.replace('.wav', '.grid.json'), 'w') as f:
        json.dump(grid, f, indent=1)
    print(json.dumps(grid))


if __name__ == '__main__':
    main()
