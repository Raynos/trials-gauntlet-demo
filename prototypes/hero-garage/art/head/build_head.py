"""First anatomical head candidate. Authored source topology; modest editable feature deltas.
Color and groom construction is scripted look development, not a claim of hand-sculpted or baked detail.
"""
import bpy,math,random,json,struct,hashlib
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from pathlib import Path
R=Path(__file__).resolve().parents[2]
bpy.ops.wm.read_factory_settings(use_empty=True)
random.seed(1701)
with bpy.data.libraries.load(str(R/'art/sources/blender-realistic-anatomy.blend'),link=False) as (src,dst):
 dst.objects=[n for n in src.objects if n.startswith('GEO-head_animation_realistic')]
objs=dst.objects
head=next(o for o in objs if o.name=='GEO-head_animation_realistic')
origin=head.location.copy(); offset=Vector((0,0,1.355))-origin
for o in objs:
 bpy.context.scene.collection.objects.link(o);o.location+=offset;o.hide_set(False)
 o.data.materials.clear()
 for p in o.data.polygons:p.use_smooth=True
head.name='Street01_AnatomicalHead'
head.shape_key_add(name='Source anatomy')
def gauss(x,c,s):return math.exp(-((x-c)/s)**2)
# Three broad limited identity controls: bridge, jaw/chin, brow. Source loops remain untouched.
for name,feature in [('Target01 nose bridge',0),('Target01 jaw plane',1),('Target01 brow',2)]:
 key=head.shape_key_add(name=name)
 for v in key.data:
  x,y,z=v.co
  if feature==0:
   v.co.y-=.010*gauss(x,0,.020)*gauss(z,.290,.041)*gauss(y,-.145,.045)
   v.co.z-=.0025*gauss(x,0,.020)*gauss(z,.270,.015)
  if feature==1:
   v.co.x+=math.copysign(.009,x)*gauss(abs(x),.061,.031)*gauss(z,.215,.037)
   v.co.y-=.0045*gauss(x,0,.045)*gauss(z,.199,.025)
   v.co.z-=.004*gauss(x,0,.035)*gauss(z,.195,.025)
  if feature==2:v.co.y-=.007*gauss(abs(x),.034,.027)*gauss(z,.335,.017)*gauss(y,-.132,.045)
 key.value=1

def material(name,col,rough=.5,metal=0):
 m=bpy.data.materials.new(name);m.diffuse_color=(*col,1);m.use_nodes=True
 bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(*col,1);bs.inputs['Roughness'].default_value=rough;bs.inputs['Metallic'].default_value=metal
 return m
