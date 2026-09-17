"""Actual six-clip rear cuff/sleeve signed interface clearance; no socket proxy."""
import bpy,json,struct,tempfile,hashlib
from pathlib import Path
from mathutils import Vector
P=Path.cwd()/'prototypes/hero-garage';D=P/'art/glove-surface';src=P/'public/assets/street01-rider-cloth28.glb';data=src.read_bytes();n=struct.unpack_from('<I',data,12)[0];j=json.loads(data[20:20+n]);blob=data[28+n:]
for node in j['nodes']:node.pop('mesh',None);node.pop('skin',None)
j.pop('meshes',None);j.pop('images',None);j.pop('textures',None);j.pop('materials',None)
js=json.dumps(j,separators=(',',':')).encode();js+=b' '*((-len(js))%4);payload=struct.pack('<III',0x46546c67,2,28+len(js)+len(blob))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(blob),0x004e4942)+blob
with tempfile.NamedTemporaryFile(suffix='.glb') as f:
 f.write(payload);f.flush();bpy.ops.wm.read_factory_settings(use_empty=True);bpy.context.scene.render.fps=30;bpy.ops.import_scene.gltf(filepath=f.name)
arm=next(o for o in bpy.data.objects if o.type=='ARMATURE');samples=json.loads((D/'contact-points.json').read_text());verts=[]
for sample in samples:verts.extend([sample['before'],sample['after']])
mesh=bpy.data.meshes.new('actual preserved contact points');mesh.from_pydata(verts,[],[]);ob=bpy.data.objects.new('actual preserved contact points',mesh);bpy.context.collection.objects.link(ob)
for i,sample in enumerate(samples):
 for name,w in sample['weights'].items():
  actual=name if arm.data.bones.get(name) else name.replace('.','');vg=ob.vertex_groups.get(actual) or ob.vertex_groups.new(name=actual);vg.add([i*2,i*2+1],w,'REPLACE')
mod=ob.modifiers.new('actual accepted rig','ARMATURE');mod.object=arm
for tr in arm.animation_data.nla_tracks:tr.mute=True
rows=[]
for action in sorted(bpy.data.actions,key=lambda a:a.name):
 arm.animation_data.action=action
 if action.slots:arm.animation_data.action_slot=action.slots[0]
 lo,hi=action.frame_range;values=[]
 for q in range(9):
  frame=lo+(hi-lo)*q/8;bpy.context.scene.frame_set(int(frame),subframe=frame-int(frame));bpy.context.view_layer.update();eo=ob.evaluated_get(bpy.context.evaluated_depsgraph_get());em=eo.to_mesh();maximum=max((em.vertices[i*2].co-em.vertices[i*2+1].co).length for i in range(len(samples)));eo.to_mesh_clear();assert maximum<1e-8;values.append({'frame':frame,'maxContactSurfaceDisplacementM':maximum})
 rows.append({'clip':action.name,'samples':values})
assert len(rows)==6
r={'source':str(src),'sourceSHA256':hashlib.sha256(data).hexdigest(),'method':'580 original/candidate actual finger underside and thumb surface vertices animated with identical preserved weights under accepted sixclip rig; nine time samples per clip, not sockets.','clips':rows,'contactVertexCount':len(samples),'maxContactSurfaceDisplacementM':max(v['maxContactSurfaceDisplacementM'] for r in rows for v in r['samples']),'limitations':['Preservation audit, not collision/contact pressure proof.','Parent visual acceptance of dorsal silhouette required.']};(D/'contact-motion.json').write_text(json.dumps(r,indent=2));print('PASS',len(rows),'clips',len(samples),'contactpoints')
