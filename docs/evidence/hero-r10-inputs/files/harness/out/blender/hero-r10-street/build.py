"""R10 single Street garment surface pass: no anatomy, skeleton or weight rebuild.
A small number of seam-guided compression creases and constructed opening edges,
with restrained broad tone/roughness masks. All old vertex weights remain exact.
"""
import bpy,bmesh,json,math,sys
from pathlib import Path
from mathutils import Vector,Matrix
from mathutils.kdtree import KDTree
sys.path.insert(0,str(Path('assets/blender').resolve()))
import common as C
import author_garments as G
import author_hood as H
import author_rider_hero as R
import rider_asset as P
ROOT=Path('harness/out/blender/hero-r10-street');SOURCE=Path('harness/out/blender/street-head/finished-street/street-assembled-v3.blend');OUT=ROOT/'street-r10-v1.blend';assert not OUT.exists()
source_sha=G.sha(SOURCE);bpy.ops.wm.open_mainfile(filepath=str(SOURCE));arm=bpy.data.objects['rider_rig'];P.clear_pose(arm)
signature={k:v for k,v in G.invariant_signature().items() if k!='materials'}
allowed={'rider:anatomical sweatshirt','rider:anatomical sweatshirt pocket','rider:denim','rider:constructed jean pockets'}
others={o.name:H.mesh_signature(o) for o in bpy.data.objects if o.type=='MESH' and o.name not in allowed}
weights_before={o.name:[[ (g.group,g.weight) for g in v.groups] for v in o.data.vertices] for o in bpy.data.objects if o.type=='MESH'}
H0=arm.data.bones['pelvis'].head_local;t=(arm.data.bones['pelvis'].tail_local-H0).normalized();front=Vector((t.z,0,-t.x));lat=Vector((0,1,0))

def smooth(x):x=max(0,min(1,x));return x*x*(3-2*x)
def crease(along,angle,station,slope,angle_center,width=.010,span=.9,amplitude=.004):
 """One tapered diagonal ridge/valley, never a repeating circumference wave."""
 da=(angle-angle_center+math.pi)%(2*math.pi)-math.pi
 distance=along-station-slope*da
 envelope=math.exp(-(da/span)**4)
 ridge=math.exp(-(distance/width)**2)-.40*math.exp(-(distance/(width*2.6))**2)
 return amplitude*ridge*envelope

def attr(ob):
 a=ob.data.attributes.get('r10_cloth_tone') or ob.data.attributes.new('r10_cloth_tone','FLOAT','POINT')
 return a

