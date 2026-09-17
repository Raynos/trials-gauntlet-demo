"""Verify standalone footwear export skin and texture invariants, using Python stdlib."""
import json,struct,math
from pathlib import Path
R=Path.cwd();P=R/'prototypes/hero-garage';data=(P/'public/assets/street01-footwear-refined.glb').read_bytes();n=struct.unpack_from('<I',data,12)[0];doc=json.loads(data[20:20+n]);raw=data[28+n:]
def read(i):
 a=doc['accessors'][i];v=doc['bufferViews'][a['bufferView']];fmt={5126:'f',5123:'H',5121:'B',5125:'I'}[a['componentType']];size={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']];s=struct.calcsize('<'+fmt*size);stride=v.get('byteStride',s);off=v.get('byteOffset',0)+a.get('byteOffset',0);return [struct.unpack_from('<'+fmt*size,raw,off+k*stride) for k in range(a['count'])]
joints=doc['skins'][0]['joints'];names=[doc['nodes'][i]['name'] for i in joints];count=0;skin_errors=[]
for m in doc['meshes']:
 for p in m['primitives']:
  a=p['attributes']
  for position,js,ws in zip(read(a['POSITION']),read(a['JOINTS_0']),read(a['WEIGHTS_0'])):
   count+=1;assert all(math.isfinite(x) for x in position)
   expected='foot.L' if position[2]>0 else 'foot.R'
   actual=[names[j] for j,w in zip(js,ws) if w>1e-6]
   if actual!=[expected] or abs(sum(ws)-1)>1e-6:skin_errors.append((position,actual,expected,ws))
assert len(joints)==19 and not skin_errors,skin_errors[:3]
assert all(i['mimeType']=='image/png' for i in doc['images'])
r={'verticesVerified':count,'skinJoints':19,'rigidFootWeightsVerified':True,'finitePositionsVerified':True,'textures':'Three lossless PNG maps','status':'static invariants pass; assembled motion and visual acceptance parent-owned'}
(P/'reports/footwear-refine-verification.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r))
