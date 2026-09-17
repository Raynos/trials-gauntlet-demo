"""Read-only source/candidate topology, influence and export compatibility audit."""
import bpy,bmesh,json,heapq,struct,hashlib
import numpy as np
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
R=Path.cwd();P=R/'prototypes/hero-garage';name='rider:anatomical sweatshirt'
def snapshot(path):
 bpy.ops.wm.open_mainfile(filepath=str(path));o=bpy.data.objects[name];m=o.data;bm=bmesh.new();bm.from_mesh(m);bm.verts.ensure_lookup_table();left={e for e in bm.edges if e.is_boundary};loops=[]
 while left:
  stack=[next(iter(left))];vs=set()
  while stack:
   e=stack.pop()
   if e not in left:continue
   left.remove(e);vs.update(v.index for v in e.verts)
   for v in e.verts:stack.extend(x for x in v.link_edges if x in left)
  loops.append(sorted(vs))
 m.calc_loop_triangles();uv=m.uv_layers.active;areas=[]
 for t in m.loop_triangles if uv else []:
  a,b,c=[uv.data[i].uv for i in t.loops];areas.append(abs((b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x))*.5)
 result={'positions':[list(v.co) for v in m.vertices],'faces':[list(p.vertices) for p in m.polygons],'edges':[list(e.vertices) for e in m.edges],'weights':[{o.vertex_groups[g.group].name:g.weight for g in v.groups if g.weight>1e-8} for v in m.vertices],'loops':loops,'vertices':len(m.vertices),'polygons':len(m.polygons),'geometryDegenerateFaces':sum(f.calc_area()<1e-12 for f in bm.faces),'nonmanifoldInteriorEdges':sum(not e.is_manifold and not e.is_boundary for e in bm.edges),'boundaryBranchVertices':[v.index for v in bm.verts if any(e.is_boundary for e in v.link_edges) and sum(e.is_boundary for e in v.link_edges)!=2],'zeroAreaUVTriangles':sum(a<1e-12 for a in areas) if areas else None,'minimumUVTriangleArea':min(areas) if areas else None,'rig':{b.name:[list(row) for row in b.matrix_local] for b in bpy.data.objects['rider_rig'].data.bones}}
 result['modifiers']=[{'name':mod.name,'type':mod.type,'levels':mod.levels if mod.type=='SUBSURF' else None,'renderLevels':mod.render_levels if mod.type=='SUBSURF' else None} for mod in o.modifiers]
 bpy.context.view_layer.update();evaluated=o.evaluated_get(bpy.context.evaluated_depsgraph_get());em=evaluated.to_mesh();tree=BVHTree.FromPolygons([v.co for v in em.vertices],[p.vertices for p in em.polygons]);hood=bpy.data.objects['rider:folded hood'];gaps=[];signed=[]
 for v in hood.data.vertices:
  hit,normal,fi,distance=tree.find_nearest(v.co)
  if hit is not None:gaps.append(distance);signed.append((v.co-hit).dot(normal))
 result['evaluatedSweatshirt']={'vertices':len(em.vertices),'polygons':len(em.polygons)};evaluated.to_mesh_clear()
 result['hoodToEvaluatedShirtRest']={'samples':len(gaps),'minimumDistanceM':min(gaps),'maximumDistanceM':max(gaps),'meanDistanceM':sum(gaps)/len(gaps),'minimumSignedNormalDistanceM':min(signed),'negativeSignedSamples':sum(d< -1e-6 for d in signed),'limitation':'Vertex nearest-surface distances and local normal sign, not triangle intersection or attachment continuity proof.'}
 bm.free();return result
src=R/'assets/blender/source/rider-street.blend';cand=P/'art/hoodie-shell/hoodie-source.blend';a=snapshot(src);b=snapshot(cand);pos=np.array(a['positions']);out=np.array(b['positions']);neck=next(l for l in a['loops'] if len(l)==148);adj=[[] for _ in pos]
for i,j in a['edges']:adj[i].append(j);adj[j].append(i)
dist={i:0. for i in neck};heap=[(0.,i) for i in neck];heapq.heapify(heap)
while heap:
 d,i=heapq.heappop(heap)
 if d>dist[i] or d>.18:continue
 for j in adj[i]:
  nd=d+float(np.linalg.norm(pos[i]-pos[j]))
  if nd<dist.get(j,1e9):dist[j]=nd;heapq.heappush(heap,(nd,j))
