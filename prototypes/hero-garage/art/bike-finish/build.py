import bpy,bmesh,sys,json,hashlib
from pathlib import Path
from mathutils import Vector
R=Path.cwd();P=R/'prototypes/hero-garage';D=P/'art/bike-finish';sys.path.insert(0,str(R/'assets/blender'));import common as C
source=R/'assets/blender/source/bike.blend';accepted=P/'art/bike-detail/bike-detail.blend';sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();hashes={str(p):sha(p) for p in [source,accepted]}
bpy.ops.wm.open_mainfile(filepath=str(source));selection={};orig={}
for name,mats in [('frame',['hero_forged_aluminium','frame_paint']),('swingarm',['alloy_swing']),('handlebar',['alloy_brushed'])]:
 o=bpy.data.objects[name];selection[name]={m:[p.index for p in o.data.polygons if o.data.materials[p.material_index].name==m] for m in mats};orig[name]=([list(v.co) for v in o.data.vertices],[list(p.vertices) for p in o.data.polygons])
bar=Vector((.96,0,.77));V=lambda *x:Vector(x)
paths=[([bar+V(0,-.235,.012),V(.99,-.21,.72),V(.86,-.16,.62),V(.74,-.14,.44),V(.68,.145,.34)],.003,'hose'),([bar+V(-.03,.25,.01),V(.90,.18,.68),V(.76,.13,.60),V(.61,.02,.55)],.0027,'hose'),([bar+V(.02,.235,.012),V(1.07,.16,.85),V(1.12,-.04,.84),V(1.07,-.105,.73)],.0032,'hose')]
for sg in [-1,1]:
 perch=bar+V(-.02,sg*.235,.012);paths.append(([perch+V(.02,sg*.01,.01),perch+V(.09,sg*.07,.008),perch+V(.16,sg*.14,0)],.006,'lever'))
def key(v):return tuple(round(x,6) for x in v)
oldkeys=set()
for points,r,kind in paths:
 bm=C.prim_tube(points,r,sides=6,samples=3)
 oldkeys.update(key(v.co-bar) for v in bm.verts);bm.free()
o=bpy.data.objects['handlebar'];removed_ids={v.index for v in o.data.vertices if key(v.co) in oldkeys};assert len(removed_ids)==len(oldkeys),(len(removed_ids),len(oldkeys))
bpy.ops.wm.open_mainfile(filepath=str(accepted));before={o.name:([list(r) for r in o.matrix_world],o.parent.name if o.parent else None,[list(v.co) for v in o.data.vertices] if o.type=='MESH' else None) for o in bpy.context.scene.objects}
for name,values in orig.items():
 o=bpy.data.objects[name];assert ([list(v.co) for v in o.data.vertices],[list(p.vertices) for p in o.data.polygons])==values
# Decal-free broad structure receives uniform satin response; swingarm retains atlas color+logos.
def plain(name,col,metal,rough):return C.new_mat(name,(*col,1),metal=metal,rough=rough)
alloy=plain('stable satin structural aluminium',(.32,.35,.37),.88,.39);paint=plain('stable blue graphite frame paint',(.035,.068,.09),.25,.39);lever=plain('stable satin handlebar alloy',(.40,.42,.43),.92,.34);rubber=plain('smooth control cable rubber',(.013,.017,.019),0,.78)
for name,mats in selection.items():
 o=bpy.data.objects[name]
 for old,indices in mats.items():
  if old=='alloy_swing':
   mat=o.data.materials[0].copy();mat.name='stable satin swingarm with original logo';bs=next(n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
   for socket,value in [('Roughness',.44),('Metallic',.86),('Normal',None)]:
    for link in list(bs.inputs[socket].links):mat.node_tree.links.remove(link)
    if value is not None:bs.inputs[socket].default_value=value
  else:mat=paint if old=='frame_paint' else lever if name=='handlebar' else alloy
  o.data.materials.append(mat);mi=len(o.data.materials)-1
  for i in indices:o.data.polygons[i].material_index=mi
# Only replace the three static cable tubes and two lever tubes; all other handlebar vertices unchanged.
o=bpy.data.objects['handlebar'];o.data.materials.append(rubber);ri=len(o.data.materials)-1;o.data.materials.append(lever);li=len(o.data.materials)-1
bm=bmesh.new();bm.from_mesh(o.data);bm.verts.ensure_lookup_table();bmesh.ops.delete(bm,geom=[bm.verts[i] for i in removed_ids],context='VERTS')
added=0
for points,r,kind in paths:
 tube=C.prim_tube(points,r,sides=12 if kind=='lever' else 10,samples=10);mapping={v:bm.verts.new(v.co-bar) for v in tube.verts};added+=len(mapping)
 for face in tube.faces:
  f=bm.faces.new([mapping[v] for v in face.verts]);f.material_index=li if kind=='lever' else ri;f.smooth=len(face.verts)==4
 tube.free()
bm.to_mesh(o.data);bm.free();o.data.update()
for name,(matrix,parent,positions) in before.items():
 ob=bpy.data.objects[name];assert [list(r) for r in ob.matrix_world]==matrix;assert (ob.parent.name if ob.parent else None)==parent
 if ob.type=='MESH' and name!='handlebar':assert [list(v.co) for v in ob.data.vertices]==positions,name
survivors={key(v.co) for v in o.data.vertices};assert all(key(Vector(p)) in survivors for i,p in enumerate(orig['handlebar'][0]) if i not in removed_ids)
# Keep the single target01 preview's explicit material assignments (variant metadata left as source).
bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(D/'bike-finish.blend'),compress=True);out=P/'public/assets/street01-bike-finish.glb';C.export_glb(str(out),[o for o in bpy.context.scene.objects if o.type in ('MESH','EMPTY')],animations=False,meshopt=True)
assert all(sha(Path(p))==h for p,h in hashes.items())
r={'sourceHashes':hashes,'outputSHA256':sha(out),'outputBytes':out.stat().st_size,'allHierarchyAndTransformsUnchanged':True,'allOtherMeshPositionsUnchanged':True,'handlebarOriginalVerticesRemoved':len(removed_ids),'handlebarRefinedTubeVertices':added,'survivingHandlebarVerticesUnchanged':True,'centerlineEndpointsUnchanged':True,'articulatedBrakeHoseCompletelyUnchanged':True,'materialRegions':{n:{m:len(ids) for m,ids in ms.items()} for n,ms in selection.items()},'swingarmAtlasColorAndLogoPreserved':True,'limitations':['Parent rendered acceptance required.','New target01 explicit materials not separately authored for pro variant.']};(D/'build-report.json').write_text(json.dumps(r,indent=2));print(json.dumps(r))
