import bpy,bmesh,json,sys,hashlib,math
from pathlib import Path
from mathutils import Vector
R=Path.cwd();P=R/'prototypes/hero-garage';sys.path.insert(0,str(R/'assets/blender'));import common as C
source=P/'public/assets/street01-rider-seat.glb';out=P/'public/assets/street01-rider-garment-repair.glb'
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.context.scene.render.fps=30;bpy.ops.import_scene.gltf(filepath=str(source));ob=bpy.data.objects['rider'];arm=next(o for o in bpy.data.objects if o.type=='ARMATURE')
bm=bmesh.new();bm.from_mesh(ob.data);uv=bm.loops.layers.uv.active;skin=bm.verts.layers.deform.verify()
region=[v for v in bm.verts if .70<v.co.x<.90 and 1.13<v.co.z<1.32 and abs(v.co.y)<.20]
bmesh.ops.remove_doubles(bm,verts=region,dist=.00001)
boundary={e for e in bm.edges if e.is_boundary};candidates=[]
while boundary:
 stack=[next(iter(boundary))];comp=set()
 while stack:
  e=stack.pop()
  if e not in boundary:continue
  boundary.remove(e);comp.add(e)
  for v in e.verts:stack.extend(x for x in v.link_edges if x in boundary)
 vs={v for e in comp for v in e.verts}
 if len(comp)>100 and 1.14<min(v.co.z for v in vs)<1.18 and max(v.co.z for v in vs)<1.32:candidates.append(comp)
assert len(candidates)==1,[(len(c),min(v.co.z for e in c for v in e.verts)) for c in candidates]
comp=candidates[0];before_edges=len(comp)
degrees={v:sum(e in comp for e in v.link_edges) for e in comp for v in e.verts}
ends=[v for v,n in degrees.items() if n==1]
assert len(ends)==2 and all(n in (1,2) for n in degrees.values())
ring=[ends[0]];previous=None;current=ring[0]
while current!=ends[1]:
 ns=[e.other_vert(current) for e in current.link_edges if e in comp and e.other_vert(current)!=previous];n=ns[0]
 ring.append(n);previous,current=current,n
assert len(ring)==len(comp)+1
seam_gap=(ends[0].co-ends[1].co).length
# Genuine extension of existing garment rim, two strips terminating around anatomical neck.
center=Vector((.797,0,1.248));axis=Vector((.407,0,.914)).normalized();across=Vector((0,1,0));front=across.cross(axis).normalized()
inner=[];middle=[]
for v in ring:
 d=v.co-center;angle=math.atan2(d.dot(front),d.dot(across));target=center+across*(.067*math.cos(angle))+front*(.068*math.sin(angle))
 a=bm.verts.new(v.co.lerp(target,.50));b=bm.verts.new(target);middle.append(a);inner.append(b)
 for gi,weight in dict(v[skin]).items():a[skin][gi]=weight
 b[skin][ob.vertex_groups['chest'].index]=.7;b[skin][ob.vertex_groups['neck'].index]=.3
made=[]
for i,v in enumerate(ring[:-1]):
 j=i+1;w=ring[j];edge=next(e for e in v.link_edges if w in e.verts and e in comp);old=edge.link_faces[0]
 uvv=next(l[uv].uv.copy() for l in old.loops if l.vert==v);uvw=next(l[uv].uv.copy() for l in old.loops if l.vert==w)
 for a,b in [(ring,middle),(middle,inner)]:
  f=bm.faces.new((a[i],a[j],b[j],b[i]));f.material_index=old.material_index;f.smooth=True
  for l,t in zip(f.loops,(uvv,uvw,uvw,uvv)):l[uv].uv=t
  made.append(f)
bmesh.ops.recalc_face_normals(bm,faces=made);after_rim=sum(e.is_boundary for e in comp);assert after_rim==0
new_boundary=sum(e.is_boundary for e in {e for f in made for e in f.edges})
bm.to_mesh(ob.data);bm.free();ob.data.update()
bpy.ops.wm.save_as_mainfile(filepath=str(P/'art/street01-rider-garment-repair.blend'));C.export_glb(str(out),list(bpy.context.scene.objects),animations=True,meshopt=False)
r=dict(sourceSHA256=hashlib.sha256(source.read_bytes()).hexdigest(),outputSHA256=hashlib.sha256(out.read_bytes()).hexdigest(),originalBoundaryComponentEdges=before_edges,mainNecklineEdges=len(comp),frontSeamGapM=seam_gap,originalRimBoundaryEdgesAfter=after_rim,newNeckOpeningBoundaryEdges=new_boundary,addedQuads=len(made),notes=['Actual existing neckline boundary extended with two connected strips to anatomically sized collar opening; not an overlapping shell.','Outer skin weights retained; inner collar 70% chest / 30% neck; UVs extend adjacent authored rim texels across strip.','Original neckline is an open 146-edge chain with 10.2 mm front seam gap. Collar extends actual boundary; front seam still open, no closed-garment claim.','Head, seat geometry, skeleton and six actions unedited. Visual shoulder/collar acceptance remains parent-owned.'])
(P/'reports/rider-garment-repair.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r))