move=np.linalg.norm(out-pos,axis=1);far=[i for i in range(len(pos)) if dist.get(i,1e9)>=.18];weightfar=[i for i in range(len(pos)) if dist.get(i,1e9)>.045];weightdiff=lambda i:max([abs(a['weights'][i].get(k,0)-b['weights'][i].get(k,0)) for k in set(a['weights'][i])|set(b['weights'][i])] or [0]);center=np.array([.828,0,1.247]);axis=np.array([.407,0,.914]);axis/=np.linalg.norm(axis);across=np.array([0,1,0]);front=np.cross(across,axis);v=out[neck]-center

def glb(path):
 raw=path.read_bytes();n=struct.unpack_from('<I',raw,12)[0];return json.loads(raw[20:20+n]),raw[28+n:]
def acc(j,data,i):
 x=j['accessors'][i];bv=j['bufferViews'][x['bufferView']];dt={5126:'<f4',5123:'<u2',5125:'<u4'}[x['componentType']];k={'MAT4':16,'VEC4':4,'VEC3':3,'SCALAR':1}[x['type']];return np.frombuffer(data,dtype=dt,count=x['count']*k,offset=bv.get('byteOffset',0)+x.get('byteOffset',0)).reshape(-1,k)
s,sd=glb(P/'public/assets/street01-hoodie-shell.glb');t,td=glb(P/'public/assets/street01-rider-collar-uv.glb');ss=s['skins'][0];ts=t['skins'][0];sm={s['nodes'][n]['name']:i for i,n in enumerate(ss['joints'])};tm={t['nodes'][n]['name']:i for i,n in enumerate(ts['joints'])};si=acc(s,sd,ss['inverseBindMatrices']);ti=acc(t,td,ts['inverseBindMatrices']);common=set(sm)&set(tm)
r={'sourceSHA256':hashlib.sha256(src.read_bytes()).hexdigest(),'candidateSHA256':hashlib.sha256(cand.read_bytes()).hexdigest(),'sourceTopologyCounts':{k:a[k] for k in ('vertices','polygons','geometryDegenerateFaces','nonmanifoldInteriorEdges','zeroAreaUVTriangles')},'candidateTopologyCounts':{k:b[k] for k in ('vertices','polygons','geometryDegenerateFaces','nonmanifoldInteriorEdges','boundaryBranchVertices','zeroAreaUVTriangles','minimumUVTriangleArea')},'subdivisionModifiers':b['modifiers'],'evaluatedSweatshirt':b['evaluatedSweatshirt'],'hoodToEvaluatedShirtRest':b['hoodToEvaluatedShirtRest'],'facesIdentical':a['faces']==b['faces'],'edgesIdentical':a['edges']==b['edges'],'boundaryLoopsIdentical':sorted(a['loops'])==sorted(b['loops']),'boundaryLoopSizes':sorted(map(len,b['loops'])),'changedVertices':int((move>1e-8).sum()),'maxDisplacementM':float(move.max()),'outside18cmVertices':len(far),'maxOutside18cmDisplacementM':float(move[far].max()),'maxOutside45mmWeightDifference':max(map(weightdiff,weightfar)),'rigRestMatricesIdentical':a['rig']==b['rig'],'neckPlaneMaxErrorM':float(np.max(np.abs(v@axis))),'neckEllipseMaxEquationError':float(np.max(np.abs((v@across/.076)**2+(v@front/.059)**2-1))),'glbCompatibility':{'shellJoints':list(sm),'identityJoints':list(tm),'sameJointOrder':list(sm)==list(tm),'shellMeshNodesHaveIdentityTransforms':all(not any(k in n for k in ('translation','rotation','scale','matrix')) for n in s['nodes'] if 'mesh' in n),'missingJoints':sorted(set(sm)-set(tm)),'maxNamedInverseBindDifference':max(float(np.max(np.abs(si[sm[n]]-ti[tm[n]]))) for n in common),'shellSkins':len(s['skins']),'identitySkins':len(t['skins'])},'limitations':['Does not prove absence of surface self-intersections or artistic quality. Parent motion review required.','Any GLB skin compatibility difference must be resolved explicitly in assembly; source rig equality alone is not sufficient.']};(P/'reports/hoodie-shell-verification.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r,indent=2))
