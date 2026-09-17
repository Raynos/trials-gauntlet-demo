"""Dark-indigo finish matching target01, preserving dedicated UVs and accepted cloth geometry."""
import bpy,sys,json,hashlib
from pathlib import Path
import numpy as np
R=Path.cwd();P=R/'prototypes/hero-garage';D=P/'art/denim-finish';sys.path.insert(0,str(R/'assets/blender'));import common as C
source=P/'art/denim-texture/denim-textured-source.blend';sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();sourcehash=sha(source);bpy.ops.wm.open_mainfile(filepath=str(source));ob=bpy.data.objects['rider'];arm=next(o for o in bpy.data.objects if o.type=='ARMATURE');arm.data.pose_position='REST';arm.animation_data_clear()
def state():return {'positions':[list(v.co)for v in ob.data.vertices],'weights':[[[g.group,g.weight]for g in v.groups]for v in ob.data.vertices],'polygons':[list(p.vertices)for p in ob.data.polygons],'uv':[[list(d.uv)for d in uv.data]for uv in ob.data.uv_layers],'normals':[list(n.vector)for n in ob.data.corner_normals]}
before=state();changes=[]
for mat in ob.data.materials:
 if mat.name not in ['hero indigo twill','hero denim pocket']:continue
 bs=mat.node_tree.nodes['BSDF'];socket=bs.inputs['Base Color'];source_socket=socket.links[0].from_socket if socket.links else None
 node=mat.node_tree.nodes.new('ShaderNodeMixRGB');node.name='Target01 deep indigo dye';node.blend_type='MULTIPLY';node.inputs[0].default_value=1
 node.inputs[2].default_value=(.26,.27,.34,1) if mat.name=='hero indigo twill' else (.29,.30,.37,1)
 if source_socket:mat.node_tree.links.new(source_socket,node.inputs[1])
 else:node.inputs[1].default_value=socket.default_value
 mat.node_tree.links.new(node.outputs[0],socket);changes.append({'material':mat.name,'linearBaseMultiplier':list(node.inputs[2].default_value)})
assert len(changes)==2;assert state()==before
bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(D/'denim-finish-source.blend'),compress=True)
paths=C.bake_atlas([ob],2048,str(D),'denim',normal_size=1024,orm_size=1024,margin=16)
img=bpy.data.images['denim_albedo'];dest=D/'denim_albedo.png';img.filepath_raw=str(dest);img.file_format='PNG';img.save();paths['albedo']=str(dest)
# Reuse accepted data maps byte-for-byte; this is a dye-color change only.
for key in ['normal','orm']:paths[key]=str(P/'art/denim-texture'/('denim_'+key+'.png'))
mat=C.atlas_material('Target01 dark indigo denim and tobacco stitching',paths);ob.data.materials.clear();ob.data.materials.append(mat)
for p in ob.data.polygons:p.material_index=0
arm.data.pose_position='POSE';out=P/'public/assets/street01-denim-finish.glb';C.export_glb(str(out),[ob,arm],animations=True,meshopt=False,extra={'export_animations':False});assert state()==before;assert sha(source)==sourcehash
report={'sourceSHA256':sourcehash,'outputSHA256':sha(out),'outputBytes':out.stat().st_size,'changes':changes,'tobaccoTopstitchUnchanged':True,'acceptedNormalAndORMImagesReusedExactly':{k:sha(Path(paths[k]))for k in ['normal','orm']},'positionsTopologyNormalsUVsSkinWeightsExact':True,'reference':'public/references/target01.png','limitations':['Parent matched full-scene and close denim render judgement required.']};(P/'reports/denim-finish-build.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
