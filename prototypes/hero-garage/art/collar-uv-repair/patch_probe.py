import bpy,json
from pathlib import Path
R=Path.cwd();P=R/'prototypes/hero-garage';bpy.ops.wm.open_mainfile(filepath=str(P/'art/rider-data-maps/uv-matched-source.blend'));o=next(o for o in bpy.context.scene.objects if o.type=='MESH');m=o.data;m.calc_loop_triangles();uv=m.uv_layers.active.data
print('MATERIALS',[(i,x.name) for i,x in enumerate(m.materials)])
by={}
for t in m.loop_triangles:
 u=[tuple(uv[i].uv) for i in t.loops];area=abs((u[1][0]-u[0][0])*(u[2][1]-u[0][1])-(u[1][1]-u[0][1])*(u[2][0]-u[0][0]))/2
 name=m.materials[t.material_index].name
 if area>by.get(name,{}).get('area',0):by[name]={'area':area,'uv':u,'material':name,'triangle':t.index}
(P/'art/collar-uv-repair/patch-candidates.json').write_text(json.dumps(by,indent=2))
