import bpy,json,math,sys
from pathlib import Path
from mathutils import Vector
sys.path.insert(0,str(Path('assets/blender').resolve()));import rider_asset as P
bpy.ops.wm.open_mainfile(filepath='harness/out/blender/street-head/street-head-v1.blend');arm=bpy.data.objects['rider_rig'];P.clear_pose(arm)
head_objects=[o for o in bpy.data.objects if o.type=='MESH' and (o.name.startswith('rider:human') or o.name.startswith('rider:sclera') or o.name.startswith('rider:iris') or o.name=='rider:short hair prototype')]
rows=[];eye_reference={};max_eye_delta=0
for action in bpy.data.actions:
 arm.animation_data.action=action
 for frame in (int(action.frame_range[0]),int(sum(action.frame_range)/2),int(action.frame_range[1])):
  bpy.context.scene.frame_set(frame);deps=bpy.context.evaluated_depsgraph_get();inv=(arm.matrix_world@arm.pose.bones['head'].matrix).inverted()
  for ob in head_objects:
   eo=ob.evaluated_get(deps);me=eo.to_mesh();assert all(math.isfinite(c) for v in me.vertices for c in v.co)
   if ob.name.startswith(('rider:sclera','rider:iris')):
    center=inv@(eo.matrix_world@Vector([math.fsum(v.co[k] for v in me.vertices)/len(me.vertices) for k in range(3)]))
    if ob.name not in eye_reference:eye_reference[ob.name]=center.copy()
    max_eye_delta=max(max_eye_delta,(center-eye_reference[ob.name]).length)
   eo.to_mesh_clear()
  rows.append({'clip':action.name,'frame':frame,'finite':True})
print("EYE_DRIFT",max_eye_delta)
assert max_eye_delta<1e-6
out={'sample_count':len(rows),'samples':rows,'eye_center_max_head_local_drift_m':max_eye_delta,'head_object_names':[o.name for o in head_objects]}
Path('harness/out/blender/street-head/focused-checks.json').write_text(json.dumps(out,indent=2));print(json.dumps(out))
