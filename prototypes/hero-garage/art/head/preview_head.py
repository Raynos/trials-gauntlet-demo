import bpy,math
from mathutils import Vector
from pathlib import Path
R=Path(__file__).resolve().parents[2]
bpy.ops.wm.open_mainfile(filepath=str(R/'art/street01-head.blend'))
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=24
scene.render.resolution_x=700;scene.render.resolution_y=800;scene.render.resolution_percentage=100
scene.world=bpy.data.worlds.new('Neutral inspection world');scene.world.color=(.2,.2,.2)
def aim(o,p):o.rotation_euler=(Vector(p)-o.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.object.camera_add(location=(.48,-.83,1.70));cam=bpy.context.object;aim(cam,(0,-.015,1.64));cam.data.type='ORTHO';cam.data.ortho_scale=.48;scene.camera=cam
for loc,power,size in [((-.7,-.8,2.3),110,1),((.6,-.2,1.9),60,.8),((0,.5,2.1),90,.6)]:
 bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.data.energy=power;o.data.shape='DISK';o.data.size=size;aim(o,(0,0,1.65))
scene.render.filepath=str(R/'art/head/first-source-lookdev.png');bpy.ops.render.render(write_still=True)
