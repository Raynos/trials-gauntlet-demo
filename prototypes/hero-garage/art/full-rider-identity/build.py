"""Appearance-only assembly. Run via background Blender for bundled numpy."""
from pathlib import Path
import json,struct,copy,hashlib,math
import numpy as np
P=Path.cwd()/'prototypes/hero-garage';src=P/'public/assets/street01-rider-garment-repair.glb';head=P/'public/assets/street01-head-groom.glb';out=P/'public/assets/street01-rider-identity.glb'
def read(p):
 b=p.read_bytes();n=struct.unpack_from('<I',b,12)[0];return json.loads(b[20:20+n]),b[28+n:]
j,bodybin=read(src);h,hbin=read(head);original=copy.deepcopy(j);blob=bytearray(bodybin)
def append(payload,target=None):
 while len(blob)%4:blob.append(0)
 v={'buffer':0,'byteOffset':len(blob),'byteLength':len(payload)}
 if target:v['target']=target
 i=len(j['bufferViews']);j['bufferViews'].append(v);blob.extend(payload);return i
def accessor(doc,binary,i):
 a=doc['accessors'][i];v=doc['bufferViews'][a['bufferView']];dtype={5121:'u1',5123:'<u2',5125:'<u4',5126:'<f4'}[a['componentType']];n={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']];assert not v.get('byteStride');return np.frombuffer(binary,dtype=dtype,count=a['count']*n,offset=v.get('byteOffset',0)+a.get('byteOffset',0)).reshape(-1,n).copy()
def addacc(data,kind,ctype=5126):
 data=np.ascontiguousarray(data);a={'bufferView':append(data.tobytes()),'componentType':ctype,'count':len(data),'type':kind};idx=len(j['accessors']);j['accessors'].append(a);return idx
prim=j['meshes'][0]['primitives'][0];attrs=prim['attributes'];joints=accessor(j,bodybin,attrs['JOINTS_0']);weights=accessor(j,bodybin,attrs['WEIGHTS_0']);headjoint=j['skins'][0]['joints'].index(next(i for i,n in enumerate(j['nodes']) if n.get('name')=='head'))
indices=accessor(j,bodybin,prim['indices']).reshape(-1,3);hw=np.sum(weights*(joints==headjoint),axis=1);weighted_remove=(hw[indices]>.5).any(axis=1)
# Remove the complete old head components, including neck faces below the weight
# threshold. Exact-position welding connects UV/normal splits, not nearby cloth.
positions=accessor(j,bodybin,attrs['POSITION'])
_,welded=np.unique(positions,axis=0,return_inverse=True)
parents=list(range(int(welded.max())+1))
def component_root(i):
 while parents[i]!=i:parents[i]=parents[parents[i]];i=parents[i]
 return i
for triangle in welded[indices]:
 root=component_root(int(triangle[0]))
 for vertex in triangle[1:]:parents[component_root(int(vertex))]=root
components=np.array([component_root(int(t[0])) for t in welded[indices]])
remove=np.isin(components,np.unique(components[weighted_remove]))
residual_neck=np.flatnonzero(remove & ~weighted_remove)
# Frozen-source guard: source topology changes must be reviewed before assembly.
assert len(residual_neck)==347, len(residual_neck)
kept=indices[~remove];prim['indices']=addacc(kept.reshape(-1,1).astype('<u2'),'SCALAR',5123)
# Source faces +Z, target faces +X; tilt to the rider's rest neck direction.
a=math.radians(24);rz=np.array([[math.cos(a),math.sin(a),0],[-math.sin(a),math.cos(a),0],[0,0,1]]);ry=np.array([[0,0,1],[0,1,0],[-1,0,0]]);rot=rz@ry;scale=.9;pivot=np.array([0,1.531,0]);anchor=np.array([.79,1.235,0])
# Copy head data/resources with index remapping; retain all texture payloads.
vo=len(j['bufferViews']);ao=len(j['accessors']);io=len(j.get('images',[]));to=len(j.get('textures',[]));so=len(j.get('samplers',[]));mo=len(j['materials']);meo=len(j['meshes'])
for v in h['bufferViews']:
 assert not v.get('extensions');v2=copy.deepcopy(v);v2['byteOffset']=len(blob)+v.get('byteOffset',0);j['bufferViews'].append(v2)
blob.extend(hbin)
for a0 in h['accessors']:
 a1=copy.deepcopy(a0);a1['bufferView']+=vo;j['accessors'].append(a1)
for im in h.get('images',[]):
 x=copy.deepcopy(im);x['bufferView']+=vo;j.setdefault('images',[]).append(x)
j.setdefault('samplers',[]).extend(h.get('samplers',[]))
for tx in h.get('textures',[]):
 x=copy.deepcopy(tx);x['source']+=io
 if 'sampler' in x:x['sampler']+=so
 j.setdefault('textures',[]).append(x)
def remaptextures(x):
 if isinstance(x,dict):
  for k,v in x.items():
   if k.endswith('Texture') and isinstance(v,dict) and 'index' in v:v['index']+=to
   else:remaptextures(v)
 elif isinstance(x,list):
  for v in x:remaptextures(v)
for mat in h['materials']:
 x=copy.deepcopy(mat);remaptextures(x);j['materials'].append(x)
counts=[]
for mesh in h['meshes']:
 x=copy.deepcopy(mesh)
 for p in x['primitives']:
  origattrs=dict(p['attributes']);p['attributes']={k:v+ao for k,v in origattrs.items()};p['indices']+=ao;p['material']+=mo
  pos=accessor(h,hbin,origattrs['POSITION']);norm=accessor(h,hbin,origattrs['NORMAL']);pos=((pos-pivot)@rot.T*scale+anchor).astype('<f4');norm=(norm@rot.T).astype('<f4');n=len(pos)
  pa=addacc(pos,'VEC3');j['accessors'][pa].update(min=pos.min(axis=0).tolist(),max=pos.max(axis=0).tolist());p['attributes']['POSITION']=pa;p['attributes']['NORMAL']=addacc(norm,'VEC3');joint=np.zeros((n,4),dtype='u1');joint[:,0]=headjoint;w=np.zeros((n,4),dtype='<f4');w[:,0]=1;p['attributes']['JOINTS_0']=addacc(joint,'VEC4',5121);p['attributes']['WEIGHTS_0']=addacc(w,'VEC4');counts.append(n)
 j['meshes'].append(x)
for node in h['nodes']:
 assert set(node)<=set(['mesh','name']),node
 n=copy.deepcopy(node);n['mesh']+=meo;n['skin']=0;j['scenes'][j.get('scene',0)]['nodes'].append(len(j['nodes']));j['nodes'].append(n)
for ext in h.get('extensionsUsed',[]):
 if ext not in j.setdefault('extensionsUsed',[]):j['extensionsUsed'].append(ext)
j['buffers'][0]['byteLength']=len(blob)
while len(blob)%4:blob.append(0)
js=json.dumps(j,separators=(',',':')).encode();js+=b' '*((-len(js))%4);data=struct.pack('<III',0x46546c67,2,28+len(js)+len(blob))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(blob),0x004e4942)+blob;out.write_bytes(data)
assert bytes(blob[:len(bodybin)])==bodybin;assert j['animations']==original['animations'];assert j['skins']==original['skins'];assert prim['attributes']==original['meshes'][0]['primitives'][0]['attributes']
r={'sourceSHA256':hashlib.sha256(src.read_bytes()).hexdigest(),'headSHA256':hashlib.sha256(head.read_bytes()).hexdigest(),'outputSHA256':hashlib.sha256(data).hexdigest(),'outputBytes':len(data),'removedOldHeadTriangles':int(remove.sum()),'residualNeckTrianglesRemoved':residual_neck.tolist(),'remainingBodyTriangles':len(kept),'attachedMeshVertices':counts,'headSkinJoint':headjoint,'sourceBodyBinaryPrefixIdentical':True,'bodyAttributesIdentical':True,'sixAnimationsAndSkinJSONIdentical':True,'animationCount':len(j['animations']),'uniformScale':scale,'sourcePivot':pivot.tolist(),'riderRestAnchor':anchor.tolist(),'rotationMatrix':rot.tolist(),'limitations':['Local appearance assembly only; unoptimized original groom retained.','Old head-weighted faces removed; neck joining and fit need whole-scene visual review.','No mobile/deployment or final target likeness claim.']};(P/'reports/full-rider-identity.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r))
