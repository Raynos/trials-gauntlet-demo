from pathlib import Path
import numpy as np,json,struct,hashlib
P=Path.cwd()/'prototypes/hero-garage';D=P/'art/cuff-band-final'
def read(p):
 b=p.read_bytes();n=struct.unpack_from('<I',b,12)[0];return json.loads(b[20:20+n]),b[28+n:]
def acc(j,b,i):
 a=j['accessors'][i];v=j['bufferViews'][a['bufferView']];return np.frombuffer(b,dtype={5121:'u1',5123:'<u2',5125:'<u4',5126:'<f4'}[a['componentType']],count=a['count']*{'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']],offset=v.get('byteOffset',0)+a.get('byteOffset',0)).reshape(a['count'],-1)
def rows(j,b,node):
 result=[]
 for p in j['meshes'][node['mesh']]['primitives']:
  arrays=[acc(j,b,p['attributes'][key])for key in ['POSITION','NORMAL','TEXCOORD_0','JOINTS_0','WEIGHTS_0']if key in p['attributes']];data=np.concatenate(arrays,axis=1);ids=acc(j,b,p['indices']).reshape(-1,3)
  for triangle in ids:
   vertices=[tuple(data[i])for i in triangle];result.append(tuple(sorted(vertices)))
 return sorted(result)
a,ab=read(P/'public/assets/street01-sleeve-shape-final-donor.glb');b,bb=read(P/'public/assets/street01-cuff-band-final-donor.glb');results={}
for node in a['nodes']:
 if 'mesh'not in node:continue
 other=next(n for n in b['nodes']if n.get('name')==node['name']);ar=rows(a,ab,node);br=rows(b,bb,other);assert ar==br,node['name'];results[node['name']]={'triangles':len(ar),'positionNormalUVJointsWeightsTriangleMultisetExactlyIdentical':True}
r={'comparedTo':'street01-sleeve-shape-final-donor.glb','meshes':results,'allPass':True};(D/'geometry-verification.json').write_text(json.dumps(r,indent=2));print(json.dumps(r))
