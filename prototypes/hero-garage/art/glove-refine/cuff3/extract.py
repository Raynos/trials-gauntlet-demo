import bpy,bmesh,json
from pathlib import Path
from mathutils import Vector
P=Path.cwd()/'prototypes/hero-garage';bpy.ops.wm.open_mainfile(filepath=str(P/'art/hoodie-finish/cloth28-source.blend'));shirt=bpy.data.objects['rider:anatomical sweatshirt'];arm=bpy.data.objects['rider_rig'];arm.data.pose_position='REST'
for mod in shirt.modifiers:
 if mod.type in ('SOLIDIFY','ARMATURE'):mod.show_viewport=False
bpy.context.view_layer.update();eo=shirt.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=eo.to_mesh(preserve_all_data_layers=True,depsgraph=bpy.context.evaluated_depsgraph_get());bm=bmesh.new();bm.from_mesh(mesh);bm.verts.ensure_lookup_table();edges={e for e in bm.edges if e.is_boundary};rings=[]
while edges:
 e=next(iter(edges));start=e.verts[0];current=start;verts=[]
 while True:
  verts.append(current);eligible=[e for e in current.link_edges if e in edges]
  if not eligible:break
  e=eligible[0];edges.remove(e);current=e.other_vert(current)
  if current==start:break
 co=sum((v.co for v in verts),Vector())/len(verts)
 if abs(co.y)>.2 and co.z<1.05:
  side='L' if co.y<0 else 'R';data=[]
  for v in verts:
   mv=mesh.vertices[v.index];ws={shirt.vertex_groups[g.group].name:g.weight for g in mv.groups};data.append({'co':list(v.co),'weights':ws})
  rings.append({'side':side,'center':list(co),'vertices':data});print(side,len(verts),list(co))
assert len(rings)==2 and all(len(r['vertices'])==88 for r in rings)
(P/'art/glove-refine/cuff3/sleeve-boundaries.json').write_text(json.dumps(rings,indent=2))
