"""Re-tailor the original continuous sweatshirt; retain source topology and weights."""
import bpy,bmesh,sys,json,math,hashlib,heapq
from pathlib import Path
from mathutils import Vector
R=Path.cwd();P=R/'prototypes/hero-garage';D=P/'art/hoodie-shell';sys.path.insert(0,str(R/'assets/blender'))
import common as C
import rider_asset as A
source=R/'assets/blender/source/rider-street.blend';sourcehash=hashlib.sha256(source.read_bytes()).hexdigest()
bpy.ops.wm.open_mainfile(filepath=str(source));arm=bpy.data.objects['rider_rig'];A.clear_pose(arm)
keep=['rider:anatomical sweatshirt','rider:anatomical sweatshirt pocket','rider:folded hood'];cloth=[bpy.data.objects[x] for x in keep];o=cloth[0]
bm=bmesh.new();bm.from_mesh(o.data);bm.verts.ensure_lookup_table()
boundary=set(e for e in bm.edges if e.is_boundary);loops=[]
while boundary:
 todo=[next(iter(boundary))];edges=set()
 while todo:
  e=todo.pop()
  if e not in boundary:continue
  boundary.remove(e);edges.add(e)
  for v in e.verts:todo.extend(x for x in v.link_edges if x in boundary)
 loops.append({v for e in edges for v in e.verts})
neck=next(x for x in loops if len(x)==148);old={v.index:v.co.copy() for v in bm.verts};center=Vector((.828,0,1.247));axis=Vector((.407,0,.914)).normalized();across=Vector((0,1,0));front=across.cross(axis).normalized()
# Boundary displacement extends smoothly into the adjacent shoulder/chest rows.
shifts={}
for v in neck:
 d=v.co-center;ang=math.atan2(d.dot(front),d.dot(across));target=center+across*(.076*math.cos(ang))+front*(.059*math.sin(ang))
 shifts[v.index]=target-v.co
# Distance along the actual garment avoids modifying nearby sleeves across air.
dist={v.index:0. for v in neck};heap=[(0.,i) for i in dist];heapq.heapify(heap)
while heap:
 d,i=heapq.heappop(heap)
 if d>dist[i] or d>.18:continue
 for e in bm.verts[i].link_edges:
  v=e.other_vert(bm.verts[i]);nd=d+e.calc_length()
  if nd<dist.get(v.index,1e9):dist[v.index]=nd;heapq.heappush(heap,(nd,v.index))
changed=0
for v in bm.verts:
 d=dist.get(v.index,1e9)
 if d>=.18:continue
 if v.index in shifts:delta=shifts[v.index]
 else:
  near=sorted(shifts,key=lambda i:(old[i]-old[v.index]).length_squared)[:6];ww=[1/max(1e-6,(old[i]-old[v.index]).length_squared)**2 for i in near];delta=sum((shifts[i]*w for i,w in zip(near,ww)),Vector())/sum(ww)
 fade=1-min(1,d/.18);fade=fade*fade*(3-2*fade);v.co+=delta*fade;changed+=1
# Fair only the reconstructed neighborhood; hold the fitted neckline and distal cloth.
for it in range(5):
 coords={v.index:v.co.copy() for v in bm.verts}
 for v in bm.verts:
  d=dist.get(v.index,1e9)
  if v in neck or d>.16:continue
  ns=[e.other_vert(v).index for e in v.link_edges]
  v.co=coords[v.index].lerp(sum((coords[i] for i in ns),Vector())/len(ns),.22)
bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(o.data);bm.free();o.data.update()
sys.path.insert(0,str(D))
from repair_annulus import repair_annulus
annulus_report=repair_annulus(o,dist)
# Keep the full garment's cloth shading coherent, with no separate broad collar band.
for p in o.data.polygons:p.use_smooth=True
# The old neckline mesh positions were spread over several bone regions. Blend
# the closest source neck rows toward chest/neck; retain sleeves and lower body.
for v in o.data.vertices:
 d=dist.get(v.index,1e9)
 if d>.045:continue
 t=(1-d/.045)
 ws={o.vertex_groups[g.group].name:g.weight*(1-t) for g in v.groups}
 ws['chest']=ws.get('chest',0)+.7*t;ws['neck']=ws.get('neck',0)+.3*t
 for g in o.vertex_groups:g.remove([v.index])
 for name,w in ws.items():
  group=o.vertex_groups.get(name) or o.vertex_groups.new(name=name);group.add([v.index],w,'REPLACE')
A.normalize_skin_weights(o)
# Evaluate a smoother shirt before fitting the independent two-panel hood.
sub=o.modifiers.new('tailored cloth surface','SUBSURF');sub.levels=1;sub.render_levels=1
bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_move_up(modifier=sub.name)
from build_hood import build_hood
hood_report=build_hood(o,cloth[2],arm)
# Review/export only source clothing and its rig. Body, head and clips stay in
# the active GLB and will be preserved by the assembly operation.
for obj in list(bpy.context.scene.objects):
 if obj not in cloth and obj!=arm:bpy.data.objects.remove(obj,do_unlink=True)
arm.animation_data_clear()
C.apply_colourway(json.loads(bpy.context.scene['heroColourways'])['rookie'])
C.unwrap_all(cloth,angle=66,margin=.006)
bpy.ops.wm.save_as_mainfile(filepath=str(D/'hoodie-source.blend'))
paths=C.bake_atlas(cloth,2048,str(D/'textures'),'hoodie',normal_size=1024,orm_size=1024)
# Preserve linear data in lossless PNGs after the numerical bake.
for key in ('normal','orm'):
 im=bpy.data.images['hoodie_'+key];im.filepath_raw=str(D/'textures'/('hoodie_'+key+'.png'));im.file_format='PNG';im.save();paths[key]=im.filepath_raw
mat=C.atlas_material('hoodie tailored cotton',paths)
for obj in cloth:
 obj.data.materials.clear();obj.data.materials.append(mat)
 for poly in obj.data.polygons:poly.material_index=0
for a in list(bpy.data.actions):bpy.data.actions.remove(a)
C.export_glb(str(P/'public/assets/street01-hoodie-shell.glb'),list(bpy.context.scene.objects),animations=True,meshopt=False)
assert hashlib.sha256(source.read_bytes()).hexdigest()==sourcehash
r={'sourceSHA256':sourcehash,'changedSweatshirtVertices':changed,'neckBoundaryVertices':148,'sourceControlCageTopologyRetained':True,'evaluatedSubdivisionLevels':1,'hoodConstruction':hood_report,'annulusRepair':annulus_report,'distalClothOutsideGeodesic18cmUnchanged':True,'fittedNeckCenter':list(center),'neckRadii':[.076,.059],'textures':paths,'status':'candidate; parent visual and rig review required'}
(P/'reports/hoodie-shell-build.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r))
