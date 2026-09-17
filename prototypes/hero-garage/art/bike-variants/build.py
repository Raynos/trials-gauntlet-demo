"""Retain exact accepted compressed mechanics; replace canonical livery resources only."""
from pathlib import Path
import json,struct,copy,hashlib
R=Path(__file__).resolve().parents[4];P=R/'prototypes/hero-garage';D=P/'art/bike-variants';OUT=P/'public/assets/variants';OUT.mkdir(exist_ok=True)
source=P/'public/assets/street01-bike-exhaust.glb';raw=source.read_bytes();n=struct.unpack_from('<I',raw,12)[0];old=json.loads(raw[20:20+n]);binary=raw[28+n:];j=copy.deepcopy(old);blob=bytearray(binary);changed=[]
def image_replace(image_id,path):
 while len(blob)%4:blob.append(0)
 data=path.read_bytes();vi=len(j['bufferViews']);j['bufferViews'].append({'buffer':0,'byteOffset':len(blob),'byteLength':len(data)});blob.extend(data);j['images'][image_id]={'bufferView':vi,'mimeType':'image/png','name':path.stem};changed.append({'imageIndex':image_id,'path':str(path.relative_to(R)),'sha256':hashlib.sha256(data).hexdigest()})
materials={m['name']:m for m in j['materials']};paint=materials['Clean blue white plastics with original decals'];pbr=paint['pbrMetallicRoughness']
for key,tx in [('albedo',pbr['baseColorTexture']['index']),('normal',paint['normalTexture']['index']),('orm',pbr['metallicRoughnessTexture']['index'])]:image_replace(j['textures'][tx]['source'],D/f'paint_{key}.png')
body=materials['bike_body_rookie'];tx=body['pbrMetallicRoughness']['baseColorTexture']['index'];image_replace(j['textures'][tx]['source'],D/'original_pro_body.png');body['name']='bike_body_pro'
for name,color,rough,metal in [('hero_refine_blue_front_fender',[.025,.028,.031,1],.55,.05),('stable blue graphite frame paint',[.07,.075,.078,1],.42,.7)]:
 m=materials[name]['pbrMetallicRoughness'];m['baseColorFactor']=color;m['roughnessFactor']=rough;m['metallicFactor']=metal
j['buffers'][0]['byteLength']=len(blob)
while len(blob)%4:blob.append(0)
s=json.dumps(j,separators=(',',':')).encode();s+=b' '*((-len(s))%4);result=struct.pack('<III',0x46546c67,2,28+len(s)+len(blob))+struct.pack('<II',len(s),0x4e4f534a)+s+struct.pack('<II',len(blob),0x004e4942)+blob
rookie=OUT/'bike-rookie-art.glb';rookie.write_bytes(raw);pro=OUT/'bike-pro-art.glb';pro.write_bytes(result)
for k in ['meshes','nodes','skins','animations','accessors','scenes','scene','extensions','extensionsUsed','extensionsRequired']:assert j.get(k)==old.get(k),k
assert j['bufferViews'][:len(old['bufferViews'])]==old['bufferViews'];assert blob[:len(binary)]==binary
report={'canonicalIdentitySources':['src/render/bike/livery.ts','assets/blender/build_bike.py','assets/blender/author_bike_hero.py'],'actualExistingBikeIdentities':['rookie','pro'],'fiveSkinsNotPresentInRepository':True,'sourceSHA256':hashlib.sha256(raw).hexdigest(),'imagesChanged':changed,'allGeometryCompressedPayloadsIndicesAttributesHierarchySocketsClipsExact':True,'rookieByteIdenticalToReviewed':True,'outputs':{p.name:{'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}for p in [rookie,pro]},'proIdentity':'Authored charcoal plastics, gunmetal frame, yellow fields/plate, red number1; original Pro atlas on remaining body and swingarm; shared accepted alloy/rubber/warm steel preserved.','limits':['Parent matched recordings required; no claim of five bike identities.','Source geometry is shared; this is a material/livery upgrade, not two new mechanical bike designs.','Pro includes appended image payloads; obsolete source images retained for exact geometry-preserving assembly.']};(D/'report.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
