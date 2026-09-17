"""Actual six-clip rear cuff/sleeve signed interface clearance; no socket proxy."""
import bpy,json,struct,tempfile,hashlib
from pathlib import Path
from mathutils import Vector
P=Path.cwd()/'prototypes/hero-garage';D=P/'art/glove-refine/cuff3';src=P/'public/assets/street01-rider-cloth28.glb';data=src.read_bytes();n=struct.unpack_from('<I',data,12)[0];j=json.loads(data[20:20+n]);blob=data[28+n:]
for node in j['nodes']:node.pop('mesh',None);node.pop('skin',None)
j.pop('meshes',None);j.pop('images',None);j.pop('textures',None);j.pop('materials',None)
js=json.dumps(j,separators=(',',':')).encode();js+=b' '*((-len(js))%4);payload=struct.pack('<III',0x46546c67,2,28+len(js)+len(blob))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(blob),0x004e4942)+blob
with tempfile.NamedTemporaryFile(suffix='.glb') as f:
 f.write(payload);f.flush();bpy.ops.wm.read_factory_settings(use_empty=True);bpy.context.scene.render.fps=30;bpy.ops.import_scene.gltf(filepath=f.name)
arm=next(o for o in bpy.data.objects if o.type=='ARMATURE');sections=json.loads((P/'reports/glove-refine-cuff3-build.json').read_text())['newCuffSections'];samples=[x for section in sections for x in section['rearSamples']];verts=[]
for s in samples:verts.extend([s['sourceCo'],s['co'],list(Vector(s['sourceCo'])+Vector(s['radial'])*.01)])
mesh=bpy.data.meshes.new('measured paired sleeve and cuff');mesh.from_pydata(verts,[],[]);ob=bpy.data.objects.new('measured paired sleeve and cuff',mesh);bpy.context.collection.objects.link(ob)
for i,s in enumerate(samples):
 for name,w in s['weights'].items():
  # GLB exporter sanitizes punctuation; importer restores source names in this pipeline.
  actual=name if arm.data.bones.get(name) else name.replace('.','');vg=ob.vertex_groups.get(actual) or ob.vertex_groups.new(name=actual);vg.add([i*3,i*3+1,i*3+2],w,'REPLACE')
mod=ob.modifiers.new('actual accepted rig','ARMATURE');mod.object=arm
for tr in arm.animation_data.nla_tracks:tr.mute=True
rows=[]
for action in sorted(bpy.data.actions,key=lambda a:a.name):
 arm.animation_data.action=action
 if action.slots:arm.animation_data.action_slot=action.slots[0]
 lo,hi=action.frame_range;values=[]
 for q in range(9):
  frame=lo+(hi-lo)*q/8;bpy.context.scene.frame_set(int(frame),subframe=frame-int(frame));bpy.context.view_layer.update();eo=ob.evaluated_get(bpy.context.evaluated_depsgraph_get());em=eo.to_mesh();ds=[];radial=[]
  for i in range(len(samples)):
   a,b,c=[em.vertices[i*3+k].co for k in range(3)];ds.append((a-b).length);radial.append((a-b).dot((c-a).normalized()))
  eo.to_mesh_clear();assert min(radial)>.0019 and max(ds)<.003, (action.name,min(radial),max(ds));values.append({'frame':frame,'radialInsetM':[min(radial),max(radial)],'rearPairDistanceM':[min(ds),max(ds)]})
 rows.append({'clip':action.name,'samples':values})
assert len(rows)==6,len(rows)
r={'source':str(src),'sourceSHA256':hashlib.sha256(data).hexdigest(),'method':'176 exact evaluated outer sleeve boundary positions and corresponding inset rear cuff vertices, identical copied skin weights, animated using actual accepted six-clip rig. Signed inward distance measured along deformed radial directions.','clips':rows,'limitations':['Measures rear interface clearance only; does not prove zero crossings along entire cuff surface.','Inset measured from outer cloth surface,2mm shell thickness leaves0.2mm nominal inner clearance.','Parent rendered six-clip acceptance required.']};(D/'interface-motion.json').write_text(json.dumps(r,indent=2));print('PASS',len(rows),'clips',len(samples),'paired surface points')
