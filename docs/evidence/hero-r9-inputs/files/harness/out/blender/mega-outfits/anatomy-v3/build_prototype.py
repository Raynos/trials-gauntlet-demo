"""CC0 Blender realistic male torso/arm topology fitted to the unchanged rider rig.
Prototype only. Source body is extracted by its authored anatomical face sets, relaxed,
expanded to sweatshirt ease, then fitted with continuous landmark-based bone weights.
"""
import bpy,bmesh,json,math,sys
from pathlib import Path
from mathutils import Vector,Matrix
sys.path.insert(0,str(Path('assets/blender').resolve()))
import author_garments as G
import author_hood as H
import rider_asset as P
import author_rider_hero as R
import common as C
ROOT=Path('harness/out/blender/mega-outfits/anatomy-v3')
SOURCE=Path('harness/out/blender/mega-outfits/street-v2.blend')
OUT=ROOT/'street-anatomy-v3b.blend'
assert not OUT.exists()
j=json.loads((ROOT/'male.json').read_text())
bpy.ops.wm.open_mainfile(filepath=str(SOURCE));arm=bpy.data.objects['rider_rig'];P.clear_pose(arm)
sig={k:v for k,v in G.invariant_signature().items() if k!='materials'}
fixed={o.name:H.mesh_signature(o) for o in bpy.data.objects if o.type=='MESH' and o.name not in ('rider:hoodie','rider:hero garment construction')}
# Keep the accepted folded hood; replace the entire previous torso/sleeve component.
old=bpy.data.objects['rider:hoodie'];bm=bmesh.new();bm.from_mesh(old.data)
main=max(G.components(bm),key=len);bmesh.ops.delete(bm,geom=list(main),context='VERTS');bm.to_mesh(old.data);bm.free();old.name='rider:folded hood'
oldparts=bpy.data.objects.get('rider:hero garment construction')
if oldparts:bpy.data.objects.remove(oldparts,do_unlink=True)
# The anatomical mesh's body region already has connected shoulder, axilla and elbow topology.
bm=bmesh.new();vs=[bm.verts.new(Vector(p)) for p in j['vertices']]
for face,region in zip(j['faces'],j['face_sets']):
 if region in (1,11,12,17,18,19,20,21):bm.faces.new([vs[i] for i in face])
bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS')
for z,no in ((.861,Vector((0,0,1))),(1.387,Vector((0,0,-1)))):
 bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=.000001,plane_co=Vector((0,0,z)),plane_no=no,clear_inner=True,clear_outer=False)
# Smooth the underlying muscular subdivisions into cloth spanning anatomy.
for _ in range(7):bmesh.ops.smooth_vert(bm,verts=list(bm.verts),factor=.30,use_axis_x=True,use_axis_y=True,use_axis_z=True)
bm.normal_update()
# Cloth ease is predominantly chest/waist depth; sleeves stay close to anatomy.
for v in bm.verts:
 x,y,z=v.co
 armness=max(0,min(1,(abs(x)-.16)/.12))
 ease=.013*(1-armness)+.009*armness
 v.co+=v.normal*ease
 if abs(x)<.18 and z<1.22:
  # Sweatshirt fabric spans the waist rather than tracing abdominal muscles.
  v.co.y*=1.12
bmesh.ops.subdivide_edges(bm,edges=list(bm.edges),cuts=1,use_grid_fill=True)
bm.normal_update();bm.verts.ensure_lookup_table();bm.verts.index_update()
# Piecewise affine fit using actual face-set seam centroids as elbows and wrists.
H0=arm.data.bones['pelvis'].head_local;t=(arm.data.bones['pelvis'].tail_local-H0).normalized();front=Vector((t.z,0,-t.x));lat=Vector((0,1,0))
source_shoulder=Vector((.178,.005,1.335));source_elbow=Vector((.29408,0,1.09054));source_wrist=Vector((.37585,-.06349,.88159))
def smooth(x):x=max(0,min(1,x));return x*x*(3-2*x)
def limb_fit(p,sa,sb,ta,tb):
 a=(sb-sa).normalized();b=(tb-ta).normalized()
 srcf=Vector((0,-1,0));srcf=(srcf-a*srcf.dot(a)).normalized();srcs=a.cross(srcf)
 dstf=front-b*front.dot(b);dstf.normalize();dsts=b.cross(dstf)
 rel=p-sa
 return ta+b*(rel.dot(a)*(tb-ta).length/(sb-sa).length)+dstf*rel.dot(srcf)*1.06+dsts*rel.dot(srcs)*1.06
