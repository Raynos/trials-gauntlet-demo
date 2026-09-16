"""Add three contact-preserving whole-rider actions; preserve source mesh/materials/actions."""
import bpy,sys,json,hashlib,math
from pathlib import Path
from mathutils import Vector
R=Path.cwd();P=R/'prototypes/hero-garage';sys.path.insert(0,str(R/'assets/blender'));import build_rider as B;import common as C
source=P/'public/assets/street01-rider-cloth.glb';out=P/'public/assets/street01-rider-motion.glb'
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.context.scene.render.fps=30;bpy.ops.import_scene.gltf(filepath=str(source));arm=next(o for o in bpy.data.objects if o.type=='ARMATURE');arm.animation_data.action=None
B.BONES=B.define_bones(B.chain('stand_attack'));B.ELBOW_POLE=Vector((-.55,-.7,.3))
neutral=dict(hips=(-.30,.735),torso=60,head=80);raised=dict(hips=(-.26,.87),torso=42,head=68);compressed=dict(hips=(-.34,.79),torso=32,head=58);extended=dict(hips=(-.20,.96),torso=48,head=72);absorbed=dict(hips=(-.36,.78),torso=35,head=60)
keys={
 'compression':[(0,neutral),(30,raised),(54,compressed),(78,compressed),(104,raised),(134,neutral),(149,neutral)],
 'extension':[(0,neutral),(30,raised),(55,extended),(80,extended),(105,raised),(134,neutral),(149,neutral)],
 'landing_absorption':[(0,neutral),(30,raised),(50,extended),(65,absorbed),(83,absorbed),(108,raised),(134,neutral),(149,neutral)]}
def interp(a,b,t):
 t=t*t*(3-2*t)
 return {k:tuple(x+(y-x)*t for x,y in zip(a[k],b[k])) if k=='hips' else a[k]+(b[k]-a[k])*t for k in a}
for name,poses in keys.items():
 act=bpy.data.actions.new(name);arm.animation_data.action=act
 for frame in range(150):
  for (a,pa),(b,pb) in zip(poses,poses[1:]):
   if a<=frame<=b:p=interp(pa,pb,(frame-a)/(b-a));break
  B.pose_from_joints(arm,B.BONES,B.pose_chain(**p));B.key_all(arm,frame)
 for fc in B.action_fcurves(act,arm):
  for kp in fc.keyframe_points:kp.interpolation='LINEAR'
 act.use_frame_range=True;act.frame_range=(0,149)
 tr=arm.animation_data.nla_tracks.new();tr.name=name;tr.strips.new(name,0,act);tr.mute=True;arm.animation_data.action=None
B.pose_from_joints(arm,B.BONES,B.pose_chain(**neutral));bpy.context.scene.frame_start=0;bpy.context.scene.frame_end=149
bpy.ops.wm.save_as_mainfile(filepath=str(P/'art/street01-rider-motion.blend'));C.export_glb(str(out),list(bpy.context.scene.objects),animations=True,meshopt=False)
r=dict(sourceSHA256=hashlib.sha256(source.read_bytes()).hexdigest(),outputSHA256=hashlib.sha256(out.read_bytes()).hexdigest(),poseKeys=keys,notes=['Existing three actions retained. Three new actions at30fps,150samples each.','Compression begins after raising pelvis off seat. Landing absorbs from extension then recovers through raised pose to seated neutral.','Skeleton, geometry, UVs and materials unedited. IK solved per frame; visual motion quality remains parent-owned.'])
(P/'reports/rider-motion.json').write_text(json.dumps(r,indent=2)+'\n')
