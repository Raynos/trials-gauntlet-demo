"""Natural connected garment patterns; edits UVs/seams only, never saves a source."""
import bpy,bmesh,heapq,json,hashlib,math
import numpy as np
from pathlib import Path

def signature(o):
 return hashlib.sha256(repr(([tuple(v.co) for v in o.data.vertices],[tuple(p.vertices) for p in o.data.polygons],[[(g.group,g.weight) for g in v.groups] for v in o.data.vertices])).encode()).hexdigest()

def metrics(o):
 m=o.data;m.calc_loop_triangles();uv=m.uv_layers.active.data;parent=list(range(len(m.polygons)))
 def root(i):
  while parent[i]!=i:parent[i]=parent[parent[i]];i=parent[i]
  return i
 edgefaces={}
 for p in m.polygons:
  ids=list(p.loop_indices)
  for i,li in enumerate(ids):
   lj=ids[(i+1)%len(ids)];vi=m.loops[li].vertex_index;vj=m.loops[lj].vertex_index;k=tuple(sorted((vi,vj)));pair=tuple(tuple(round(float(x),6) for x in uv[l].uv) for l in ((li,lj) if vi<vj else (lj,li)));edgefaces.setdefault(k,[]).append((p.index,pair))
 for rows in edgefaces.values():
  if len(rows)==2 and rows[0][1]==rows[1][1]:parent[root(rows[0][0])]=root(rows[1][0])
 stretch=[];zero=0;flips=0
 for t in m.loop_triangles:
  a,b,c=[np.array(m.vertices[i].co) for i in t.vertices];u,v,w=[np.array(uv[i].uv) for i in t.loops];e=b-a;length=np.linalg.norm(e);n=np.cross(e,c-a);area=np.linalg.norm(n);signed=float(np.linalg.det(np.column_stack((v-u,w-u))));zero+=abs(signed)<1e-12;flips+=signed< -1e-12
  if area<1e-14 or abs(signed)<1e-12:continue
  basis=np.array([[length,np.dot(c-a,e/length)],[0,area/length]]);jac=np.column_stack((v-u,w-u))@np.linalg.inv(basis);sv=np.linalg.svd(jac,compute_uv=False);stretch.append(float(sv[0]/sv[1]))
 return {'islands':len({root(i) for i in parent}),'zeroAreaUVTriangles':int(zero),'uvTriangleOrientationNegativeCount':int(flips),'anisotropyMedian':float(np.median(stretch)),'anisotropyP95':float(np.quantile(stretch,.95)),'anisotropyMax':float(max(stretch)),'seamEdges':sum(e.use_seam for e in m.edges)}

def shirt_seams(o):
 bm=bmesh.new();bm.from_mesh(o.data);bm.verts.ensure_lookup_table();left={e for e in bm.edges if e.is_boundary};loops=[]
 while left:
  todo=[next(iter(left))];vs=set()
  while todo:
   e=todo.pop()
   if e not in left:continue
   left.remove(e);vs.update(v.index for v in e.verts)
   for v in e.verts:todo.extend(x for x in v.link_edges if x in left)
  loops.append(vs)
 assert sorted(map(len,loops))==[44,44,72,148]
 neck=next(v for v in loops if len(v)==148);hem=next(v for v in loops if len(v)==72);cuffs=[v for v in loops if len(v)==44]
 for e in bm.edges:e.seam=False
 paths=[]
 def route(start,goal,back=False):
  dist={start:0.};previous={};heap=[(0.,start)]
  while heap:
   d,i=heapq.heappop(heap)
   if d!=dist[i]:continue
   if i==goal:break
   for e in bm.verts[i].link_edges:
    v=e.other_vert(bm.verts[i]);co=(v.co+bm.verts[i].co)*.5
    # Favor center-back for torso cut, lower sleeve surface for underarm cuts.
    penalty=1+abs(co.y)*30 if back else 1+max(0,co.z-1.02)*8
    nd=d+e.calc_length()*penalty
    if nd<dist.get(v.index,1e9):dist[v.index]=nd;previous[v.index]=(i,e);heapq.heappush(heap,(nd,v.index))
  path=[goal];i=goal
  while i!=start:i,e=previous[i];e.seam=True;path.append(i)
  paths.append(path)
 neckback=min(neck,key=lambda i:bm.verts[i].co.x+abs(bm.verts[i].co.y));hemback=min(hem,key=lambda i:bm.verts[i].co.x+abs(bm.verts[i].co.y));route(neckback,hemback,True)
 for cuff in cuffs:
  side=1 if sum(bm.verts[i].co.y for i in cuff)>0 else -1
  start=min(cuff,key=lambda i:bm.verts[i].co.z);goal=max(hem,key=lambda i:side*bm.verts[i].co.y);route(start,goal)
 bm.to_mesh(o.data);bm.free();return [len(p) for p in paths]

def hood_seams(o):
 # Separate outer and lining at mouth; center-back seam opens each tapered panel.
 assert len(o.data.vertices)==960
 for e in o.data.edges:
  a,b=e.vertices;seam=False
  for off in (0,480):
   x,y=a-off,b-off
   if 0<=x<480 and 0<=y<480:
    seam=(x<48 and y<48) or (x>=432 and y>=432) or (x%48==24 and y%48==24)
    if seam:break
  e.use_seam=seam or set((a,b))=={24,504}

def unwrap_cloth(obs,margin=.006):
 before={o.name:signature(o) for o in obs};base={o.name:metrics(o) for o in obs};shirt=next(o for o in obs if o.name=='rider:anatomical sweatshirt');paths=shirt_seams(shirt)
 for o in obs:
  if o.name=='rider:folded hood':hood_seams(o)
  elif o!=shirt:
   # Pocket's closed welt and open body remain distinct physical pattern pieces.
   for e in o.data.edges:e.use_seam=False
   bm=bmesh.new();bm.from_mesh(o.data)
   for e in bm.edges:
    if len(e.link_faces)==2 and e.calc_face_angle()>math.radians(65):e.seam=True
   bm.to_mesh(o.data);bm.free()
 bpy.ops.object.select_all(action='DESELECT')
 for o in obs:o.select_set(True)
 bpy.context.view_layer.objects.active=shirt;bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.uv.unwrap(method='ANGLE_BASED',margin=margin);bpy.ops.uv.average_islands_scale();bpy.ops.uv.pack_islands(rotate=True,margin=margin);bpy.ops.object.mode_set(mode='OBJECT')
 after={o.name:signature(o) for o in obs};assert before==after
 return {'method':'Connected back-center and two underarm-to-hem cuts; hood outer/lining mouth and back-center seams; angle-based unwrap, common-scale packing','shirtSeamPathVertexCounts':paths,'geometryTopologyWeightsExactlyPreserved':True,'before':base,'after':{o.name:metrics(o) for o in obs},'limitations':['Anisotropy measures local UV stretch only, not texel resolution or visual cloth-scale acceptance.','No overlap proof from island count; parent bake and rendered material review required.']}

if __name__=='__main__':
 P=Path.cwd()/'prototypes/hero-garage';bpy.ops.wm.open_mainfile(filepath=str(P/'art/hoodie-shell/hoodie-source.blend'));obs=[o for o in bpy.context.scene.objects if o.type=='MESH'];r=unwrap_cloth(obs);(P/'reports/hoodie-connected-uv.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r,indent=2))
