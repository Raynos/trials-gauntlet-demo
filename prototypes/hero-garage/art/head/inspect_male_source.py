import bpy
from pathlib import Path
from mathutils import Vector
R=Path(__file__).resolve().parents[2]
bpy.ops.wm.read_factory_settings(use_empty=True)
with bpy.data.libraries.load(str(R/'art/sources/blender-realistic-anatomy.blend'),link=False) as (s,d):d.objects=[n for n in s.objects if n.startswith('GEO-body_male_realistic')]
body=next(o for o in d.objects if o.name=='GEO-body_male_realistic');offset=body.location.copy()
for o in d.objects:
 bpy.context.scene.collection.objects.link(o);o.location-=offset
 for p in o.data.polygons:p.use_smooth=True
 o.data.materials.clear()
scene=bpy.context.scene;scene.world=bpy.data.worlds.new('World');scene.world.color=(.15,.15,.15);scene.render.engine='CYCLES';scene.cycles.samples=16;scene.render.resolution_x=600;scene.render.resolution_y=700;scene.render.resolution_percentage=100
bpy.ops.object.camera_add(location=(.40,-.80,1.62));cam=bpy.context.object;cam.rotation_euler=(Vector((0,-.01,1.56))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=.38;scene.camera=cam
for loc,energy,size in [((-.5,-.7,2.0),90,.7),((.6,-.3,1.8),45,.6)]:
 bpy.ops.object.light_add(type='AREA',location=loc);o=bpy.context.object;o.data.energy=energy;o.data.size=size;o.rotation_euler=(Vector((0,0,1.55))-o.location).to_track_quat('-Z','Y').to_euler()
scene.render.filepath=str(R/'art/head/male-source-diagnostic.png');bpy.ops.render.render(write_still=True)
