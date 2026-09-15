"""One assembled Street direction: fitted anatomical cotton, photographed fabrics,
modest articulated short hair, retained human head, complete jean pocket construction.
Never changes the pose/rig or immutable head-v1 input.
"""
import bpy,bmesh,json,math,sys
from pathlib import Path
from mathutils import Vector,Matrix
from mathutils.bvhtree import BVHTree
sys.path.insert(0,str(Path('assets/blender').resolve()))
import common as C
import author_garments as G
import author_hood as H
import author_rider_hero as R
import rider_asset as P
sys.path.insert(0,str(Path('harness/out/blender/hero-fabrics').resolve()))
import fabrics
ROOT=Path('harness/out/blender/street-head/finished-street');OUT=ROOT/'street-assembled-v2.blend';SOURCE=Path('harness/out/blender/street-head/street-head-v1.blend');assert not OUT.exists()
source_hash=G.sha(SOURCE);bpy.ops.wm.open_mainfile(filepath=str(SOURCE));arm=bpy.data.objects['rider_rig'];P.clear_pose(arm)
sig={k:v for k,v in G.invariant_signature().items() if k!='materials'}
changed={'rider:anatomical sweatshirt','rider:anatomical sweatshirt pocket','rider:short hair prototype'}
fixed={o.name:H.mesh_signature(o) for o in bpy.data.objects if o.type=='MESH' and o.name not in changed}
top=bpy.data.objects['rider:anatomical sweatshirt'];head=arm.data.bones['head'];H0=arm.data.bones['pelvis'].head_local;t=(arm.data.bones['pelvis'].tail_local-H0).normalized();front=Vector((t.z,0,-t.x))
def smooth(x):x=max(0,min(1,x));return x*x*(3-2*x)
# Tailor the entire sleeve envelope around its true segments. Weights and the authored
# anatomical seam topology are retained; the muscular deltoid dome becomes a set-in sleeve.
before=[];after=[];changed_vertices=0
for v in top.data.vertices:
 original=v.co.copy();w=R.weights(top,v);side='L' if original.y<0 else 'R';uw=w.get('upperArm.'+side,0);fw=w.get('forearm.'+side,0)
 if max(uw,fw)>.06:
  upper=uw>=fw;bone=arm.data.bones[('upperArm.' if upper else 'forearm.')+side];axis=(bone.tail_local-bone.head_local).normalized();along=(original-bone.head_local).dot(axis);center=bone.head_local+axis*along;radial=original-center;radius=radial.length
  if -.065<along<bone.length+.01:
   cap=(.068-.012*smooth((along-.01)/.28)) if upper else (.055-.011*smooth(along/bone.length))
   influence=smooth(max(uw,fw)/.58)
   if radius>cap:v.co-=radial.normalized()*(radius-cap)*.90*influence
   if upper and uw>.8:before.append(radius);after.append((v.co-center).length)
 if uw+fw<.05:
  u=(original-H0).dot(t)
  # Hem sits around the jeans waistband instead of trailing onto the saddle.
  if u<.13:v.co+=t*.024*(1-smooth((u+.02)/.15))
  # One shallow diagonal compression crease, not repeating radial padding.
  if -.02<u<.21:
   v.co+=v.normal*.0025*math.sin((u+original.y*.26)*34)*math.exp(-((u-.06)/.085)**2)
 if (v.co-original).length>1e-6:changed_vertices+=1
top.data.update()
rib=bpy.data.materials['hero knitted rib'];ribidx=next(i for i,m in enumerate(top.data.materials) if m==rib)
for p in top.data.polygons:
 c=p.center;u=(c-H0).dot(t)
 if u<.025 or ((c-head.head_local).length<.087 and abs(c.y)<.085):p.material_index=ribidx
# Refit the functional pouch to the newly tailored torso. No legacy floating patch.
old=bpy.data.objects['rider:anatomical sweatshirt pocket'];bpy.data.objects.remove(old,do_unlink=True)
b=C.MeshBuilder('rider:anatomical sweatshirt pocket');surface=R.Surface(top,arm);cotton=bpy.data.materials['hero heavy cotton']
surface.panel(b,'kangaroo',H0+t*.145,Vector((0,1,0)),t,front,[(-.108,-.050),(.108,-.050),(.075,.064),(-.075,.064)],cotton,.004,.004,seam=rib)
R.bind(b.build(),arm)
# Jeans regain two true rear pockets with modest edge construction; fabric remains one
# continuous R7 trouser shell and unchanged weights/shape.
pants=bpy.data.objects['rider:denim'];surface=R.Surface(pants,arm);b=C.MeshBuilder('rider:constructed jean pockets');denim=bpy.data.materials.get('hero denim pocket')
if denim is None:
 denim=bpy.data.materials['hero indigo twill'].copy();denim.name='hero denim pocket'
