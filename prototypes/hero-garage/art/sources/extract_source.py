"""Extract unmodified realistic anatomy from official Blender Human Base Meshes v1.4.1."""
import bpy,json,hashlib
from pathlib import Path
root=Path(__file__).resolve().parent
source=root/'raw/human-base-meshes-bundle-v1.4.1/human_base_meshes_bundle.blend'
bpy.ops.wm.open_mainfile(filepath=str(source))
prefixes=('GEO-head_animation_realistic','GEO-head_sculpting_realistic','GEO-body_male_realistic')
selected=[o for o in bpy.data.objects if o.name.startswith(prefixes)]
report=[]
for o in selected:
 m=o.data
 record={'name':o.name,'vertices':len(m.vertices),'faces':len(m.polygons),'triangles':sum(len(p.vertices)-2 for p in m.polygons),'quads':sum(len(p.vertices)==4 for p in m.polygons),'uv_layers':[u.name for u in m.uv_layers],'uv_bounds':[[min(d.uv[i] for d in m.uv_layers.active.data),max(d.uv[i] for d in m.uv_layers.active.data)] for i in range(2)] if m.uv_layers.active else None,'location':list(o.location),'rotation_euler':list(o.rotation_euler),'scale':list(o.scale),'modifiers':[{'name':m.name,'type':m.type,'levels':getattr(m,'levels',None),'total_levels':getattr(m,'total_levels',None)} for m in o.modifiers]}
 report.append(record)
 for mod in o.modifiers:
  if mod.type=='MULTIRES':mod.levels=min(1,mod.total_levels);mod.sculpt_levels=mod.total_levels;mod.render_levels=min(2,mod.total_levels)
 o.parent=None
 o.hide_viewport=False;o.hide_render=False;o.hide_set(False)
 o['source_bundle']='Blender Human Base Meshes v1.4.1'
 o['source_url']='https://download.blender.org/demo/asset-bundles/human-base-meshes/human-base-meshes-bundle-v1.4.1.zip'
 o['source_license']='CC0 — source bundle README and official listing'
# Write only selected objects and dependency data, preserving multires source details and eye transforms.
bpy.data.libraries.write(str(root/'blender-realistic-anatomy.blend'),set(selected),fake_user=True,compress=True)
(root/'anatomy-inspection.json').write_text(json.dumps({'blender':bpy.app.version_string,'objects':report},indent=2)+'\n')
(root/'BUNDLE-README.txt').write_text(bpy.data.texts['README'].as_string())
print(json.dumps(report,indent=2))
print('EXTRACTED',root/'blender-realistic-anatomy.blend')
