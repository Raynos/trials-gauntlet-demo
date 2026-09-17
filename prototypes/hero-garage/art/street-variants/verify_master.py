"""Reopen the saved catalog master and inspect its editable rig, images and clips."""
import bpy,json,hashlib,math,sys
slug=sys.argv[sys.argv.index("--")+1];assert slug in ("street-charcoal","street-openface")
from pathlib import Path
R=Path.cwd();P=R/'prototypes/hero-garage';source=P/'art/delivery'/f'{slug}-master.blend';sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();before=sha(source)
bpy.ops.wm.open_mainfile(filepath=str(source));scene=bpy.context.scene
record=json.loads((P/'reports'/f'{slug}-master.json').read_text());catalog=record['variantCatalog'];assert record['sha256']==before
sourceChecks=[]
for item in record['assets']:
 path=P/'public'/item['source'].lstrip('/');actual=sha(path);assert actual==item['sha256'];sourceChecks.append({'source':item['source'],'sha256':actual,'matches':True})
assert scene.render.fps==30
for name in ['RIDER','BIKE','STUDIO - exclude from asset export']:assert name in bpy.data.collections
rigs=[o for o in bpy.data.collections['RIDER'].objects if o.type=='ARMATURE'];assert len(rigs)==1;rig=rigs[0];assert len(rig.data.bones)==19;default=rig.animation_data.action.name;assert default=='sit_cruise';assert all(t.mute for t in rig.animation_data.nla_tracks)
expected={c['name']:c['catalogDurationSeconds'] for c in record['sixClipDurationChecks']};assert set(expected)=={a.name for a in bpy.data.actions};assert all(a.use_fake_user for a in bpy.data.actions)
placements=[]
for asset in catalog['assets']:
 root=bpy.data.objects[asset['id']+' placement'];x,y,z=asset.get('position',[0,0,0]);assert max(abs(root.location[i]-v)for i,v in enumerate([x,-z,y]))<1e-6;placements.append({'asset':asset['id'],'blenderLocation':list(root.location)})
images=[im for im in bpy.data.images if im.source!='VIEWER'];missing=[im.name for im in images if im.source=='FILE' and not im.packed_file];assert not missing,missing
# Bone-only reopened-action audit; dense meshes are reviewed separately in Three.js.
for ob in bpy.data.objects:
 if ob.type=='MESH':ob.hide_viewport=True
rows=[]
for name,duration in expected.items():
 a=bpy.data.actions[name];rig.animation_data.action=a
 if a.slots:rig.animation_data.action_slot=a.slots[0]
 assert abs((a.frame_range[1]-a.frame_range[0])/30-duration)<1e-5
 samples=0
 for k in range(round(duration*30)+1):
  scene.frame_set(round(a.frame_range[0])+k);bpy.context.view_layer.update()
  for bone in rig.pose.bones:assert all(math.isfinite(v)for row in bone.matrix for v in row)
  samples+=1
 rows.append({'clip':name,'durationSeconds':duration,'sampledFrames':samples})
assert sum(r['sampledFrames']for r in rows)==750
assert sha(source)==before
report={'sourceAssetHashes':sourceChecks,'source':str(source.relative_to(R)),'sha256':before,'defaultAction':default,'allSixActionsRetainedWithFakeUsers':True,'rigBones':len(rig.data.bones),'fps':30,'placements':placements,'packedFileImages':sum(bool(im.packed_file)for im in images),'unpackedFileImages':missing,'clips':rows,'savedFileUnchanged':True,'scope':'Reopened saved Blender scene; retained actions, durations, packed images, placement and finite bone matrices over750frames. This is not rendered Blender or Three.js visual acceptance.'}
(P/'art/street-variants'/f'{slug}-master-reopen.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
