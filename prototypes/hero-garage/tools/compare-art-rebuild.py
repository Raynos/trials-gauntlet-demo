#!/usr/bin/env python3
"""Compare unpacked art GLBs by active node attributes and decoded resources."""
import argparse,json,struct,hashlib
from pathlib import Path

def sha(b):return hashlib.sha256(b).hexdigest()
def read(p):
 raw=p.read_bytes();n=struct.unpack_from('<I',raw,12)[0];return json.loads(raw[20:20+n]),raw[28+n:],sha(raw)
def view(j,b,i):
 v=j['bufferViews'][i];assert not v.get('extensions',{}).get('EXT_meshopt_compression'),'Use raw delivery for this comparison';return b[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']]
def acc(j,b,i):
 a=j['accessors'][i];v=j['bufferViews'][a['bufferView']];size={5120:1,5121:1,5122:2,5123:2,5125:4,5126:4}[a['componentType']]*{'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT2':4,'MAT3':9,'MAT4':16}[a['type']];data=view(j,b,a['bufferView']);start=a.get('byteOffset',0);stride=v.get('byteStride',size);payload=data[start:start+a['count']*size]if stride==size else b''.join(data[start+k*stride:start+k*stride+size]for k in range(a['count']));return {'type':a['type'],'componentType':a['componentType'],'count':a['count'],'normalized':a.get('normalized',False),'sha256':sha(payload)},payload

def compare(first,second):
 a,ab,ah=read(first);b,bb,bh=read(second);changes=[];rows=[];image_rows=[]
 def check(where,x,y):
  if x!=y:changes.append({'path':where,'first':x,'second':y})
 # Scene/node order is stable in this recipe; compare every node metadata field,
 # normalizing mesh references into their active payloads below.
 check('nodeCount',len(a['nodes']),len(b['nodes']))
 for ni,(an,bn)in enumerate(zip(a['nodes'],b['nodes'])):
  check(f'nodes[{ni}]',an,bn)
  if 'mesh'not in an or'mesh'not in bn:continue
  am=a['meshes'][an['mesh']];bm=b['meshes'][bn['mesh']];row={'node':an.get('name'),'nodeIndex':ni,'attributes':[]};check(f'meshName[{ni}]',am.get('name'),bm.get('name'));check(f'primitiveCount[{ni}]',len(am['primitives']),len(bm['primitives']))
  for pi,(ap,bp)in enumerate(zip(am['primitives'],bm['primitives'])):
   check(f'attributeKeys[{ni},{pi}]',sorted(ap['attributes']),sorted(bp['attributes']))
   for key in [*ap['attributes'],'indices']:
    ia=ap.get('indices')if key=='indices'else ap['attributes'][key];ib=bp.get('indices')if key=='indices'else bp['attributes'][key];x,xb=acc(a,ab,ia);y,yb=acc(b,bb,ib);same=x==y;row['attributes'].append({'semantic':key,'exact':same,'bytes':len(xb)});check(f'attribute[{ni},{pi},{key}]',x,y)
   check(f'material[{ni},{pi}]',a['materials'][ap['material']],b['materials'][bp['material']])
  rows.append(row)
 check('skins',a['skins'],b['skins'])
 for i,(x,y)in enumerate(zip(a['skins'],b['skins'])):check(f'inverseBind[{i}]',acc(a,ab,x['inverseBindMatrices'])[0],acc(b,bb,y['inverseBindMatrices'])[0])
 check('animationsJSON',a.get('animations'),b.get('animations'))
 for i,(x,y)in enumerate(zip(a.get('animations',[]),b.get('animations',[]))):
  for k,(xs,ys)in enumerate(zip(x['samplers'],y['samplers'])):
   for field in ('input','output'):check(f'animation[{i},{k},{field}]',acc(a,ab,xs[field])[0],acc(b,bb,ys[field])[0])
 for i,(x,y)in enumerate(zip(a.get('images',[]),b.get('images',[]))):
  xp=view(a,ab,x['bufferView']);yp=view(b,bb,y['bufferView']);row={'index':i,'firstName':x.get('name'),'secondName':y.get('name'),'firstBytes':len(xp),'secondBytes':len(yp),'exact':xp==yp,'firstSHA256':sha(xp),'secondSHA256':sha(yp)};image_rows.append(row)
  if xp!=yp:changes.append({'path':f'imagePayload[{i}]','first':row['firstSHA256'],'second':row['secondSHA256']})
 for key in ('textures','samplers','scenes','scene','extensions','extensionsUsed','extensionsRequired'):check(key,a.get(key),b.get(key))
 return {'first':str(first),'second':str(second),'firstSHA256':ah,'secondSHA256':bh,'fileByteDifference':second.stat().st_size-first.stat().st_size,'activeMeshAttributes':rows,'images':image_rows,'differences':changes,'limitations':['Raw GLBs only; fails rather than treating compressed accessor bytes as decoded geometry.','Image encoding differences are reported by payload hash; pixel decoding is a separate verification step.','Node/material metadata compared directly, not silently discarded.']}
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('first',type=Path);p.add_argument('second',type=Path);p.add_argument('--report',type=Path,required=True);args=p.parse_args();r=compare(args.first,args.second);args.report.write_text(json.dumps(r,indent=2)+'\n');print(json.dumps({'differenceCount':len(r['differences']),'paths':[d['path']for d in r['differences']],'changedImages':[i['index']for i in r['images']if not i['exact']]},indent=2))
