"""Replace only source denim and pockets triangles; preserve accepted identity and motion bytes."""
from pathlib import Path
import bpy,json,struct,copy,hashlib,itertools,sys
import numpy as np
from mathutils.kdtree import KDTree
P=Path.cwd()/'prototypes/hero-garage'
sys.path.insert(0,str(Path.cwd()/'assets/blender'));import common as C;import rider_asset as A
bpy.ops.wm.open_mainfile(filepath=str(Path.cwd()/'assets/blender/source/rider-street.blend'));A.clear_pose(bpy.data.objects['rider_rig'])
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH'];C.select_only(meshes);bpy.context.view_layer.objects.active=meshes[0];bpy.ops.object.join();o=bpy.context.object;C.unwrap_all([o],angle=66,margin=.002)
m=o.data;m.calc_loop_triangles();uv=m.uv_layers.active.data
manifest=json.loads((P/'art/denim-refine/source-removal-triangles.json').read_text())
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
base=P/'public/assets/street01-rider-identity.glb';j,basebin=read(base);original=copy.deepcopy(j);blob=bytearray(basebin)
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
assert matched==8068,matched

p['indices']=add(inds[remove].reshape(-1,1).astype('<u2'),'SCALAR',5123)
for node in j['nodes']:
 if 'mesh' in node and node['mesh']!=0:del node['mesh'];node.pop('skin',None)
j['buffers'][0]['byteLength']=len(blob)
while len(blob)%4:blob.append(0)
js=json.dumps(j,separators=(',',':')).encode();js+=b' '*((-len(js))%4);data=struct.pack('<III',0x46546c67,2,28+len(js)+len(blob))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(blob),0x004e4942)+blob
scratch=Path('/tmp/denim-accepted-extract.glb');scratch.write_bytes(data)
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(scratch));arm=next(o for o in bpy.data.objects if o.type=='ARMATURE');arm.animation_data_clear();arm.data.pose_position='REST'
for act in list(bpy.data.actions):bpy.data.actions.remove(act)
ob=bpy.data.objects['rider'];before=[v.co.copy() for v in ob.data.vertices]
# Existing original exporter split each UV corner. Merge exact position AND weights
# is avoided: smooth only normals across coincident corner positions, geometry untouched.
# A bounded knee relaxation is computed on the welded positional graph, applied
# identically to all coincident corners; retain UV/skin splits and exact seat surface.
from mathutils import Vector
keys={};groups={}
for v in ob.data.vertices:
 key=tuple(round(float(c),7) for c in v.co);keys[v.index]=key;groups.setdefault(key,[]).append(v.index)
coords={k:ob.data.vertices[ids[0]].co.copy() for k,ids in groups.items()};links={k:set() for k in groups}
for edge in ob.data.edges:
 a,b=[keys[i] for i in edge.vertices]
 if a!=b:links[a].add(b);links[b].add(a)
strength={}
for k,ids in groups.items():
 v=ob.data.vertices[ids[0]];ws={ob.vertex_groups[g.group].name:g.weight for g in v.groups};pelvis=ws.get('pelvis',0)
 # Smooth distal thigh/knee only. All pelvis-influenced saddle/crotch stays exact.
 strength[k]=.16 if pelvis<.00001 and .24<v.co.z<.65 else 0
for _ in range(3):
 updates={}
 for k,c in coords.items():
  if not strength[k] or not links[k]:continue
  avg=sum((coords[n] for n in links[k]),Vector())/len(links[k]);delta=(avg-c)*strength[k]
  if delta.length>.001:delta.normalize();delta*=.001
  updates[k]=c+delta
 coords.update(updates)
for k,ids in groups.items():
 for i in ids:ob.data.vertices[i].co=coords[k]
# Smooth shading across positional UV splits with area-weighted normals.
ob.data.update();normal_sums={k:Vector() for k in groups}
for poly in ob.data.polygons:
 for vi in poly.vertices:normal_sums[keys[vi]]+=poly.normal*poly.area
normals=[normal_sums[keys[loop.vertex_index]].normalized() for loop in ob.data.loops]
for poly in ob.data.polygons:poly.use_smooth=True
ob.data.normals_split_custom_set(normals)
changed=[i for i,v in enumerate(ob.data.vertices) if (v.co-before[i]).length>1e-9];maxmove=max(((v.co-before[i]).length for i,v in enumerate(ob.data.vertices)),default=0)
# Exact original weights/UVs retained. Fully accepted seat triangles are unchanged.
for v in ob.data.vertices:
 if any(ob.vertex_groups[g.group].name=='pelvis' and g.weight>1e-5 for g in v.groups):assert (v.co-before[v.index]).length<1e-9
bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(P/'art/denim-refine/denim-accepted-source.blend'),compress=True)
arm.data.pose_position='POSE';out=P/'public/assets/street01-denim-refined-accepted.glb';C.export_glb(str(out),[ob,arm],animations=True,meshopt=False,extra={'export_animations':False})
r={'method':'Extract exact accepted denim triangles by original UV correspondence; preserve skin/UVs and all pelvis-influenced geometry; bounded distal thigh/knee positional relaxation plus area-weighted smooth normals across UV split corners','removedSourceTriangles':matched,'changedVertexCount':len(changed),'maxMovementM':maxmove,'seatPelvisGeometryExact':True,'outputSHA256':hashlib.sha256(out.read_bytes()).hexdigest(),'outputBytes':out.stat().st_size}
(P/'reports/denim-refine-accepted-build.json').write_text(json.dumps(r,indent=2));print(json.dumps(r))
