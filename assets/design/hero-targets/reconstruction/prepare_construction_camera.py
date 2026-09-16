"""Deterministic initial framing from a reviewed silhouette and a design stature.

This is not camera calibration, image-to-mesh reconstruction, or texture editing.
Run with Python >=3.10. Preserve the emitted agentFill/solved flags until an actual
rendered model overlay supplies separate evidence for a camera refinement.
"""
from pathlib import Path
import hashlib
import json
import math
import subprocess
import sys

ROOT = Path(__file__).resolve().parent
SKILL = Path.home() / '.codex/skills/img2threejs'
sys.path.insert(0, str(SKILL / 'forge/stage1_intake'))
from extract_pbr_evidence import load_image


def main():
    source = ROOT / 'turnaround-front.png'
    mask = ROOT / 'turnaround-front-reviewed-mask.png'
    width, height, _, _ = load_image(source)
    mw, mh, pixels, _ = load_image(mask)
    if (width, height) != (mw, mh):
        raise ValueError('Reviewed mask and construction reference dimensions differ')
    selected = []
    for i, pixel in enumerate(pixels):
        # Skill loader returns RGB tuples; no thresholded design-image interpretation here.
        rgb = pixel[:3]
        if tuple(rgb) not in ((0, 0, 0), (255, 255, 255)):
            raise ValueError('Reviewed silhouette must be a binary RGB mask')
        if rgb[0] == 255:
            selected.append((i % width, i // width))
    if not selected:
        raise ValueError('Empty reviewed silhouette')
    x0 = min(p[0] for p in selected); x1 = max(p[0] for p in selected) + 1
    y0 = min(p[1] for p in selected); y1 = max(p[1] for p in selected) + 1
    stature = 1.78  # Selected consumer scaffold, NOT measured from image.
    fov = 20.0  # Weak-perspective construction hypothesis, NOT solved focal length.
    units_per_pixel = stature / (y1 - y0)
    view_height = height * units_per_pixel
    distance = view_height / (2 * math.tan(math.radians(fov / 2)))
    cx = -(0.5 * (x0 + x1) - width / 2) * units_per_pixel
    cy = stature / 2 + (0.5 * (y0 + y1) - height / 2) * units_per_pixel
    out = ROOT / 'construction-camera-initial.json'
    subprocess.run([sys.executable, str(SKILL / 'forge/stage1_intake/solve_camera_pose.py'), str(source),
                    '--fov-degrees', str(fov), '--yaw', '0', '--pitch', '0', '--roll', '0',
                    '--distance', str(distance), '--height-offset', str(cy), '--out', str(out)], check=True, capture_output=True, text=True)
    camera = json.loads(out.read_text())['referenceCamera']
    camera['fovDegrees']['source'] = 'agent-construction-assumption'
    camera['fovDegrees']['agentFill'] = True
    camera['position']['distance']['source'] = 'agent-framing-derived-from-assumed-stature'
    camera['position']['distance']['agentFill'] = True
    camera['aspect']['value'] = width / height
    camera['solved'] = False
    camera['position']['hint'][0] = cx
    camera['position']['note'] = 'Front +Z camera, level -Z optical axis, metric scaffold grounded at y=0. X/Y framing comes from reviewed mask bounds plus assumed stature.'
    camera['constructionOnly'] = True
    camera['confidence'] = 0.35
    camera['limitations'].append('Mask framing only aligns an assumed 1.78m planar vertical extent; depth, lens and actual shape are unresolved until rendered overlay refinement.')
    out.write_text(json.dumps({'referenceCamera': camera}, indent=2) + '\n')
    sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
    views = []
    for angle, name in [(0, 'front'), (35, 'front-right'), (-35, 'front-left'), (90, 'right'), (180, 'back'), (270, 'left')]:
        rad = math.radians(angle)
        views.append({'id': name, 'azimuthDegrees': angle, 'position': [cx + distance * math.sin(rad), cy, distance * math.cos(rad)],
                      'target': [cx, cy, 0], 'fovDegrees': fov, 'aspect': width / height, 'near': 0.01, 'far': 100,
                      'viewport': {'width': width, 'height': height, 'deviceScaleFactor': 1},
                      'referenceOverlayApplicable': angle == 0})
    manifest = {'version': 1, 'status': 'initial-construction-framing-not-calibrated', 'solved': False,
                'finalIdentityReference': '../01-street-barehead.png', 'constructionReference': source.name,
                'sourceSha256': sha(source), 'mask': mask.name, 'maskSha256': sha(mask),
                'maskReview': 'front-mask-review.json', 'maskBoundingBoxExclusive': [x0, y0, x1, y1],
                'maskUse': 'silhouette geometry overlay only; not authorization to sample reference RGB as albedo',
                'designAssumptions': {'statureMetres': stature, 'statureSource': 'selected existing consumer scaffold, not measured likeness', 'fovDegrees': fov, 'projection': 'perspective weak-perspective hypothesis', 'worldForward': '+Z', 'worldUp': '+Y', 'characterLeft': '+X'},
                'framing': {'worldUnitsPerPixelAtZ0': units_per_pixel, 'verticalSpanAtZ0': view_height, 'distance': distance},
                'views': views, 'projection': {'enabled': False, 'readiness': 'projection-readiness.json'},
                'requiredNextEvidence': ['render procedural blockout front with this fixed camera; inspect overlay against reviewed mask',
                    'capture fixed ±35/90/180/270 degree views with identical camera distance/FOV and no per-view auto-framing',
                    'refine shape, pose and camera together against front/side/back construction refs; do not infer a true lens from silhouette bounds',
                    'later pose against target01 original gameplay identity and validate rig/socket compatibility',
                    'review accepted de-lit per-region imagery and calibrated overlay before enabling any projected albedo']}
    (ROOT / 'construction-camera.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(json.dumps({'bbox': manifest['maskBoundingBoxExclusive'], 'position': views[0]['position'], 'distance': distance, 'solved': False}))


if __name__ == '__main__':
    main()
