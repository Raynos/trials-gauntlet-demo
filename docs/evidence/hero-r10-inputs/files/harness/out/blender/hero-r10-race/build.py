"""R10 Race construction finish; scratch-only, source-backed and invariant audited."""
import bpy,bmesh,json,math,sys
from pathlib import Path
from mathutils import Vector,Matrix
from mathutils.bvhtree import BVHTree
sys.path.insert(0,str(Path('assets/blender').resolve()))
import common as C, author_garments as G, author_hood as H, author_rider_hero as R, rider_asset as P
ROOT=Path('harness/out/blender/hero-r10-race');SOURCE=Path('harness/out/blender/race-head/finished-race/race-assembled-v1.blend');OUT=ROOT/'race-surface-v2.blend'
assert not OUT.exists();sourcehash=G.sha(SOURCE)
bpy.ops.wm.open_mainfile(filepath=str(SOURCE));arm=bpy.data.objects['rider_rig'];P.clear_pose(arm)
inv={k:v for k,v in G.invariant_signature().items() if k!='materials'}
helmet=bpy.data.objects['rider:constructed_helmet'];top=bpy.data.objects['rider:anatomical race jersey'];boots=bpy.data.objects['rider:articulated race boots']
fixed={o.name:H.mesh_signature(o) for o in bpy.data.objects if o.type=='MESH' and o not in [helmet,top]}
originalmats={r[0]:r for r in G.invariant_signature()['materials']}
# Materials are local copies, so pants, gloves and all human surfaces are untouched.
def clone_slot(ob,idx,name,rough,metal=0):
 m=ob.data.materials[idx].copy();m.name=name;ob.data.materials[idx]=m;p=C.bsdf(m)
 for key,val in [('Roughness',rough),('Metallic',metal)]:
  for link in list(p.inputs[key].links):m.node_tree.links.remove(link)
  p.inputs[key].default_value=val
 return m
for i,n in enumerate(['shell enamel','eyeport edge polymer','goggle foam and woven strap','smoke lens']):clone_slot(helmet,i,'r10 '+n,[.30,.48,.88,.13][i],[0,0,0,.12][i])
# Dark manufactured vent floors remain behind physical shell rims.
vent=C.new_mat('r10 vent cavity',(.012,.017,.022,1),rough=.92)
helmet.data.materials.append(vent);ventidx=len(helmet.data.materials)-1
bm=bmesh.new();bm.from_mesh(helmet.data);bm.faces.ensure_lookup_table();bm.verts.ensure_lookup_table()
selected=[]
for f in bm.faces:
 ids=[v.index for v in f.verts]
 # Outer profile crown panels, two three-cell banks outside peak centre.
 if len(ids)==4 and max(ids)<640 and min(ids)//64 in (5,6):
  cols=[i%64 for i in ids]
  if min(cols) in (8,9,10,53,54,55):selected.append(f)
for f in selected:
 result=bmesh.ops.inset_individual(bm,faces=[f],thickness=.0020,depth=0,use_even_offset=True)
 for v in f.verts:v.co-=f.normal*.0030
 f.material_index=ventidx;f.smooth=False