verts=[];weights=[]
for v in bm.verts:
 p=v.co.copy();side='R' if p.x>=0 else 'L';sgn=1 if p.x>=0 else -1
 pp=Vector((abs(p.x),p.y,p.z));sa=source_shoulder;se=source_elbow;sw=source_wrist
 ua=arm.data.bones['upperArm.'+side];fa=arm.data.bones['forearm.'+side]
 # Armpit transition follows the high diagonal shoulder boundary, rather than x alone.
 armblend=smooth((abs(p.x)-(.105+.06*max(0,min(1,(1.30-p.z)/.18))))/.095)
 lower=smooth(((pp-se).dot((sw-sa).normalized())+.060)/.12)
 up=limb_fit(pp,sa,se,ua.head_local,ua.tail_local)
 low=limb_fit(pp,se,sw,fa.head_local,fa.tail_local)
 # Positive source X maps to positive target Y; mirror the negative half.
 if side=='L':
  # limb_fit's destination orientation must mirror its transverse source offset.
  def fit_right(p,sa,sb,ta,tb):
   a=(sb-sa).normalized();b=(tb-ta).normalized();sf=Vector((0,-1,0));sf=(sf-a*sf.dot(a)).normalized();ss=a.cross(sf);df=front-b*front.dot(b);df.normalize();ds=-b.cross(df);rel=p-sa
   return ta+b*(rel.dot(a)*(tb-ta).length/(sb-sa).length)+df*rel.dot(sf)*1.06+ds*rel.dot(ss)*1.06
  up=fit_right(pp,sa,se,ua.head_local,ua.tail_local);low=fit_right(pp,se,sw,fa.head_local,fa.tail_local)
 u=(p.z-.92)*(.54/.415)
 torso=H0+t*u+lat*(p.x*1.18)+front*(-p.y-.005)*1.06
 co=torso.lerp(up.lerp(low,lower),armblend)
 # A broad gravity fold near the waist; no periodic radial puffer rings.
 if armblend<.1 and -.05<u<.22:
  co+=front*.004*math.exp(-((u-.075)/.070)**2)*math.sin(p.x*15+.6)
 w={}
 if u<.1:
  blend=smooth((u-.055)/.09);w={'pelvis':1-blend,'spine':blend}
 else:
  blend=smooth((u-.215)/.13);w={'spine':1-blend,'chest':blend}
 w={k:q*(1-armblend) for k,q in w.items()};w['upperArm.'+side]=armblend*(1-lower);w['forearm.'+side]=armblend*lower
 w={k:q for k,q in w.items() if q>1e-8};w=dict(sorted(w.items(),key=lambda x:-x[1])[:4]);total=sum(w.values());w={k:q/total for k,q in w.items()}
 verts.append(co);weights.append(w)
for v,co in zip(bm.verts,verts):v.co=co
bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));me=bpy.data.meshes.new('CC0 anatomical cotton shell');bm.to_mesh(me);bm.free()
ob=bpy.data.objects.new('rider:anatomical sweatshirt',me);bpy.context.scene.collection.objects.link(ob)
for name in sorted({k for w in weights for k in w}):ob.vertex_groups.new(name=name)
for i,w in enumerate(weights):
 for name,value in w.items():ob.vertex_groups[name].add([i],value,'REPLACE')
R.bind(ob,arm)
cotton=bpy.data.materials['hero heavy cotton'];rib=bpy.data.materials['hero knitted rib'];me.materials.append(cotton);me.materials.append(rib)
for p in me.polygons:
 p.use_smooth=True;c=p.center;u=(c-H0).dot(t)
 if u<-.027:p.material_index=1
 for side in ('L','R'):
  if (c-arm.data.bones['hand.'+side].head_local).length<.067:p.material_index=1
# Solid cloth endings: turn the hem/cuff/collar edges inward, preserving their vertex weights.
bm=bmesh.new();bm.from_mesh(me);layer=bm.verts.layers.deform.verify();bm.normal_update();edges=[e for e in bm.edges if e.is_boundary]
result=bmesh.ops.extrude_edge_only(bm,edges=edges);added=[v for v in result['geom'] if isinstance(v,bmesh.types.BMVert)]
for v in added:v.co-=v.normal*.0025
bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(me);bm.free();P.normalize_skin_weights(ob)
# Refit the kangaroo pocket to the anatomical shell rather than retaining floating old detail.
b=C.MeshBuilder('rider:anatomical sweatshirt pocket');surf=R.Surface(ob,arm)
surf.panel(b,'kangaroo',H0+t*.13,Vector((0,1,0)),t,front,[(-.108,-.055),(.108,-.055),(.077,.065),(-.077,.065)],cotton,.004,.004,seam=rib)
R.bind(b.build(),arm)
C.apply_colourway(json.loads(bpy.context.scene['heroColourways'])['rookie']);P.clear_pose(arm)
assert sig=={k:v for k,v in G.invariant_signature().items() if k!='materials'}
assert fixed=={name:H.mesh_signature(bpy.data.objects[name]) for name in fixed}
P.check_source(arm,[o for o in bpy.context.scene.objects if o.type=='MESH'])
bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(OUT),compress=True)
report={'source':str(SOURCE),'anatomy_source':'Blender human-base-meshes-bundle v1.4.1 / GEO-body_male_realistic / CC0','anatomy_zip_sha256':G.sha(ROOT/'human-base-meshes.zip'),'script_sha256':G.sha(__file__),'output_sha256':G.sha(OUT),'topology':G.topology(me),'rig_actions_sockets_unchanged':True,'other_meshes_unchanged':True}
OUT.with_suffix('.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
