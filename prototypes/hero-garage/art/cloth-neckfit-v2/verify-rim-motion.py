import bpy,bmesh,json,struct,tempfile,math
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
P=Path.cwd()/'prototypes/hero-garage';bpy.ops.wm.open_mainfile(filepath=str(P/'art/cloth-neckfit-v2/neckfit-source.blend'));o=bpy.data.objects['rider:anatomical sweatshirt'];bm=bmesh.new();bm.from_mesh(o.data);bm.verts.ensure_lookup_table();ids={v.index for e in bm.edges if e.is_boundary for v in e.verts if v.co.z>1.1};rim=[(i,o.data.vertices[i].co.copy(),{o.vertex_groups[g.group].name:g.weight for g in o.data.vertices[i].groups}) for i in ids];bm.free()
r=(P/'public/assets/street01-rider-neckfit-v2.glb').read_bytes();n=struct.unpack_from('<I',r,12)[0];j=json.loads(r[20:20+n]);blob=r[28+n:];old=j['meshes'];j['meshes']=[]
for node in j['nodes']:
 if 'mesh' not in node:continue
 if node['name'] not in ('Street01_Authored_EditableBody_Runtime','rider:anatomical sweatshirt'):node.pop('mesh');node.pop('skin',None);continue
 m=old[node['mesh']];node['mesh']=len(j['meshes']);j['meshes'].append(m)
 for p in m['primitives']:p['material']=0
j['materials']=[{}];j.pop('images',None);j.pop('textures',None);j.pop('samplers',None);js=json.dumps(j).encode();js+=b' '*((-len(js))%4);payload=struct.pack('<III',0x46546c67,2,28+len(js)+len(blob))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(blob),0x004e4942)+blob
with tempfile.NamedTemporaryFile(suffix='.glb') as f:
 f.write(payload);f.flush();bpy.ops.wm.read_factory_settings(use_empty=True);bpy.context.scene.render.fps=30;bpy.ops.import_scene.gltf(filepath=f.name)
arm=next(o for o in bpy.data.objects if o.type=='ARMATURE');head=bpy.data.objects['Street01_Authored_EditableBody_Runtime'];shirt=bpy.data.objects['rider:anatomical sweatshirt'];actions=list(bpy.data.actions)
for tr in arm.animation_data.nla_tracks:tr.mute=True
print('DEBUGARM',list(map(list,arm.matrix_world)));print('DEBUGHEAD',list(map(list,head.matrix_world)));print('DEBUGSHIRT',list(map(list,shirt.matrix_world)));print('DEBUGV',tuple(shirt.data.vertices[0].co));bm=bmesh.new();bm.from_mesh(head.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-6);cutcoords=[v.co.copy() for v in bm.verts if any(e.is_boundary for e in v.link_edges)];bm.free();assert cutcoords
rows=[]
for a in actions:
 arm.animation_data.action=a;arm.animation_data.action_slot=a.slots[0];lo,hi=a.frame_range;samples=[]
 for t in [i/8 for i in range(9)]:
  f=lo+(hi-lo)*t;bpy.context.scene.frame_set(int(f),subframe=f-int(f));bpy.context.view_layer.update();ev=head.evaluated_get(bpy.context.evaluated_depsgraph_get());m=ev.to_mesh();tree=BVHTree.FromPolygons([ev.matrix_world@v.co for v in m.vertices],[p.vertices for p in m.polygons]);ev.to_mesh_clear();Ds={b.name:arm.pose.bones[b.name].matrix@b.matrix_local.inverted() for b in arm.data.bones};vals=[]
  for i,co,ws in rim:
   p=sum(((Ds[k]@co)*w for k,w in ws.items()),Vector());hit,n,_,d=tree.find_nearest(p);vals.append((i,d,(p-hit).dot(n)))
  normal=(Ds['head'].to_3x3()@Vector((.40673664,0,.91354546))).normalized();rimproj=[sum(((Ds[k]@co)*w for k,w in ws.items()),Vector()).dot(normal) for _,co,ws in rim];cutproj=[(Ds['head']@co).dot(normal) for co in cutcoords];cutgap=min(rimproj)-max(cutproj)
  samples.append({'minimumAxialCutToRimGapM':cutgap,'cutBoundaryVertices':len(cutcoords),'frame':f,'minimumDistanceM':min(v[1]for v in vals),'maximumDistanceM':max(v[1]for v in vals),'minimumSignedNormalDistanceM':min(v[2]for v in vals),'insideRimVertices':sum(v[2]<-.0001 for v in vals),'worstInside':sorted(vals,key=lambda x:x[2])[:5]})
 rows.append({'clip':a.name,'samples':samples})
print(json.dumps({'rimVertices':len(rim),'clips':rows}));(P/'art/cloth-neckfit-v2/candidate-motion.json').write_text(json.dumps({'rimVertices':len(rim),'clips':rows},indent=2))
