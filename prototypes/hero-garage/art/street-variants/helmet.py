import bpy,sys,json,hashlib
from pathlib import Path
from mathutils import Matrix,Vector
R=Path.cwd();D=R/'prototypes/hero-garage/art/street-variants';sys.path.insert(0,str(R/'assets/blender'));import common as C
src=R/'assets/blender/source/rider-openface.blend';bpy.ops.wm.open_mainfile(filepath=str(src));arm=bpy.data.objects['rider_rig'];arm.data.pose_position='REST';helmet=bpy.data.objects['rider:openface helmet']
for ob in list(bpy.data.objects):
 if ob not in [arm,helmet]:bpy.data.objects.remove(ob,do_unlink=True)
for a in list(bpy.data.actions):bpy.data.actions.remove(a)
head=arm.data.bones['head'];up=(head.tail_local-head.head_local).normalized();front=Vector((up.z,0,-up.x));origin=head.head_local;basis=Matrix(((front.x,0,up.x,origin.x),(0,1,0,origin.y),(front.z,0,up.z,origin.z),(0,0,0,1)))
bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(D/'openface-helmet-source.blend'),compress=True);C.export_glb(str(D/'openface-helmet.glb'),[arm,helmet],animations=True,meshopt=False)
(D/'helmet-report.json').write_text(json.dumps({'source':str(src.relative_to(R)),'sourceSHA256':hashlib.sha256(src.read_bytes()).hexdigest(),'headBasisBlender':[list(r)for r in basis],'vertices':len(helmet.data.vertices),'unchangedOriginalHelmetGeometry':True},indent=2))