bm.normal_update();bm.to_mesh(helmet.data);bm.free();helmet.data.update()
# Existing compact construction metadata is retained as historical layout only.
helmet['r10_vent_recess_m']=.003;helmet['r10_parts_indices_historical']=True
# Local nonperiodic tension ridges: lower torso pulls diagonally from side seam;
# elbow gathers are two unequal short creases, not circumferential padded bands.
H0=arm.data.bones['pelvis'].head_local;t=(arm.data.bones['pelvis'].tail_local-H0).normalized();front=Vector((t.z,0,-t.x));maxmove=0
for v in top.data.vertices:
 p=v.co.copy();w=R.weights(top,v);side='L' if p.y<0 else 'R';sg=-1 if side=='L' else 1;move=0
 uw=w.get('upperArm.'+side,0);fw=w.get('forearm.'+side,0)
 if uw+fw<.18:
  u=(p-H0).dot(t);y=p.y;facing=max(0,v.normal.dot(front))
  for center,amp,width in ((.095,.0025,.012),(.157,.0018,.009)):
   q=u-center-sg*.27*(y-sg*.065);move+=amp*math.exp(-(q/width)**2)*math.exp(-((y-sg*.095)/.065)**2)*facing
 else:
  elbow=arm.data.bones['forearm.'+side].head_local;axis=(arm.data.bones['forearm.'+side].tail_local-elbow).normalized();u=(p-elbow).dot(axis);r=p-elbow-axis*u
  facing=max(0,-v.normal.dot(front))
  for offset,amp in ((.015,.0022),(.047,.0013)):
   q=u-offset-(.18 if side=='L' else -.12)*r.y
   move+=amp*math.exp(-(q/.010)**2)*math.exp(-(r.y/.055)**2)*facing
 v.co+=v.normal*move;maxmove=max(maxmove,abs(move))
top.data.update()
# Low profile piping follows actual panel boundaries and carries interpolated skin weights.
detail=C.MeshBuilder('rider:r10 construction details');rubber=C.new_mat('r10 edge rubber',(.022,.028,.034,1),rough=.79);metal=C.new_mat('r10 buckle aluminium',(.24,.27,.29,1),rough=.31,metal=.65)
seam=C.new_mat('r10 jersey seam thread',(.035,.043,.056,1),rough=.90)
def tube(points,r,mat,weights):
 geom=C.prim_tube(points,r,sides=5,samples=1);detail.add(geom,Matrix.Identity(4),mat,group=weights);geom.free()
def weights_average(ob,ids):
 result={}
 for i in ids:
  for key,val in R.weights(ob,ob.data.vertices[i]).items():result[key]=result.get(key,0)+val/len(ids)
 return result
seam_count=0
for ob,r,mat in [(top,.00055,seam),(boots,.0010,rubber)]:
 adjacency={}
 for p in ob.data.polygons:
  for e in p.edge_keys:adjacency.setdefault(tuple(sorted(e)),[]).append(p.material_index)
 edges=set()
 for edge,ms in adjacency.items():
  if len(ms)!=2 or ms[0]==ms[1]:continue
  if ob==boots and not (0 in ms or 1 in ms or 4 in ms):continue
  if ob==top and set(ms) not in ({0,1},{0,2}):continue
  edges.add(edge)
 graph={}
 for a,b in edges:graph.setdefault(a,set()).add(b);graph.setdefault(b,set()).add(a)
 while edges:
  seed=next((i for i,ns in graph.items() if len(ns)!=2 and any(tuple(sorted((i,j))) in edges for j in ns)),next(iter(edges))[0])
  ids=[seed];cur=seed
  while True:
   nxt=next((j for j in graph[cur] if tuple(sorted((cur,j))) in edges),None)
   if nxt is None:break
   edges.remove(tuple(sorted((cur,nxt))));ids.append(nxt);cur=nxt
   if cur==seed or len(graph[cur])!=2:break
  if len(ids)<2:continue
  # Keep authored curve corners; collapse only near-collinear microscopic segments.
  keep=[ids[0]]
  for k in range(1,len(ids)-1):
   a=ob.data.vertices[keep[-1]].co;b=ob.data.vertices[ids[k]].co;c=ob.data.vertices[ids[k+1]].co
   if (b-a).length>.012 or (b-a).normalized().dot((c-b).normalized())<.97:keep.append(ids[k])
  keep.append(ids[-1]);pts=[ob.data.vertices[i].co+ob.data.vertices[i].normal*r*.4 for i in keep]
  def skin(co,ob=ob,ids=keep):
   nearest=min(ids,key=lambda i:(ob.data.vertices[i].co-co).length_squared)
   return R.weights(ob,ob.data.vertices[nearest])
  tube(pts,r,mat,skin);seam_count+=len(keep)-1
