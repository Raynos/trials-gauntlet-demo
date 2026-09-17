"""Letterbox-crop each round-3 menu PNG to a JPG and build the labelled contact sheet
(round-2 B "Lobby" first, then B1–B3). Same recipe as menu round 2's sheet script."""
from PIL import Image, ImageDraw, ImageFont
import os

M = '/Users/raynos/projects/game-demos/trials-gauntlet-demo/assets/design/menu'
D = os.path.join(M, 'round3')
items = [('B  LOBBY  (round 2, the chosen direction)', os.path.join(M, 'round2', 'B-lobby.png')),
         ('B1  PLATE  (hard split, jump plate left, four stacked buttons right)', os.path.join(D, 'B1-plate.png')),
         ('B2  STRIP  (cinematic strip on top, four huge tiles across the bottom)', os.path.join(D, 'B2-strip.png')),
         ('B3  GLASS  (jump full-bleed, translucent slab of four pills right)', os.path.join(D, 'B3-glass.png'))]

def crop_letterbox(im, thr=18):
    """Crop rows that are (near) black across the full width — the generator's letterbox."""
    import numpy as np
    a = np.asarray(im.convert('L'))
    w, h = im.size
    rowmax = a.max(axis=1); rowmean = a.mean(axis=1)
    def dark(y):
        return rowmean[y] <= 6 and rowmax[y] <= 40
    top = 0
    while top < h // 3 and dark(top): top += 1
    bot = h
    while bot > 2 * h // 3 and dark(bot - 1): bot -= 1
    return im.crop((0, top, w, bot)), top, h - bot

report = []
for label, p in items:
    if not os.path.exists(p):
        print('missing', p); continue
    if p.startswith(D):
        im = Image.open(p).convert('RGB')
        c, t, b = crop_letterbox(im)
        jpg = p[:-4] + '.jpg'
        c.save(jpg, quality=90)
        report.append((os.path.basename(p), im.size, c.size, t, b, round(c.width / c.height, 2)))

W = 1200; H = int(W * 1024 / 1536); pad = 24; cap = 44; cols = 2
rows = (len(items) + cols - 1) // cols
sheet = Image.new('RGB', (cols * W + (cols + 1) * pad, rows * (H + cap) + (rows + 1) * pad), (18, 18, 20))
dr = ImageDraw.Draw(sheet)
try: font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 30)
except Exception: font = ImageFont.load_default()
for i, (label, p) in enumerate(items):
    if not os.path.exists(p): continue
    im = Image.open(p).convert('RGB')
    im, _, _ = crop_letterbox(im)
    r = im.width / im.height
    if r > W / H: nw, nh = W, int(W / r)
    else: nh, nw = H, int(H * r)
    im = im.resize((nw, nh), Image.LANCZOS)
    x = pad + (i % cols) * (W + pad); y = pad + (i // cols) * (H + cap + pad)
    dr.text((x, y + 6), label, fill=(255, 196, 64), font=font)
    tile = Image.new('RGB', (W, H), (0, 0, 0)); tile.paste(im, ((W - nw) // 2, (H - nh) // 2))
    sheet.paste(tile, (x, y + cap))
sheet.save(os.path.join(D, 'contact-sheet.jpg'), quality=86)
print('sheet', sheet.size)
for r in report: print(r)
