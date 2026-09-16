"""Fixed-camera silhouette diagnostic only; never visual acceptance."""
import hashlib
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path.home() / '.agents/skills/img2threejs/forge/stage1_intake'))
from extract_pbr_evidence import load_image, write_png_rgb

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parents[3]
reference = ROOT / 'turnaround-front-reviewed-mask.png'
render = REPO / 'harness/out/blender/img2-preview/matte-blockout-06/front-matte.png'
out = REPO / 'docs/evidence/hero-r12-reconstruction'
out.mkdir(parents=True, exist_ok=True)
rw, rh, rp, _ = load_image(reference)
w, h, pixels, _ = load_image(render)
assert (w, h) == (rw, rh)
a = [p[0] >= 128 for p in rp]
b = [p[0] >= 128 for p in pixels]
def region(start, end):
    pairs = list(zip(a[start*w:end*w], b[start*w:end*w]))
    union = sum(x or y for x, y in pairs)
    return {'iou': sum(x and y for x, y in pairs) / union,
            'referencePixels': sum(x for x, y in pairs),
            'renderPixels': sum(y for x, y in pairs),
            'missingPixels': sum(x and not y for x, y in pairs),
            'excessPixels': sum(y and not x for x, y in pairs)}
report = {'method': 'Threshold128, original fixed camera and full resolution; no alignment/warping',
          'limitation': 'Reference is a reviewed heuristic mask with annotated shoes. Diagnostic of projected envelope only; not likeness, anatomy, materials, or rig acceptance.',
          'referenceSha256': hashlib.sha256(reference.read_bytes()).hexdigest(),
          'renderSha256': hashlib.sha256(render.read_bytes()).hexdigest(),
          'size': [w,h], 'whole': region(0,h),
          'regions': {name: region(lo, hi) for name,lo,hi in
                      [('head',0,170),('torso-arms',170,455),('waist-hands',455,555),('legs',555,880),('shoes',880,h)]}}
write_png_rgb(out / 'front-matte-difference.png', w,h,
              bytes(c for x,y in zip(a,b) for c in
                    ((225,225,225) if x and y else (230,60,75) if x else (40,145,250) if y else (20,20,20))))
(out / 'front-matte-diagnostic.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report))
