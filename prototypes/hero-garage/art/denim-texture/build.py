"""Replace only source denim and pockets triangles; preserve accepted identity and motion bytes."""
from pathlib import Path
import bpy,json,struct,copy,hashlib,itertools,sys
import numpy as np
from mathutils.kdtree import KDTree
P=Path.cwd()/'prototypes/hero-garage';D=P/'art/denim-texture'
sys.path.insert(0,str(Path.cwd()/'assets/blender'));import common as C;import rider_asset as A
bpy.ops.wm.open_mainfile(filepath=str(Path.cwd()/'assets/blender/source/rider-street.blend'));A.clear_pose(bpy.data.objects['rider_rig'])
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH'];C.select_only(meshes);bpy.context.view_layer.objects.active=meshes[0];bpy.ops.object.join();o=bpy.context.object;C.unwrap_all([o],angle=66,margin=.002)
m=o.data;m.calc_loop_triangles();uv=m.uv_layers.active.data
manifest=json.loads((P/'art/denim-refine/source-removal-triangles.json').read_text())
def key(points):return tuple(sorted(tuple(round(float(c),6) for c in p) for p in points))
keys={key(t['position']) for t in manifest}
source=[]
for t in m.loop_triangles:
 if key([m.vertices[i].co for i in t.vertices]) in keys:source.append((np.array([tuple(uv[i].uv) for i in t.loops]),m.materials[t.material_index].name))
assert len(source)==len(manifest),(len(source),len(manifest))
tree=KDTree(len(source))
for i,(t,mat) in enumerate(source):tree.insert((*t.mean(axis=0),0),i)
tree.balance()

# Load accepted geometry, then assign original procedural material by original UV triangles.
bpy.ops.wm.open_mainfile(filepath=str(P/'art/denim-refine/denim-accepted-source.blend'));ob=bpy.data.objects['rider'];arm=next(o for o in bpy.data.objects if o.type=='ARMATURE');arm.data.pose_position='REST';arm.animation_data_clear()
material_names=['hero denim pocket','hero indigo twill','hero tobacco topstitch']
with bpy.data.libraries.load(str(Path.cwd()/'assets/blender/source/rider-street.blend'),link=False) as (src,dst):dst.materials=list(material_names)
materials=dst.materials;assert all(materials)
ob.data.materials.clear()
for mat in materials:ob.data.materials.append(mat)
uv=ob.data.uv_layers.active.data;counts={n:0 for n in material_names};ob.data.calc_loop_triangles();assert len(ob.data.loop_triangles)==8068
for tri in ob.data.loop_triangles:
 t=np.array([tuple(uv[i].uv) for i in tri.loops]);found=[]
 for _,si,_ in tree.find_range((*t.mean(axis=0),0),.00003):
  st,mat=source[si]
  if any(np.max(np.abs(t-np.array(perm)))<.00002 for perm in itertools.permutations(st)):found.append(mat)
 assert len(set(found))==1,(tri.index,found)
 mat=found[0];assert mat in material_names,mat;ob.data.polygons[tri.polygon_index].material_index=material_names.index(mat);counts[mat]+=1
# Stored authoring geometry and skin are immutable through UV and bake operations.
def state():return {'positions':np.array([tuple(v.co) for v in ob.data.vertices]),'weights':[[[g.group,g.weight] for g in v.groups]for v in ob.data.vertices],'polygons':[tuple(p.vertices)for p in ob.data.polygons],'normals':np.array([tuple(n.vector)for n in ob.data.corner_normals])}
before=state();C.unwrap_all([ob],angle=66,margin=.012)
after=state();assert np.array_equal(before['positions'],after['positions']);assert before['weights']==after['weights'] and before['polygons']==after['polygons'];assert np.array_equal(before['normals'],after['normals'])
bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(D/'denim-textured-source.blend'),compress=True)
paths=C.bake_atlas([ob],2048,str(D),'denim',normal_size=1024,orm_size=1024,margin=16)
for key in ['albedo','normal','orm']:
 img=bpy.data.images.get('denim_'+key);assert img;dest=D/('denim_'+key+'.png');img.filepath_raw=str(dest);img.file_format='PNG';img.save();paths[key]=str(dest)
mat=C.atlas_material('Dedicated indigo twill pockets stitching',paths);ob.data.materials.clear();ob.data.materials.append(mat)
for p in ob.data.polygons:p.material_index=0
arm.data.pose_position='POSE';out=P/'public/assets/street01-denim-textured.glb';C.export_glb(str(out),[ob,arm],animations=True,meshopt=False,extra={'export_animations':False})
after=state();assert np.array_equal(before['positions'],after['positions']);assert before['weights']==after['weights'] and before['polygons']==after['polygons'];assert np.array_equal(before['normals'],after['normals'])
r={'method':'Assign original three procedural denim/pocket/topstitch materials using exact original atlas corner UV correspondence, smart-project dedicated UV atlas with generous padding; bake 2K albedo and 1K normal/ORM lossless PNG','matchedTriangles':sum(counts.values()),'materialTriangleCounts':counts,'geometryPositionsPolygonsWeightsNormalsExactlyPreservedInBlender':True,'sourceSHA256':hashlib.sha256((P/'art/denim-refine/denim-accepted-source.blend').read_bytes()).hexdigest(),'outputSHA256':hashlib.sha256(out.read_bytes()).hexdigest(),'outputBytes':out.stat().st_size};(P/'reports/denim-texture-build.json').write_text(json.dumps(r,indent=2));print(json.dumps(r))
