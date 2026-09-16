"""Render a transparent strand group from editable curves; no photographed lighting."""
import bpy,math,random
from pathlib import Path
R=Path(__file__).resolve().parent
bpy.ops.wm.read_factory_settings(use_empty=True);random.seed(1234)
m=bpy.data.materials.new('Unlit dark brown strand color');m.use_nodes=True;nodes=m.node_tree.nodes;nodes.clear();e=nodes.new('ShaderNodeEmission');e.inputs['Color'].default_value=(.075,.043,.025,1);o=nodes.new('ShaderNodeOutputMaterial');m.node_tree.links.new(e.outputs[0],o.inputs[0])
for i in range(135):
 c=bpy.data.curves.new('Authored atlas strand %03d'%i,'CURVE');c.dimensions='3D';c.bevel_depth=random.uniform(.0007,.0015);c.bevel_resolution=1;s=c.splines.new('POLY');s.points.add(24)
 x=random.uniform(-.43,.43);phase=random.uniform(-.3,.3);end=random.uniform(.79,.99)
 for j,p in enumerate(s.points):
  t=j/24;p.co=(x*(1-.8*t)+.08*math.sin(t*7+phase),-.95+1.9*t*end,0,1);p.radius=1-t*.94
 ob=bpy.data.objects.new(c.name,c);bpy.context.scene.collection.objects.link(ob);ob.data.materials.append(m)
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=8;scene.render.film_transparent=True;scene.render.resolution_x=512;scene.render.resolution_y=1024;scene.render.resolution_percentage=100
scene.world=bpy.data.worlds.new('black');scene.world.color=(0,0,0)
bpy.ops.object.camera_add(location=(0,0,4));cam=bpy.context.object;cam.data.type='ORTHO';cam.data.ortho_scale=2;scene.camera=cam
scene.view_settings.view_transform='Standard';scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.render.filepath=str(R/'hair-strand-atlas.png')
bpy.ops.wm.save_as_mainfile(filepath=str(R/'hair-strand-atlas.blend'));bpy.ops.render.render(write_still=True)
