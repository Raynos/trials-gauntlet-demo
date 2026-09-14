#!/usr/bin/env python3
"""Trailer edit: beat-synced cut list -> frames piped to ffmpeg, plus the audio mix.

    python3 harness/trailer/edit.py --beats harness/out/trailer/beats --music harness/out/trailer/music.wav \
        --out harness/out/trailer/trailer.mp4 [--cut full|social] [--height 720|1080]

Every segment starts on a bar / half-bar of the 124 BPM grid (see shots.md). Sources are the
capture-beats.ts PNG sequences (30 fps, or 60 fps 1080p for the slow-mo beat) and render-audio.ts
WAVs (48 kHz, sample-aligned with frame 0). Cards are drawn with PIL in Barlow Condensed.
"""
import argparse
import json
import math
import os
import subprocess
import sys
import wave

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

FFMPEG = '/opt/homebrew/bin/ffmpeg'
SR = 48000
FPS = 30
W, H = 1280, 720
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FONT_DIR = os.path.join(ROOT, 'public', 'fonts')
KEYART = os.path.join(ROOT, 'public', 'art', 'menu', 'keyart-industrial-1920.webp')
AMBER = (255, 176, 32)
AMBER2 = (255, 138, 31)
INK = (243, 245, 248)
BG = (7, 8, 10)

BPM = 124.0
BEAT = 60 / BPM
BAR = 4 * BEAT


def bar(b):
    return b * BAR


def font(name, size):
    return ImageFont.truetype(os.path.join(FONT_DIR, name), size)


# ---------------------------------------------------------------- cards

def gradient_text(draw_size, text, fnt, xy, colors=((255, 217, 138), (255, 176, 32), (255, 138, 31), (201, 100, 26)), anchor='la'):
    """Wordmark-style text: vertical amber gradient through a text mask, dark bevel/drop shadow."""
    w, h = draw_size
    mask = Image.new('L', (w, h), 0)
    ImageDraw.Draw(mask).text(xy, text, font=fnt, fill=255, anchor=anchor)
    bbox = mask.getbbox()
    grad = Image.new('RGB', (w, h), colors[0])
    if bbox:
        top, bot = bbox[1], bbox[3]
        arr = np.zeros((h, w, 3), dtype=np.float32)
        ys = np.arange(h)
        u = np.clip((ys - top) / max(1, bot - top), 0, 1)
        stops = np.array([0.0, 0.42, 0.70, 1.0])
        cols = np.array(colors, dtype=np.float32)
        for c in range(3):
            arr[:, :, c] = np.interp(u, stops, cols[:, c])[:, None]
        grad = Image.fromarray(arr.astype(np.uint8))
    layer = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    # Shadow / bevel
    sh = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    ImageDraw.Draw(sh).text((xy[0] + 3, xy[1] + 6), text, font=fnt, fill=(0, 0, 0, 200), anchor=anchor)
    sh = sh.filter(ImageFilter.GaussianBlur(4))
    layer.alpha_composite(sh)
    bevel = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    ImageDraw.Draw(bevel).text((xy[0], xy[1] + 4), text, font=fnt, fill=(107, 58, 5, 255), anchor=anchor)
    layer.alpha_composite(bevel)
    glow = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    ImageDraw.Draw(glow).text(xy, text, font=fnt, fill=(255, 150, 30, 110), anchor=anchor)
    glow = glow.filter(ImageFilter.GaussianBlur(14))
    layer.alpha_composite(glow)
    fill = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    fill.paste(grad, (0, 0), mask)
    layer.alpha_composite(fill)
    return layer


