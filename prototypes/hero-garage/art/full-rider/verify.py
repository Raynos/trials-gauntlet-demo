import bpy,json,hashlib,struct
from pathlib import Path
from mathutils import Vector
R=Path.cwd();P=R/'prototypes/hero-garage';p=P/'public/assets/street01-rider-posed.glb'
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.context.scene.render.fps=30;bpy.ops.import_scene.gltf(filepath=str(p));arm=next(o for o in bpy.data.objects if o.type=='ARMATURE')
for tr in arm.animation_data.nla_tracks:tr.mute=True
rows={}
for action in bpy.data.actions:
 arm.animation_data.action=action
 if action.slots:arm.animation_data.action_slot=action.slots[0]
 errors=[]
 for frame in range(1,61):
  bpy.context.scene.frame_set(frame);bpy.context.view_layer.update()
  for side,s in [('L',-1),('R',1)]:
   grip=(bpy.data.objects['gripSocket.'+side].matrix_world.translation-Vector((.92,s*.33,.78))).length
   sole=(bpy.data.objects['soleSocket.'+side].matrix_world.translation-Vector((.51,s*.2,.031))).length
   errors.append((grip,sole))
 rows[action.name]=dict(maxGripErrorM=max(x[0] for x in errors),maxSoleAuthoredContactErrorM=max(x[1] for x in errors),sampledFrames=60)
 assert rows[action.name]['maxGripErrorM']<.0001,rows
 assert rows[action.name]['maxSoleAuthoredContactErrorM']<.0001,rows
j=json.loads((P/'reports/full-rider-pose.json').read_text());j['exportedReimportVerification']=rows;j['outputSHA256']=hashlib.sha256(p.read_bytes()).hexdigest()
(P/'reports/full-rider-pose.json').write_text(json.dumps(j,indent=2)+'\n');print(json.dumps(rows))
# Verify source texture payloads and triangle inventory survive import/export.
def glb(path):
 with open(path,'rb') as f:
  f.read(12);n,_=struct.unpack('<II',f.read(8));doc=json.loads(f.read(n));n,_=struct.unpack('<II',f.read(8));return doc,f.read(n)
def images(doc,buf):
 return sorted(hashlib.sha256(buf[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']]).hexdigest() for i in doc['images'] for v in [doc['bufferViews'][i['bufferView']]])
a,ab=glb(R/'public/models/rider-street.glb');b,bb=glb(p)
j['sourceTextureBytesIdentical']=images(a,ab)==images(b,bb)
j['triangleCounts']={k:sum(doc['accessors'][prim['indices']]['count']//3 for m in doc['meshes'] for prim in m['primitives']) for k,doc in [('source',a),('candidate',b)]}
assert j['sourceTextureBytesIdentical']
assert j['triangleCounts']['source']==j['triangleCounts']['candidate']
(P/'reports/full-rider-pose.json').write_text(json.dumps(j,indent=2)+'\n')
