import bpy,json
from pathlib import Path
R=Path(__file__).resolve().parents[2]
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(R/'art/sources/alternates/lee-perry-smith/LeePerrySmith.glb'))
o=bpy.context.selected_objects[0];bpy.context.view_layer.objects.active=o;bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
vs=o.data.vertices;lo=min(v.co.z for v in vs);hi=max(v.co.z for v in vs);s=.44/(hi-lo)
for v in vs:v.co*=s;v.co.z+=1.355-lo*s
uv=o.data.uv_layers.active.data
for u,v in [(.432,.305),(.545,.305),(.48,.486),(.49,.391),(.50,.09)]:
 loops=sorted(o.data.loops,key=lambda l:(uv[l.index].uv.x-u)**2+(uv[l.index].uv.y-v)**2)[:8]
 print('UV',u,v,'xyz',[sum(o.data.vertices[l.vertex_index].co[i] for l in loops)/len(loops) for i in range(3)])
print('bounds',[[min(v.co[i] for v in vs),max(v.co[i] for v in vs)] for i in range(3)])
