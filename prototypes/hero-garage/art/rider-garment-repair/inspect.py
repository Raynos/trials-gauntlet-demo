import bpy,bmesh,json
from pathlib import Path
R=Path.cwd();P=R/'prototypes/hero-garage';bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(P/'public/assets/street01-rider-seat.glb'));o=bpy.data.objects['rider'];bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001);bm.verts.ensure_lookup_table();bm.edges.ensure_lookup_table()
boundary={e for e in bm.edges if e.is_boundary};loops=[]
while boundary:
 seed=next(iter(boundary));todo=[seed];comp=set()
 while todo:
  e=todo.pop()
  if e not in boundary:continue
  boundary.remove(e);comp.add(e)
  for v in e.verts:todo.extend(x for x in v.link_edges if x in boundary)
 vs={v for e in comp for v in e.verts};coords=[v.co for v in vs];lo=[min(v[i] for v in coords) for i in range(3)];hi=[max(v[i] for v in coords) for i in range(3)]
 if hi[2]>1.13 and lo[2]<1.4:loops.append(dict(edges=len(comp),lo=lo,hi=hi,center=[sum(v[i] for v in coords)/len(coords) for i in range(3)],branched=sum(sum(e in comp for e in v.link_edges)!=2 for v in vs)))
print(json.dumps(loops,indent=2));(P/'art/rider-garment-repair/boundary-diagnosis.json').write_text(json.dumps(loops,indent=2))
