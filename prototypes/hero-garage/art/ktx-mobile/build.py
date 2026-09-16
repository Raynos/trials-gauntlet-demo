"""Encode embedded mobile images to compatible UASTC KTX2; preserve mesh data.
Run from any directory with Python 3 and /opt/homebrew/bin/basisu installed.
"""
import copy, hashlib, json, math, struct, subprocess
from pathlib import Path
P=Path(__file__).resolve().parents[2]
D=Path(__file__).resolve().parent
ENC='/opt/homebrew/bin/basisu'
def sha(b):return hashlib.sha256(b).hexdigest()
def read(p):
 b=p.read_bytes();n=struct.unpack_from('<I',b,12)[0];j=json.loads(b[20:20+n]);size=struct.unpack_from('<I',b,20+n)[0];return j,b[28+n:28+n+size]
def chunk(b,v):return b[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']]
def write(p,j,b):
 j['buffers'][0]['byteLength']=len(b);jb=json.dumps(j,separators=(',',':')).encode();jb+=b' '*((-len(jb))%4);b+=b'\0'*((-len(b))%4)
 p.write_bytes(struct.pack('<III',0x46546c67,2,28+len(jb)+len(b))+struct.pack('<II',len(jb),0x4e4f534a)+jb+struct.pack('<II',len(b),0x004e4942)+b)
report={'encoder':subprocess.run([ENC,'-version'],capture_output=True,text=True).stdout.strip(),'models':{},'inconsistentColorSpaces':[]}
for kind in ['rider','bike']:
 src=P/'public/assets'/f'street01-{kind}-mobile.glb';dst=src.with_name(f'street01-{kind}-mobile-ktx.glb')
 j,b=read(src);old=copy.deepcopy(j);usage={i:set() for i in range(len(j['images']))};roles={i:set() for i in usage}
 def use(t,space,role):
  if t is not None:
   i=j['textures'][t['index']]['source'];usage[i].add(space);roles[i].add(role)
 for m in j['materials']:
  p=m.get('pbrMetallicRoughness',{});use(p.get('baseColorTexture'),'srgb','color');use(m.get('emissiveTexture'),'srgb','color');use(m.get('normalTexture'),'linear','normal');use(m.get('occlusionTexture'),'linear','orm');use(p.get('metallicRoughnessTexture'),'linear','orm')
 replacements={};images=[]
 for i,im in enumerate(j['images']):
  assert len(usage[i])==1,(kind,i,usage[i])
  assert not ('normal' in roles[i] and len(roles[i])>1),(kind,i,roles[i])
  space=next(iter(usage[i]));vi=im['bufferView'];raw=chunk(b,old['bufferViews'][vi]);stem=f'{kind}-{i:02d}'
  source=D/(stem+('.png' if im['mimeType']=='image/png' else '.jpg'));source.write_bytes(raw);out=D/(stem+'.ktx2')
  args=[ENC,'-file',str(source),'-output_file',str(out),'-ktx2','-uastc','-uastc_level','3','-mipmap','-mip_slow','-mip_smallest','1','-'+space]
  if 'normal' in roles[i]:args+=['-normal_map','-mip_renorm','-mip_linear']
  result=subprocess.run(args,capture_output=True,text=True);(D/(stem+'.encode.log')).write_text(result.stdout+result.stderr);assert result.returncode==0,result.stderr
  encoded=out.read_bytes();assert encoded[:12]==b'\xabKTX 20\xbb\r\n\x1a\n'
  vk,ts,w,h,depth,layers,faces,levels,compression=struct.unpack_from('<9I',encoded,12)
  assert levels==int(math.log2(max(w,h)))+1
  dfd=struct.unpack_from('<I',encoded,48)[0];model=encoded[dfd+12];transfer=encoded[dfd+14]
  assert model==166,('not UASTC',model);assert transfer==(2 if space=='srgb' else 1)
  validation=subprocess.run([ENC,'-validate',str(out)],capture_output=True,text=True);(D/(stem+'.validate.log')).write_text(validation.stdout+validation.stderr);assert validation.returncode==0
  compressed=sum(math.ceil(max(1,w>>l)/4)*math.ceil(max(1,h>>l)/4)*16 for l in range(levels));rgba=sum(max(1,w>>l)*max(1,h>>l)*4 for l in range(levels))
  replacements[vi]=encoded;im['mimeType']='image/ktx2'
  images.append(dict(index=i,name=im.get('name'),roles=sorted(roles[i]),colorSpace=space,width=w,height=h,levels=levels,dfdColorModel=model,dfdTransferFunction=transfer,supercompressionScheme=compression,sourceBytes=len(raw),encodedBytes=len(encoded),sourceSHA256=sha(raw),outputSHA256=sha(encoded),block4x4BytesWithMips=compressed,rgba8BytesWithMips=rgba,encoderArgs=args,hasAlpha='Has Alpha: 1' in validation.stdout,validationPassed=True))
  print(kind,i,im.get('name'),len(encoded),flush=True)
 for tex in j['textures']:
  index=tex.pop('source');tex.setdefault('extensions',{})['KHR_texture_basisu']={'source':index}
 for key in ['extensionsUsed','extensionsRequired']:
  if 'KHR_texture_basisu' not in j.setdefault(key,[]):j[key].append('KHR_texture_basisu')
 data=bytearray()
 def append(raw):
  data.extend(b'\0'*((-len(data))%4));off=len(data);data.extend(raw);return off
 for vi,v in enumerate(j['bufferViews']):
  if v['buffer']==0:
   raw=replacements.get(vi,chunk(b,old['bufferViews'][vi]));v['byteOffset']=append(raw);v['byteLength']=len(raw)
  ext=v.get('extensions',{}).get('EXT_meshopt_compression')
  if ext and ext['buffer']==0:ext['byteOffset']=append(chunk(b,old['bufferViews'][vi]['extensions']['EXT_meshopt_compression']))
 write(dst,j,bytes(data));nj,nb=read(dst);checked=0
 for vi,v in enumerate(old['bufferViews']):
  if vi not in replacements and v['buffer']==0:assert chunk(b,v)==chunk(nb,nj['bufferViews'][vi]);checked+=1
  ext=v.get('extensions',{}).get('EXT_meshopt_compression')
  if ext and ext['buffer']==0:assert chunk(b,ext)==chunk(nb,nj['bufferViews'][vi]['extensions']['EXT_meshopt_compression']);checked+=1
 for key in ['nodes','skins','animations','meshes','materials','extensions','accessors','samplers','scenes','scene']:
  assert old.get(key)==nj.get(key),key
 report['models'][kind]=dict(source=src.name,output=dst.name,sourceSHA256=sha(src.read_bytes()),outputSHA256=sha(dst.read_bytes()),sourceBytes=src.stat().st_size,outputBytes=dst.stat().st_size,images=images,verifiedNonImagePayloads=checked,geometryAnimationPayloadError=0,block4x4BytesWithMips=sum(x['block4x4BytesWithMips'] for x in images),rgba8BytesWithMips=sum(x['rgba8BytesWithMips'] for x in images))
report['notes']=['UASTC LDR 4x4, no RDO or channel swizzling, no alpha removal or vertical flip. Compatible legacy UASTC, not XUASTC.','Source rider normal and ORM are already JPEG; compression cannot restore original data.','Compressed residency assumes ASTC/BC7/ETC2 RGBA 4x4 16-byte blocks for every embedded image and mip; actual loaded variants/transcode format/device allocations vary. Excludes geometry, shadows, renderer/driver memory.','Normal mipmaps use linear filtering and vector renormalization. ORM remains linear; color mipmaps use sRGB-aware filtering.','Catalog is not modified; browser visual and device performance approval remain parent tasks.']
(P/'reports/ktx-mobile.json').write_text(json.dumps(report,indent=2)+'\n')
