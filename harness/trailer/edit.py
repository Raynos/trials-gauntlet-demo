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
TTF_DIR = os.path.join(ROOT, 'harness', 'trailer', 'fonts')
KEYART = os.path.join(ROOT, 'public', 'art', 'menu', 'keyart-industrial-1920.webp')
AMBER = (255, 176, 32)
AMBER2 = (255, 138, 31)
INK = (243, 245, 248)
BG = (7, 8, 10)

TIMELAPSE = None
KEYART_FLIP = True
BPM = 124.0
BEAT = 60 / BPM
BAR = 4 * BEAT


def bar(b):
    return b * BAR


def font(name, size):
    """The game ships .woff2, which Pillow can only open when its bundled FreeType was built
    with brotli — the stock wheel is not, so a plain `pip install pillow` raises "unknown file
    format" on every card. `harness/trailer/fonts/` holds the same faces converted to .ttf
    (regenerate with `fonts/woff2ttf.py public/fonts harness/trailer/fonts`); the shipped
    woff2 stays the fallback for a FreeType that can read it."""
    ttf = os.path.join(TTF_DIR, name.replace('.woff2', '.ttf'))
    if os.path.exists(ttf):
        return ImageFont.truetype(ttf, size)
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
    # The industrial plate authors the hero left of centre and the game mirrors it, so the hero
    # lands right of the wordmark. The nalati plate is already hero-right — `--keyart-noflip`.
    if KEYART_FLIP:
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


def overlay_text(text, accent_words=(), size=92, y_frac=0.68):
    """Transparent RGBA layer with outlined big italic text (for cards over footage).

    `y_frac` is the baseline band as a fraction of the height; the UI cut lifts it to the
    top third on shots whose own UI (the world map's track card, the garage's selectors)
    owns the bottom band.
    """
    f = font('BarlowCondensed-BlackItalic.woff2', size)
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    words = text.split(' ')
    widths = [d.textlength(wd, font=f) for wd in words]
    space = d.textlength(' ', font=f)
    tw = sum(widths) + space * (len(words) - 1)
    x = (W - tw) / 2
    bb = d.textbbox((0, 0), text, font=f)
    y = int(H * y_frac) - bb[1]
    # scrim band
    band = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    band_top = int(H * (y_frac - 0.04))
    ImageDraw.Draw(band).rectangle((0, band_top, W, band_top + (bb[3] - bb[1]) + 70), fill=(0, 0, 0, 120))
    band = band.filter(ImageFilter.GaussianBlur(18))
    img.alpha_composite(band)
    for wd, ww in zip(words, widths):
        col = AMBER if wd in accent_words else INK
        d.text((x + 3, y + 5), wd, font=f, fill=(0, 0, 0, 220))
        d.text((x, y), wd, font=f, fill=col + (255,), stroke_width=2, stroke_fill=(10, 10, 12, 255))
        x += ww + space
    return img


