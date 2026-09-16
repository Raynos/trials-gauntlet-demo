import bpy,json,hashlib,struct,math
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
R=Path.cwd();P=R/'prototypes/hero-garage';p=P/'public/assets/street01-rider-garment-repair.glb';r=json.loads((P/'reports/rider-garment-repair.json').read_text())
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.context.scene.render.fps=30;bpy.ops.import_scene.gltf(filepath=str(p));arm=next(o for o in bpy.data.objects if o.type=='ARMATURE');mesh=bpy.data.objects['rider'];actions=list(bpy.data.actions)
for tr in arm.animation_data.nla_tracks:tr.mute=True
before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(R/'public/models/bike.glb'));bike=set(bpy.data.objects)-before;body=next(o for o in bike if o.type=='MESH' and o.name.startswith('bodywork'));tree=BVHTree.FromPolygons([body.matrix_world@v.co for v in body.data.vertices],[p.vertices for p in body.data.polygons])
ids=[v.index for v in mesh.data.vertices if v.co.z<.85 and abs(v.co.y)<.13 and any(mesh.vertex_groups[g.group].name=='pelvis' and g.weight>.65 for g in v.groups)]
results={}
for act in actions:
 arm.animation_data.action=act
 if act.slots:arm.animation_data.action_slot=act.slots[0]
 rows=[];frames=range(round(act.frame_range[0]),round(act.frame_range[1])+1)
 for frame in frames:
  bpy.context.scene.frame_set(frame);bpy.context.view_layer.update()
  contact={}
  for side,s in [('L',-1),('R',1)]:
   contact['grip'+side]=(bpy.data.objects['gripSocket.'+side].matrix_world.translation-Vector((.92,s*.33,.78))).length
   contact['sole'+side]=(bpy.data.objects['soleSocket.'+side].matrix_world.translation-Vector((.51,s*.2,.031))).length
  pelvis=arm.pose.bones['thigh.L'].head.copy();pelvis.y=0
  gaps=[]
  if True:
   ev=mesh.evaluated_get(bpy.context.evaluated_depsgraph_get());me=ev.to_mesh()
   for i in ids:
    co=ev.matrix_world@me.vertices[i].co
    hit,_,_,_=tree.ray_cast(Vector((co.x,co.y,1)),Vector((0,0,-1)),1.1)
    if hit and .40<hit.z<.65:gaps.append(co.z-hit.z)
   ev.to_mesh_clear()
  rows.append(dict(frame=frame,contactsM=contact,pelvis=list(pelvis),minPelvisSurfaceToBodyVerticalGapM=min(gaps) if gaps else None))
  if frame==frames.start:start={b.name:b.matrix.copy() for b in arm.pose.bones}
 end=max(abs(b.matrix[i][k]-start[b.name][i][k]) for b in arm.pose.bones for i in range(4) for k in range(4))
 maxcontact=max(v for row in rows for v in row['contactsM'].values());assert maxcontact<.00001;assert end<.00001
 gaps=[x['minPelvisSurfaceToBodyVerticalGapM'] for x in rows if x['minPelvisSurfaceToBodyVerticalGapM'] is not None]
 results[act.name]=dict(frameCount=len(rows),maxContactErrorM=maxcontact,endpointMatrixDifference=end,pelvisVerticalTravelM=max(x['pelvis'][2] for x in rows)-min(x['pelvis'][2] for x in rows),minPelvisBodyClearanceM=min(gaps) if gaps else None,frames=rows)
r['exportedVerification']=results
r['clearanceScope']='Every new exported frame: vertical ray gaps from pelvis-weighted trouser underside to rendered bike bodywork. Not full-body collision verification.'
(P/'reports/rider-garment-repair.json').write_text(json.dumps(r,indent=2)+'\n')
print(json.dumps({n:{k:v for k,v in d.items() if k!='frames'} for n,d in results.items()},indent=2))
def glb(path):
 with open(path,'rb') as f:
  f.read(12);n,_=struct.unpack('<II',f.read(8));doc=json.loads(f.read(n));n,_=struct.unpack('<II',f.read(8));return doc,f.read(n)
def images(doc,buf):
 return sorted(hashlib.sha256(buf[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']]).hexdigest() for i in doc['images'] for v in [doc['bufferViews'][i['bufferView']]])
a,ab=glb(P/'public/assets/street01-rider-seat.glb');b,bb=glb(p)
r['sourceTextureBytesIdentical']=images(a,ab)==images(b,bb)
r['triangleCounts']={k:sum(doc['accessors'][prim['indices']]['count']//3 for m in doc['meshes'] for prim in m['primitives']) for k,doc in [('source',a),('candidate',b)]}
r['localWeldCollapsedDegenerateTriangles']=1
assert r['sourceTextureBytesIdentical'];assert r['triangleCounts']['candidate']-r['triangleCounts']['source']==583
for name in ('compression','extension','landing_absorption'):assert results[name]['minPelvisBodyClearanceM']>=0
(P/'reports/rider-garment-repair.json').write_text(json.dumps(r,indent=2)+'\n')
r['allClipMinimumClearanceM']=min(d['minPelvisBodyClearanceM'] for d in results.values())
r['penetrationFinding']='Rearward shift grazes bodywork by about0.05mm; not a zero-penetration pass. All other clips have positive sampled clearance.'
r['clearanceScope']='Every exported frame across all6clips: pelvis-weighted trouser underside vertical rays to rendered bodywork. Not full-body collision verification.'
(P/'reports/rider-garment-repair.json').write_text(json.dumps(r,indent=2)+'\n')
