"""Replace only source footwear triangles; preserve accepted identity and motion bytes."""
from pathlib import Path
import bpy,json,struct,copy,hashlib,itertools,sys
import numpy as np
from mathutils.kdtree import KDTree
P=Path.cwd()/'prototypes/hero-garage'
sys.path.insert(0,str(Path.cwd()/'assets/blender'));import common as C;import rider_asset as A
bpy.ops.wm.open_mainfile(filepath=str(Path.cwd()/'assets/blender/source/rider-street.blend'));A.clear_pose(bpy.data.objects['rider_rig'])
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH'];C.select_only(meshes);bpy.context.view_layer.objects.active=meshes[0];bpy.ops.object.join();o=bpy.context.object;C.unwrap_all([o],angle=66,margin=.002)
m=o.data;m.calc_loop_triangles();uv=m.uv_layers.active.data
manifest=json.loads((P/'art/footwear-refine/source-removal-triangles.json').read_text())
def key(points):return tuple(sorted(tuple(round(float(c),6) for c in p) for p in points))
keys={key(t['position']) for t in manifest}
source=[]
for t in m.loop_triangles:
 if key([m.vertices[i].co for i in t.vertices]) in keys:source.append(np.array([tuple(uv[i].uv) for i in t.loops]))
assert len(source)==len(manifest),(len(source),len(manifest))
tree=KDTree(len(source))
for i,t in enumerate(source):tree.insert((*t.mean(axis=0),0),i)
tree.balance()
def read(p):
 b=p.read_bytes();n=struct.unpack_from('<I',b,12)[0];return json.loads(b[20:20+n]),b[28+n:]
def acc(j,b,i):
 a=j['accessors'][i];v=j['bufferViews'][a['bufferView']];return np.frombuffer(b,dtype={5121:'u1',5123:'<u2',5125:'<u4',5126:'<f4'}[a['componentType']],count=a['count']*{'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']],offset=v.get('byteOffset',0)+a.get('byteOffset',0)).reshape(a['count'],-1).copy()
import argparse
parser=argparse.ArgumentParser();parser.add_argument('--base');parser.add_argument('--out');args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
base=Path(args.base) if args.base else P/'public/assets/street01-rider-tailored.glb';new=P/'public/assets/street01-footwear-refined.glb';j,basebin=read(base);h,hbin=read(new);original=copy.deepcopy(j);blob=bytearray(basebin)
def add(data,kind,ctype=5126):
 data=np.ascontiguousarray(data)
 while len(blob)%4:blob.append(0)
 v=len(j['bufferViews']);j['bufferViews'].append({'buffer':0,'byteOffset':len(blob),'byteLength':data.nbytes});blob.extend(data.tobytes());i=len(j['accessors']);j['accessors'].append({'bufferView':v,'componentType':ctype,'count':len(data),'type':kind});return i
p=j['meshes'][0]['primitives'][0];inds=acc(j,basebin,p['indices']).reshape(-1,3);uvs=acc(j,basebin,p['attributes']['TEXCOORD_0']);uvs[:,1]=1-uvs[:,1];pos=acc(j,basebin,p['attributes']['POSITION']);remove=[];matched=0;collar=0
for ii,t in enumerate(uvs[inds]):
 found=False
 for _,si,_ in tree.find_range((*t.mean(axis=0),0),.00003):
  if any(np.max(np.abs(t-np.array(perm)))<.00002 for perm in itertools.permutations(source[si])):found=True;break
 if found:remove.append(ii);matched+=1;continue
assert matched==len(source),(matched,len(source))
mask=np.ones(len(inds),dtype=bool);mask[remove]=False;p['indices']=add(inds[mask].reshape(-1,1).astype('<u2'),'SCALAR',5123)
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
 n={'name':node['name'],'mesh':node['mesh']+meo,'skin':0};j['scenes'][j.get('scene',0)]['nodes'].append(len(j['nodes']));j['nodes'].append(n)
for e in h.get('extensionsUsed',[]):
 if e not in j.setdefault('extensionsUsed',[]):j['extensionsUsed'].append(e)
j['buffers'][0]['byteLength']=len(blob)
while len(blob)%4:blob.append(0)
js=json.dumps(j,separators=(',',':')).encode();js+=b' '*((-len(js))%4);data=struct.pack('<III',0x46546c67,2,28+len(js)+len(blob))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(blob),0x004e4942)+blob
out=Path(args.out) if args.out else P/'public/assets/street01-rider-tailored-footwear.glb';out.write_bytes(data)
assert bytes(blob[:len(basebin)])==basebin;assert j['animations']==original['animations'];assert j['skins']==original['skins']
r={'independentWorldRestMatrixMaxDelta':rest_delta,'inverseBindMatchTolerance':.00001,'removedSourceFootwearTriangles':matched,'sourceFootwearTriangles':len(source),'oldBodyBinaryPrefixIdentical':True,'savedHeadAndHoodieMeshesAndAttributesIdentical':j['meshes'][1:meo]==original['meshes'][1:],'sixAnimationsAndSkinJSONIdentical':True,'outputSHA256':hashlib.sha256(data).hexdigest(),'outputBytes':len(data)}
(P/'reports/footwear-refine-assembly.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r))
