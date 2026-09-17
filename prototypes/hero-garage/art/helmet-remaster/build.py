"""Target02 compact openface shell, level peak, recessed vents and joined webbing."""
import bpy,sys,math,json,hashlib,struct
from pathlib import Path
from mathutils import Vector,Matrix
from mathutils.bvhtree import BVHTree
import numpy as np
R=Path.cwd();P=R/'prototypes/hero-garage';D=P/'art/helmet-remaster';sys.path.insert(0,str(R/'assets/blender'));import common as C;import rider_forms as F
src=R/'assets/blender/source/rider-openface.blend';bpy.ops.wm.open_mainfile(filepath=str(src));arm=bpy.data.objects['rider_rig'];arm.data.pose_position='REST'
for ob in list(bpy.data.objects):
 if ob!=arm:bpy.data.objects.remove(ob,do_unlink=True)
for a in list(bpy.data.actions):bpy.data.actions.remove(a)
head=arm.data.bones['head'];up=(head.tail_local-head.head_local).normalized();front=Vector((up.z,0,-up.x));origin=head.head_local;basis=Matrix(((front.x,0,up.x,origin.x),(0,1,0,origin.y),(front.z,0,up.z,origin.z),(0,0,0,1)))
mats={'shell':C.new_mat('remastered satin graphite shell',(.025,.028,.032,1),rough=.55),'rim':C.new_mat('thin flexible rubber aperture',(.008,.009,.011,1),rough=.77),'liner':C.new_mat('recessed ventilation and liner',(.009,.010,.012,1),rough=.94),'strap':C.new_mat('woven flat chin webbing',(.013,.014,.015,1),rough=.9),'metal':C.new_mat('recessed alloy fittings',(.07,.075,.08,1),rough=.5,metal=.6)}
builder=C.MeshBuilder('rider:openface helmet');parts=[]
def add(name,vertices,faces):parts.append({'name':name,'vertices':len(vertices),'triangles':sum(len(f)-2 for f,m in faces)});F.mesh(builder,vertices,faces,basis,mats,'head')
def prim(name,bm,xf,mat):parts.append({'name':name,'vertices':len(bm.verts)});builder.add(bm,basis@xf,mats[mat],group='head');bm.free()
N=96;ROWS=24
# Compact cranial shell: 11mm lower crown; front opening follows a smooth ear cut.
def boundary(a):return 2.23-1.05*max(math.cos(a),0)**3
def point(a,t,inset=0):
 ear=.011*max(0,(t-1.65)/.58)**2
 return Vector((.024+(.112-inset)*math.sin(t)*math.cos(a)+.009*max(math.cos(a),0),(.103-inset+ear)*math.sin(t)*math.sin(a),.146+(.099-inset)*math.cos(t)))
def pt(row,col,inset=0):
 a=math.tau*(col%N)/N;return point(a,.01+(boundary(a)-.01)*row/ROWS,inset)
vertices=[]
for inset in [0,.006]:
 for row in range(ROWS+1):
  for col in range(N):vertices.append(pt(row,col,inset))
layer=(ROWS+1)*N;faces=[];vent={(r,c)for r in range(6,10)for c in [9,10,20,21,74,75,85,86]}
for row in range(ROWS):
 for col in range(N):
  a=row*N+col;b=row*N+(col+1)%N;c=b+N;d=a+N
  if (row,col)not in vent:faces.append(((a,b,c,d),'shell'))
  else:
   ids=[]
   for rr,cc in [(row,col),(row,col+1),(row+1,col+1),(row+1,col)]:ids.append(len(vertices));vertices.append(pt(rr,cc,.0035))
   faces.append((tuple(ids),'liner'))
   for q,(nr,nc)in enumerate([(row-1,col),(row,(col+1)%N),(row+1,col),(row,(col-1)%N)]):
    if (nr,nc)not in vent:faces.append(((a,b,c,d)[q:q+1]+((a,b,c,d)[(q+1)%4],ids[(q+1)%4],ids[q]),'shell'))
  faces.append(((a+layer,d+layer,c+layer,b+layer),'liner'))
for col in range(N):
 a=ROWS*N+col;b=ROWS*N+(col+1)%N;faces.append(((a,a+layer,b+layer,b),'rim'))
faces.extend([(tuple(reversed(range(N))),'shell'),(tuple(layer+i for i in range(N)),'liner')]);add('compact continuous double wall shell with four recessed vents',vertices,faces)
rim=[point(math.tau*i/N,boundary(math.tau*i/N))for i in range(N)];prim('1.6mm rolled aperture trim',C.prim_tube(rim,.0016,sides=8,samples=1,closed=True,smooth_path=False),Matrix.Identity(4),'rim')
# Nearly level short visor, attached above ear cut rather than following its arch.
pv=[];pf=[];S=32
for layerid in [0,1]:
 for row in range(4):
  for i in range(S+1):
   a=-.68+1.36*i/S;t=1.14;base=point(a,t);z=.187-.006*(abs(a)/.68)**2-row*.0012-layerid*.002
   pv.append(Vector((base.x+row*.010*math.cos(a),base.y+row*.0018*math.sin(a),z)))
