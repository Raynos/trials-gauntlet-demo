import bpy,json
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
R=Path.cwd();P=R/'prototypes/hero-garage';bpy.ops.wm.read_factory_settings(use_empty=True);bpy.context.scene.render.fps=30;bpy.ops.import_scene.gltf(filepath=str(P/'public/assets/street01-rider-motion.glb'));arm=next(o for o in bpy.data.objects if o.type=='ARMATURE');mesh=bpy.data.objects['rider']
for t in arm.animation_data.nla_tracks:t.mute=True
act=bpy.data.actions['sit_cruise'];arm.animation_data.action=act;arm.animation_data.action_slot=act.slots[0];bpy.context.scene.frame_set(0)
ev=mesh.evaluated_get(bpy.context.evaluated_depsgraph_get());me=ev.to_mesh();coords=[ev.matrix_world@v.co for v in me.vertices];tree=BVHTree.FromPolygons(coords,[p.vertices for p in me.polygons]);ev.to_mesh_clear()
before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(R/'public/models/bike.glb'));body=next(o for o in set(bpy.data.objects)-before if o.type=='MESH' and o.name.startswith('bodywork'));bt=BVHTree.FromPolygons([body.matrix_world@v.co for v in body.data.vertices],[p.vertices for p in body.data.polygons])
rows=[]
for x in [.18,.22,.26,.30,.34,.38,.42,.46]:
 for y in [-.05,0,.05]:
  s,_,_,_=bt.ray_cast(Vector((x,y,.70)),Vector((0,0,-1)),.25)
  if s:
   p,_,idx,_=tree.ray_cast(s+Vector((0,0,.001)),Vector((0,0,1)),.4)
   rows.append(dict(x=x,y=y,seatZ=s.z,riderZ=p.z if p else None,gapM=p.z-s.z if p else None,poly=idx))
print(json.dumps(rows,indent=2));(P/'art/rider-seat/baseline-grid.json').write_text(json.dumps(rows,indent=2)+'\n')
