"""Letterbox-crop each round-2 menu PNG to a JPG and build the labelled contact sheet
(the current menu + the five directions). Same recipe as tracks round 3's sheet script."""
from PIL import Image, ImageDraw, ImageFont
import os

D = '/Users/raynos/projects/game-demos/trials-gauntlet-demo/assets/design/menu/round2'
items = [('CURRENT  (B Broadcast as built, 932x430, build 4d2e762)', os.path.join(D, 'current-932x430.png')),
         ('A  BAY  (the garage bay is the menu, tags on the rail, one PLAY slab)', os.path.join(D, 'A-bay.png')),
         ('B  LOBBY  (hero at the start gate left, run sheet + PLAY right)', os.path.join(D, 'B-lobby.png')),
         ('C  PIT WALL  (everything pinned to the garage wall, PLAY is a pit board)', os.path.join(D, 'C-pit-wall.png')),
         ('D  WORLD  (the bay is a diorama tile beside the tracks, actions as places)', os.path.join(D, 'D-world.png')),
         ('E  TITLE CARD  (hero huge, one full-width PLAY, four small pills)', os.path.join(D, 'E-title-card.png'))]

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
    if os.path.basename(p)[0] in 'ABCDE' and not os.path.basename(p).startswith('current'):
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
