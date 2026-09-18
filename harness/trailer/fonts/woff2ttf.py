"""woff2 -> ttf for the trailer cards: Pillow's bundled FreeType has no brotli, so it cannot
read the game's shipped .woff2 faces directly. Writes .ttf next to a chosen out dir."""
import os
import sys

from fontTools.ttLib import TTFont

src, dst = sys.argv[1], sys.argv[2]
os.makedirs(dst, exist_ok=True)
for name in sorted(os.listdir(src)):
    if not name.endswith('.woff2'):
        continue
    f = TTFont(os.path.join(src, name))
    f.flavor = None
    out = os.path.join(dst, name[:-len('.woff2')] + '.ttf')
    f.save(out)
    print('wrote', out)