def end_card_frames(n, url='trials-gauntlet-demo.vercel.app', version=None):
    """Wordmark + URL; with `version` ('v0.2.0 · 90f0622') a build line sits under the wordmark (the v0.2.0 title card)."""
    wm = wordmark(150 if version else 170)
    fu = font('BarlowCondensed-Bold.woff2', 46)
    fk = font('BarlowCondensed-Bold.woff2', 24)
    fv = font('BarlowCondensed-Bold.woff2', 40)
    frames = []
    for i in range(n):
        img = Image.new('RGBA', (W, H), BG + (255,))
        a = int(255 * min(1, i / 4))
        layer = wm.copy()
        layer.putalpha(layer.getchannel('A').point(lambda v: v * a // 255))
        img.alpha_composite(layer, ((W - wm.width) // 2, int(H * (0.08 if version else 0.16))))
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
        if version:
            va = int(255 * np.clip((i - 3) / 5, 0, 1))
            vt = '  '.join(version)
            tv = d.textlength(vt, font=fv)
            d.text(((W - tv) / 2, int(H * 0.565)), vt, font=fv, fill=AMBER + (va,))
        frames.append(np.asarray(img.convert('RGB')))
    return frames


def menu_frames(plate_path, n, z0=1.08, z1=1.15):
    """Ken Burns on the Broadcast menu plate: a slow push-in (the crop also drops the headless perf chip top-right)."""
    plate = Image.open(plate_path).convert('RGB')
    pw, ph = plate.size
    frames = []
    for i in range(n):
        u = i / max(1, n - 1)
        z = z0 + (z1 - z0) * (1 - (1 - u) ** 2)
        cw, ch = pw / z, ph / z
        cx, cy = pw * 0.52, ph * 0.50
        x0, y0 = cx - cw / 2, cy - ch / 2
        img = plate.crop((int(x0), int(y0), int(x0 + cw), int(y0 + ch))).resize((W, H), Image.LANCZOS)
        a = min(1.0, i / 3)
        arr = np.asarray(img).astype(np.float32) * a
        frames.append(arr.astype(np.uint8))
    return frames


def phone_card_frame(clip_rgb, i, lines=('PLAYS IN YOUR BROWSER', 'DESKTOP  ·  iPHONE  ·  GAMEPAD'), accent=('BROWSER',)):
    """The platform card with the live phone capture (touch controls in frame) inside a rounded device bezel."""
    img = Image.new('RGBA', (W, H), BG + (255,))
    d = ImageDraw.Draw(img)
    fb = font('BarlowCondensed-BlackItalic.woff2', 72)
    fs = font('BarlowCondensed-Bold.woff2', 26)
    # device: 62 % of the width, 19.5:9
    dw = int(W * 0.62)
    dh = int(dw * 430 / 932)
    dx, dy = (W - dw) // 2, int(H * 0.36)
    a = int(255 * min(1, i / 4))
    clip = Image.fromarray(clip_rgb).resize((dw, dh), Image.LANCZOS)
    mask = Image.new('L', (dw, dh), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, dw - 1, dh - 1), radius=int(dh * 0.11), fill=a)
    bez = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(bez).rounded_rectangle((dx - 10, dy - 10, dx + dw + 10, dy + dh + 10), radius=int(dh * 0.11) + 10, fill=(24, 26, 30, a), outline=(70, 74, 80, a), width=2)
    img.alpha_composite(bez)
    img.paste(clip, (dx, dy), mask)
    # text above the device
    y = int(H * 0.10)
    words = lines[0].split(' ')
    widths = [d.textlength(wd, font=fb) for wd in words]
    space = d.textlength(' ', font=fb)
    x = (W - (sum(widths) + space * (len(words) - 1))) / 2
    for wd, ww in zip(words, widths):
        col = AMBER if wd in accent else INK
        d.text((x + 2, y + 4), wd, font=fb, fill=(0, 0, 0, a))
        d.text((x, y), wd, font=fb, fill=col + (a,))
        x += ww + space
    sa = int(255 * np.clip((i - 3) / 4, 0, 1))
    tw = d.textlength(lines[1], font=fs)
    d.text(((W - tw) / 2, int(H * 0.235)), lines[1], font=fs, fill=INK + (sa,))
    return np.asarray(img.convert('RGB'))


def timelapse_frames(mp4, seconds, tmpdir):
    """Last `seconds` of an external mp4 (the harness owner's progress montage) as RGB frames at FPS, via ffmpeg."""
    os.makedirs(tmpdir, exist_ok=True)
    dur = float(subprocess.check_output(['/opt/homebrew/bin/ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp4]).decode().strip())
    ss = max(0.0, dur - seconds)
    subprocess.check_call([FFMPEG, '-y', '-loglevel', 'error', '-ss', f'{ss:.3f}', '-i', mp4, '-t', f'{seconds:.3f}', '-vf', f'fps={FPS},scale={W}:{H}:force_original_aspect_ratio=decrease,pad={W}:{H}:(ow-iw)/2:(oh-ih)/2',
                           os.path.join(tmpdir, 'tl-%04d.png')])
    files = sorted(f for f in os.listdir(tmpdir) if f.startswith('tl-'))
    return [np.asarray(Image.open(os.path.join(tmpdir, f)).convert('RGB')) for f in files]


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
        t = add(t, bar(1), kind='clip', beat='kicker', in_s=0.6, gain=0.9)
        t = add(t, bar(2), kind='clip', beat='plank', in_s=0.7, gain=0.9,
                remap=[(0.0, 0.9, 1.0), (0.9, 1.75, 0.35), (1.75, 2.3, 1.0)], punch=True)
        t = add(t, bar(1.5), kind='clip', beat='crash', in_s=0.1, gain=1.0, music_cut=(2.17, None))
        t = add(t, bar(0.5), kind='clip', beat='crash', in_s=3.8, gain=0.9, overlay=('EVERY CRASH IS A RESTART', ('RESTART',)))
        t = add(t, bar(1), kind='clip', beat='fire', in_s=0.55, gain=0.9, lift=1.25)
        t = add(t, 2.5, kind='end', fade_out=0.4)
        return S, t

    if cut == 'v2-social':
        # 15 s v0.2.0 social cut on music-15 (drops 0,5 breaks 3.5 end 6.5): title, hop, stack slow-mo, summit crash -> respawn, rooftop drop, end card.
        t = 0.0
        t = add(t, bar(0.5), kind='title')
        t = add(t, bar(0.5), kind='clip', beat='hop', in_s=0.35, gain=0.9)
        t = add(t, bar(0.5), kind='clip', beat='landing', in_s=0.9, gain=0.9)
        t = add(t, bar(2), kind='clip', beat='stack', in_s=0.0, gain=0.9, lift=1.2,
                remap=[(0.0, 1.05, 1.0), (1.05, 1.65, 0.35), (1.65, 2.6, 1.0)], punch=True)
        t = add(t, bar(1.5), kind='clip', beat='crash', in_s=0.1, gain=1.0, music_cut=(2.07, None))
        t = add(t, bar(0.5), kind='clip', beat='crash', in_s=3.5, gain=0.9, overlay=('EVERY CRASH IS A RESTART', ('RESTART',)))
        t = add(t, bar(1), kind='clip', beat='drop', in_s=0.2, gain=0.9)
        t = add(t, 2.5, kind='end', fade_out=0.4)
        return S, t

    if cut == 'ui':
        # 15 s cut (ask 63, round 2: the first pass was all front end and the reply was "shows no
        # gameplay"). Majority riding — 4.5 of the 7.75 bars, 58 % of the runtime — with the two
        # screens that are new since the v0.2.0 trailer carrying the rest. Bed: music-15 (124 BPM,
        # drops at bars 0 and 5), so every cut lands on a half-bar.
        t = 0.0
        t = add(t, bar(0.5), kind='title')
        # H1 Pro off the start gate: 2.52 s on the rear wheel along the night-city rooftops.
        t = add(t, bar(1), kind='clip', beat='wheelie', in_s=0.15, gain=0.85, no_zoom=True)
        # X3 Pro: 2.33 s of air, 10.5 m apex, out over the foundry.
        t = add(t, bar(0.5), kind='clip', beat='bigair', in_s=0.30, gain=0.85, punch=True)
        # In on the pan, not on the held opening frame.
        t = add(t, bar(1), kind='clip', beat='map', in_s=0.55, gain=0.0, no_zoom=True,
                overlay=('A HAND-PAINTED WORLD', ('WORLD',)), overlay_y=0.13, overlay_size=84)
        # THE BACKFLIP (make-flip.ts): 349 deg off the X1 summit at 15.1 m, landed clean. Slow to
        # 0.45x through the rotation with the tracked punch-in, back to speed for the landing.
        t = add(t, bar(1.5), kind='clip', beat='flip', in_s=0.35, gain=0.9, punch=True,
                remap=[(0.0, 0.75, 1.0), (0.75, 1.25, 0.45), (1.25, 2.29, 1.0)])
        t = add(t, bar(0.5), kind='clip', beat='garage', in_s=0.60, gain=0.0, no_zoom=True,
                overlay=('FIVE OUTFITS, TWO BIKES', ('FIVE', 'TWO')), overlay_y=0.13, overlay_size=84)
        # Two half-bars rather than one bar on a single biome: H3 Pro over the foundry fire line
        # (in on the landing), then E1's 2.23 s / 9.8 m gap across the canyon mesas — the one warm
        # daylight shot in a cut that is otherwise night city, foundry and snow.
        t = add(t, bar(0.5), kind='clip', beat='firejump', in_s=1.50, gain=0.85, lift=1.35, punch=True)
        t = add(t, bar(0.5), kind='clip', beat='canyonair', in_s=1.70, gain=0.85, punch=True)
        # B1 finish: TRACK FINISHED, 0:40.558, 0 faults, the medal row and the tiles.
        t = add(t, bar(0.5), kind='clip', beat='results', in_s=1.9, gain=0.85, no_zoom=True)
        t = add(t, 2.5, kind='end', fade_out=0.4)
        return S, t

    if cut == 'v2':
        # v0.2.0 (physics v2 + Pro, r9 storyboards, r13/14 render, r4 audio, the Broadcast menu). Same 26-bar grid as
        # v0.1.0: drop 1 = bar 4 (the hop), break = bar 12 (card), drop 2 = bar 15 (the respawn hard cut), break = bar 23.
        t = 0.0
        t = add(t, bar(0.5), kind='black')
        t = add(t, bar(2.5), kind='clip', beat='cold', in_s=0.0, gain=1.0, fade_in=0.4)                       # b1 gate, crowd, 3-2-1-GO
        t = add(t, bar(1), kind='title')
        t = add(t, bar(0.5), kind='clip', beat='hop', in_s=0.35, gain=0.9)                                      # m1: the hop onto the ledge (air 0.6-0.75 s in)
        t = add(t, bar(1), kind='clip', beat='landing', in_s=0.2, gain=0.9)                                      # e2: 1.24 s air, the 2 m rear-wheel landing at 1.62 s in
        t = add(t, bar(1.5), kind='clip', beat='wheelie', in_s=0.5, gain=0.9)                                    # h1 Pro: 2.7 s wheelie onto the wire
        t = add(t, bar(1), kind='clip', beat='face', in_s=0.0, gain=0.9)                                         # x1 Face 1: the 45 deg face, snow
        # x3 The Stack: 1.82 s / 9 m drop; slow x0.3 through the apex with the tracked punch-in
        t = add(t, bar(2.5), kind='clip', beat='stack', in_s=0.0, gain=0.9, lift=1.2,
                remap=[(0.0, 1.05, 1.0), (1.05, 1.75, 0.3), (1.75, 3.2, 1.0)], punch=True)
        t = add(t, bar(1), kind='clip', beat='apron', in_s=0.3, gain=0.9)                                        # h2: the crane jump, night city
        t = add(t, bar(1), kind='clip', beat='canyon', in_s=0.1, gain=0.9)                                       # e2: canyon table-top, sunset mesas
        t = add(t, bar(1), kind='card', lines=['15 TRACKS · 5 BIOMES · 2 BIKES'], accent=('15', '5', '2'), big=112, reveal=0.0)
        # x1 The Summit (make-crash.ts off the Pro golden at 42.3 s): 1.9 s of air from 15 m, lands on the head at 2.07 s in
        # (rec 44.37 s); music cut, 0.8 s of ragdoll to the bar, then the hard cut to the respawned bike = drop 2
        t = add(t, bar(1.5), kind='clip', beat='crash', in_s=0.1, gain=1.0, music_cut=(2.07, None))
        t = add(t, bar(1), kind='clip', beat='crash', in_s=3.5, gain=0.9, overlay=('EVERY CRASH IS A RESTART', ('RESTART',)))
        t = add(t, bar(1.5), kind='clip', beat='drop', in_s=0.0, gain=0.9)                                       # h1 The Drop: rooftop roll-off into the scaffold tunnel
        t = add(t, bar(2), kind='clip', beat='pour', in_s=0.0, gain=0.9, lift=1.22)                              # h3 The Pour: the tunnel rows, then the 1.6 s fire jump
        t = add(t, bar(1), kind='clip', beat='face', in_s=1.7, gain=0.9)                                         # x1: the wheelie up the face
        t = add(t, bar(1.5), kind='menu')                                                                        # the Broadcast menu (2.9 s push-in)
        t = add(t, bar(0.5), kind='clip', beat='canyon', in_s=1.85, gain=0.9)                                    # e2: the second canyon jump
        t = add(t, bar(0.5), kind='clip', beat='hop', in_s=0.66, gain=0.9)                                       # m1: off the ledge
        t = add(t, bar(1), kind='phonecard', beat='phone', in_s=0.0, gain=0.7)                                   # iPhone geometry, G touch controls
        t = add(t, bar(2), kind='clip', beat='finish', in_s=0.13, gain=1.0)                                      # h1 finish arch: fireworks, results
        if TIMELAPSE:
            t = add(t, 3.0, kind='timelapse')
        t = add(t, 3.5, kind='end', fade_out=0.5)
        return S, t

    t = 0.0
    t = add(t, bar(0.5), kind='black')
    t = add(t, bar(2.5), kind='clip', beat='cold', in_s=0.1, gain=1.0, fade_in=0.4)
    t = add(t, bar(1), kind='title')
    t = add(t, bar(1.5), kind='clip', beat='flow', in_s=0.1, gain=0.85)
    t = add(t, bar(1.5), kind='clip', beat='kicker', in_s=0.1, gain=0.9)
    # plank: normal 28.25-29.7, slow x0.35 29.7-30.55, normal 30.55-31.51 (source starts 28.1)
    t = add(t, bar(2.5), kind='clip', beat='plank', in_s=0.15, gain=0.9,
            remap=[(0.0, 1.45, 1.0), (1.45, 2.3, 0.35), (2.3, 3.26, 1.0)], punch=True)
    t = add(t, bar(1.5), kind='clip', beat='seesaw', in_s=0.15, gain=0.9, lift=1.3)
    t = add(t, bar(1), kind='clip', beat='drums', in_s=0.1, gain=0.9)
    t = add(t, bar(1.5), kind='card', lines=['15 TRACKS · 5 BIOMES'], accent=('15', '5'), reveal=0.0)
    # crash: jump start at x1 t=3.4 (in_s 0.1), crash at 2.17 s in, hold ragdoll to the bar
    t = add(t, bar(1.5), kind='clip', beat='crash', in_s=0.1, gain=1.0, music_cut=(2.17, None))
    # respawn (x1 t=6.6): 1 bar, card over footage; this is drop 2
    t = add(t, bar(1), kind='clip', beat='crash', in_s=3.8, gain=0.9, overlay=('EVERY CRASH IS A RESTART', ('RESTART',)))
    t = add(t, bar(1.5), kind='clip', beat='fire', in_s=0.2, gain=0.9, lift=1.25)
    t = add(t, bar(1), kind='clip', beat='night', in_s=0.5, gain=0.9)
    t = add(t, bar(1), kind='clip', beat='pipes', in_s=0.6, gain=0.9, lift=1.15)
    t = add(t, bar(1), kind='clip', beat='climb', in_s=0.5, gain=0.9)
    t = add(t, bar(0.5), kind='clip', beat='stairs', in_s=0.35, gain=0.9)
    t = add(t, bar(1), kind='clip', beat='loopout', in_s=0.15, gain=1.0)
    t = add(t, bar(0.5), kind='clip', beat='hop', in_s=0.15, gain=0.9)
    t = add(t, bar(0.5), kind='clip', beat='chain', in_s=0.15, gain=0.9)
    t = add(t, bar(1), kind='card', lines=['PLAYS IN YOUR BROWSER', 'DESKTOP  ·  iPHONE  ·  GAMEPAD'], accent=('BROWSER',), reveal=0.35)
    t = add(t, bar(2), kind='clip', beat='finish', in_s=0.3, gain=1.0)
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
        if seg['kind'] not in ('clip', 'phonecard'):
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
        if s['kind'] in ('clip', 'phonecard') and s['beat'] not in beats:
            beats[s['beat']] = Beat(args.beats, s['beat'])
    # A tagged cut reads "v0.2.0 · <sha>"; a cut of whatever is at HEAD reads the build stamp the
    # menu itself shows ("build <sha>"), so the end card never claims a release it is not.
    version = f'v{args.version} · {args.sha}' if args.version else (f'build {args.sha}' if args.sha else None)
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
                card_cache[key] = text_card(seg['lines'], n_seg, seg.get('accent', ()), big=seg.get('big', 140), reveal=seg.get('reveal', 0.0))
            img = card_cache[key][min(local, n_seg - 1)]
        elif kind == 'end':
            key = ('end', n_seg)
            if key not in card_cache:
                card_cache[key] = end_card_frames(n_seg, version=version)
            img = card_cache[key][min(local, n_seg - 1)]
        elif kind == 'menu':
            key = ('menu', n_seg)
            if key not in card_cache:
                card_cache[key] = menu_frames(os.path.join(args.beats, 'menu', 'menu-0.png'), n_seg)
            img = card_cache[key][min(local, n_seg - 1)]
        elif kind == 'timelapse':
            key = ('timelapse', n_seg)
            if key not in card_cache:
                card_cache[key] = timelapse_frames(TIMELAPSE, seg['t1'] - seg['t0'], args.out + '.tl')
            fr = card_cache[key]
            img = fr[min(local, len(fr) - 1)] if fr else np.zeros((H, W, 3), np.uint8)
        elif kind == 'phonecard':
            b = beats[seg['beat']]
            img = phone_card_frame(b.frame(round((seg['in_s'] + dt) * b.fps)), local)
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
            elif seg.get('push'):
                # Slow linear push-in over the segment: a beat whose own screen barely moves (the
                # menu is a near-still) still needs to breathe. `punch` tracks the bike and needs a
                # camera log; this is just the frame scaling.
                z0, z1 = seg['push']
                punch_center = None
                u = (dt) / max(1e-6, seg['t1'] - seg['t0'])
                img = sample(b, src_t, blend=False, zoom=z0 + (z1 - z0) * u)
            else:
                punch_center = None
                img = sample(b, src_t, blend=False)
            if seg.get('lift'):
                g = seg['lift']
                lut = (np.power(np.arange(256) / 255.0, 1.0 / g) * 255).astype(np.uint8)
                img = lut[img]
            if seg.get('overlay'):
                text, acc = seg['overlay']
                okey = (text, seg.get('overlay_y', 0.68), seg.get('overlay_size', 92))
                if okey not in overlay_cache:
                    overlay_cache[okey] = overlay_text(text, acc, size=okey[2], y_frac=okey[1])
                a = min(1.0, local / 3)
                if a > 0:
                    ov = overlay_cache[okey]
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
        if local == n_seg // 2 and kind in ('clip', 'phonecard', 'menu'):
            sheet_frames.append((seg.get('beat', kind), img))
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
    ap.add_argument('--cut', default='full', choices=['full', 'social', 'v2', 'v2-social', 'ui'])
    ap.add_argument('--height', type=int, default=720)
    ap.add_argument('--sheet', default=None)
    ap.add_argument('--keyart', default=None, help='override the title-card key art (default: the industrial plate); the UI cut matches whatever the live menu is showing')
    ap.add_argument('--keyart-noflip', action='store_true', help='do not mirror the key art (the nalati plate is already hero-right)')
    ap.add_argument('--version', default=None, help='e.g. 0.2.0: adds "v0.2.0 · <sha>" to the end card')
    ap.add_argument('--sha', default=None)
    ap.add_argument('--timelapse', default=None, help='mp4 whose last 3 s splice in before the end card (v2 cut), if it exists')
    a = ap.parse_args()
    global TIMELAPSE, KEYART, KEYART_FLIP
    TIMELAPSE = a.timelapse if a.timelapse and os.path.exists(a.timelapse) else None
    KEYART_FLIP = not a.keyart_noflip
    if a.keyart:
        KEYART = a.keyart if os.path.isabs(a.keyart) else os.path.join(ROOT, a.keyart)
    render(a)


if __name__ == '__main__':
    main()
