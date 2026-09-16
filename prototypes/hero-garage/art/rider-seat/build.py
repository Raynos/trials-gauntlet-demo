import bpy,json,sys,hashlib,math
from pathlib import Path
from mathutils import Vector,Matrix
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree
R=Path.cwd();P=R/'prototypes/hero-garage';sys.path.insert(0,str(R/'assets/blender'));import common as C
bpy.ops.wm.open_mainfile(filepath=str(R/'assets/blender/source/rider-street.blend'));o=bpy.data.objects['rider:denim'];pts=[o.matrix_world@v.co for v in o.data.vertices];kd=KDTree(len(pts))
for i,co in enumerate(pts):kd.insert(co,i)
kd.balance()
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.context.scene.render.fps=30
source=P/'public/assets/street01-rider-motion.glb';out=P/'public/assets/street01-rider-seat.glb';bpy.ops.import_scene.gltf(filepath=str(source));arm=next(o for o in bpy.data.objects if o.type=='ARMATURE');mesh=bpy.data.objects['rider'];riderobs=list(bpy.context.scene.objects)
for tr in arm.animation_data.nla_tracks:tr.mute=True
act=bpy.data.actions['sit_cruise'];arm.animation_data.action=act;arm.animation_data.action_slot=act.slots[0];bpy.context.scene.frame_set(0)
before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(R/'public/models/bike.glb'));bike=set(bpy.data.objects)-before;body=next(o for o in bike if o.type=='MESH' and o.name.startswith('bodywork'));tree=BVHTree.FromPolygons([body.matrix_world@v.co for v in body.data.vertices],[p.vertices for p in body.data.polygons])
ev=mesh.evaluated_get(bpy.context.evaluated_depsgraph_get());me=ev.to_mesh();posed=[v.co.copy() for v in me.vertices];ev.to_mesh_clear();changes=[]
def smooth(t):t=max(0,min(1,t));return t*t*(3-2*t)
for v in mesh.data.vertices:
 if kd.find(v.co)[2]>.005:continue
 co=posed[v.index]
 if not (.265<co.x<.425 and abs(co.y)<.12 and .58<co.z<.73):continue
 # Cloth underside support plateau; smooth perimeter retains outer silhouette transition.
 f=smooth((co.x-.265)/.035)*smooth((.425-co.x)/.035)*smooth((.12-abs(co.y))/.06)*smooth((.73-co.z)/.045)
 sample=Vector((co.x,max(-.05,min(.05,co.y)),.70));hit,_,_,_=tree.ray_cast(sample,Vector((0,0,-1)),.25)
 if not hit:continue
 drop=min(.075,max(0,co.z-hit.z-.002))*f
 if drop<.0001:continue
 # Invert the actual linear skin transform for an explicit posed-space correction.
 skin=Matrix(((0,0,0),(0,0,0),(0,0,0)));total=0
 for g in v.groups:
  name=mesh.vertex_groups[g.group].name
  if name in arm.pose.bones:
   skin+=(arm.pose.bones[name].matrix@arm.data.bones[name].matrix_local.inverted()).to_3x3()*g.weight;total+=g.weight
 if not total:continue
 delta=skin.inverted_safe()@Vector((0,0,-drop));v.co+=delta;changes.append(dict(vertex=v.index,dropM=drop,posedBefore=list(co)))
mesh.data.update()
for o in bike:bpy.data.objects.remove(o,do_unlink=True)
arm.animation_data.action=None;bpy.ops.wm.save_as_mainfile(filepath=str(P/'art/street01-rider-seat.blend'));C.export_glb(str(out),riderobs,animations=True,meshopt=False)
r=dict(sourceSHA256=hashlib.sha256(source.read_bytes()).hexdigest(),outputSHA256=hashlib.sha256(out.read_bytes()).hexdigest(),changedDenimVertices=len(changes),maxPosedDownwardChangeM=max(c['dropM'] for c in changes),changes=changes,notes=['Actual saddle grid baseline found33–45mm central support gap,62–119mm side gaps.','Local denim glute underside extended downward toward saddle using inverse linear skin transforms; skeleton/actions/bike unchanged.','No claim of full collision freedom or visual acceptance; sampled exported motion verification required.'])
(P/'reports/rider-seat.json').write_text(json.dumps(r,indent=2)+'\n');print(len(changes),r['outputSHA256'])
