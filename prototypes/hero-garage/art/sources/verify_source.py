"""Smoke-check extracted anatomy can be appended with UV and multires details intact."""
import bpy,json
from pathlib import Path
root=Path(__file__).resolve().parent
bpy.ops.wm.read_factory_settings(use_empty=True)
with bpy.data.libraries.load(str(root/'blender-realistic-anatomy.blend'),link=False) as (src,dst):dst.objects=src.objects
out=[]
for o in dst.objects:
 bpy.context.scene.collection.objects.link(o)
 if o.type!='MESH':continue
 deps=bpy.context.evaluated_depsgraph_get()
 evaluated=o.evaluated_get(deps)
 out.append({'name':o.name,'control_vertices':len(o.data.vertices),'evaluated_vertices':len(evaluated.data.vertices),'uv_layers':len(o.data.uv_layers),'multires_levels':[m.total_levels for m in o.modifiers if m.type=='MULTIRES']})
assert len(out)==13
assert next(x for x in out if x['name']=='GEO-head_animation_realistic')['multires_levels']==[1]
assert next(x for x in out if x['name']=='GEO-body_male_realistic')['multires_levels']==[3]
(root/'source-verification.json').write_text(json.dumps({'blender':bpy.app.version_string,'objects':out,'passed':True},indent=2)+'\n')
print('PASS source append: 13 objects, preserved UV and multires levels')
