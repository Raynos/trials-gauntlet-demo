"""Source-derived bike rebake: 2K color, 1K lossless normal/ORM. No source mutation."""
import bpy,sys,json,hashlib
from pathlib import Path
R=Path.cwd();P=R/'prototypes/hero-garage';sys.path.insert(0,str(R/'assets/blender'))
import common as C
import bike_asset as B
source=R/'assets/blender/source/bike.blend';sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();before=sha(source)
bpy.ops.wm.open_mainfile(filepath=str(source));meshes=B.check_source();colours=json.loads(bpy.context.scene['heroColourways']);ao=B.local_ao_settings(bpy.context.scene);kw={'ao_'+k:v for k,v in ao.items()}
body=[o for o in meshes if o.name in B.BODY];mech=[o for o in meshes if o.name not in B.BODY|{'chain','wheel_front_blur','wheel_rear_blur'}]
C.unwrap_all(body,angle=66,margin=.004);C.unwrap_all(mech,angle=66,margin=.004)
tex=P/'art/bike-materials/textures';tex.mkdir(exist_ok=True)
def bake(obs,prefix,**extra):
 paths=C.bake_atlas(obs,2048,str(tex),prefix,jpeg_quality=94,normal_size=1024,orm_size=1024,margin=8,**kw,**extra)
 for key in ('normal','orm'):
  im=bpy.data.images.get(prefix+'_'+key)
  if im is None:raise RuntimeError('Missing raw bake '+key)
  dest=tex/(prefix+'_'+key+'.png');im.filepath_raw=str(dest);im.file_format='PNG';im.save();paths[key]=str(dest)
 if 'occlusion' in paths:paths['occlusion']=paths['orm']
 return paths
pb=bake(body,'bike_body',variants=[(cw,lambda cw=cw:C.apply_colourway(colours[cw])) for cw in ('rookie','pro')]);pm=bake(mech,'bike_mech')
mats={cw:C.atlas_material('bike_body_'+cw,pb,albedo='albedo:'+cw) for cw in ('rookie','pro')}
C.assign_atlas(body,mats['rookie']);C.assign_atlas(mech,C.atlas_material('bike_mech',pm));C.setup_variants(body,[('bike_'+cw,{n:mats[cw] for n in B.BODY}) for cw in ('rookie','pro')])
bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(P/'art/street01-bike-materials.blend'),compress=True)
output=P/'public/assets/street01-bike-materials.glb';C.export_glb(str(output),meshes+[o for o in bpy.context.scene.objects if o.type=='EMPTY'],animations=False,meshopt=True)
assert sha(source)==before
report={'source':str(source.relative_to(R)),'sourceSHA256':before,'outputSHA256':sha(output),'sourceUnchanged':True,'geometryChange':'None; source mesh topology preserved, UVs repacked with larger gutters.','textures':'2048px color JPEG94;1024px normal/ORM PNG from original bake pixels, not transcoded JPEG.','files':{str(f.relative_to(P)):sha(f) for f in tex.iterdir() if f.is_file()},'visualAcceptance':'Parent review required.'}
(P/'reports/bike-materials.json').write_text(json.dumps(report,indent=2)+'\n')