def modify(ob,trousers=False):
 a=attr(ob);moves={};max_move=0
 for v in ob.data.vertices:
  p=v.co.copy();normal=v.normal.copy();delta=0.;tone=0.;ww=R.weights(ob,v);side='L' if p.y<0 else 'R';sgn=-1 if side=='L' else 1
  if trousers:
   thigh=arm.data.bones['thigh.'+side];shin=arm.data.bones['shin.'+side];axis=(thigh.tail_local-thigh.head_local).normalized();knee=shin.head_local
   down=(shin.tail_local-shin.head_local).normalized();bis=(axis+down).normalized();out=Vector((-bis.z,0,bis.x)).normalized();cross=bis.cross(out).normalized()
   along=(p-knee).dot(bis);radial=p-knee-bis*along;angle=math.atan2(radial.dot(cross),radial.dot(out))
   # A slanted front-knee ease fold and two shorter back-knee compression folds.
   delta+=crease(along,angle,-.090 if side=='L' else -.072,.023*sgn,0,.016,.85,.0046)
   delta+=crease(along,angle,.045,.020*sgn,math.pi,.010,.85,.0045)
   delta+=crease(along,angle,.095,-.014*sgn,math.pi+.28,.008,.55,.0028)
   # Restrained worn knee/front thigh, darker outer seam; unchanged blue class pigment.
   facing=max(0,math.cos(angle));tone=.32*math.exp(-((along+.050)/.135)**2)*facing**3
   tone-=.16*math.exp(-((abs(angle)-math.pi/2)/.19)**2)*math.exp(-((along+.10)/.35)**2)
   tone+=delta*23
  else:
   uw=ww.get('upperArm.'+side,0);fw=ww.get('forearm.'+side,0)
   if uw+fw>.18:
    upper=uw>=fw;bone=arm.data.bones[('upperArm.' if upper else 'forearm.')+side];axis=(bone.tail_local-bone.head_local).normalized();el=arm.data.bones['forearm.'+side].head_local
    shoulder=arm.data.bones['upperArm.'+side].head_local;wrist=arm.data.bones['hand.'+side].head_local
    inward=(shoulder+wrist)*.5-el;inward=(inward-axis*inward.dot(axis)).normalized();cross=axis.cross(inward).normalized()
    along=(p-el).dot(axis);radial=p-el-axis*along;angle=math.atan2(radial.dot(cross),radial.dot(inward))
    if upper:
     delta+=crease(along,angle,-.057,.018*sgn,.10,.012,.78,.0042)
    else:
     delta+=crease(along,angle,.044,.021*sgn,-.10,.012,.85,.0048)
     if side=='L':delta+=crease(along,angle,.095,-.013,.38,.009,.55,.0028)
    # Broad seam-underfold tonal variation without painting a dark ring.
    tone=delta*32-.14*math.exp(-((angle-1.5)/.20)**2)*math.exp(-((along-.06)/.25)**2)
    # A single relaxed cuff gathering, tapering before the actual contact anchor.
    distance=(p-wrist).length
    delta+=.0018*math.exp(-((distance-.082)/.028)**2)*max(0,math.cos(angle+.6))**4
   else:
    rel=p-H0;u=rel.dot(t);depth=rel.dot(front);angle=math.atan2(rel.y,depth)
    # Two irregular creases rise from opposite waist seams; front pouch stays quiet.
    delta+=crease(u,angle,.070,.042,-1.05,.016,.65,.0055)
    delta+=crease(u,angle,.118,-.026,1.05,.018,.64,.0047)
    delta+=crease(u,angle,.032,.018,math.pi,.014,.60,.0032)
    tone=delta*30-.12*math.exp(-((abs(angle)-1.42)/.20)**2)*math.exp(-((u-.16)/.25)**2)
    # Rib hem gathered shoulder: one continuous folded edge, no scalloped sine waves.
    if u<.067:delta+=.0024*math.exp(-((u-.028)/.009)**2)
   delta*=min(1,max(0,(uw+fw)/.65)) if uw+fw>.18 else 1
  delta=max(-.003,min(.005,delta));v.co+=normal*delta;a.data[v.index].value=max(-.5,min(.55,tone))
  moves[v.index]=v.co-p;max_move=max(max_move,abs(delta))
 ob.data.update();return moves,max_move

top=bpy.data.objects['rider:anatomical sweatshirt'];pants=bpy.data.objects['rider:denim']
old_top=[v.co.copy() for v in top.data.vertices];old_pants=[v.co.copy() for v in pants.data.vertices]
top_moves,top_max=modify(top);pant_moves,pant_max=modify(pants,True)
# Existing pouch/pockets and their stitching follow their parent cloth displacement;
# their topology and vertex groups are unchanged.
for name,base,old,moves in [('rider:anatomical sweatshirt pocket',top,old_top,top_moves),('rider:constructed jean pockets',pants,old_pants,pant_moves)]:
 ob=bpy.data.objects[name];tree=KDTree(len(old))
 for i,p in enumerate(old):tree.insert(p,i)
 tree.balance();a=attr(ob);basea=base.data.attributes['r10_cloth_tone']
 for v in ob.data.vertices:
  co,i,d=tree.find(v.co);v.co+=moves[i];a.data[v.index].value=basea.data[i].value
 ob.data.update()
# One sewn fold at each real garment opening, sampled from its current weighted edge.
# The existing turned boundary stays intact; this adds a small, readable rounded seam.
bm=bmesh.new();bm.from_mesh(top.data);bm.normal_update();bm.verts.ensure_lookup_table();layer=bm.verts.layers.deform.verify()
boundaries=[];remaining={v for e in bm.edges if e.is_boundary for v in e.verts}
while remaining:
 todo=[remaining.pop()];part=set(todo)
 while todo:
  v=todo.pop()
  for e in v.link_edges:
   w=e.other_vert(v)
   if e.is_boundary and w in remaining:remaining.remove(w);part.add(w);todo.append(w)
 boundaries.append(G.boundary_cycle(part))
