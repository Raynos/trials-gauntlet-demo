from pathlib import Path
import json,struct,copy,hashlib,sys
import numpy as np
P=Path.cwd()/'prototypes/hero-garage'
def read(p):
 b=p.read_bytes();n=struct.unpack_from('<I',b,12)[0];return json.loads(b[20:20+n]),b[28+n:]
def acc(j,b,i):
 a=j['accessors'][i];v=j['bufferViews'][a['bufferView']];return np.frombuffer(b,dtype={5121:'u1',5123:'<u2',5125:'<u4',5126:'<f4'}[a['componentType']],count=a['count']*{'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']],offset=v.get('byteOffset',0)+a.get('byteOffset',0)).reshape(a['count'],-1).copy()
import argparse
parser=argparse.ArgumentParser();parser.add_argument('--base',required=True);parser.add_argument('--out',required=True);args=parser.parse_args(sys.argv[sys.argv.index('--')+1:]);base=Path(args.base);new=P/'public/assets/street01-footwear-finish.glb';j,basebin=read(base);h,hbin=read(new);original=copy.deepcopy(j);blob=bytearray(basebin)
def add(data,kind,ctype=5126):
 data=np.ascontiguousarray(data)
 while len(blob)%4:blob.append(0)
 v=len(j['bufferViews']);j['bufferViews'].append({'buffer':0,'byteOffset':len(blob),'byteLength':data.nbytes});blob.extend(data.tobytes());i=len(j['accessors']);j['accessors'].append({'bufferView':v,'componentType':ctype,'count':len(data),'type':kind});return i
target_nodes={n['name']:i for i,n in enumerate(j['nodes']) if 'mesh' in n and n.get('name') in ('rider:trainer_upper','rider:trainer_rubber','rider:hero footwear construction','rider:cotton_laces')}
assert len(target_nodes)==4,target_nodes
# Bind the new garment to the existing identical rest skeleton by bone name.
oldnames=[j['nodes'][n]['name'] for n in j['skins'][0]['joints']];oldib=acc(j,basebin,j['skins'][0]['inverseBindMatrices'])
for skin in h['skins']:
 names=[h['nodes'][n]['name'] for n in skin['joints']];ib=acc(h,hbin,skin['inverseBindMatrices']);assert max(np.max(abs(ib[i]-oldib[oldnames.index(name)])) for i,name in enumerate(names))<.00001
# Independently derive world rest transforms from node TRS, not inverse binds.
from mathutils import Matrix,Vector,Quaternion
def worlds(doc):
 parents={c:i for i,n in enumerate(doc['nodes']) for c in n.get('children',[])};cache={}
 def world(i):
  if i not in cache:
   n=doc['nodes'][i]
   if 'matrix' in n:local=Matrix(np.array(n['matrix']).reshape(4,4).T.tolist())
   else:
    q=n.get('rotation',[0,0,0,1]);local=Matrix.LocRotScale(Vector(n.get('translation',[0,0,0])),Quaternion((q[3],*q[:3])),Vector(n.get('scale',[1,1,1])))
   cache[i]=(world(parents[i])@local) if i in parents else local
  return cache[i]
 return {doc['nodes'][i]['name']:np.array(world(i)) for i in doc['skins'][0]['joints']}
wa,wb=worlds(j),worlds(h);rest_delta=max(float(np.max(abs(wa[n]-wb[n]))) for n in wb);assert rest_delta<.00001,rest_delta
vo=len(j['bufferViews']);ao=len(j['accessors']);io=len(j.get('images',[]));to=len(j.get('textures',[]));so=len(j.get('samplers',[]));mo=len(j['materials']);meo=len(j['meshes'])
for v in h['bufferViews']:
 x=copy.deepcopy(v);x['byteOffset']=len(blob)+v.get('byteOffset',0);j['bufferViews'].append(x)
blob.extend(hbin)
for a in h['accessors']:
 x=copy.deepcopy(a);x['bufferView']+=vo;j['accessors'].append(x)
for im in h.get('images',[]):
 x=copy.deepcopy(im);x['bufferView']+=vo;j.setdefault('images',[]).append(x)
j.setdefault('samplers',[]).extend(h.get('samplers',[]))
for tx in h.get('textures',[]):
 x=copy.deepcopy(tx);x['source']+=io
 if 'sampler' in x:x['sampler']+=so
 j.setdefault('textures',[]).append(x)
def remap(x):
 if isinstance(x,dict):
  for k,v in x.items():
   if k.endswith('Texture') and isinstance(v,dict) and 'index' in v:v['index']+=to
   else:remap(v)
 elif isinstance(x,list):
  for v in x:remap(v)
for mat in h['materials']:
 x=copy.deepcopy(mat);remap(x);j['materials'].append(x)
for mesh in h['meshes']:
 x=copy.deepcopy(mesh)
 for pr in x['primitives']:
  pr['attributes']={k:v+ao for k,v in pr['attributes'].items()};pr['indices']+=ao;pr['material']+=mo
 j['meshes'].append(x)
for node in h['nodes']:
 if 'mesh' not in node:continue
 assert not any(k in node for k in ('translation','rotation','scale','matrix')),node
 skin=h['skins'][node['skin']];names=[h['nodes'][n]['name'] for n in skin['joints']]
 for pr in j['meshes'][node['mesh']+meo]['primitives']:
  ids=acc(h,hbin,pr['attributes']['JOINTS_0']-ao);mapped=np.array([oldnames.index(n) for n in names],dtype='u1')[ids];pr['attributes']['JOINTS_0']=add(mapped,'VEC4',5121)
 n={'name':node['name'],'mesh':node['mesh']+meo,'skin':0};assert node['name'] in target_nodes;target=target_nodes[node['name']];assert not any(k in j['nodes'][target] for k in ('translation','rotation','scale','matrix'));j['nodes'][target].update(n)
for e in h.get('extensionsUsed',[]):
 if e not in j.setdefault('extensionsUsed',[]):j['extensionsUsed'].append(e)
j['buffers'][0]['byteLength']=len(blob)
while len(blob)%4:blob.append(0)
js=json.dumps(j,separators=(',',':')).encode();js+=b' '*((-len(js))%4);data=struct.pack('<III',0x46546c67,2,28+len(js)+len(blob))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(blob),0x004e4942)+blob
out=Path(args.out);out.write_bytes(data)
assert bytes(blob[:len(basebin)])==basebin;assert j['animations']==original['animations'];assert j['skins']==original['skins']
r={'independentWorldRestMatrixMaxDelta':rest_delta,'oldBinaryPrefixIdentical':True,'oldMeshesUnchanged':j['meshes'][:meo]==original['meshes'],'sixAnimationsAndSkinJSONIdentical':True,'replacedNodes':list(target_nodes),'outputSHA256':hashlib.sha256(data).hexdigest(),'outputBytes':len(data)}
(P/'art/footwear-finish/assembly-report.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r))
