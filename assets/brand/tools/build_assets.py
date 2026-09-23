#!/usr/bin/env python3
"""ROCKHOP raster kit (store release Phase 1 R2/R3, Brand/UI owner): icons, splash, key art, medals, OG + feature art.

    pnpm exec tsx assets/brand/tools/export.mts      # first: the wordmark / medal SVG masters from src/ui/brand.ts
    python3 assets/brand/tools/build_assets.py        # needs Pillow + numpy, rsvg-convert, cwebp

Sources (assets/brand/gen/, Codex image_gen runs from assets/brand/briefs/, recipe gen.sh):
  I1 (assets/design/store-release/round2/I1.png)  the app icon, taken as final (D23)
  IBG / IFG                                        its background (teal field, contours, sun) and foreground
                                                   (rider + triangle on chroma green) for the Android adaptive icon
  K-harbour / K-quarry                             home-screen key art plates, no UI (M1 / A-menu redrawn)
  R-<zone>                                         finish-line plates (credits, share art)
  MED                                              the four mountain medals on white (2 x 2)
  OG                                               the F1 feature art without its wordmark

Writes:
  assets/brand/icon-1024.png (RGB, no alpha), play-icon-512.png, adaptive-foreground.png / adaptive-background.png
  (1024, the foreground inside the 66 % safe circle), feature-graphic.png (1024 x 500), wordmark.png (export.mts)
  public/art/icons/*          PWA icons, apple-touch, favicons (SVG + PNG), maskable
  public/art/splash/*.png     the 28 iOS launch images (teal contour field + cream wordmark)
  public/art/og.jpg           1200 x 630 link card
  public/art/menu/keyart-{harbour,quarry}-{1920,960}.webp, results-{coast,alpine,quarry,snowline}.webp,
  medal-{bronze,silver,gold,obsidian}{,-512}.png
and folds the menu art into assets/art/manifest.json (then `node assets/art/runtime-manifest.mjs` for the runtime copy).
"""
import hashlib
import json
import os
import subprocess
import tempfile

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
BRAND = os.path.join(REPO, 'assets', 'brand')
GEN = os.path.join(BRAND, 'gen')
PUB = os.path.join(REPO, 'public', 'art')
TEAL = (15, 92, 99)
CREAM = (239, 227, 200)
VERMILION = (228, 87, 46)
INK = (29, 35, 38)

# iOS launch images: device pixel sizes, portrait (landscape = swapped). Keep in step with index.html.
SPLASH = [(750, 1334), (828, 1792), (1125, 2436), (1170, 2532), (1179, 2556), (1206, 2622), (1242, 2688), (1284, 2778),
          (1290, 2796), (1320, 2868), (1536, 2048), (1620, 2160), (1668, 2388), (2048, 2732)]


def g(name: str) -> str:
    return os.path.join(GEN, name)


def have(name: str) -> bool:
    return os.path.exists(g(name))


def rsvg(svg_path: str, width: int) -> Image.Image:
    with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as t:
        subprocess.run(['rsvg-convert', '-w', str(width), '-o', t.name, svg_path], check=True)
        im = Image.open(t.name).convert('RGBA')
        im.load()
    os.unlink(t.name)
    return im


def wordmark(width: int, color: str = 'cream') -> Image.Image:
    return rsvg(os.path.join(BRAND, 'rockhop-wordmark.svg' if color == 'teal' else f'rockhop-wordmark-{color}.svg'), width)


def save_png(im: Image.Image, path: str, alpha: bool = True) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    (im if alpha else im.convert('RGB')).save(path, optimize=True)
    if os.sep + 'public' + os.sep in path:
        shrink(path)


def shrink(path: str) -> None:
    """Shipped PNGs only (the assets/brand masters stay lossless): palette-quantise, then a lossless re-pack."""
    subprocess.run(['pngquant', '--force', '--skip-if-larger', '--quality', '72-95', '--speed', '1', '--ext', '.png', path], check=False)
    subprocess.run(['oxipng', '-q', '-o', '3', '--strip', 'safe', path], check=False)


def save_webp(im: Image.Image, path: str, q: int = 82) -> None:
    with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as t:
        im.convert('RGB').save(t.name)
        subprocess.run(['cwebp', '-quiet', '-q', str(q), '-m', '6', t.name, '-o', path], check=True)
    os.unlink(t.name)


# --- icons ------------------------------------------------------------------------------------------------------

