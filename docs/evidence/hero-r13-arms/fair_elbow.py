"""One bounded local rest-surface fairing study; no rig, skin weights or runtime changes."""
import bpy,sys,json,math
from pathlib import Path
from mathutils import Vector
sys.path.insert(0,str(Path('assets/blender').resolve()))
import rider_asset as P
import author_garments as G
import author_hood as H
root=Path('harness/out/blender/arms-r13')
source=Path('assets/blender/source/rider-street.blend');out=root/'street-elbow-v1.blend'
assert not out.exists()
bpy.ops.wm.open_mainfile(filepath=str(source.resolve()))
arm=bpy.data.objects['rider_rig'];P.clear_pose(arm)
ob=bpy.data.objects['rider:anatomical sweatshirt']
signature=G.invariant_signature()
fixed={o.name:H.mesh_signature(o) for o in bpy.data.objects if o.type=='MESH' and o!=ob}
before=[v.co.copy() for v in ob.data.vertices]
weights=[[(g.group,g.weight) for g in v.groups] for v in ob.data.vertices]
neighbors=[set() for v in before]
for e in ob.data.edges:
 a,b=e.vertices;neighbors[a].add(b);neighbors[b].add(a)
affected={}
for v in ob.data.vertices:
 w={ob.vertex_groups[g.group].name:g.weight for g in v.groups}
 for side in ['L','R']:
  if w.get('upperArm.'+side,0)+w.get('forearm.'+side,0)<.95:continue
  d=(v.co-arm.data.bones['forearm.'+side].head_local).length
  if d<.09:
   t=max(0,min(1,(.09-d)/.035));affected[v.index]=t*t*(3-2*t)
for iteration in range(4):
 current=[v.co.copy() for v in ob.data.vertices]
 for i,w in affected.items():
  if not neighbors[i]:continue
  mean=sum((current[j] for j in neighbors[i]),Vector())/len(neighbors[i])
  proposed=current[i]+(mean-current[i])*.35*w
  delta=proposed-before[i]
  if delta.length>.003:delta*=.003/delta.length
  ob.data.vertices[i].co=before[i]+delta
ob.data.update()
assert signature==G.invariant_signature()
assert weights==[[(g.group,g.weight) for g in v.groups] for v in ob.data.vertices]
assert fixed=={o.name:H.mesh_signature(o) for o in bpy.data.objects if o.type=='MESH' and o!=ob}
assert all(v.co==before[v.index] for v in ob.data.vertices if v.index not in affected)
P.check_source(arm,[o for o in bpy.data.objects if o.type=='MESH'])
bpy.ops.wm.save_as_mainfile(filepath=str(out.resolve()),compress=True)
(root/'candidate-provenance.json').write_text(json.dumps({'source':str(source),'sourceSha256':G.sha(source),'candidate':str(out),'candidateSha256':G.sha(out),'recipeSha256':G.sha(__file__),'changedVertices':sum((v.co-before[v.index]).length>1e-9 for v in ob.data.vertices),'maxDisplacement':max((v.co-before[v.index]).length for v in ob.data.vertices),'onlyRegion':'sweatshirt vertices within90mm of elbow joint, upperArm+forearm weight>=.95','rigActionsSocketsMaterialsWeightsOtherMeshesOutsideRegionParity':True,'status':'Measurement study only; not played or accepted','licenses':'docs/evidence/hero-r9-inputs/THIRD-PARTY.md'},indent=2)+'\n')
