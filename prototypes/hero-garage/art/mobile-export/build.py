"""Resize only embedded bike textures, preserving all meshopt/animation payloads.
Run with a Python environment containing Pillow. No model inference is used.
"""
import json,struct,io,hashlib,copy
from pathlib import Path
from PIL import Image
R=Path.cwd();P=R/'prototypes/hero-garage'
def read(p):
 with open(p,'rb') as f:
  f.read(12);n,_=struct.unpack('<II',f.read(8));j=json.loads(f.read(n));n,_=struct.unpack('<II',f.read(8));return j,f.read(n)
def chunk(b,v):return b[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']]
def sha(b):return hashlib.sha256(b).hexdigest()
def write(p,j,b):
 j['buffers'][0]['byteLength']=len(b);jb=json.dumps(j,separators=(',',':')).encode();jb+=b' '*((-len(jb))%4);b+=b'\0'*((-len(b))%4)
 p.write_bytes(struct.pack('<III',0x46546c67,2,28+len(jb)+len(b))+struct.pack('<II',len(jb),0x4e4f534a)+jb+struct.pack('<II',len(b),0x004e4942)+b)
report={}
for kind,srcname in [('rider','street01-rider-garment-repair.glb'),('bike','street01-bike-materials.glb')]:
 src=P/'public/assets'/srcname;dst=P/'public/assets'/f'street01-{kind}-mobile.glb';j,b=read(src);old=copy.deepcopy(j);replacements={};images=[]
 for im in j['images']:
  vi=im['bufferView'];raw=chunk(b,j['bufferViews'][vi]);img=Image.open(io.BytesIO(raw));before=img.size;name=im.get('name','')
  cap=1024 if 'albedo' in name else 512
  if kind=='bike' and max(img.size)>cap:
   size=tuple(round(v*cap/max(img.size)) for v in img.size);img=img.resize(size,Image.Resampling.LANCZOS)
   buf=io.BytesIO();img.save(buf,format='PNG',optimize=True);replacements[vi]=buf.getvalue();im['mimeType']='image/png'
  images.append(dict(name=name,before=list(before),after=list(img.size),rgba8BeforeBytes=before[0]*before[1]*4,rgba8AfterBytes=img.width*img.height*4,changed=vi in replacements))
 if not replacements:dst.write_bytes(src.read_bytes())
 else:
  data=bytearray()
  def append(raw):
   data.extend(b'\0'*((-len(data))%4));off=len(data);data.extend(raw);return off
  for vi,v in enumerate(j['bufferViews']):
   if v['buffer']==0:
    raw=replacements.get(vi,chunk(b,old['bufferViews'][vi]));v['byteOffset']=append(raw);v['byteLength']=len(raw)
   ext=v.get('extensions',{}).get('EXT_meshopt_compression')
   if ext and ext['buffer']==0:
    ext['byteOffset']=append(chunk(b,old['bufferViews'][vi]['extensions']['EXT_meshopt_compression']))
  write(dst,j,bytes(data))
 nj,nb=read(dst);imageviews={im['bufferView'] for im in j['images']};checked=0
 for vi,v in enumerate(old['bufferViews']):
  if vi in imageviews:continue
  if v['buffer']==0:assert chunk(b,v)==chunk(nb,nj['bufferViews'][vi]);checked+=1
  ext=v.get('extensions',{}).get('EXT_meshopt_compression')
  if ext and ext['buffer']==0:assert chunk(b,ext)==chunk(nb,nj['bufferViews'][vi]['extensions']['EXT_meshopt_compression']);checked+=1
 for key in ['nodes','skins','animations','meshes','materials','extensions','extensionsUsed','extensionsRequired','accessors']:
  assert old.get(key)==nj.get(key),key
 report[kind]=dict(source=srcname,output=dst.name,sourceSHA256=sha(src.read_bytes()),outputSHA256=sha(dst.read_bytes()),sourceBytes=src.stat().st_size,outputBytes=dst.stat().st_size,images=images,baseRGBA8BeforeBytes=sum(x['rgba8BeforeBytes'] for x in images),baseRGBA8AfterBytes=sum(x['rgba8AfterBytes'] for x in images),verifiedNonImagePayloads=checked,geometryAnimationPayloadError=0,triangles=sum(nj['accessors'][p['indices']]['count']//3 for m in nj['meshes'] for p in m['primitives']),extensionsPreserved=nj.get('extensionsUsed'),notes=['Only embedded image buffer views changed; meshopt compressed streams and animation/accessor/node data preserved exactly.','RGBA8 is base-level image memory estimate, excluding mipmaps and renderer allocations.','Normal/ORM maps resized directly as linear data, PNG encoded. Color maps use Pillow Lanczos interpolation.'])
(P/'reports/mobile-export.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:{x:y for x,y in v.items() if x!='images'} for k,v in report.items()},indent=2))