# Buckle frames seat over the two existing closures on each boot. No foot/contact edits.
for side,sg in [('L',-1),('R',1)]:
 ankle=arm.data.bones['foot.'+side].head_local;knee=arm.data.bones['shin.'+side].head_local;d=(knee-ankle).normalized();f=Vector((d.z,0,-d.x)).normalized();l=d.cross(f).normalized()
 for u in (.155,.257):
  center=ankle+d*u+l*sg*.090+f*.032
  pts=[center+f*x+d*z for x,z in [(-.015,-.009),(.015,-.009),(.015,.009),(-.015,.009),(-.015,-.009)]]
  tube(pts,.0016,metal,{'shin.'+side:1})
  tube([center-f*.009,center+f*.010],.0021,metal,{'shin.'+side:1})
# Eyeport lower polymer lip is defined by existing frame; black foam remains in its own layer.
# Rim tangent tubes sit on the outer goggle ring and stay away from human skin.
part=next(p for p in json.loads(helmet['author_helmet_parts']) if p['name']=='goggle seal rim and lens')
# Original vertex indices survive face insets; newly inserted vertices append.
pts=[helmet.data.vertices[part['first']+2*18+i].co.copy() for i in range(18)]
tube(pts+[pts[0]],.00085,rubber,{'head':1})
new=R.bind(detail.build(),arm)
assert fixed=={n:H.mesh_signature(bpy.data.objects[n]) for n in fixed}
assert inv=={k:v for k,v in G.invariant_signature().items() if k!='materials'}
assert originalmats=={r[0]:r for r in G.invariant_signature()['materials'] if r[0] in originalmats}
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH'];P.check_source(arm,meshes)
checks=[]
for act in sorted(bpy.data.actions,key=lambda a:a.name):
 arm.animation_data.action=act;arm.animation_data.action_slot=act.slots[0];lo,hi=map(int,act.frame_range)
 for frame in sorted(set((lo,(lo+hi)//2,hi))):
  bpy.context.scene.frame_set(frame);deps=bpy.context.evaluated_depsgraph_get();trees=[]
  for o in [helmet,bpy.data.objects['rider:human head and neck'],top,new]:
   ev=o.evaluated_get(deps);me=ev.to_mesh();assert all(math.isfinite(c) for v in me.vertices for c in v.co)
   if len(trees)<2:trees.append(BVHTree.FromPolygons([ev.matrix_world@v.co for v in me.vertices],[list(p.vertices) for p in me.polygons]))
   ev.to_mesh_clear()
  cross=len(trees[0].overlap(trees[1]));assert cross==0
  checks.append(dict(action=act.name,frame=frame,finite=True,helmet_human_crossings=cross))
P.clear_pose(arm);bpy.context.scene['heroLocalAO']=json.dumps(dict(distance=.025,samples=32,strength=.8));C.apply_colourway(json.loads(bpy.context.scene['heroColourways'])['rookie'])
assert inv=={k:v for k,v in G.invariant_signature().items() if k!='materials'}
for o in [helmet,top,new]:assert G.topology(o.data)['degenerate_faces']==0
bpy.ops.wm.save_as_mainfile(filepath=str(OUT),compress=True)
report=dict(source=str(SOURCE),source_sha256=sourcehash,output_sha256=G.sha(OUT),script_sha256=G.sha(__file__),rig_actions_sockets_unchanged=True,fixed_meshes=list(fixed),all_original_material_graphs_unchanged=True,vent_faces=len(selected),vent_depth_m=.003,max_jersey_displacement_m=maxmove,seam_segments=seam_count,boot_buckle_frames=4,base_boot_contact_and_weights_unchanged=True,heroLocalAO=json.loads(bpy.context.scene['heroLocalAO']),pose_checks=checks,topologies={o.name:G.topology(o.data) for o in [helmet,top,new]},triangles=sum(len(p.vertices)-2 for o in meshes for p in o.data.polygons),visual_verdict='Parent plays and judges; no quality acceptance claim')
OUT.with_suffix('.json').write_text(json.dumps(report,indent=2));assert G.sha(SOURCE)==sourcehash;print(json.dumps(report,indent=2))