skin=material('Olive skin and short beard • vertex color',(.47,.285,.19),.52)
attr=skin.node_tree.nodes.new('ShaderNodeVertexColor');attr.layer_name='SkinColor';skin.node_tree.links.new(attr.outputs['Color'],skin.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
head.data.materials.append(skin)
colors=head.data.color_attributes.new(name='SkinColor',type='FLOAT_COLOR',domain='POINT')
for v,c in zip(head.data.vertices,colors.data):
 x,y,z=v.co
 # Measured source landmarks: mouth .23, nose tip .27, eye .31, brow .335 local Z.
 cheekline=.249+.061*min(1,abs(x)/.085)
 below=1/(1+math.exp(max(-60,min(60,(z-cheekline)*190))))
 jawbottom=1/(1+math.exp(max(-60,min(60,(.180-z)*220))))
 front=1/(1+math.exp(max(-60,min(60,(y+.035)*100))))
 beard=below*jawbottom*front
 moustache=gauss(z,.253,.008)*gauss(x,0,.039)*gauss(y,-.143,.035)
 sideburn=gauss(abs(x),.079,.016)*gauss(z,.311,.029)*front
 beard=max(beard,moustache*.95,sideburn*.9)
 lip=gauss(z,.233,.009)*gauss(x,0,.033)*gauss(y,-.143,.030)
 beard*=1-lip*.96
 noise=random.uniform(-.025,.025)
 base=(.38+noise,.221+noise*.65,.140+noise*.45)
 beardcol=(.022,.015,.010)
 strength=min(.94,beard*(.72+random.uniform(-.12,.12)))
 col=[base[i]*(1-strength)+beardcol[i]*strength for i in range(3)]
 col=[col[i]*(1-lip*.60)+(.30,.105,.084)[i]*lip*.60 for i in range(3)]
 scalp=max(gauss(z,.418,.044),gauss(abs(x),.078,.020)*gauss(z,.356,.034)) if z>.33 else 0
 scalp*=1 if y>-.075 else max(0,min(1,(z-.382)/.018))
 col=[col[i]*(1-scalp*.94)+beardcol[i]*scalp*.94 for i in range(3)]
 c.color=(*col,1)
white=material('Eye sclera • warm white',(.74,.70,.64),.19)
iris=material('Dark brown iris',(.085,.037,.015),.24)
for o in objs:
 if o==head:continue
 o.data.materials.append(iris if 'iris' in o.name else white)
# Place authored iris surfaces in front of the source's closed sclera globes.
bpy.context.view_layer.update()
for side in ('L','R'):
 eye=next(o for o in objs if '.iris.'+side in o.name)
 globe=next(o for o in objs if '.sclera.'+side in o.name)
 ev=[eye.matrix_world@v.co for v in eye.data.vertices];gv=[globe.matrix_world@v.co for v in globe.data.vertices]
 eye.location.y += min(v.y for v in gv)-min(v.y for v in ev)-.00025
 # Match both eye aperture radii, preserving source iris mesh topology.
 if side=='L': eye.scale.x*=.71;eye.scale.z*=.71
bpy.context.view_layer.update()
# Source includes separate iris and sclera. A small pupil disc and corneal dome give eye depth.
for side in ('L','R'):
 eye=next(o for o in objs if '.iris.'+side in o.name)
 # Determine frontmost point in global -Y direction from authored iris mesh.
 coords=[eye.matrix_world@v.co for v in eye.data.vertices]
 # matrix_world may need scene update after moving; evaluate below.
bpy.context.view_layer.update()
pupilmat=material('Pupil',(.006,.004,.003),.12)
cornea=material('Corneal glint',(.92,.95,1),.065)
bs=cornea.node_tree.nodes.get('Principled BSDF');bs.inputs['Transmission Weight'].default_value=.96;bs.inputs['IOR'].default_value=1.376
for side in ('L','R'):
 eye=next(o for o in objs if '.iris.'+side in o.name)
 coords=[eye.matrix_world@v.co for v in eye.data.vertices]
 center=Vector((sum(v.x for v in coords)/len(coords),min(v.y for v in coords)-.0003,sum(v.z for v in coords)/len(coords)))
 bpy.ops.mesh.primitive_uv_sphere_add(segments=24,ring_count=12,radius=1,location=center)
 p=bpy.context.object;p.name='Pupil.'+side;p.scale=(.0024,.0005,.0024);p.data.materials.append(pupilmat)
 bpy.ops.mesh.primitive_uv_sphere_add(segments=24,ring_count=12,radius=1,location=(center.x,center.y+.0002,center.z))
 p=bpy.context.object;p.name='Corneal dome.'+side;p.scale=(.0057,.0015,.0057);p.data.materials.append(cornea)
 for poly in p.data.polygons:poly.use_smooth=True
# BVH follows evaluated authored anatomy. Scalp points use actual anatomy intersections.
deps=bpy.context.evaluated_depsgraph_get();bv=BVHTree.FromObject(head,deps)
hairmats=[material('Dark brown locks '+str(i),c,.6) for i,c in enumerate([(.031,.022,.016),(.049,.032,.021),(.070,.045,.027),(.091,.061,.037)])]
guides=bpy.data.collections.new('EDITABLE GROOM GUIDES');bpy.context.scene.collection.children.link(guides)
guides.hide_render=True
verts=[];faces=[];mids=[]
center=Vector((0,.012,.349))
# Deliberately irregular lock families; loose S waves with root-to-tip taper.
for idx in range(370):
 phi=random.uniform(0,math.tau)
 theta=random.uniform(.08,1.96)
 direction=Vector((math.sin(theta)*math.cos(phi),math.sin(theta)*math.sin(phi),math.cos(theta)))
 hit,normal,_,_=bv.ray_cast(center,direction,.30)
 if hit is None:continue
 # Keep forehead and ears exposed; back and sides can root lower.
 if hit.y<-.045 and hit.z<.346:continue
 if abs(hit.x)>.068 and hit.z<.292:continue
 if hit.y>.015 and hit.z<.265:continue
 root=hit+normal*.0015
 length=random.uniform(.044,.080)
 flow=Vector((.2*math.cos(phi)+random.uniform(-.3,.3),-.8 if hit.y<.025 else .28,-.2 if hit.z>.389 else -1.0))
 flow=(flow-normal*flow.dot(normal)).normalized()
 across=normal.cross(flow).normalized()
 points=[]
 amp=random.uniform(.005,.012);phase=random.uniform(-.45,.45);width=random.uniform(.0034,.0054)
 for j in range(13):
  t=j/12
  p=root+flow*length*t+normal*(.014*math.sin(math.pi*t*.86)+.006*t)+across*(amp*math.sin(t*math.tau*random.uniform(.8,.82)+phase)*math.sin(math.pi*t*.8))
  points.append(head.matrix_world @ p)
 curve=bpy.data.curves.new('Loose S guide %03d'%idx,'CURVE');curve.dimensions='3D'
 sp=curve.splines.new('POLY');sp.points.add(len(points)-1)
 for p,co in zip(sp.points,points):p.co=(*co,1)
 obj=bpy.data.objects.new(curve.name,curve);guides.objects.link(obj)
 # A flattened tapered solid clump retains silhouette; thin nearby fibers break edges.
 for strand in range(2 if idx%5==0 else 1):
  start=len(verts);radius=width if strand==0 else width*.13
  drift=across*((strand-1)*width*.85)
  for j,p in enumerate(points):
   t=j/(len(points)-1);tangent=(points[min(j+1,len(points)-1)]-points[max(j-1,0)]).normalized();a=tangent.cross(normal).normalized();b=tangent.cross(a).normalized()
   w=radius*(.4+.6*math.sin(math.pi*t*.75))*(1-t*.94)
   for k in range(4):
    ang=k*math.tau/4;verts.append(tuple(p+drift*math.sin(math.pi*t)+a*w*math.cos(ang)+b*w*.55*math.sin(ang)))
  mat=random.choices(range(4),weights=(5,5,3,1))[0]
  for j in range(len(points)-1):
   for k in range(4):faces.append((start+j*4+k,start+j*4+(k+1)%4,start+(j+1)*4+(k+1)%4,start+(j+1)*4+k));mids.append(mat)
mesh=bpy.data.meshes.new('Tapered S-wave clumps');mesh.from_pydata(verts,[],faces);mesh.update()
hair=bpy.data.objects.new('Street01_LooseWaveGroom',mesh);bpy.context.scene.collection.objects.link(hair)
for m in hairmats:mesh.materials.append(m)
for p,mi in zip(mesh.polygons,mids):p.material_index=mi;p.use_smooth=True
# Sparse eyebrows follow brow planes, mesh tubes exported explicitly.
browmat=hairmats[0]
for side in (-1,1):
 for n in range(33):
  x=side*(.015+n*.00125);z=.335+.008*math.sin(n/32*math.pi)
  hit,normal,_,_=bv.ray_cast(Vector((x,-.25,z)),Vector((0,1,0)),.35)
  if hit is None:continue
  cu=bpy.data.curves.new('Brow fiber','CURVE');cu.dimensions='3D';cu.bevel_depth=.00040;cu.bevel_resolution=1
  sp=cu.splines.new('POLY');sp.points.add(2)
  for p,v in zip(sp.points,[hit+Vector((0,-.001,0)),hit+Vector((side*.002,-.0015,.003)),hit+Vector((side*.004,-.001,.004))]):p.co=(*(head.matrix_world @ v),1)
  o=bpy.data.objects.new('Brow strand',cu);bpy.context.scene.collection.objects.link(o);o.data.materials.append(browmat)
# Merge evaluated eyebrow fibers for one draw call; guide curves remain in saved source.
bpy.ops.object.select_all(action='DESELECT')
for o in bpy.context.scene.objects:
 if o.name.startswith('Brow strand'):o.select_set(True);bpy.context.view_layer.objects.active=o
bpy.ops.object.convert(target='MESH');bpy.ops.object.join();bpy.context.object.name='Street01_Eyebrows'
# Editable scene + deterministic glTF export, excluding authoring guides.
bpy.ops.object.select_all(action='DESELECT')
export=[]
for o in bpy.context.scene.objects:
 if o.name.startswith('Loose S guide'):continue
 if o.type in {'MESH','CURVE'}:o.select_set(True);export.append(o)
bpy.context.view_layer.objects.active=head
bpy.ops.wm.save_as_mainfile(filepath=str(R/'art/street01-head.blend'))
bpy.ops.export_scene.gltf(filepath=str(R/'public/assets/street01-head.glb'),export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_extras=True,export_animations=False,export_morph=False)
report={'status':'first candidate — unaccepted','source':'Blender realistic animation head; authored quad source and multires retained in blend','head_control_vertices':len(head.data.vertices),'groom_vertices':len(verts),'groom_triangles':len(faces)*2,'guide_count':len(guides.objects),'editable_feature_keys':[k.name for k in head.data.shape_keys.key_blocks],'limitations':['No high-to-low bake or hand-painted skin maps; vertex color look development only','No strand/card atlas; silhouette groom geometry from editable S-wave guide curves','No facial rig or animation deformation validation','Identity and hair still require parent browser orbit review','Source multires contains only one subdivision level on this head'], 'runtime':str(R/'public/assets/street01-head.glb')}
glb=(R/'public/assets/street01-head.glb').read_bytes();chunklen=struct.unpack_from('<I',glb,12)[0];meta=json.loads(glb[20:20+chunklen])
report.update({'runtime_triangles':sum(meta['accessors'][p['indices']]['count']//3 for m in meta['meshes'] for p in m['primitives']),'runtime_materials':len(meta['materials']),'runtime_primitives':sum(len(m['primitives']) for m in meta['meshes']),'runtime_bytes':len(glb),'runtime_sha256':hashlib.sha256(glb).hexdigest(),'correction':'2 — fuller scalp coverage and broader locks, measured cheek/moustache beard regions, mature brow/bridge/jaw shape keys'})
(R/'reports/head-build.json').write_text(json.dumps(report,indent=2)+'\n')
print('HEAD_EXPORTED',json.dumps(report))
