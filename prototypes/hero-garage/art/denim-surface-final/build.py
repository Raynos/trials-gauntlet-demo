"""Dark-indigo finish matching target01, preserving dedicated UVs and accepted cloth geometry."""
import bpy,sys,json,hashlib
from pathlib import Path
import numpy as np
R=Path.cwd();P=R/'prototypes/hero-garage';D=P/'art/denim-surface-final';sys.path.insert(0,str(R/'assets/blender'));import common as C
source=P/'art/denim-finish/denim-finish-source.blend';sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();sourcehash=sha(source);bpy.ops.wm.open_mainfile(filepath=str(source));ob=bpy.data.objects['rider'];arm=next(o for o in bpy.data.objects if o.type=='ARMATURE');arm.data.pose_position='REST';arm.animation_data_clear()
def state():return {'positions':[list(v.co)for v in ob.data.vertices],'weights':[[[g.group,g.weight]for g in v.groups]for v in ob.data.vertices],'polygons':[list(p.vertices)for p in ob.data.polygons],'uv':[[list(d.uv)for d in uv.data]for uv in ob.data.uv_layers],'normals':[list(n.vector)for n in ob.data.corner_normals]}
before=state();changes=[]
for mat in ob.data.materials:
 if mat.name not in ['hero indigo twill','hero denim pocket']:continue
 bump=mat.node_tree.nodes['PHOTO_image-derived micro normal'];old=float(bump.inputs['Strength'].default_value);bump.inputs['Strength'].default_value=.18;changes.append({'material':mat.name,'photoBumpStrengthBefore':old,'photoBumpStrengthAfter':.18,'heightDistanceUnchangedM':float(bump.inputs['Distance'].default_value)})
assert len(changes)==2;assert state()==before
bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(D/'denim-surface-final-source.blend'),compress=True)
paths=C.bake_atlas([ob],2048,str(D),'denim',normal_size=1024,orm_size=1024,margin=16)
img=bpy.data.images['denim_normal'];dest=D/'denim_normal.png';img.filepath_raw=str(dest);img.file_format='PNG';img.save();paths['normal']=str(dest)
paths['albedo']=str(P/'art/denim-finish/denim_albedo.png');paths['orm']=str(P/'art/denim-texture/denim_orm.png')
mat=C.atlas_material('Target01 dark indigo denim and tobacco stitching',paths);ob.data.materials.clear();ob.data.materials.append(mat)
for p in ob.data.polygons:p.material_index=0
arm.data.pose_position='POSE';out=P/'public/assets/street01-denim-surface-final.glb';C.export_glb(str(out),[ob,arm],animations=True,meshopt=False,extra={'export_animations':False});assert state()==before;assert sha(source)==sourcehash
report={'sourceSHA256':sourcehash,'outputSHA256':sha(out),'outputBytes':out.stat().st_size,'changes':changes,'tobaccoTopstitchUnchanged':True,'acceptedAlbedoAndORMImagesReusedExactly':{k:sha(Path(paths[k]))for k in ['albedo','orm']},'positionsTopologyNormalsUVsSkinWeightsExact':True,'reference':'public/references/target01.png','limitations':['Parent matched full-scene and close denim render judgement required.']};(P/'reports/denim-surface-final-build.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
