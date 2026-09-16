import bpy,json,pathlib
root=pathlib.Path(__file__).parent
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(root/'LeePerrySmith.glb'))
meshes=[]
for o in bpy.context.scene.objects:
 if o.type=='MESH':
  o.data.calc_loop_triangles()
  meshes.append(dict(name=o.name,vertices=len(o.data.vertices),triangles=len(o.data.loop_triangles),uvLayers=[x.name for x in o.data.uv_layers],materials=[x.name for x in o.data.materials],dimensions=list(o.dimensions),shapeKeys=len(o.data.shape_keys.key_blocks) if o.data.shape_keys else 0))
images=[]
for name in ['Map-COL.jpg','Map-SPEC.jpg','Infinite-Level_02_Tangent_SmoothUV.jpg','Infinite-Level_02_Disp_NoSmoothUV-4096.jpg']:
 im=bpy.data.images.load(str(root/name));images.append(dict(file=name,width=im.size[0],height=im.size[1],channels=im.channels))
report=dict(blender=bpy.app.version_string,meshes=meshes,images=images,armatures=len([o for o in bpy.context.scene.objects if o.type=='ARMATURE']))
(root/'inspection.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
