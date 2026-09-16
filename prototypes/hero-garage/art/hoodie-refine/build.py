import bpy,bmesh,json,sys,hashlib,math
from pathlib import Path
from mathutils import Vector
R=Path.cwd();P=R/'prototypes/hero-garage';sys.path.insert(0,str(R/'assets/blender'));import common as C
source=P/'public/assets/street01-rider-seat.glb';out=P/'public/assets/street01-rider-hoodie-refine-body.glb'
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.context.scene.render.fps=30;bpy.ops.import_scene.gltf(filepath=str(source));ob=bpy.data.objects['rider'];arm=next(o for o in bpy.data.objects if o.type=='ARMATURE')
original_normals={}
for loop in ob.data.loops:
 original_normals[(tuple(round(x,6) for x in ob.data.vertices[loop.vertex_index].co),tuple(round(x,6) for x in ob.data.uv_layers.active.data[loop.index].uv))]=ob.data.corner_normals[loop.index].vector.copy()
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

# Fair the irregular outer rim while holding its original endpoints. Work on the
# connected source garment, then fill the collar with six continuous rings.
original=[v.co.copy() for v in ring]
for iteration in range(8):
 coords=[v.co.copy() for v in ring]
 for i in range(1,len(ring)-1):
  target=(coords[i-1]+coords[i+1])*.5
  delta=(target-coords[i])*.35
  total=coords[i]+delta-original[i]
  if total.length>.009:total=total.normalized()*.009
  ring[i].co=original[i]+total
# Join the front strip ends at a shared midpoint; remove_doubles welds this seam.
mid=(ring[0].co+ring[-1].co)*.5
ring[0].co=mid;ring[-1].co=mid
rows=[ring]
for row in range(1,7):
 t=row/6;vs=[]
 for i,v in enumerate(ring):
  d=v.co-center;angle=math.atan2(d.dot(front),d.dot(across))
  target=center+across*(.069*math.cos(angle))+front*(.070*math.sin(angle))
  # Raised, softly rolled neckline, with a smooth surface through the shoulder gap.
  co=v.co.lerp(target,t)+axis*(.008*math.sin(math.pi*t))
  nv=bm.verts.new(co);vs.append(nv)
  ws=dict(v[skin]);neck_group=ob.vertex_groups['neck'].index;chest_group=ob.vertex_groups['chest'].index
  for gi,w in ws.items():nv[skin][gi]=w*(1-t)
  nv[skin][chest_group]=nv[skin].get(chest_group,0)+.7*t
  nv[skin][neck_group]=nv[skin].get(neck_group,0)+.3*t
 rows.append(vs)
# Distinct textile material lets the collar have a proper continuous unwrap,
# rather than collapsing onto texels along the source boundary.
mat=bpy.data.materials.new('mustard collar cotton');mat.use_nodes=True
bsdf=mat.node_tree.nodes.get('Principled BSDF');bsdf.inputs['Base Color'].default_value=(.36,.205,.055,1);bsdf.inputs['Roughness'].default_value=.87
mat.diffuse_color=(.36,.205,.055,1);ob.data.materials.append(mat);material_index=len(ob.data.materials)-1
made=[]
for row in range(6):
 for i in range(len(ring)-1):
  f=bm.faces.new((rows[row][i],rows[row][i+1],rows[row+1][i+1],rows[row+1][i]));f.material_index=material_index;f.smooth=True
  for loop,coord in zip(f.loops,((i/(len(ring)-1),row/6),((i+1)/(len(ring)-1),row/6),((i+1)/(len(ring)-1),(row+1)/6),(i/(len(ring)-1),(row+1)/6))):loop[uv].uv=coord
  made.append(f)
bmesh.ops.remove_doubles(bm,verts=[r[i] for r in rows for i in (0,len(ring)-1)],dist=.0001)
bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(ob.data);bm.free();ob.data.update()
# Preserve original authored split normals outside the rebuilt transition.
normals=[]
for loop in ob.data.loops:
 key=(tuple(round(x,6) for x in ob.data.vertices[loop.vertex_index].co),tuple(round(x,6) for x in ob.data.uv_layers.active.data[loop.index].uv))
 normals.append(original_normals.get(key,Vector((0,0,0))))
ob.data.normals_split_custom_set(normals)
bpy.ops.wm.save_as_mainfile(filepath=str(P/'art/hoodie-refine/hoodie-refine.blend'));C.export_glb(str(out),list(bpy.context.scene.objects),animations=True,meshopt=False)
r={'sourceSHA256':hashlib.sha256(source.read_bytes()).hexdigest(),'outputSHA256':hashlib.sha256(out.read_bytes()).hexdigest(),'collarRows':6,'newQuads':len(made),'frontSeamWelded':True,'uv':'Continuous circumference/width rectangle','limitations':['First material factors provisional; no final cloth texture bake.','Outer garment source and all six clips retained; export/motion review still required.']}
(P/'reports/hoodie-refine-build.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r))