def wordmark(size=150, two_line=True):
    fnt = font('BarlowCondensed-BlackItalic.woff2', size)
    text = 'TRIALS\nGAUNTLET' if two_line else 'TRIALS GAUNTLET'
    # Measure
    tmp = ImageDraw.Draw(Image.new('L', (1, 1)))
    bbox = tmp.multiline_textbbox((0, 0), text, font=fnt, spacing=-size * 0.16)
    w = int(bbox[2] - bbox[0] + 80)
    h = int(bbox[3] - bbox[1] + 80)
    layer = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    lines = text.split('\n')
    y = 40
    for ln in lines:
        part = gradient_text((w, h), ln, fnt, (40, y), anchor='la')
        layer.alpha_composite(part)
        y += int(size * 0.86)
    return layer


def vignette(img, strength=0.55):
    w, h = img.size
    yy, xx = np.mgrid[0:h, 0:w]
    d = np.sqrt(((xx - w / 2) / (w / 2)) ** 2 + ((yy - h / 2) / (h / 2)) ** 2)
    m = np.clip(1 - strength * np.clip(d - 0.45, 0, 1) ** 1.5, 0, 1)
    arr = np.asarray(img.convert('RGB')).astype(np.float32) * m[:, :, None]
    return Image.fromarray(arr.astype(np.uint8))


def keyart_plate():
    art = Image.open(KEYART).convert('RGB')
    aw, ah = art.size
    s = max(W / aw, H / ah)
    art = art.resize((int(aw * s + 0.5), int(ah * s + 0.5)), Image.LANCZOS)
    # the hero is authored left of centre; the game mirrors it so the hero lands right of the wordmark
    art = art.transpose(Image.FLIP_LEFT_RIGHT)
    x0 = (art.width - W) // 2
    art = art.crop((x0, 0, x0 + W, H))
    art = vignette(art, 0.6)
    arr = np.asarray(art).astype(np.float32)
    # left scrim for the wordmark
    xs = np.arange(W) / W
    scrim = 1 - 0.55 * np.clip(1 - xs / 0.55, 0, 1) ** 1.2
    arr *= scrim[None, :, None]
    return Image.fromarray(arr.astype(np.uint8))


