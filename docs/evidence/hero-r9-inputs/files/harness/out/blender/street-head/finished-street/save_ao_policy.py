import bpy,json,sys
from pathlib import Path
sys.path.insert(0,str(Path('assets/blender').resolve()))
import author_garments as G
import author_hood as H
root=Path('harness/out/blender/street-head/finished-street');source=root/'street-assembled-v2.blend';out=root/'street-assembled-v3.blend';assert not out.exists()
bpy.ops.wm.open_mainfile(filepath=str(source));sig=G.invariant_signature();meshes={o.name:H.mesh_signature(o) for o in bpy.data.objects if o.type=='MESH'}
bpy.context.scene['heroLocalAO']=json.dumps(dict(distance=.025,samples=32,strength=.8))
bpy.ops.wm.save_as_mainfile(filepath=str(out),compress=True)
assert sig==G.invariant_signature();assert meshes=={o.name:H.mesh_signature(o) for o in bpy.data.objects if o.type=='MESH'}
report={'source':str(source),'source_sha256':G.sha(source),'output':str(out),'output_sha256':G.sha(out),'only_change':'heroLocalAO scene JSON metadata','heroLocalAO':json.loads(bpy.context.scene['heroLocalAO']),'mesh_material_rig_action_socket_invariants_unchanged':True}
out.with_suffix('.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
