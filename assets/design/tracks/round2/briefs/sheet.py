"""Letterbox-crop each round-2 PNG to a JPG and build the labelled contact sheet
(round-1 A + the five new). Same recipe as round 1's sheet script."""
from PIL import Image, ImageDraw, ImageFont
import os, sys
R1 = '/Users/raynos/projects/game-demos/trials-gauntlet-demo/assets/design/tracks'
D = os.path.join(R1, 'round2')
items = [('A  BIOME MAP  (round 1, the chosen direction)', os.path.join(R1, 'A-biome-map.png')),
         ('A1  ONE CONTINUOUS MAP  (regions, roads + gates)', os.path.join(D, 'A1-continuous-map.png')),
         ('A2  TABBED ATLAS  (one biome per page, mini-map strip)', os.path.join(D, 'A2-tabbed-atlas.png')),
         ('A3  ISOMETRIC DIORAMA  (raised tiles, proving-ground island)', os.path.join(D, 'A3-isometric-diorama.png')),
         ('AD  MAP + MEDAL SHELF  (A + D)', os.path.join(D, 'AD-map-medal-shelf.png')),
         ('AE  MAP + PROGRESSION ROAD  (A + E)', os.path.join(D, 'AE-map-road.png'))]

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