b=C.MeshBuilder('rider:R10 garment opening construction');rib=bpy.data.materials['hero knitted rib']
for ring in boundaries:
 points=[v.co+v.normal*.0016 for v in ring];points.append(points[0]);ww=[{top.vertex_groups[k].name:w for k,w in v[layer].items()} for v in ring];ww.append(ww[0])
 geom=C.prim_tube(points,.00165,sides=5,samples=1)
 def wg(co):return ww[min(range(len(points)),key=lambda i:(co-points[i]).length)]
 b.add(geom,Matrix.Identity(4),rib,group=wg);geom.free()
bm.free();R.bind(b.build(),arm)
# Broader physical color/roughness variation is tied to the actual garment relief.
# Attribute zero is neutral on the unchanged hood/other uses of these materials.
mat_names=('hero heavy cotton','hero indigo twill','hero denim pocket','hero knitted rib')
for name in mat_names:
 m=bpy.data.materials[name];nt=m.node_tree;bs=nt.nodes['BSDF'];old=bs.inputs['Base Color'].links[0].from_socket if bs.inputs['Base Color'].links else tuple(bs.inputs['Base Color'].default_value)
 att=C.node(m,'ShaderNodeAttribute','R10 garment construction tone');att.attribute_name='r10_cloth_tone'
 factor=C.math_node(m,'MULTIPLY_ADD',att.outputs['Fac'],.24,1.0)
 C.link(m,C.mix_rgb(m,1,old,factor,blend='MULTIPLY'),bs.inputs['Base Color'])
 rough=bs.inputs['Roughness'].links[0].from_socket if bs.inputs['Roughness'].links else bs.inputs['Roughness'].default_value
 changed=C.math_node(m,'ADD',rough,C.math_node(m,'MULTIPLY',att.outputs['Fac'],.055))
 C.link(m,C.math_node(m,'MINIMUM',C.math_node(m,'MAXIMUM',changed,.74 if 'cotton' in name or 'rib' in name else .72),.96),bs.inputs['Roughness'])
# Exact weight and non-garment geometry/rig checks, before saving fresh source.
assert signature=={k:v for k,v in G.invariant_signature().items() if k!='materials'}
assert others=={name:H.mesh_signature(bpy.data.objects[name]) for name in others}
for name,ww in weights_before.items():assert ww==[[(g.group,g.weight) for g in v.groups] for v in bpy.data.objects[name].data.vertices],name
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH'];P.check_source(arm,meshes)
topologies={o.name:G.topology(o.data) for o in meshes};assert all(not r['degenerate_faces'] and not r['nonmanifold_interior_edges'] for r in topologies.values())
# Finite source deformation at three frames per existing clip, no changes to clips.
checks=[]
for action in bpy.data.actions:
 arm.animation_data.action=action
 for frame in (int(action.frame_range[0]),int(sum(action.frame_range)/2),int(action.frame_range[1])):
  bpy.context.scene.frame_set(frame);deps=bpy.context.evaluated_depsgraph_get()
  for ob in (top,pants):
   eo=ob.evaluated_get(deps);me=eo.to_mesh();assert all(math.isfinite(c) for v in me.vertices for c in v.co);eo.to_mesh_clear()
  checks.append([action.name,frame])
P.clear_pose(arm);bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(OUT),compress=True);assert source_sha==G.sha(SOURCE)
report={'source':str(SOURCE),'source_sha256':source_sha,'output_sha256':G.sha(OUT),'script_sha256':G.sha(__file__),'unchanged_original_weights':True,'unchanged_face_rig_actions_sockets_contacts':True,'maximum_top_offset_m':top_max,'maximum_denim_offset_m':pant_max,'finite_clip_samples':checks,'topology':topologies,'heroLocalAO':json.loads(bpy.context.scene['heroLocalAO']),'triangles':sum(len(p.vertices)-2 for o in meshes for p in o.data.polygons)}
OUT.with_suffix('.json').write_text(json.dumps(report,indent=2));print(json.dumps({k:v for k,v in report.items() if k!='topology'}))
