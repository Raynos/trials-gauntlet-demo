#!/usr/bin/env python3
"""
PIL text burner for the build timelapse (this ffmpeg has no drawtext).

  overlay.py caption --out f.png --width 1280 --height 720 --index 12 --total 44 \
      --sha 4eb0b12 --date "2026-09-14 01:16" --subject "Physics: ..."
      -> transparent RGBA: bottom caption bar + top-left counter pill.
  overlay.py card --out f.png --title "TRIALS GAUNTLET" --lines "build timelapse" "44 commits" ...
      -> opaque 1280x720 title card.
  overlay.py stills --manifest m.json --out progress-stills.mp4
      -> the whole stills timelapse: intro card, one still per commit with caption,
         1.2 s each with a 0.3 s crossfade, final frame held, outro card; frames are
         piped raw to ffmpeg (h264 crf 20, 30 fps). Manifest shape is documented in
         render.mts (writeStillsManifest).
"""
import argparse
import json
import os
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFont

FONT_DIRS = ["/System/Library/Fonts/Supplemental", "/System/Library/Fonts", "/Library/Fonts"]
FONT_SANS_BOLD = ["Arial Bold.ttf", "Helvetica.ttc", "SFNS.ttf", "DejaVuSans-Bold.ttf"]
FONT_SANS = ["Arial.ttf", "Helvetica.ttc", "SFNS.ttf", "DejaVuSans.ttf"]
FONT_MONO = ["Menlo.ttc", "SFNSMono.ttf", "Monaco.ttf", "DejaVuSansMono.ttf"]

BG = (14, 17, 24)
ACCENT = (255, 138, 0)  # trials orange
FG = (240, 240, 236)
DIM = (168, 172, 180)


def find_font(names, size):
    for n in names:
        for d in FONT_DIRS:
            p = os.path.join(d, n)
            if os.path.exists(p):
                try:
                    return ImageFont.truetype(p, size)
                except OSError:
                    continue
    return ImageFont.load_default()


def text_w(draw, s, font):
    l, t, r, b = draw.textbbox((0, 0), s, font=font)
    return r - l


def fit(draw, s, font, max_w):
    if text_w(draw, s, font) <= max_w:
        return s
    while s and text_w(draw, s + "…", font) > max_w:
        s = s[:-1]
    return s.rstrip() + "…"


def caption_layer(width, height, index, total, sha, date, subject):
    img = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    bar_h = 64
    y0 = height - bar_h
    # bar: translucent black with an orange rule on top
    d.rectangle([0, y0, width, height], fill=(0, 0, 0, 176))
    d.rectangle([0, y0, width, y0 + 3], fill=ACCENT + (255,))
    f_mono = find_font(FONT_MONO, 20)
    f_sub = find_font(FONT_SANS, 22)
    f_idx = find_font(FONT_SANS_BOLD, 22)
    x = 20
    cy = y0 + bar_h // 2
    # "#NN"
    s = f"#{index:02d}"
    d.text((x, cy), s, font=f_idx, fill=ACCENT + (255,), anchor="lm")
    x += text_w(d, s, f_idx) + 14
    d.text((x, cy), "·", font=f_sub, fill=DIM + (255,), anchor="lm")
    x += 16
    d.text((x, cy), sha, font=f_mono, fill=FG + (255,), anchor="lm")
    x += text_w(d, sha, f_mono) + 14
    d.text((x, cy), "·", font=f_sub, fill=DIM + (255,), anchor="lm")
    x += 16
    d.text((x, cy), date, font=f_mono, fill=DIM + (255,), anchor="lm")
    x += text_w(d, date, f_mono) + 14
    d.text((x, cy), "·", font=f_sub, fill=DIM + (255,), anchor="lm")
    x += 16
    subj = fit(d, subject, f_sub, width - x - 20)
    d.text((x, cy), subj, font=f_sub, fill=FG + (255,), anchor="lm")
    # counter pill, top-left
    f_pill = find_font(FONT_SANS_BOLD, 18)
    label = f"{index} / {total}"
    pw = text_w(d, label, f_pill) + 24
    # sits under the game's own top-left track plate (both the scaffold label and the later HUD)
    py = 68
    d.rounded_rectangle([16, py, 16 + pw, py + 30], radius=8, fill=(0, 0, 0, 150), outline=ACCENT + (200,), width=1)
    d.text((16 + pw / 2, py + 15), label, font=f_pill, fill=FG + (255,), anchor="mm")
    return img


