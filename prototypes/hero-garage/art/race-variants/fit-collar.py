"""Low continuous jersey neckline fitted to original race neck, no hoodie graft."""
import bpy,bmesh,math,heapq,sys
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree

def fit(jersey,arm):
 skin=bpy.data.objects['rider:human head and neck'];tree=BVHTree.FromPolygons([v.co for v in skin.data.vertices],[p.vertices for p in skin.data.polygons]);bm=bmesh.new();bm.from_mesh(jersey.data);bm.verts.ensure_lookup_table();neck={v.index for e in bm.edges if e.is_boundary for v in e.verts if v.co.z>1.1};assert len(neck)==148;old={v.index:v.co.copy()for v in bm.verts};adj={i:[]for i in neck}
 for e in bm.edges:
  if e.is_boundary and all(v.index in neck for v in e.verts):
   a,b=(v.index for v in e.verts);adj[a].append(b);adj[b].append(a)
 order=[min(neck)];prev=None
 while True:
  choices=sorted(x for x in adj[order[-1]]if x!=prev);n=choices[0]
  if n==order[0]:break
  prev=order[-1];order.append(n)
 assert set(order)==neck
 axis=(arm.data.bones['head'].tail_local-arm.data.bones['head'].head_local).normalized();front=Vector((axis.z,0,-axis.x));side=Vector((0,1,0));center=arm.data.bones['head'].head_local-axis*.055
 angles=[math.atan2((old[i]-center).dot(side),(old[i]-center).dot(front))for i in order];turn=sum(math.atan2(math.sin(angles[(k+1)%len(order)]-a),math.cos(angles[(k+1)%len(order)]-a))for k,a in enumerate(angles));sign=1 if turn>0 else -1;weights={}
 for k,i in enumerate(order):
  angle=angles[0]+sign*math.tau*k/len(order);direction=front*math.cos(angle)+side*math.sin(angle);hit,normal,face,_=tree.ray_cast(center,direction,.25);assert hit is not None,(i,list(center));bm.verts[i].co=hit+direction*.004
  closest=min(skin.data.polygons[face].vertices,key=lambda q:(skin.data.vertices[q].co-hit).length_squared);weights[i]={skin.vertex_groups[g.group].name:g.weight for g in skin.data.vertices[closest].groups}
 dist={i:0. for i in neck};heap=[(0.,i)for i in neck];heapq.heapify(heap)
 while heap:
  d,i=heapq.heappop(heap)
  if d>dist[i]or d>.10:continue
  for e in bm.verts[i].link_edges:
   q=e.other_vert(bm.verts[i]).index;nd=d+(old[q]-old[i]).length
   if nd<dist.get(q,1e9):dist[q]=nd;heapq.heappush(heap,(nd,q))
 bm.to_mesh(jersey.data);bm.free();sys.path.insert(0,str(Path.cwd()/'prototypes/hero-garage/art/hoodie-shell'));from repair_annulus import repair_annulus
 report=repair_annulus(jersey,dist,radius=.10);changedweights=0
 for v in jersey.data.vertices:
  d=dist.get(v.index,1e9)
  if d>=.075:continue
  t=1-d/.075;t=t*t*(3-2*t);closest=min(neck,key=lambda i:(old[i]-old[v.index]).length_squared);ws={jersey.vertex_groups[g.group].name:g.weight*(1-t)for g in v.groups}
  for n,w in weights[closest].items():ws[n]=ws.get(n,0)+w*t
  ws=dict(sorted(ws.items(),key=lambda p:-p[1])[:4]);total=sum(ws.values())
  for g in jersey.vertex_groups:g.remove([v.index])
  for n,w in ws.items():(jersey.vertex_groups.get(n)or jersey.vertex_groups.new(name=n)).add([v.index],w/total,'REPLACE')
  changedweights+=1
 report.update({'method':'Evenly ordered low neck boundary fitted4mm outside actual race skin; harmonic annulus replaces folded lip; local skin weights matched to race neck','center':list(center),'neckVertices':148,'changedWeightVertices':changedweights,'positionChanges':[{'index':v.index,'delta':list(v.co-old[v.index])}for v in jersey.data.vertices if(v.co-old[v.index]).length>1e-8]});return report
