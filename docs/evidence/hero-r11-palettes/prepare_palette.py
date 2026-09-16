"""Palette-only review candidate. Geometry, weights, rig, actions and sockets remain intact."""
import bpy, json, hashlib, sys
from pathlib import Path
sys.path.insert(0, str(Path('assets/blender').resolve()))
import author_garments as G
import author_hood as H

ROOT = Path('harness/out/blender/five-presets-palettes')
ROOT.mkdir(parents=True, exist_ok=True)
reports = {}
for outfit in ('street', 'race'):
    source = ROOT/'originals/assets/blender/source/rider-street.blend' if outfit == 'street' else Path('assets/blender/source/rider-race.blend')
    bpy.ops.wm.open_mainfile(filepath=str(source.resolve()))
    before = G.invariant_signature()
    mesh_signatures = {o.name: H.mesh_signature(o) for o in bpy.data.objects if o.type == 'MESH'}
    palette = json.loads(bpy.context.scene['heroColourways'])
    reports[outfit] = {'source': str(source), 'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(), 'originalColourways': palette}
    if outfit == 'street':
        # Linear scene RGB: neutral warm charcoal, not the previous green/teal dye.
        # Target04 shows a dark neutral cotton hoodie; retain the photographed fabric graph.
        changed = json.loads(json.dumps(palette))
        changed['pro']['JA'] = [.045, .043, .041]
        changed['pro']['JB'] = [.045, .043, .041]
        bpy.context.scene['heroColourways'] = json.dumps(changed)
        bpy.context.scene['heroPaletteReview'] = json.dumps({'reference': 'assets/design/hero-targets/04-street-pro-gameplay.png', 'change': 'pro JA/JB teal to neutral warm charcoal', 'status': 'source-backed candidate; parent played review pending'})
        out = ROOT / 'source/rider-street.blend'
        out.parent.mkdir(parents=True, exist_ok=True)
        assert before == G.invariant_signature()
        assert mesh_signatures == {o.name: H.mesh_signature(o) for o in bpy.data.objects if o.type == 'MESH'}
        bpy.ops.wm.save_as_mainfile(filepath=str(out.resolve()), compress=True)
        reports[outfit].update(candidate=str(out), candidateSha256=hashlib.sha256(out.read_bytes()).hexdigest(), changedColourways=changed, meshRigActionSocketMaterialGraphParity=True)
    else:
        reports[outfit]['decision'] = 'No palette change pending actual appearance audit: saved pro RACE_JERSEY_MAIN/JA neutral charcoal; PANEL/JB yellow. Target05 has charcoal cloth with yellow panels.'
(ROOT / 'source-palette-report.json').write_text(json.dumps(reports, indent=2)+'\n')
