"""Letterbox-crop each worldmap mockup PNG to a JPG and build the labelled contact sheet:
the rejected live far view (round 5), then A / B / C at the region zoom and at the whole-world zoom,
then the three kept extra runs. Same recipe as round 4's sheet.py."""
from PIL import Image, ImageDraw, ImageFont
import os
D = '/Users/raynos/projects/game-demos/trials-gauntlet-demo/assets/design/worldmap'
REJ = '/Users/raynos/projects/game-demos/trials-gauntlet-demo/docs/evidence/level-select/round5/far-chromium-932x430.jpg'
items = [('REJECTED  (live today, round 5 far view — the diorama tiles chained on one page)', REJ),
         ('A  PAINTED TERRAIN — region zoom  (tilted 3-D painterly land, beacon, leader lines)', os.path.join(D, 'A-painted-region.png')),
         ('A  PAINTED TERRAIN — whole world', os.path.join(D, 'A-painted-world.png')),
         ('B  CARTOGRAPHER\'S SHEET — region zoom  (top-down illustrated sheet, cartouches, seals)', os.path.join(D, 'B-sheet-region.png')),
         ('B  CARTOGRAPHER\'S SHEET — whole world  (run 1, 1.86:1; run 2 below)', os.path.join(D, 'B-sheet-world.png')),
         ('C  SATELLITE NODES — region zoom  (painted aerial, node network, info panel)', os.path.join(D, 'C-nodes-region.png')),
         ('C  SATELLITE NODES — whole world', os.path.join(D, 'C-nodes-world.png')),
         ('B  whole world, run 2  (retry: 2.79:1 ultra-wide canvas — kept for the drawing)', os.path.join(D, 'B-sheet-world-run2-wide.png')),
         ('C  region, run 1  (1.77:1, kept)', os.path.join(D, 'C-nodes-region-run1-tall.png')),
         ('C  whole world, run 1  (1.69:1, grey letterbox, kept)', os.path.join(D, 'C-nodes-world-run1-tall.png'))]

def crop_letterbox(im, thr=18):
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
    if p.endswith('.png'):
        im = Image.open(p).convert('RGB')
        c, t, b = crop_letterbox(im)
        jpg = p[:-4] + '.jpg'
        c.save(jpg, quality=90)
        report.append((os.path.basename(p), im.size, c.size, t, b, round(c.width / c.height, 2)))

W = 1200; H = int(W * 430 / 932); pad = 24; cap = 44; cols = 2
rows = (len(items) + cols - 1) // cols
sheet = Image.new('RGB', (cols * W + (cols + 1) * pad, rows * (H + cap) + (rows + 1) * pad), (18, 18, 20))
dr = ImageDraw.Draw(sheet)
try: font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 28)
except Exception: font = ImageFont.load_default()
for i, (label, p) in enumerate(items):
    if not os.path.exists(p): continue
    im = Image.open(p).convert('RGB')
    if p.endswith('.png'): im, _, _ = crop_letterbox(im)
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