L=4*(S+1)
for row in range(3):
 for i in range(S):
  a=row*(S+1)+i;b=a+1;c=b+S+1;d=a+S+1;pf.append(((a,b,c,d),'shell'));pf.append(((a+L,d+L,c+L,b+L),'rim'))
outline=list(range(S+1))+[r*(S+1)+S for r in [1,2,3]]+list(range(L-2,3*(S+1)-1,-1))+[2*(S+1),S+1]
for a,b in zip(outline,outline[1:]+outline[:1]):pf.append(((a,b,b+L,a+L),'rim'))
add('thin nearly level short trials peak',pv,pf)
def ribbon(name,points,width=.009):
 vs=[];fs=[]
 for i,p in enumerate(points):
  p=Vector(p);t=(Vector(points[min(i+1,len(points)-1)])-Vector(points[max(0,i-1)])).normalized();normal=Vector((0,1,0));across=t.cross(normal).normalized()*width*.5
  for depth in [-.0008,.0008]:vs.extend([p-across+normal*depth,p+across+normal*depth])
 for i in range(len(points)-1):
  a=i*4;b=a+4
  for q,r in [(0,1),(1,3),(3,2),(2,0)]:fs.append(((a+q,b+q,b+r,a+r),'strap'))
 fs.extend([((0,2,3,1),'strap'),((len(vs)-4,len(vs)-3,len(vs)-1,len(vs)-2),'strap')]);add(name,vs,fs)
for side in [-1,1]:
 hardware=Matrix.Translation((.009,side*.103,.125))@Matrix.Rotation(math.pi/2,4,'X');prim('flush ear mount',C.prim_cylinder(.0105,.0105,.0025,seg=32),hardware,'rim');prim('flush ear alloy ring',C.prim_torus(.0078,.0012,seg=32,sides=8),hardware@Matrix.Translation((0,0,-side*.0015)),'metal')
 junction=(.071,side*.065,.027)
 ribbon('rear fork chin strap',[tuple(point(side*2.0,boundary(side*2.0))),(.018,side*.077,.050),junction])
 ribbon('front fork chin strap',[tuple(point(side*.75,boundary(side*.75))),(.086,side*.075,.062),junction])
 ribbon('chin retention strap',[junction,(.109,side*.040,.004),(.109,side*.010,-.006)])
 prim('flat strap junction',C.prim_box(.014,.003,.012,bevel=.002,segments=3),Matrix.Translation(junction),'rim')
prim('chin strap quick release buckle',C.prim_box(.012,.019,.006,bevel=.002,segments=3),Matrix.Translation((.109,0,-.006)),'rim')
helmet=builder.build();helmet.parent=arm;helmet.modifiers.new('rig','ARMATURE').object=arm;helmet['remasterParts']=json.dumps(parts)
# Actual saved face surface from R33, independent of older helmet source head.
b=Path('/tmp/street-r33-decoded.glb').read_bytes();n=struct.unpack_from('<I',b,12)[0];j=json.loads(b[20:20+n]);bb=b[28+n:]
def acc(i):
 a=j['accessors'][i];v=j['bufferViews'][a['bufferView']];return np.frombuffer(bb,dtype={5121:'u1',5123:'<u2',5125:'<u4',5126:'<f4'}[a['componentType']],count=a['count']*{'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']],offset=v.get('byteOffset',0)+a.get('byteOffset',0)).reshape(a['count'],-1)
mesh=j['meshes'][next(n['mesh']for n in j['nodes']if n.get('name')=='Street01_Authored_EditableBody_Runtime')];hp=[];hf=[]
for pr in mesh['primitives']:
 v=acc(pr['attributes']['POSITION']);off=len(hp);hp.extend([(float(x),float(-z),float(y))for x,y,z in v]);hf.extend([tuple(int(k)+off for k in f)for f in acc(pr['indices']).reshape(-1,3)])
ht=BVHTree.FromPolygons(hp,hf);kt=BVHTree.FromPolygons([v.co for v in helmet.data.vertices],[list(p.vertices)for p in helmet.data.polygons]);crossings=kt.overlap(ht)
centers=[list(basis.inverted()@(sum((Vector(hp[k])for k in hf[pi]),Vector())/3))for _,pi in crossings]
bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(D/'openface-remaster-source.blend'),compress=True);C.export_glb(str(D/'openface-helmet.glb'),[arm,helmet],animations=True,meshopt=False)
report={'source':str(src.relative_to(R)),'sourceSHA256':hashlib.sha256(src.read_bytes()).hexdigest(),'headSource':'accepted R33 actual saved face triangles','headCollisionPairs':len(crossings),'headCollisionCentersLocal':centers,'parts':parts,'vertices':len(helmet.data.vertices),'rigidHeadWeight':True,'shellRoughness':.55,'headBasisBlender':[list(r)for r in basis]};(D/'build-report.json').write_text(json.dumps(report,indent=2));print('REPORT',json.dumps(report))
