from pathlib import Path
import json,struct,numpy as np
P=Path.cwd()/'prototypes/hero-garage'
def read(name):
 raw=(P/'public/assets'/name).read_bytes();n=struct.unpack_from('<I',raw,12)[0];return json.loads(raw[20:20+n]),raw[28+n:]
def acc(j,blob,i):
 a=j['accessors'][i];v=j['bufferViews'][a['bufferView']];return np.frombuffer(blob,dtype={5121:'u1',5123:'<u2',5125:'<u4',5126:'<f4'}[a['componentType']],count=a['count']*{'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']],offset=v.get('byteOffset',0)+a.get('byteOffset',0)).reshape(a['count'],-1)
a,ab=read('street01-rider-identity.glb');b,bb=read('street01-rider-collar-uv.glb');ap=a['meshes'][0]['primitives'][0];bp=b['meshes'][0]['primitives'][0];ai=acc(a,ab,ap['indices']).flatten();bi=acc(b,bb,bp['indices']).flatten()
checks={}
for key,i in ap['attributes'].items():
 old=acc(a,ab,i)[ai];new=acc(b,bb,bp['attributes'][key])[bi]
 if key!='TEXCOORD_0':checks[key]=bool(np.array_equal(old,new));assert checks[key]
 else:
  changed=np.any(old!=new,axis=1).reshape(-1,3).any(axis=1);assert changed.sum()==584
  uv=new.reshape(-1,3,2)[changed];x=uv[:,1]-uv[:,0];y=uv[:,2]-uv[:,0];area=np.abs(x[:,0]*y[:,1]-x[:,1]*y[:,0])/2;assert area.min()>1e-8
for key in ['nodes','skins','animations','materials','textures','images']:assert a[key]==b[key]
body_ids=set(ap['attributes'].values())|{ap['indices']}
for i in range(len(a['accessors'])):
 if i in body_ids:continue
 aa=a['accessors'][i];v=a['bufferViews'][aa['bufferView']];o=v.get('byteOffset',0);assert ab[o:o+v['byteLength']]==bb[o:o+v['byteLength']]
r={'renderedTriangleCornerAttributesIdentical':checks,'changedUVTriangles':int(changed.sum()),'minimumRepairedUVArea':float(area.min()),'nonBodyAccessorBytesIdentical':True,'animationsSkinNodesMaterialsTexturesImagesIdentical':True}
(P/'reports/collar-uv-round25-preservation.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r))