def title_card_frames(n):
    """Key art + wordmark slamming in (scale 1.18 -> 1 over 5 frames), kicker fades in after."""
    plate = keyart_plate()
    wm = wordmark(148)
    kick_f = font('BarlowCondensed-Bold.woff2', 26)
    frames = []
    for i in range(n):
        img = plate.copy().convert('RGBA')
        u = min(1, i / 5)
        s = 1.18 - 0.18 * (1 - (1 - u) ** 3)
        a = int(255 * min(1, i / 2))
        ww = wm.resize((int(wm.width * s), int(wm.height * s)), Image.LANCZOS)
        layer = ww.copy()
        layer.putalpha(layer.getchannel('A').point(lambda v: v * a // 255))
        x = int(W * 0.06) - int((ww.width - wm.width) / 2)
        y = int(H * 0.30) - int((ww.height - wm.height) / 2)
        img.alpha_composite(layer, (x, y))
        if i >= 6:
            ka = int(255 * min(1, (i - 6) / 6))
            d = ImageDraw.Draw(img)
            spaced = '  '.join('A PHYSICS TRIALS GAME')
            d.text((int(W * 0.065) + 6, int(H * 0.30) - 2), spaced, font=kick_f, fill=INK + (ka,))
        frames.append(np.asarray(img.convert('RGB')))
    return frames


def text_card(lines, n, accent_words=(), big=140, small=None, bg=BG, reveal=0.0):
    """Black card with big italic uppercase lines; `accent_words` drawn amber. Lines can reveal in stages."""
    frames = []
    fb = font('BarlowCondensed-BlackItalic.woff2', big)
    fs = font('BarlowCondensed-Bold.woff2', small or int(big * 0.36))
    for i in range(n):
        img = Image.new('RGBA', (W, H), bg + (255,))
        d = ImageDraw.Draw(img)
        total_h = 0
        heights = []
        for k, ln in enumerate(lines):
            f = fb if k == 0 else fs
            bb = d.textbbox((0, 0), ln.replace('|', ''), font=f)
            heights.append(bb[3] - bb[1])
            total_h += heights[-1] + (18 if k else 0)
        y = (H - total_h) // 2
        for k, ln in enumerate(lines):
            f = fb if k == 0 else fs
            show_at = 0 if k == 0 else reveal
            a = int(255 * np.clip((i - show_at * FPS) / 3, 0, 1)) if i >= 0 else 0
            if k == 0 and i < 3:
                a = int(255 * (i + 1) / 3)
            words = ln.split(' ')
            widths = [d.textlength(wd, font=f) for wd in words]
            space = d.textlength(' ', font=f)
            tw = sum(widths) + space * (len(words) - 1)
            x = (W - tw) / 2
            # Slight slide-in on the big line
            if k == 0:
                x += 18 * (1 - min(1, i / 4)) ** 2
            bb0 = d.textbbox((0, 0), ln, font=f)
            for wd, ww in zip(words, widths):
                col = AMBER if wd.strip('·,') in accent_words else INK
                # shadow
                d.text((x + 2, y - bb0[1] + 4), wd, font=f, fill=(0, 0, 0, a))
                d.text((x, y - bb0[1]), wd, font=f, fill=col + (a,))
                x += ww + space
            y += heights[k] + 18
        frames.append(np.asarray(img.convert('RGB')))
    return frames


def overlay_text(text, accent_words=(), size=92):
    """Transparent RGBA layer with outlined big italic text (for cards over footage)."""
    f = font('BarlowCondensed-BlackItalic.woff2', size)
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    words = text.split(' ')
    widths = [d.textlength(wd, font=f) for wd in words]
    space = d.textlength(' ', font=f)
    tw = sum(widths) + space * (len(words) - 1)
    x = (W - tw) / 2
    bb = d.textbbox((0, 0), text, font=f)
    y = int(H * 0.68) - bb[1]
    # scrim band
    band = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(band).rectangle((0, int(H * 0.64), W, int(H * 0.64) + (bb[3] - bb[1]) + 70), fill=(0, 0, 0, 120))
    band = band.filter(ImageFilter.GaussianBlur(18))
    img.alpha_composite(band)
    for wd, ww in zip(words, widths):
        col = AMBER if wd in accent_words else INK
        d.text((x + 3, y + 5), wd, font=f, fill=(0, 0, 0, 220))
        d.text((x, y), wd, font=f, fill=col + (255,), stroke_width=2, stroke_fill=(10, 10, 12, 255))
        x += ww + space
    return img


def end_card_frames(n, url='trials-gauntlet-demo.vercel.app'):
    wm = wordmark(170)
    fu = font('BarlowCondensed-Bold.woff2', 46)
    fk = font('BarlowCondensed-Bold.woff2', 24)
    frames = []
    for i in range(n):
        img = Image.new('RGBA', (W, H), BG + (255,))
        a = int(255 * min(1, i / 4))
        layer = wm.copy()
        layer.putalpha(layer.getchannel('A').point(lambda v: v * a // 255))
        img.alpha_composite(layer, ((W - wm.width) // 2, int(H * 0.16)))
        d = ImageDraw.Draw(img)
        ua = int(255 * np.clip((i - 6) / 6, 0, 1))
        spaced = ' '.join(url)
        tw = d.textlength(url, font=fu)
        d.text(((W - tw) / 2, int(H * 0.70)), url, font=fu, fill=INK + (ua,))
        k = '  '.join('PLAY FREE IN YOUR BROWSER')
        tk = d.textlength(k, font=fk)
        d.text(((W - tk) / 2, int(H * 0.80)), k, font=fk, fill=AMBER + (ua,))
        # amber rule
        d.rectangle(((W - 160) / 2, int(H * 0.66), (W + 160) / 2, int(H * 0.66) + 4), fill=AMBER + (ua,))
        frames.append(np.asarray(img.convert('RGB')))
    return frames


# ---------------------------------------------------------------- sources

class Beat:
    def __init__(self, root, bid):
        self.dir = os.path.join(root, bid)
        meta = json.load(open(os.path.join(self.dir, 'log.json')))
        self.fps = meta['fps']
        self.n = meta['frames']
        self.log = meta['log']
        self.cache = {}
        with wave.open(os.path.join(self.dir, 'audio.wav')) as w:
            pcm = np.frombuffer(w.readframes(w.getnframes()), dtype='<i2').astype(np.float32) / 32768
            self.audio = pcm.reshape(-1, 2)
        first = self.frame(0)
        self.size = (first.shape[1], first.shape[0])

    def frame(self, i):
        i = int(max(0, min(self.n - 1, i)))
        if i not in self.cache:
            if len(self.cache) > 8:
                self.cache.pop(next(iter(self.cache)))
            self.cache[i] = np.asarray(Image.open(os.path.join(self.dir, f'frame-{i:05d}.png')).convert('RGB'))
        return self.cache[i]

    def bike_at(self, i):
        e = self.log[int(max(0, min(self.n - 1, i)))]
        return e['cam']['bikeScreenX'], e['cam']['bikeScreenY']

    def dist_at(self, i):
        return self.log[int(max(0, min(self.n - 1, i)))]['cam']['dist']


def sample(beat, src_t, blend=True, zoom=1.0, center=None):
    """Frame at source time src_t (s from beat frame 0); blends neighbours for slow-mo; optional punch-in."""
    fi = src_t * beat.fps
    if blend and beat.fps >= 60:
        a = beat.frame(math.floor(fi))
        b = beat.frame(math.floor(fi) + 1)
        w = fi - math.floor(fi)
        img = (a.astype(np.float32) * (1 - w) + b.astype(np.float32) * w).astype(np.uint8)
    else:
        img = beat.frame(round(fi))
    sw, sh = beat.size
    if (sw, sh) == (W, H) and zoom == 1.0:
        return img
    cw, ch = sw / zoom, sh / zoom
    cx, cy = (sw / 2, sh / 2) if center is None else (center[0] * sw, center[1] * sh)
    x0 = min(max(0, cx - cw / 2), sw - cw)
    y0 = min(max(0, cy - ch / 2), sh - ch)
    pil = Image.fromarray(img).crop((int(x0), int(y0), int(x0 + cw), int(y0 + ch))).resize((W, H), Image.LANCZOS)
    return np.asarray(pil)


# ---------------------------------------------------------------- timeline

def build_timeline(cut):
    """List of segments: dict(t0, t1, kind, ...). Times in seconds on the bar grid."""
    S = []

    def add(t0, dur, **kw):
        S.append(dict(t0=t0, t1=t0 + dur, **kw))
        return t0 + dur

    if cut == 'social':
        # 15 s cut: title, kicker, slow-mo jump, crash -> respawn on the drop, fire, end card. Music: drops 0,5 breaks 3.5 end 6.5.
        t = 0.0
        t = add(t, bar(0.5), kind='title')
        t = add(t, bar(1), kind='clip', beat='kicker', in_s=1.0, gain=0.9)
        t = add(t, bar(2), kind='clip', beat='plank', in_s=0.7, gain=0.9,
                remap=[(0.0, 0.9, 1.0), (0.9, 1.75, 0.35), (1.75, 2.3, 1.0)], punch=True)
        t = add(t, bar(1.5), kind='clip', beat='crash', in_s=0.1, gain=1.0, music_cut=(2.17, None))
        t = add(t, bar(0.5), kind='clip', beat='crash', in_s=3.3, gain=0.9, overlay=('EVERY CRASH IS A RESTART', ('RESTART',)))
        t = add(t, bar(1), kind='clip', beat='fire', in_s=0.55, gain=0.9, lift=1.25)
        t = add(t, 2.5, kind='end', fade_out=0.4)
        return S, t

    t = 0.0
    t = add(t, bar(0.5), kind='black')
    t = add(t, bar(2.5), kind='clip', beat='cold', in_s=0.1, gain=1.0, fade_in=0.4)
    t = add(t, bar(1), kind='title')
    t = add(t, bar(1.5), kind='clip', beat='flow', in_s=0.1, gain=0.85)
    t = add(t, bar(1.5), kind='clip', beat='kicker', in_s=0.2, gain=0.9)
    # plank: normal 28.25-29.7, slow x0.35 29.7-30.55, normal 30.55-31.51 (source starts 28.1)
    t = add(t, bar(2.5), kind='clip', beat='plank', in_s=0.15, gain=0.9,
            remap=[(0.0, 1.45, 1.0), (1.45, 2.3, 0.35), (2.3, 3.26, 1.0)], punch=True)
    t = add(t, bar(1.5), kind='clip', beat='seesaw', in_s=0.15, gain=0.9, lift=1.3)
    t = add(t, bar(1), kind='clip', beat='drums', in_s=0.75, gain=0.9)
    t = add(t, bar(1.5), kind='card', lines=['15 TRACKS · 5 BIOMES'], accent=('15', '5'), reveal=0.0)
    # crash: jump start at x1 t=3.4 (in_s 0.1), crash at 2.17 s in, hold ragdoll to the bar
    t = add(t, bar(1.5), kind='clip', beat='crash', in_s=0.1, gain=1.0, music_cut=(2.17, None))
    # respawn (x1 t=6.6): 1 bar, card over footage; this is drop 2
    t = add(t, bar(1), kind='clip', beat='crash', in_s=3.3, gain=0.9, overlay=('EVERY CRASH IS A RESTART', ('RESTART',)))
    t = add(t, bar(1.5), kind='clip', beat='fire', in_s=0.2, gain=0.9, lift=1.25)
    t = add(t, bar(1.5), kind='clip', beat='night', in_s=0.2, gain=0.9)
    t = add(t, bar(1.5), kind='clip', beat='climb', in_s=0.05, gain=0.9)
    t = add(t, bar(0.5), kind='clip', beat='stairs', in_s=0.3, gain=0.9)
    t = add(t, bar(1), kind='clip', beat='loopout', in_s=0.15, gain=1.0)
    t = add(t, bar(0.5), kind='clip', beat='hop', in_s=0.15, gain=0.9)
    t = add(t, bar(0.5), kind='clip', beat='chain', in_s=0.15, gain=0.9)
    t = add(t, bar(1), kind='card', lines=['PLAYS IN YOUR BROWSER', 'DESKTOP  ·  iPHONE  ·  GAMEPAD'], accent=('BROWSER',), reveal=0.35)
    t = add(t, bar(2), kind='clip', beat='finish', in_s=0.4, gain=1.0)
    t = add(t, 3.5, kind='end', fade_out=0.5)
    return S, t


def remap_time(seg, dt):
    """Output time within segment -> source time (s from in_s), honouring slow-mo remaps."""
    if 'remap' not in seg:
        return dt
    acc_out = 0.0
    for (s0, s1, speed) in seg['remap']:
        span_out = (s1 - s0) / speed
        if dt <= acc_out + span_out or (s0, s1, speed) == seg['remap'][-1]:
            return s0 + (dt - acc_out) * speed
        acc_out += span_out
    return dt


def slow_factor(seg, dt):
    if 'remap' not in seg:
        return 1.0
    acc_out = 0.0
    for (s0, s1, speed) in seg['remap']:
        span_out = (s1 - s0) / speed
        if dt <= acc_out + span_out:
            return speed
        acc_out += span_out
    return seg['remap'][-1][2]


# ---------------------------------------------------------------- audio

def read_wav(path):
    with wave.open(path) as w:
        pcm = np.frombuffer(w.readframes(w.getnframes()), dtype='<i2').astype(np.float32) / 32768
        return pcm.reshape(-1, w.getnchannels())


def write_wav(path, x):
    pcm = (np.clip(x, -1, 1) * 32767).astype('<i2')
    with wave.open(path, 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


def envelope(x, attack=0.01, release=0.25):
    e = np.sqrt(np.mean(x ** 2, axis=1))
    out = np.empty_like(e)
    a_a = math.exp(-1 / (SR * attack))
    a_r = math.exp(-1 / (SR * release))
    acc = 0.0
    # block-wise for speed: 1 ms blocks
    blk = SR // 1000
    eb = e[: len(e) // blk * blk].reshape(-1, blk).max(axis=1)
    ob = np.empty_like(eb)
    a_a = math.exp(-1 / (1000 * attack))
    a_r = math.exp(-1 / (1000 * release))
    for i, v in enumerate(eb):
        acc = a_a * acc + (1 - a_a) * v if v > acc else a_r * acc + (1 - a_r) * v
        ob[i] = acc
    out = np.repeat(ob, blk)
    return np.concatenate([out, np.full(len(e) - len(out), out[-1] if len(out) else 0)])


def mix_audio(segments, total, beats, music_path, out_wav):
    n = int(total * SR)
    sfx = np.zeros((n, 2), np.float32)
    music_gate = np.ones(n, np.float32)
    for seg in segments:
        if seg['kind'] != 'clip':
            continue
        b = beats[seg['beat']]
        i0 = int(seg['t0'] * SR)
        i1 = int(seg['t1'] * SR)
        m = i1 - i0
        # source sample positions (handles slow-mo by index remap)
        if 'remap' in seg:
            dts = np.arange(m) / SR
            src_t = np.array([remap_time(seg, d) for d in dts[::48]])
            src_t = np.interp(np.arange(m), np.arange(0, m, 48)[: len(src_t)], src_t)
        else:
            src_t = np.arange(m) / SR
        idx = (seg['in_s'] + src_t) * SR
        idx = np.clip(idx, 0, len(b.audio) - 2)
        i_lo = idx.astype(np.int64)
        frac = (idx - i_lo)[:, None]
        chunk = b.audio[i_lo] * (1 - frac) + b.audio[i_lo + 1] * frac
        # edge fades
        f = int(0.02 * SR)
        ramp = np.linspace(0, 1, f)[:, None]
        chunk[:f] *= ramp
        chunk[-f:] *= ramp[::-1]
        if seg.get('fade_in'):
            k = int(seg['fade_in'] * SR)
            chunk[:k] *= np.linspace(0, 1, k)[:, None]
        sfx[i0:i1] += chunk * seg.get('gain', 0.9)
        if seg.get('music_cut'):
            c0, c1 = seg['music_cut']
            j0 = i0 + int(c0 * SR)
            j1 = i1 if c1 is None else i0 + int(c1 * SR)
            music_gate[j0:j1] = 0.0
            # 8 ms fade into the cut so it does not click
            k = int(0.008 * SR)
            music_gate[j0 - k : j0] = np.linspace(1, 0, k)
    music = read_wav(music_path)
    if len(music) < n:
        music = np.concatenate([music, np.zeros((n - len(music), 2), np.float32)])
    music = music[:n]
    # Sidechain duck under the game audio: up to -7 dB, fast attack, 250 ms release
    env = envelope(sfx)
    ref = np.percentile(env[env > 1e-4], 85) if np.any(env > 1e-4) else 1.0
    duck = 1 - 0.55 * np.clip(env / max(ref, 1e-6), 0, 1)
    music_gain = music * (duck * music_gate)[:, None]
    # Fade out the tail
    fo = int(0.6 * SR)
    music_gain[-fo:] *= np.linspace(1, 0, fo)[:, None]
    sfx[-fo:] *= np.linspace(1, 0, fo)[:, None]
    # Level balance: music ~ -16 LUFS-ish relative to sfx peaks; final loudnorm to -14 in ffmpeg
    mix = 0.55 * music_gain + 0.9 * sfx
    peak = np.abs(mix).max()
    if peak > 0.98:
        mix *= 0.98 / peak
    write_wav(out_wav, mix)
    return out_wav


# ---------------------------------------------------------------- render

def render(args):
    segments, total = build_timeline(args.cut)
    beats = {}
    for s in segments:
        if s['kind'] == 'clip' and s['beat'] not in beats:
            beats[s['beat']] = Beat(args.beats, s['beat'])
    nframes = int(round(total * FPS))
    print(f'timeline: {len(segments)} segments, {total:.2f} s, {nframes} frames', file=sys.stderr)
    for s in segments:
        print(f"  {s['t0']:6.2f}-{s['t1']:6.2f} {s['kind']:6} {s.get('beat', s.get('lines', ''))}", file=sys.stderr)

    wav = mix_audio(segments, total, beats, args.music, args.out.replace('.mp4', '.mix.wav'))

    out_h = args.height
    out_w = out_h * 16 // 9
    grade = "eq=contrast=1.07:saturation=1.10:brightness=0.005,curves=r='0/0 0.5/0.515 1/1':b='0/0 0.5/0.487 1/1'"
    scale = f',scale={out_w}:{out_h}:flags=lanczos' if out_h != H else ''
    cmd = [
        FFMPEG, '-y', '-hide_banner', '-loglevel', 'error',
        '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
        '-i', wav,
        '-vf', grade + scale + ',format=yuv420p',
        '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11',
        '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-profile:v', 'high', '-level', '4.1',
        '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
        '-movflags', '+faststart', '-shortest', args.out,
    ]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    card_cache = {}
    overlay_cache = {}
    sheet_frames = []
    punch_center = None
    for k in range(nframes):
        t = (k + 0.5) / FPS
        seg = next((s for s in segments if s['t0'] <= t < s['t1']), segments[-1])
        dt = t - seg['t0']
        local = int((t - seg['t0']) * FPS)
        n_seg = int(round((seg['t1'] - seg['t0']) * FPS))
        kind = seg['kind']
        if kind == 'black':
            img = np.zeros((H, W, 3), np.uint8)
        elif kind == 'title':
            key = ('title', n_seg)
            if key not in card_cache:
                card_cache[key] = title_card_frames(n_seg)
            img = card_cache[key][min(local, n_seg - 1)]
        elif kind == 'card':
            key = ('card', tuple(seg['lines']), n_seg)
            if key not in card_cache:
                card_cache[key] = text_card(seg['lines'], n_seg, seg.get('accent', ()), reveal=seg.get('reveal', 0.0))
            img = card_cache[key][min(local, n_seg - 1)]
        elif kind == 'end':
            key = ('end', n_seg)
            if key not in card_cache:
                card_cache[key] = end_card_frames(n_seg)
            img = card_cache[key][min(local, n_seg - 1)]
        else:
            b = beats[seg['beat']]
            src_t = seg['in_s'] + remap_time(seg, dt)
            if seg.get('freeze_after') is not None:
                src_t = min(src_t, seg['in_s'] + seg['freeze_after'])
            if seg.get('punch'):
                sp = slow_factor(seg, dt)
                # ease the zoom in/out around the slow-mo
                z_target = 1.8 if sp < 1 else 1.15
                bx, by = b.bike_at(src_t * b.fps)
                if punch_center is None or len(punch_center) != 3:
                    punch_center = [bx, by, 1.0]
                punch_center[0] += (bx - punch_center[0]) * 0.18
                punch_center[1] += (by - punch_center[1]) * 0.18
                punch_center[2] += (z_target - punch_center[2]) * 0.12
                img = sample(b, src_t, zoom=punch_center[2], center=(punch_center[0], punch_center[1] - 0.03))
            elif b.size[0] > W and not seg.get('no_zoom'):
                # HD source: punch in as the game camera pulls back (dist 24 -> 1.0x, 44 -> 1.45x), tracking the bike
                fi = src_t * b.fps
                bx, by = b.bike_at(fi)
                z_target = float(np.clip((b.dist_at(fi) - 20) / 28 * 0.8 + 1.0, 1.0, 1.8)) * seg.get('zoom', 1.0)
                if punch_center is None or len(punch_center) != 4 or punch_center[3] != seg['t0']:
                    punch_center = [bx, by, z_target, seg['t0']]
                punch_center[0] += (bx - punch_center[0]) * 0.15
                punch_center[1] += (by - punch_center[1]) * 0.15
                punch_center[2] += (z_target - punch_center[2]) * 0.10
                img = sample(b, src_t, blend=False, zoom=punch_center[2], center=(punch_center[0] + 0.06, punch_center[1] - 0.02))
            else:
                punch_center = None
                img = sample(b, src_t, blend=False)
            if seg.get('lift'):
                g = seg['lift']
                lut = (np.power(np.arange(256) / 255.0, 1.0 / g) * 255).astype(np.uint8)
                img = lut[img]
            if seg.get('overlay'):
                text, acc = seg['overlay']
                if text not in overlay_cache:
                    overlay_cache[text] = overlay_text(text, acc)
                a = min(1.0, local / 3)
                if a > 0:
                    ov = overlay_cache[text]
                    base = Image.fromarray(img).convert('RGBA')
                    lay = ov.copy()
                    if a < 1:
                        lay.putalpha(lay.getchannel('A').point(lambda v: int(v * a)))
                    base.alpha_composite(lay)
                    img = np.asarray(base.convert('RGB'))
            if seg.get('fade_in') and dt < seg['fade_in']:
                img = (img.astype(np.float32) * (dt / seg['fade_in'])).astype(np.uint8)
        if seg.get('fade_out') and (seg['t1'] - t) < seg['fade_out']:
            img = (img.astype(np.float32) * max(0.0, (seg['t1'] - t) / seg['fade_out'])).astype(np.uint8)
        if img.shape[0] != H or img.shape[1] != W:
            img = np.asarray(Image.fromarray(img).resize((W, H), Image.LANCZOS))
        proc.stdin.write(np.ascontiguousarray(img).tobytes())
        if local == n_seg // 2 and kind == 'clip':
            sheet_frames.append((seg['beat'], img))
        if k % 150 == 0:
            print(f'  frame {k}/{nframes} t={t:.1f}s {kind} {seg.get("beat", "")}', file=sys.stderr)
    proc.stdin.close()
    rc = proc.wait()
    if rc != 0:
        raise SystemExit(f'ffmpeg failed: {rc}')
    # Contact sheet of beat midpoints (6-up rows)
    if args.sheet:
        cols = 6
        rows = math.ceil(len(sheet_frames) / cols)
        tw, th = 426, 240
        sheet = Image.new('RGB', (cols * tw, rows * th), BG)
        fl = font('BarlowCondensed-Bold.woff2', 22)
        for i, (name, fr) in enumerate(sheet_frames):
            tile = Image.fromarray(fr).resize((tw, th), Image.LANCZOS)
            d = ImageDraw.Draw(tile)
            d.rectangle((0, th - 30, tw, th), fill=(0, 0, 0))
            d.text((10, th - 28), name.upper(), font=fl, fill=AMBER)
            sheet.paste(tile, ((i % cols) * tw, (i // cols) * th))
        sheet.save(args.sheet, quality=90)
    json.dump({'total_s': total, 'segments': segments}, open(args.out.replace('.mp4', '.cutlist.json'), 'w'), indent=1)
    print(f'wrote {args.out} ({total:.2f} s)', file=sys.stderr)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--beats', default='harness/out/trailer/beats')
    ap.add_argument('--music', default='harness/out/trailer/music.wav')
    ap.add_argument('--out', default='harness/out/trailer/trailer.mp4')
    ap.add_argument('--cut', default='full', choices=['full', 'social'])
    ap.add_argument('--height', type=int, default=720)
    ap.add_argument('--sheet', default=None)
    render(ap.parse_args())


if __name__ == '__main__':
    main()
