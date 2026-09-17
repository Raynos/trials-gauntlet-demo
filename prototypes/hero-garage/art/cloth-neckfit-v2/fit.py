"""Fit clothing to unchanged closed head bust; do not modify head geometry."""
import bpy,bmesh,json,struct,heapq,math
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from pathlib import Path

def fit_neck(shirt):
 P=Path.cwd()/'prototypes/hero-garage';raw=(P/'public/assets/street01-rider-cloth28.glb').read_bytes();n=struct.unpack_from('<I',raw,12)[0];j=json.loads(raw[20:20+n]);blob=raw[28+n:]
 def acc(i):
  a=j['accessors'][i];v=j['bufferViews'][a['bufferView']];return np.frombuffer(blob,dtype={5123:'<u2',5125:'<u4',5126:'<f4'}[a['componentType']],count=a['count']*{'SCALAR':1,'VEC3':3}[a['type']],offset=v.get('byteOffset',0)+a.get('byteOffset',0)).reshape(a['count'],-1)
 node=next(n for n in j['nodes'] if n.get('name')=='Street01_Authored_EditableBody_Runtime');p=j['meshes'][node['mesh']]['primitives'][0];v=acc(p['attributes']['POSITION']);v=np.column_stack((v[:,0],-v[:,2],v[:,1]));tri=acc(p['indices']).reshape(-1,3);tree=BVHTree.FromPolygons([Vector(x) for x in v],tri.tolist(),all_triangles=True)
 bm=bmesh.new();bm.from_mesh(shirt.data);bm.verts.ensure_lookup_table();neck={v.index for e in bm.edges if e.is_boundary for v in e.verts if v.co.z>1.1};assert len(neck)==148;old={v.index:v.co.copy() for v in bm.verts};dist={i:0. for i in neck};heap=[(0.,i)for i in neck];heapq.heapify(heap)
 while heap:
  d,i=heapq.heappop(heap)
  if d>dist[i] or d>.12:continue
  for e in bm.verts[i].link_edges:
   q=e.other_vert(bm.verts[i]);nd=d+e.calc_length()
   if nd<dist.get(q.index,1e9):dist[q.index]=nd;heapq.heappush(heap,(nd,q.index))
 center=Vector((.828,0,1.247));axis=Vector((.407,0,.914)).normalized();shift={}
 for i in neck:
  delta=old[i]-center;direction=(delta-axis*delta.dot(axis)).normalized();hit,normal,_,_=tree.ray_cast(center,direction,.3)
  if hit is None:raise RuntimeError('Neck radial section ray missed saved skin')
  shift[i]=hit+direction*.003-old[i]
 for vv in bm.verts:
  d=dist.get(vv.index,1e9)
  if d>=.07:continue
  near=sorted(neck,key=lambda i:(old[i]-vv.co).length_squared)[:6];weights=[1/max(1e-6,(old[i]-vv.co).length_squared)**2 for i in near];delta=shift[vv.index] if vv.index in neck else sum((shift[i]*w for i,w in zip(near,weights)),Vector())/sum(weights);t=1-d/.07;vv.co+=delta*t*t*(3-2*t)
 bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(shirt.data);bm.free();shirt.data.update()
 from repair_annulus import repair_annulus
 harmonic=repair_annulus(shirt,dist,radius=.07)
 # Rim follows the exact same head transform as the saved skin; skin influence
 # fades smoothly into existing cloth over70mm of actual surface adjacency.
 for v in shirt.data.vertices:
  d=dist.get(v.index,1e9)
  if d>=.07:continue
  t=1-d/.07;t=t*t*(3-2*t);ws={shirt.vertex_groups[g.group].name:g.weight*(1-t) for g in v.groups};ws['head']=ws.get('head',0)+t;ws=dict(sorted(ws.items(),key=lambda a:-a[1])[:4]);total=sum(ws.values())
  for g in shirt.vertex_groups:g.remove([v.index])
  for name,w in ws.items():g=shirt.vertex_groups.get(name) or shirt.vertex_groups.new(name=name);g.add([v.index],w/total,'REPLACE')
 return {'rimVertices':len(neck),'rimClearanceM':.003,'weightMethod':'100% head at rim, smoothstep fade into original weights over70mm geodesic','harmonicAnnulus':harmonic,'bustProjectionPerformed':False,'maximumControlDisplacementM':max((v.co-old[v.index]).length for v in shirt.data.vertices),'protectedHead':'Unchanged; only sampled original saved head mesh','limitations':['Control-surface rest clearance is not evaluated subdivision motion proof. Parent must review candidate through all clips.']}
