"""Preserve released rider geometry/materials; replace animation family, sample IK each frame.
Run from repository root: Blender -b --python prototypes/hero-garage/art/full-rider/build.py
"""
import bpy,sys,json,hashlib,math
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
R=Path.cwd();sys.path.insert(0,str(R/'assets/blender'))
import build_rider as B
import common as C
P=R/'prototypes/hero-garage';out=P/'public/assets/street01-rider-posed.glb'
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(R/'public/models/rider-street.glb'))
arm=next(o for o in bpy.data.objects if o.type=='ARMATURE');mesh=bpy.data.objects['rider'];riderobs=[o for o in bpy.context.scene.objects if o.type in ('MESH','ARMATURE','EMPTY') and o.name!='Icosphere']
arm.animation_data_clear()
for a in list(bpy.data.actions):bpy.data.actions.remove(a)
# Imported GLB preserves rest orientation; use original anatomically authored segment directions.
B.BONES=B.define_bones(B.chain('stand_attack'))
B.ELBOW_POLE=Vector((-.55,-.7,.3))
bpy.context.scene.render.fps=30
# Bike is measurement-only, never included in rider export.
before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(R/'public/models/bike.glb'));bikeobs=set(bpy.data.objects)-before
body=next(o for o in bikeobs if o.type=='MESH' and o.name.startswith('bodywork'))
seat_tree=BVHTree.FromPolygons([body.matrix_world@v.co for v in body.data.vertices],[p.vertices for p in body.data.polygons])
neutral=dict(hips=(-.30,.735),torso=60,head=80)
forward=dict(hips=(-.20,.86),torso=33,head=63)
rear=dict(hips=(-.52,.73),torso=58,head=79)
def joints(p):return B.pose_chain(**p)
def interp(a,b,t):
 s=t*t*(3-2*t)
 return {k:tuple(x+(y-x)*s for x,y in zip(a[k],b[k])) if k=='hips' else a[k]+(b[k]-a[k])*s for k in a}
reports={}
for name,target in [('sit_cruise',neutral),('forward_attack',forward),('hang_back',rear)]:
 act=bpy.data.actions.new(name);arm.animation_data_create();arm.animation_data.action=act
 rows=[]
 for fr in range(1,61):
  p=neutral if name=='sit_cruise' else interp(neutral,target,min(1,(fr-1)/40))
  J=joints(p);B.pose_from_joints(arm,B.BONES,J);B.key_all(arm,fr);bpy.context.view_layer.update()
  if fr in (1,11,21,31,41,51,60):
   grips={};soles={}
   for side,s in [('L',-1),('R',1)]:
    grips[side]=(bpy.data.objects['gripSocket.'+side].matrix_world.translation-Vector((.92,s*.33,.78))).length
    soles[side]=(bpy.data.objects['soleSocket.'+side].matrix_world.translation-Vector((.51,s*.2,.02))).length
   dg=bpy.context.evaluated_depsgraph_get();ev=mesh.evaluated_get(dg);me=ev.to_mesh()
   # Vertical gap from trouser underside near pelvic support to rendered bike bodywork.
   # Select pelvis-weighted source vertices; excludes legs and jacket.
   ids=[]
   for v in mesh.data.vertices:
    if v.co.z < .85 and abs(v.co.y)<.13 and any(mesh.vertex_groups[g.group].name=='pelvis' and g.weight>.65 for g in v.groups):ids.append(v.index)
   gaps=[]
   for i in ids:
    point=ev.matrix_world@me.vertices[i].co
    hit,normal,index,d=seat_tree.ray_cast(Vector((point.x,point.y,1)),Vector((0,0,-1)),1.1)
    if hit and .40<hit.z<.65:gaps.append(point.z-hit.z)
   ev.to_mesh_clear()
   rows.append(dict(frame=fr,gripDistanceM=grips,soleToPegCenterM=soles,pelvis=list(J['hips']),elbowL=list(J['elbow.L']),seatVerticalGapM=min(gaps) if gaps else None,seatSampleCount=len(gaps)))
 act.use_frame_range=True;act.frame_range=(1,60)
 for fc in B.action_fcurves(act,arm):
  for kp in fc.keyframe_points:kp.interpolation='LINEAR'
 track=arm.animation_data.nla_tracks.new();track.name=name;track.strips.new(name,1,act);track.mute=True
 arm.animation_data.action=None;reports[name]=rows
for o in bikeobs:bpy.data.objects.remove(o,do_unlink=True)
B.pose_from_joints(arm,B.BONES,joints(neutral))
bpy.context.scene.frame_start=1;bpy.context.scene.frame_end=60
bpy.ops.wm.save_as_mainfile(filepath=str(P/'art/street01-full-rider.blend'))
C.export_glb(str(out),riderobs,animations=True,meshopt=False)
report=dict(source='public/models/rider-street.glb',sourceSHA256=hashlib.sha256((R/'public/models/rider-street.glb').read_bytes()).hexdigest(),outputSHA256=hashlib.sha256(out.read_bytes()).hexdigest(),poses=dict(neutral=neutral,forward=forward,rear=rear),samples=reports,notes=['Same released geometry, UVs, material textures and skeleton; animation replaced.', '60 frames at 30fps; transitions solved independently per frame to keep contact bones stationary.', 'Sole distance is to peg center; authored sole contact is 11mm above center.', 'Seat gap is vertical rendered mesh proximity, not pressure or collision simulation. Negative values mean penetration.', 'Visual acceptance and playback/export verification remain parent-owned.'])
(P/'reports/full-rider-pose.json').write_text(json.dumps(report,indent=2)+'\n')
print('POSE_REPORT',json.dumps(report))
