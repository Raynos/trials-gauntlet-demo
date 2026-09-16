import bpy,json
from pathlib import Path
from mathutils import Vector
R=Path.cwd();P=R/'prototypes/hero-garage';report=json.loads((P/'reports/mobile-export.json').read_text())
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.context.scene.render.fps=30;bpy.ops.import_scene.gltf(filepath=str(P/'public/assets/street01-rider-mobile.glb'));arm=next(o for o in bpy.data.objects if o.type=='ARMATURE')
for t in arm.animation_data.nla_tracks:t.mute=True
rows={}
for a in bpy.data.actions:
 arm.animation_data.action=a
 if a.slots:arm.animation_data.action_slot=a.slots[0]
 errors=[];frames=range(round(a.frame_range[0]),round(a.frame_range[1])+1)
 for frame in frames:
  bpy.context.scene.frame_set(frame)
  for side,s in [('L',-1),('R',1)]:
   errors.append((bpy.data.objects['gripSocket.'+side].matrix_world.translation-Vector((.92,s*.33,.78))).length)
   errors.append((bpy.data.objects['soleSocket.'+side].matrix_world.translation-Vector((.51,s*.2,.031))).length)
 rows[a.name]=dict(sampledFrames=len(frames),maxContactErrorM=max(errors));assert max(errors)<.001
report['rider']['reimportContactVerification']=rows
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(P/'public/assets/street01-bike-mobile.glb'))
report['bike']['blenderReimportSuccess']=True
report['bike']['reimportMeshObjects']=sum(o.type=='MESH' for o in bpy.data.objects)
report['bike']['reimportSockets']={o.name:list(o.matrix_world.translation) for o in bpy.data.objects if o.name.startswith(('attach_grip','attach_peg'))}
(P/'reports/mobile-export.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(rows))
