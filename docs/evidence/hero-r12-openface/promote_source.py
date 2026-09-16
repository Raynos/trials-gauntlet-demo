"""Metadata-only promotion of the played R12 candidate; run from repository root in Blender."""
import bpy, sys, json, hashlib
from pathlib import Path
sys.path.insert(0, str(Path('assets/blender').resolve()))
import author_hood as H
import author_garments as G
source = Path('harness/out/blender/openface-r12/source/rider-openface.blend')
target = Path('assets/blender/source/rider-openface.blend')
bpy.ops.wm.open_mainfile(filepath=str(source.resolve()))
def signature():
    value = G.invariant_signature()
    value['actions'] = [(a.name, [(f.data_path, f.array_index, [(list(k.co), k.interpolation) for k in f.keyframe_points])
        for layer in a.layers for strip in layer.strips for slot in a.slots
        for f in strip.channelbag(slot).fcurves]) for a in bpy.data.actions]
    return json.dumps(value, default=list, sort_keys=True)
before = signature()
meshes = {o.name: H.mesh_signature(o) for o in bpy.data.objects if o.type == 'MESH'}
bpy.context.scene['heroOutfit'] = 'openface'
bpy.context.scene['heroDesign'] = 'street-openface; fixed rider_pro charcoal palette'
bpy.ops.wm.save_as_mainfile(filepath=str(target.resolve()), compress=True)
bpy.ops.wm.open_mainfile(filepath=str(target.resolve()))
assert before == signature()
assert meshes == {o.name: H.mesh_signature(o) for o in bpy.data.objects if o.type == 'MESH'}
Path('docs/evidence/hero-r12-openface/source-promotion.json').write_text(json.dumps({
    'input': str(source), 'inputSha256': G.sha(source), 'output': str(target),
    'outputSha256': G.sha(target), 'onlyChanges': ['scene.heroOutfit', 'scene.heroDesign'],
    'meshWeightsMaterialsRigActionsSocketsParity': True,
}, indent=2)+'\n')
