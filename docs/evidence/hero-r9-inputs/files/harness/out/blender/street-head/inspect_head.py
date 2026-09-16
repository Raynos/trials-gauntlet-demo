import bpy,json
from pathlib import Path
names=['GEO-head_animation_realistic','GEO-head_animation_realistic.iris.L','GEO-head_animation_realistic.iris.R','GEO-head_animation_realistic.sclera.L','GEO-head_animation_realistic.sclera.R']
data={}
for name in names:
 o=bpy.data.objects[name]
 print(name,'location',list(o.location),'scale',list(o.scale),'bounds',[(min(v.co[i] for v in o.data.vertices),max(v.co[i] for v in o.data.vertices)) for i in range(3)])
 print('mats',[m.name for m in o.data.materials],'attrs',[(a.name,a.domain,a.data_type) for a in o.data.attributes])
 data[name]={'vertices':[list(v.co) for v in o.data.vertices],'faces':[list(p.vertices) for p in o.data.polygons],'materials':[p.material_index for p in o.data.polygons],'matrix_world':[list(r) for r in o.matrix_world],'face_sets':[v.value for v in o.data.attributes['.sculpt_face_set'].data] if '.sculpt_face_set' in o.data.attributes else []}
Path('harness/out/blender/street-head/head-base.json').write_text(json.dumps(data))