def chroma_key(im: Image.Image) -> Image.Image:
    """Pure-green (#00FF00) background -> alpha, with a despill so the rider's edges carry no green fringe."""
    a = np.asarray(im.convert('RGB')).astype(np.float32)
    r, gch, b = a[..., 0], a[..., 1], a[..., 2]
    green = gch - np.maximum(r, b)  # how much greener than the other channels
    alpha = np.clip(1.0 - (green - 40) / 90, 0, 1)
    gch2 = np.minimum(gch, np.maximum(r, b) + 12)  # despill
    out = np.dstack([r, gch2, b, alpha * 255]).astype(np.uint8)
    img = Image.fromarray(out, 'RGBA')
    # clean the matte: a 1-px erode kills the last fringe
    a_ch = img.getchannel('A').filter(ImageFilter.MinFilter(3))
    img.putalpha(a_ch)
    return img


def icons() -> None:
    master = Image.open(os.path.join(REPO, 'assets/design/store-release/round2/I1.png')).convert('RGB').resize((1024, 1024), Image.LANCZOS)
    save_png(master, os.path.join(BRAND, 'icon-1024.png'), alpha=False)
    save_png(master, os.path.join(PUB, 'icons', 'icon-1024.png'), alpha=False)
    for size, name in [(512, 'icon-512.png'), (192, 'icon-192.png'), (180, 'apple-touch-icon.png'), (167, 'apple-touch-icon-167.png'),
                       (152, 'apple-touch-icon-152.png'), (32, 'favicon-32.png'), (16, 'favicon-16.png')]:
        save_png(master.resize((size, size), Image.LANCZOS), os.path.join(PUB, 'icons', name), alpha=False)
    save_png(master.resize((512, 512), Image.LANCZOS), os.path.join(BRAND, 'play-icon-512.png'), alpha=False)

    # Adaptive / maskable: the background layer full bleed, the foreground scaled into the safe circle.
    bg = Image.open(g('IBG.png')).convert('RGB').resize((1024, 1024), Image.LANCZOS) if have('IBG.png') else Image.new('RGB', (1024, 1024), TEAL)
    fg = chroma_key(Image.open(g('IFG.png')).resize((1024, 1024), Image.LANCZOS)) if have('IFG.png') else master.convert('RGBA')
    box = fg.getchannel('A').point(lambda v: 255 if v > 24 else 0).getbbox() or (0, 0, 1024, 1024)
    art = fg.crop(box)

    def placed(frac: float) -> Image.Image:
        """Foreground whose bbox diagonal fits a circle of `frac` x the canvas, centred (slightly low: the rider is top-heavy)."""
        w, h = art.size
        k = (1024 * frac) / (w * w + h * h) ** 0.5
        a2 = art.resize((max(1, round(w * k)), max(1, round(h * k))), Image.LANCZOS)
        layer = Image.new('RGBA', (1024, 1024), (0, 0, 0, 0))
        layer.alpha_composite(a2, ((1024 - a2.width) // 2, (1024 - a2.height) // 2 + 8))
        return layer

    fg_safe = placed(0.64)  # Android adaptive: 66 of 108 dp is the guaranteed-visible circle
    save_png(fg_safe, os.path.join(BRAND, 'adaptive-foreground.png'))
    save_png(bg, os.path.join(BRAND, 'adaptive-background.png'), alpha=False)
    mask = bg.convert('RGBA')
    mask.alpha_composite(placed(0.78))  # maskable PWA icon: the 80 % safe zone
    for size in (512, 192):
        save_png(mask.convert('RGB').resize((size, size), Image.LANCZOS), os.path.join(PUB, 'icons', f'icon-maskable-{size}.png'), alpha=False)
    emblem = master.resize((512, 512), Image.LANCZOS)
    save_png(emblem, os.path.join(PUB, 'icons', 'emblem-512.png'), alpha=False)
    # Vector favicon: the teal tile, the survey triangle, the sun. Crisp at 16 px where the illustration is mush.
    with open(os.path.join(PUB, 'icons', 'favicon.svg'), 'w') as fh:
        fh.write('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#0F5C63"/>'
                 '<circle cx="47" cy="17" r="7" fill="#EFE3C8"/><path d="M32 16L55 54H9z" fill="#E4572E"/><path d="M32 29.5L45 50H19z" fill="#EFE3C8"/></svg>\n')


# --- splash ------------------------------------------------------------------------------------------------------

CONTOUR_TILE = None


def contour_field(w: int, h: int) -> Image.Image:
    """Teal field with cream contour hairlines (the icon's motif), drawn procedurally so every size is crisp."""
    im = Image.new('RGB', (w, h), TEAL)
    d = ImageDraw.Draw(im, 'RGBA')
    s = min(w, h)
    lw = max(1, round(s / 700))
    n = 16
    for i in range(n):
        y0 = h * (i + 0.5) / n
        pts = []
        for k in range(0, 101):
            x = w * k / 100
            y = y0 + s * 0.035 * np.sin(k / 100 * 6.0 + i * 0.7) + s * 0.02 * np.sin(k / 100 * 13.0 + i * 1.9)
            pts.append((x, y))
        d.line(pts, fill=CREAM + (34,), width=lw)
    return im


def splash() -> None:
    out = os.path.join(PUB, 'splash')
    os.makedirs(out, exist_ok=True)
    for pw, ph in SPLASH:
        for w, h in ((pw, ph), (ph, pw)):
            im = contour_field(w, h)
            ww = round(min(w, h) * 0.62) if w < h else round(min(w * 0.5, h * 1.1))
            wm = wordmark(ww, 'cream')
            im.paste(wm, ((w - wm.width) // 2, (h - wm.height) // 2), wm)
            im.save(os.path.join(out, f'{w}x{h}.png'), optimize=True)
            shrink(os.path.join(out, f'{w}x{h}.png'))
    print('splash: 28 launch images')


# --- key art, results plates, medals ------------------------------------------------------------------------------

def plates() -> list[dict]:
    entries = []
    menu = os.path.join(PUB, 'menu')
    for src, zone in (('K-harbour.png', 'coast'), ('K-quarry.png', 'quarry')):
        if not have(src):
            print('skip', src)
            continue
        im = Image.open(g(src)).convert('RGB')
        name = 'harbour' if zone == 'coast' else 'quarry'
        for width, variant in ((1920, '2x'), (960, '1x')):
            r = im.resize((width, round(width * im.height / im.width)), Image.LANCZOS)
            p = os.path.join(menu, f'keyart-{name}-{width}.webp')
            save_webp(r, p, 84 if width == 1920 else 80)
            entries.append({'id': f'keyart-{name}-{width}', 'path': f'art/menu/keyart-{name}-{width}.webp', 'kind': 'keyart', 'biome': zone, 'variant': variant, 'w': r.width, 'h': r.height, 'src': f'brand/{src}', 'prompt': f'assets/brand/briefs/{src[:-4]}.md'})
    for zone in ('coast', 'alpine', 'quarry', 'snowline'):
        src = f'R-{zone}.png'
        if not have(src):
            continue
        im = Image.open(g(src)).convert('RGB').resize((1536, 1024), Image.LANCZOS)
        p = os.path.join(menu, f'results-{zone}.webp')
        save_webp(im, p, 80)
        entries.append({'id': f'results-{zone}', 'path': f'art/menu/results-{zone}.webp', 'kind': 'results-bg', 'biome': zone, 'w': 1536, 'h': 1024, 'src': f'brand/{src}', 'prompt': 'assets/brand/briefs/R-common.md'})
    return entries


def medals() -> list[dict]:
    """Circle-crop the four medals out of the 2 x 2 MED sheet (flat white ground), alpha outside the rim."""
    entries = []
    if not have('MED.png'):
        print('skip medals (no MED.png): the SVG badges (src/ui/brand.ts medalSvg) stand in')
        return entries
    sheet = Image.open(g('MED.png')).convert('RGB').resize((1024, 1024), Image.LANCZOS)
    a = np.asarray(sheet).astype(np.int16)
    for (qx, qy), medal, name in (((0, 0), 'bronze', 'bronze'), ((1, 0), 'silver', 'silver'), ((0, 1), 'gold', 'gold'), ((1, 1), 'platinum', 'obsidian')):
        q = a[qy * 512:(qy + 1) * 512, qx * 512:(qx + 1) * 512]
        yy, xx = np.mgrid[0:512, 0:512]
        # ink near this quadrant's centre only: the neighbouring medal's rim can reach into the quadrant's edge
        ink = (np.abs(q - 255).sum(axis=2) > 60) & ((xx - 256) ** 2 + (yy - 256) ** 2 < 246 ** 2)
        ys, xs = np.nonzero(ink)
        cx, cy = (xs.min() + xs.max()) / 2, (ys.min() + ys.max()) / 2
        rad = max(xs.max() - xs.min(), ys.max() - ys.min()) / 2
        crop = sheet.crop((qx * 512 + cx - rad, qy * 512 + cy - rad, qx * 512 + cx + rad, qy * 512 + cy + rad)).resize((512, 512), Image.LANCZOS).convert('RGBA')
        m = Image.new('L', (2048, 2048), 0)
        ImageDraw.Draw(m).ellipse((44, 44, 2004, 2004), fill=255)  # 2 % inside the detected rim: no white halo
        crop.putalpha(m.resize((512, 512), Image.LANCZOS))
        for size, variant, suffix in ((512, '2x', '-512'), (256, '1x', '')):
            p = os.path.join(PUB, 'menu', f'medal-{name}{suffix}.png')
            save_png(crop.resize((size, size), Image.LANCZOS), p)
            entries.append({'id': f'medal-{name}{suffix}', 'path': f'art/menu/medal-{name}{suffix}.png', 'kind': 'medal', 'medal': medal, 'variant': variant, 'w': size, 'h': size, 'src': 'brand/MED.png', 'prompt': 'assets/brand/briefs/MED.md'})
    return entries


# --- OG + feature graphic ------------------------------------------------------------------------------------------

def cover(im: Image.Image, w: int, h: int, fx: float = 0.5, fy: float = 0.5) -> Image.Image:
    k = max(w / im.width, h / im.height)
    r = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
    x = round((r.width - w) * fx)
    y = round((r.height - h) * fy)
    return r.crop((x, y, x + w, y + h))


def banner(w: int, h: int) -> Image.Image:
    src = Image.open(g('OG.png') if have('OG.png') else os.path.join(REPO, 'assets/design/store-release/round2/F1.png')).convert('RGB')
    im = cover(src, w, h, 0.5, 0.45).convert('RGBA')
    # a soft dark wash behind the wordmark (right half) so cream reads on the forest
    shade = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shade)
    for i in range(w // 2):
        a = int(110 * (i / (w / 2)) ** 1.4)
        sd.line([(w // 2 + i, 0), (w // 2 + i, h)], fill=(10, 20, 22, a))
    im.alpha_composite(shade.filter(ImageFilter.GaussianBlur(h / 12)))
    wm = wordmark(round(w * 0.44), 'cream')
    at = (round(w * 0.53), round(h * 0.5 - wm.height * 0.62))
    drop = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    ink = Image.new('RGBA', wm.size, (8, 16, 18, 200))
    ink.putalpha(wm.getchannel('A').point(lambda v: v * 200 // 255))
    drop.alpha_composite(ink, (at[0], at[1] + max(2, h // 120)))
    im.alpha_composite(drop.filter(ImageFilter.GaussianBlur(max(2, h // 90))))
    im.alpha_composite(wm, at)
    return im.convert('RGB')


def og() -> None:
    banner(1200, 630).save(os.path.join(PUB, 'og.jpg'), quality=86, optimize=True, progressive=True)
    banner(1024, 500).save(os.path.join(BRAND, 'feature-graphic.png'), optimize=True)


# --- manifest ------------------------------------------------------------------------------------------------------

def fold_manifest(new: list[dict]) -> None:
    path = os.path.join(REPO, 'assets', 'art', 'manifest.json')
    full = json.load(open(path))
    ids = {e['id'] for e in new}
    kinds_replaced = {'medal'} if any(e['kind'] == 'medal' for e in new) else set()
    kept = [a for a in full['assets'] if a['id'] not in ids and a['kind'] not in kinds_replaced]
    for e in new:
        f = os.path.join(REPO, 'public', e['path'])
        e['bytes'] = os.path.getsize(f)
        e['v'] = hashlib.sha256(open(f, 'rb').read()).hexdigest()[:8]
    full['assets'] = kept + new
    json.dump(full, open(path, 'w'), indent=1)
    print(f'art manifest: {len(new)} brand entries folded in ({len(full["assets"])} assets)')


if __name__ == '__main__':
    icons()
    splash()
    og()
    entries = plates() + medals()
    fold_manifest(entries)
    for old in ('medal-platinum-512.png', 'medal-platinum.png'):
        p = os.path.join(PUB, 'menu', old)
        if have('MED.png') and os.path.exists(p):
            os.replace(p, os.path.join(tempfile.gettempdir(), old))  # the obsidian files replace them
    print('done')