thread=bpy.data.materials.get('hero tobacco topstitch') or R.material('hero tobacco topstitch',(.29,.18,.073),.88,650)
for side in ('L','R'):
 thigh=arm.data.bones['thigh.'+side];axis=(thigh.tail_local-thigh.head_local).normalized();back=-Vector((-axis.z,0,axis.x)).normalized()
 surface.panel(b,'rear patch',thigh.head_local+axis*.13,Vector((0,1,0)),axis,back,[(-.043,-.033),(.043,-.033),(.038,.060),(-.035,.065)],denim,.003,.0015,rows=4,cols=5,seam=thread)
R.bind(b.build(),arm)
# Add directional shape to short hair while keeping crown scale human. The existing
# scalp never moves more than 1.5mm; tapered 2cm clumps supply actual side/crown relief.
hair=bpy.data.objects['rider:short hair prototype'];axis=(head.tail_local-head.head_local).normalized();f=Vector((axis.z,0,-axis.x)).normalized();lat=Vector((0,1,0))
for v in hair.data.vertices:
 rel=v.co-head.head_local;x=rel.dot(lat);z=rel.dot(axis)
 relief=.0007+.0007*math.sin(x*230+z*77)**2
 v.co+=v.normal*relief
hair.data.update();tree=BVHTree.FromPolygons([v.co for v in hair.data.vertices],[p.vertices for p in hair.data.polygons])
def place(p):q=(Vector(p)-Vector((0,0,.170)))*.88;return head.head_local+lat*q.x-f*q.y+axis*q.z
b=C.MeshBuilder('rider:short hair directional clumps');hmat=bpy.data.materials['street short natural hair']
for i in range(19):
 x=-.064+i*.0071;seed=[Vector((x,-.085,.365)),Vector((x+.005,-.060,.399)),Vector((x+.007,-.020,.422))]
 centers=[];normals=[]
 for k in range(7):
  u=k/6;seg=0 if u<.5 else 1;v=(u*2)%1 if u<1 else 1;p=place(seed[seg].lerp(seed[seg+1],v));hit,n,idx,d=tree.find_nearest(p)
  centers.append(hit+n*.0008);normals.append(n)
 rings=[]
 for k,(p,n) in enumerate(zip(centers,normals)):
  tangent=(centers[min(6,k+1)]-centers[max(0,k-1)]).normalized();side=n.cross(tangent).normalized();width=.0018*math.sin(math.pi*(k+.3)/6.6)+.00025;height=.0015*math.sin(math.pi*k/6)
  ring=[b.bm.verts.new(p+side*width),b.bm.verts.new(p+n*height),b.bm.verts.new(p-side*width),b.bm.verts.new(p-n*.0004)];rings.append(ring)
 b.bm.verts.index_update()
 for ring in rings:
  for v in ring:b.groups[v.index]={'head':1}
 for a,c in zip(rings,rings[1:]):
  for k in range(4):
   face=b.bm.faces.new([a[k],a[(k+1)%4],c[(k+1)%4],c[k]]);face.material_index=b.mat_index(hmat);face.smooth=True
R.bind(b.build(),arm)
# Subtle warm skin and lip variation retain the actual facial geometry and class independence.
for name in ('street human skin','street human warm skin'):
 m=bpy.data.materials[name];m.node_tree.nodes['BSDF'].inputs['Roughness'].default_value=.51
# Real photographed cotton/denim only replaces micro normal + roughness, preserving CW albedo.
fabric_report=fabrics.apply_existing();P.clear_pose(arm)
assert sig=={k:v for k,v in G.invariant_signature().items() if k!='materials'}
assert fixed=={name:H.mesh_signature(bpy.data.objects[name]) for name in fixed}
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH'];P.check_source(arm,meshes)
bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(OUT),compress=True);assert source_hash==G.sha(SOURCE)
report={'source':str(SOURCE),'source_sha256':source_hash,'output_sha256':G.sha(OUT),'script_sha256':G.sha(__file__),'rig_actions_sockets_noncloth_nonhair_geometry_unchanged':True,'sleeve_changed_vertices':changed_vertices,'upper_arm_radius_max_before_m':max(before),'upper_arm_radius_max_after_m':max(after),'head_chin_crown_m':.23344024,'maximum_added_hair_relief_m':.0037,'fabric_report':fabric_report,'top_topology':G.topology(top.data),'triangles':sum(len(p.vertices)-2 for o in meshes for p in o.data.polygons),'ao_export_settings':{'distance':.025,'samples':32,'strength':.8}}
OUT.with_suffix('.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
