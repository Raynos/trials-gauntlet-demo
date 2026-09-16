"""Bounded collar UV trial; run with Blender from repository root."""
from pathlib import Path
import json,struct,hashlib
import numpy as np
P=Path.cwd()/'prototypes/hero-garage';src=P/'public/assets/street01-rider-identity.glb';out=P/'public/assets/street01-rider-collar-uv.glb'
raw=src.read_bytes();n=struct.unpack_from('<I',raw,12)[0];j=json.loads(raw[20:20+n]);blob=bytearray(raw[28+n:]);prim=j['meshes'][0]['primitives'][0]
def acc(i):
 a=j['accessors'][i];v=j['bufferViews'][a['bufferView']];return np.frombuffer(blob,dtype={5121:'u1',5123:'<u2',5125:'<u4',5126:'<f4'}[a['componentType']],count=a['count']*{'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']],offset=v.get('byteOffset',0)+a.get('byteOffset',0)).reshape(a['count'],-1).copy()
def replace(i,data):
 a=j['accessors'][i];data=np.ascontiguousarray(data)
 while len(blob)%4:blob.append(0)
 a['bufferView']=len(j['bufferViews']);a.pop('byteOffset',None);a['count']=len(data);j['bufferViews'].append({'buffer':0,'byteOffset':len(blob),'byteLength':data.nbytes});blob.extend(data.tobytes())
 if 'min' in a:a['min']=data.min(axis=0).tolist();a['max']=data.max(axis=0).tolist()
attrs={k:acc(v) for k,v in prim['attributes'].items()};tri=acc(prim['indices']).reshape(-1,3);uv=attrs['TEXCOORD_0'][tri];p=attrs['POSITION'][tri]
a=uv[:,1]-uv[:,0];b=uv[:,2]-uv[:,0];area=np.abs(a[:,0]*b[:,1]-a[:,1]*b[:,0])*.5
mask=(area<1e-12)&(p[:,:,1].min(axis=1)>1.13)&(p[:,:,1].max(axis=1)<1.32)&(np.abs(p[:,:,2]).max(axis=1)<.20)&(p[:,:,0].min(axis=1)>.65)&(p[:,:,0].max(axis=1)<.95)
assert mask.sum()==584,int(mask.sum())
# Verified heavy-cotton atlas triangle from UV-matched authored source. Inset
# within it to avoid neighboring islands. Per-triangle reuse is provisional.
patch=np.array([[.30002716183662415,.3652235269546509],[.3193218410015106,.3824892044067383],[.3154755234718323,.3879965543746948]],dtype='<f4');patch=patch.mean(axis=0)+(patch-patch.mean(axis=0))*.6
# Blender UV origin is bottom-left; glTF texture coordinates are top-left.
patch[:,1]=1-patch[:,1]
ids=tri[mask].flatten();count=len(attrs['POSITION']);assert count+len(ids)<65536
for key,values in attrs.items():
 extra=np.tile(patch,(int(mask.sum()),1)) if key=='TEXCOORD_0' else values[ids]
 replace(prim['attributes'][key],np.concatenate([values,extra]))
tri[mask]=np.arange(count,count+len(ids)).reshape(-1,3);replace(prim['indices'],tri.reshape(-1,1))
j['buffers'][0]['byteLength']=len(blob);js=json.dumps(j,separators=(',',':')).encode();js+=b' '*((-len(js))%4)
data=struct.pack('<III',0x46546c67,2,28+len(js)+len(blob))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(blob),0x004e4942)+blob;out.write_bytes(data)
r={'sourceSHA256':hashlib.sha256(raw).hexdigest(),'outputSHA256':hashlib.sha256(data).hexdigest(),'repairedTriangles':int(mask.sum()),'duplicatedVertices':len(ids),'originalBinaryPrefixUnchanged':bytes(blob[:len(raw[28+n:])])==raw[28+n:],'method':'Inset heavy-cotton atlas triangle reused per collar triangle; UV-only trial, original vertices preserved.','limitations':['Repeated triangle patch is provisional, not a continuous production unwrap.','Shape and weights unchanged; ragged collar geometry remains.']};(P/'reports/collar-uv-round25-build.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r))
