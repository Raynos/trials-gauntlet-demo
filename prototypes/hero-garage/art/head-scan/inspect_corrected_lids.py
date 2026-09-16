import bpy,json,math
from pathlib import Path
from mathutils import Vector
R=Path(__file__).resolve().parents[2];D=R/'art/sources/alternates/lee-perry-smith'
bpy.ops.wm.open_mainfile(filepath=str(R/'art/street01-head-scan.blend'))
bpy.ops.object.camera_add(location=(0,-.8,1.695));c=bpy.context.object;c.rotation_euler=(Vector((0,-.08,1.695))-c.location).to_track_quat('-Z','Y').to_euler();c.data.type='ORTHO';c.data.ortho_scale=.22;bpy.context.scene.camera=c
for loc,power,size in [((-.3,-.4,2),40,.4),((.3,-.3,1.75),20,.3)]:
 bpy.ops.object.light_add(type='AREA',location=loc);a=bpy.context.object;a.data.energy=power;a.data.shape='DISK';a.data.size=size;a.rotation_euler=(Vector((0,0,1.69))-a.location).to_track_quat('-Z','Y').to_euler()
s=bpy.context.scene;s.render.engine='BLENDER_EEVEE';s.render.resolution_x=1000;s.render.resolution_y=1000;s.render.resolution_percentage=100;s.world=bpy.data.worlds.new('Inspection');s.world.color=(.1,.1,.1);s.render.filepath=str(R/'art/head-scan/corrected-lids-front.png');bpy.ops.render.render(write_still=True)
