import bpy,json,math
from pathlib import Path
from mathutils import Vector
R=Path(__file__).resolve().parents[2];D=R/'art/sources/alternates/lee-perry-smith'
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(D/'LeePerrySmith.glb'))
o=bpy.context.selected_objects[0];bpy.context.view_layer.objects.active=o;bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
vs=o.data.vertices;lo=min(v.co.z for v in vs);hi=max(v.co.z for v in vs);s=.44/(hi-lo)
for v in vs:v.co*=s;v.co.z+=1.355-lo*s;v.co.x+=.013
for d in o.data.uv_layers.active.data:d.uv.y=1-d.uv.y
m=bpy.data.materials.new('Source diffuse');m.use_nodes=True;n=m.node_tree.nodes;p=n.get('Principled BSDF');p.inputs['Roughness'].default_value=.7;t=n.new('ShaderNodeTexImage');t.image=bpy.data.images.load(str(D/'Map-COL.jpg'));m.node_tree.links.new(t.outputs['Color'],p.inputs['Base Color']);o.data.materials.clear();o.data.materials.append(m)
for p in o.data.polygons:p.use_smooth=True
# Record mesh coordinates corresponding to visible crease landmarks traced on original atlas pixels.
uv=o.data.uv_layers.active.data
landmarks={}
for name,pxs in {'left':[(405,309),(414,315),(429,317),(444,315),(458,310),(467,307)],'right':[(555,308),(565,313),(581,316),(597,316),(610,311),(617,306)]}.items():
 landmarks[name]=[]
 for px,py in pxs:
  u,v=px/1024,1-py/1024
  l=min(o.data.loops,key=lambda l:(uv[l.index].uv.x-u)**2+(uv[l.index].uv.y-v)**2)
  landmarks[name].append({'atlas_pixel':[px,py],'vertex':l.vertex_index,'xyz':list(o.data.vertices[l.vertex_index].co),'uv_error':math.hypot(uv[l.index].uv.x-u,uv[l.index].uv.y-v)})
(R/'art/head-scan/source-lid-landmarks.json').write_text(json.dumps(landmarks,indent=2))
bpy.ops.object.camera_add(location=(0,-.8,1.695));c=bpy.context.object;c.rotation_euler=(Vector((0,-.08,1.695))-c.location).to_track_quat('-Z','Y').to_euler();c.data.type='ORTHO';c.data.ortho_scale=.22;bpy.context.scene.camera=c
for loc,power,size in [((-.3,-.4,2),40,.4),((.3,-.3,1.75),20,.3)]:
 bpy.ops.object.light_add(type='AREA',location=loc);a=bpy.context.object;a.data.energy=power;a.data.shape='DISK';a.data.size=size;a.rotation_euler=(Vector((0,0,1.69))-a.location).to_track_quat('-Z','Y').to_euler()
s=bpy.context.scene;s.render.engine='BLENDER_EEVEE';s.render.resolution_x=1000;s.render.resolution_y=1000;s.render.resolution_percentage=100;s.world=bpy.data.worlds.new('Inspection');s.world.color=(.1,.1,.1);s.render.filepath=str(R/'art/head-scan/source-lids-front.png');bpy.ops.render.render(write_still=True)
