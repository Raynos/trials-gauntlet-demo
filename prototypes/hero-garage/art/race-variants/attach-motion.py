"""Attach accepted six clips only when bone names and inverse-bind matrices match."""
import json,struct,hashlib,argparse
from pathlib import Path
import numpy as np
P=Path.cwd()/'prototypes/hero-garage';D=P/'art/race-variants'
p=argparse.ArgumentParser();p.add_argument('--motion-source',required=True);a=p.parse_args()
def read(p):
 b=p.read_bytes();n=struct.unpack_from('<I',b,12)[0];return json.loads(b[20:20+n]),b[28+n:]
def acc(j,b,i):
 a=j['accessors'][i];v=j['bufferViews'][a['bufferView']];return np.frombuffer(b,dtype='<f4',count=a['count']*{'SCALAR':1,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']],offset=v.get('byteOffset',0)+a.get('byteOffset',0)).reshape(a['count'],-1)
source=Path(a.motion_source);h,hbin=read(source);hnames=[h['nodes'][i]['name']for i in h['skins'][0]['joints']];hib=acc(h,hbin,h['skins'][0]['inverseBindMatrices']);reports=[]
for name in ('race-bluewhite','race-charcoalyellow'):
 j,b=read(P/'public/assets/variants'/(name+'-geometry.glb'));names=[j['nodes'][i]['name']for i in j['skins'][0]['joints']];ib=acc(j,b,j['skins'][0]['inverseBindMatrices']);error=max(np.max(abs(ib[i]-hib[hnames.index(n)]))for i,n in enumerate(names));assert error<1e-5,(name,error)
 nodes={n['name']:i for i,n in enumerate(j['nodes'])if 'name'in n};blob=bytearray(b);remapped={}
 def copyacc(idx):
  if idx in remapped:return remapped[idx]
  old=h['accessors'][idx];v=h['bufferViews'][old['bufferView']];assert not v.get('byteStride');start=v.get('byteOffset',0)+old.get('byteOffset',0);length=acc(h,hbin,idx).nbytes
  while len(blob)%4:blob.append(0)
  view=len(j['bufferViews']);j['bufferViews'].append({'buffer':0,'byteOffset':len(blob),'byteLength':length});blob.extend(hbin[start:start+length]);n=len(j['accessors']);copy=dict(old);copy['bufferView']=view;copy.pop('byteOffset',None);j['accessors'].append(copy);remapped[idx]=n;return n
 animations=json.loads(json.dumps(h['animations']))
 for animation in animations:
  for sampler in animation['samplers']:
   for key in ('input','output'):sampler[key]=copyacc(sampler[key])
  for channel in animation['channels']:channel['target']['node']=nodes[h['nodes'][channel['target']['node']]['name']]
 j['animations']=animations;j['buffers'][0]['byteLength']=len(blob);js=json.dumps(j,separators=(',',':')).encode();js+=b' '*((-len(js))%4);blob+=b'\0'*((-len(blob))%4);data=struct.pack('<III',0x46546c67,2,28+len(js)+len(blob))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(blob),0x004e4942)+blob;out=P/'public/assets/variants'/(name+'.glb');out.write_bytes(data);reports.append({'path':str(out.relative_to(P)),'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'restInverseBindError':float(error),'clips':[x['name']for x in animations],'originalGeometryBinaryExact':bytes(blob[:len(b)])==b})
(D/'motion-attachment-report.json').write_text(json.dumps({'motionSource':str(source),'motionSHA256':hashlib.sha256(source.read_bytes()).hexdigest(),'outputs':reports},indent=2)+'\n');print(json.dumps(reports))
