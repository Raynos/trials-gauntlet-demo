"""R33 street palettes and authored openface helmet; no canonical mutations."""
from pathlib import Path
import json,struct,copy,hashlib,io,argparse
import numpy as np
from PIL import Image
R=Path.cwd();P=R/'prototypes/hero-garage';D=P/'art/street-variants';O=P/'public/assets/variants';parser=argparse.ArgumentParser();parser.add_argument('--base',default='/tmp/street-r33-decoded.glb');args=parser.parse_args()
def read(p):
 b=Path(p).read_bytes();n=struct.unpack_from('<I',b,12)[0];return json.loads(b[20:20+n]),b[28+n:]
def save(j,blob,p):
 j['buffers']=[{'byteLength':len(blob)}];js=json.dumps(j,separators=(',',':')).encode();js+=b' '*((-len(js))%4);binary=bytes(blob)+b'\0'*((-len(blob))%4);data=struct.pack('<III',0x46546c67,2,28+len(js)+len(binary))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(binary),0x004e4942)+binary;Path(p).write_bytes(data);return hashlib.sha256(data).hexdigest()
def appendview(j,blob,data):
 while len(blob)%4:blob.append(0)
 i=len(j['bufferViews']);j['bufferViews'].append({'buffer':0,'byteOffset':len(blob),'byteLength':len(data)});blob.extend(data);return i
j,b=read(args.base);original=copy.deepcopy(j);blob=bytearray(b);changes=[];images={}
for m in j['materials']:
 if m.get('name')not in ['Smooth continuous wrist rib boundary','Darker gathered mustard knit','Existing subdued mustard cotton']:continue
 t=m['pbrMetallicRoughness']['baseColorTexture'];oldtex=j['textures'][t['index']];oldim=oldtex['source']
 if oldim not in images:
  im=j['images'][oldim];v=j['bufferViews'][im['bufferView']];data=b[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']];image=Image.open(io.BytesIO(data));a=np.array(image);rgb=a[:,:,:3]/255;linear=np.where(rgb<=.04045,rgb/12.92,((rgb+.055)/1.055)**2.4);lum=linear@np.array([.2126,.7152,.0722]);out=lum[:,:,None]*np.array([.24,.25,.26]);srgb=np.where(out<=.0031308,out*12.92,1.055*out**(1/2.4)-.055);a[:,:,:3]=np.round(np.clip(srgb,0,1)*255).astype('uint8');buf=io.BytesIO();Image.fromarray(a).save(buf,format='PNG');imageidx=len(j['images']);j['images'].append({'bufferView':appendview(j,blob,buf.getvalue()),'mimeType':'image/png','name':'Charcoal '+im.get('name','cloth')});images[oldim]=imageidx
  Image.fromarray(a).save(D/f'charcoal-{oldim}.png')
 tex=copy.deepcopy(oldtex);tex['source']=images[oldim];t['index']=len(j['textures']);j['textures'].append(tex);changes.append(m['name']);m['name']=m['name'].replace('mustard','charcoal')
assert j['nodes']==original['nodes'] and j['meshes']==original['meshes'] and j['skins']==original['skins'] and j['animations']==original['animations'];charcoalsha=save(j,blob,O/'street-charcoal-raw.glb')
# Append existing helmet, bound by exact bone names and verified inverse bind matrices.
h,hb=read(D/'openface-helmet.glb');vo=len(j['bufferViews']);ao=len(j['accessors']);mo=len(j['materials']);meo=len(j['meshes']);offset=len(blob)
while offset%4:blob.append(0);offset+=1
for v in h['bufferViews']:
 x=copy.deepcopy(v);x['byteOffset']=offset+v.get('byteOffset',0);j['bufferViews'].append(x)
blob.extend(hb)
for a in h['accessors']:
 x=copy.deepcopy(a);x['bufferView']+=vo;j['accessors'].append(x)
assert not h.get('textures');j['materials'].extend(h['materials'])
def acc(doc,binary,i):
 a=doc['accessors'][i];v=doc['bufferViews'][a['bufferView']];dt={5121:'u1',5123:'<u2',5125:'<u4',5126:'<f4'}[a['componentType']];return np.frombuffer(binary,dtype=dt,count=a['count']*{'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']],offset=v.get('byteOffset',0)+a.get('byteOffset',0)).reshape(a['count'],-1).copy()
oldnames=[j['nodes'][i]['name']for i in j['skins'][0]['joints']];hnames=[h['nodes'][i]['name']for i in h['skins'][0]['joints']];oldib=acc(original,b,original['skins'][0]['inverseBindMatrices']);hib=acc(h,hb,h['skins'][0]['inverseBindMatrices']);binderr=max(float(np.max(abs(hib[i]-oldib[oldnames.index(name)])))for i,name in enumerate(hnames));assert binderr<1e-5
for mesh in h['meshes']:
 x=copy.deepcopy(mesh)
 for pr in x['primitives']:
  pr['attributes']={k:v+ao for k,v in pr['attributes'].items()};pr['indices']+=ao;pr['material']+=mo
  ids=acc(h,hb,pr['attributes']['JOINTS_0']-ao);mapped=np.array([oldnames.index(n)for n in hnames],dtype='u1')[ids];view=appendview(j,blob,mapped.tobytes());pr['attributes']['JOINTS_0']=len(j['accessors']);j['accessors'].append({'bufferView':view,'componentType':5121,'count':len(mapped),'type':'VEC4'})
 j['meshes'].append(x)
for n in h['nodes']:
 if 'mesh'not in n:continue
 x=copy.deepcopy(n);x['mesh']+=meo;x['skin']=0;index=len(j['nodes']);j['nodes'].append(x);j['scenes'][j.get('scene',0)]['nodes'].append(index)
# Helmet covers the barehead scalp groom; retain its mesh data but do not draw it.
groom=next(n for n in j['nodes']if n.get('name')=='Street01_Bystedt_CurlyGroom_Runtime');hiddenGroom=groom.pop('mesh');groom.pop('skin',None)
assert j['animations']==original['animations'] and j['skins']==original['skins'];opensha=save(j,blob,O/'street-openface-raw.glb')
report={'acceptedCatalogSource':'public/assets/street01-rider-round33-lossless.glb','acceptedCatalogSourceSHA256':hashlib.sha256((P/'public/assets/street01-rider-round33-lossless.glb').read_bytes()).hexdigest(),'baseSHA256':hashlib.sha256(Path(args.base).read_bytes()).hexdigest(),'charcoalRawSHA256':charcoalsha,'openfaceRawSHA256':opensha,'changedClothMaterials':changes,'charcoalAllGeometryRigClipsExact':True,'openfaceOriginalMeshDataRigClipsExact':True,'helmetVariantScalpGroomHidden':True,'addedHelmetVertices':3942,'inverseBindMaxError':binderr,'hairFit':'Barehead scalp groom hidden under helmet; saved mesh payload retained, face/eyebrows/beard unchanged','clips':[a['name']for a in j['animations']],'skinJoints':len(oldnames)};(D/'build-report.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