def card(width, height, title, lines, footer=None):
    img = Image.new("RGB", (width, height), BG)
    d = ImageDraw.Draw(img)
    # subtle diagonal stripe field, like a track deck
    for i in range(-height, width, 48):
        d.line([(i, height), (i + height, 0)], fill=(20, 24, 33), width=10)
    f_title = find_font(FONT_SANS_BOLD, 64)
    f_line = find_font(FONT_SANS, 30)
    f_foot = find_font(FONT_MONO, 20)
    total_h = 80 + len(lines) * 44
    y = (height - total_h) // 2
    d.rectangle([width // 2 - 60, y - 24, width // 2 + 60, y - 18], fill=ACCENT)
    d.text((width / 2, y + 30), title, font=f_title, fill=FG, anchor="mm")
    y += 96
    for ln in lines:
        d.text((width / 2, y), ln, font=f_line, fill=DIM, anchor="mm")
        y += 44
    if footer:
        d.text((width / 2, height - 40), footer, font=f_foot, fill=(110, 114, 122), anchor="mm")
    return img


def load_still(path, width, height):
    try:
        im = Image.open(path).convert("RGB")
    except Exception:
        im = Image.new("RGB", (width, height), (40, 10, 10))
        d = ImageDraw.Draw(im)
        d.text((width / 2, height / 2), "capture failed", font=find_font(FONT_SANS_BOLD, 40), fill=FG, anchor="mm")
    if im.size != (width, height):
        im = im.resize((width, height), Image.LANCZOS)
    return im


def render_stills(manifest_path, out_path):
    m = json.load(open(manifest_path))
    W, H = int(m.get("width", 1280)), int(m.get("height", 720))
    fps = int(m.get("fps", 30))
    hold = float(m.get("holdSeconds", 1.2))
    xf = float(m.get("crossfadeSeconds", 0.3))
    intro_s = float(m.get("introSeconds", 2.5))
    outro_s = float(m.get("outroSeconds", 3.0))
    last_hold_s = float(m.get("lastHoldSeconds", 3.0))
    ffmpeg = m.get("ffmpeg", "/opt/homebrew/bin/ffmpeg")
    commits = m["commits"]
    # counter shows the position in the whole history, not among captured builds
    total = int(m.get("total", len(commits)))

    hold_f = max(1, round(hold * fps))
    xf_f = min(hold_f - 1, max(0, round(xf * fps)))
    intro_f = round(intro_s * fps)
    outro_f = round(outro_s * fps)
    last_hold_f = round(last_hold_s * fps)

    intro = card(W, H, m["intro"]["title"], m["intro"]["lines"], m["intro"].get("footer"))
    outro = card(W, H, m["outro"]["title"], m["outro"]["lines"], m["outro"].get("footer"))

    proc = subprocess.Popen(
        [
            ffmpeg, "-hide_banner", "-loglevel", "error", "-y",
            "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(fps), "-i", "-",
            "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
            out_path,
        ],
        stdin=subprocess.PIPE,
    )
    out = proc.stdin
    frames = 0

    def emit(img, n=1):
        nonlocal frames
        b = img.tobytes()
        for _ in range(n):
            out.write(b)
        frames += 1 * n

    def blend(a, b, t):
        return Image.blend(a, b, t)

    # intro: fade from black, hold, then crossfade into the first still
    black = Image.new("RGB", (W, H), (0, 0, 0))
    fade_f = min(intro_f // 3, 12)
    for i in range(fade_f):
        emit(blend(black, intro, (i + 1) / fade_f))
    emit(intro, max(0, intro_f - fade_f - xf_f))

    composed = []
    for i, c in enumerate(commits):
        still = load_still(c["still"], W, H)
        cap = caption_layer(W, H, c["index"], total, c["sha"], c["date"], c["subject"])
        still.paste(cap, (0, 0), cap)
        composed.append(still)

    prev = intro
    for i, img in enumerate(composed):
        # crossfade from prev into this one
        for k in range(xf_f):
            emit(blend(prev, img, (k + 1) / (xf_f + 1)))
        # hold (minus the crossfade that leads into the next)
        emit(img, hold_f - xf_f)
        prev = img
        sys.stderr.write(f"\rstills: {i + 1}/{len(composed)} composed, {frames} frames")
    sys.stderr.write("\n")
    # final frame held, then crossfade to outro, outro held, fade to black
    emit(prev, last_hold_f)
    for k in range(xf_f):
        emit(blend(prev, outro, (k + 1) / (xf_f + 1)))
    emit(outro, max(0, outro_f - xf_f - fade_f))
    for i in range(fade_f):
        emit(blend(outro, black, (i + 1) / fade_f))
    out.close()
    code = proc.wait()
    if code != 0:
        raise SystemExit(f"ffmpeg exited {code}")
    print(json.dumps({"frames": frames, "seconds": frames / fps, "fps": fps}))


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("caption")
    a.add_argument("--out", required=True)
    a.add_argument("--width", type=int, default=1280)
    a.add_argument("--height", type=int, default=720)
    a.add_argument("--index", type=int, required=True)
    a.add_argument("--total", type=int, required=True)
    a.add_argument("--sha", required=True)
    a.add_argument("--date", required=True)
    a.add_argument("--subject", required=True)
    b = sub.add_parser("card")
    b.add_argument("--out", required=True)
    b.add_argument("--width", type=int, default=1280)
    b.add_argument("--height", type=int, default=720)
    b.add_argument("--title", required=True)
    b.add_argument("--lines", nargs="*", default=[])
    b.add_argument("--footer")
    c = sub.add_parser("stills")
    c.add_argument("--manifest", required=True)
    c.add_argument("--out", required=True)
    args = ap.parse_args()
    if args.cmd == "caption":
        caption_layer(args.width, args.height, args.index, args.total, args.sha, args.date, args.subject).save(args.out)
    elif args.cmd == "card":
        card(args.width, args.height, args.title, args.lines, args.footer).save(args.out)
    elif args.cmd == "stills":
        render_stills(args.manifest, args.out)


if __name__ == "__main__":
    main()
