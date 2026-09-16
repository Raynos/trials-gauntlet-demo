"""Analytical silhouette annotation, not an edited design reference.

The official foreground heuristic includes the floor shadow and misses pale
laces/soles. Below y=874, use manually observed shoe outlines in the admitted
495x980 front crop. Keep the original heuristic mask as audit evidence.
"""
from pathlib import Path
import json
import sys

sys.path.insert(0, str(Path.home() / '.agents/skills/img2threejs/forge/stage1_intake'))
from extract_pbr_evidence import load_image, build_foreground_mask, write_png_rgb

ROOT = Path(__file__).resolve().parent
SHOES = [
    [(115,870),(174,870),(168,934),(155,942),(153,950),(119,952),
     (92,949),(91,935),(99,918),(110,899)],
    [(308,870),(367,870),(369,899),(381,920),(392,934),(394,949),
     (374,954),(343,954),(331,950),(329,943),(315,938)],
]

def inside(x, y, polygon):
    result = False
    for a, b in zip(polygon, polygon[1:] + polygon[:1]):
        if (a[1] > y) != (b[1] > y):
            if x < (b[0]-a[0]) * (y-a[1]) / (b[1]-a[1]) + a[0]:
                result = not result
    return result

width, height, pixels, _ = load_image(ROOT / 'turnaround-front.png')
assert (width, height) == (495, 980), 'Annotation coordinates require original crop'
mask, stats, warnings = build_foreground_mask(width, height, pixels)
mask = list(mask)
changed = 0
for y in range(874, height):
    for x in range(width):
        value = any(inside(x + .5, y + .5, p) for p in SHOES)
        index = y * width + x
        changed += bool(mask[index]) != value
        mask[index] = value
write_png_rgb(ROOT / 'turnaround-front-reviewed-mask.png', width, height,
              bytes(c for value in mask for c in ([255]*3 if value else [0]*3)))
(ROOT / 'front-mask-review.json').write_text(json.dumps({
    'source': 'turnaround-front.png', 'originalMask': 'turnaround-front-mask.png',
    'method': 'official heuristic above y874; parent-annotated shoe polygons below',
    'shoePolygonsPixels': SHOES, 'changedPixels': changed,
    'originalStats': stats, 'warnings': warnings,
    'limitation': 'Hand annotation at source resolution; hair fringe and contour uncertainty remain. Not ground-truth geometry.',
}, indent=2) + '\n')
