"""Complete race boot/pant lower-half construction; v2 remains immutable.
Continuous anatomical boot shells have molded soles, shaped toe/heel, ankle flexure,
calf protection and two restrained closures. Uses existing shin/foot bones only.
"""
import bpy,bmesh,json,math,sys
from pathlib import Path
from mathutils import Vector,Matrix
sys.path.insert(0,str(Path('assets/blender').resolve()))
import author_garments as G
import author_hood as H
import author_rider_hero as R
import rider_asset as P
import common as C
ROOT=Path('harness/out/blender/mega-outfits/anatomy-v3/race-lower');ROOT.mkdir(exist_ok=True)
OUT=ROOT/'race-lower-v1.blend';assert not OUT.exists()
SOURCE=Path('harness/out/blender/mega-outfits/race-v2.blend')
bpy.ops.wm.open_mainfile(filepath=str(SOURCE));arm=bpy.data.objects['rider_rig'];P.clear_pose(arm)
sig={k:v for k,v in G.invariant_signature().items() if k!='materials'}
protected=H.mesh_signature(bpy.data.objects['rider:constructed_helmet'])
# Remove only obsolete boot/shin geometry; retain torso pieces in mixed-material objects.
for name in ('rider:boots','rider:bootplate','rider:alloy_r','rider:sole','rider:hero footwear construction'):
 if name in bpy.data.objects:bpy.data.objects.remove(bpy.data.objects[name],do_unlink=True)
for name in ('rider:armour','rider:hero garment construction'):
 ob=bpy.data.objects[name];bm=bmesh.new();bm.from_mesh(ob.data);layer=bm.verts.layers.deform.verify()
 remove=[]
 for v in bm.verts:
  w=v[layer];strength=sum(value for group,value in w.items() if ob.vertex_groups[group].name.startswith(('foot.','shin.','thigh.','pelvis')))
  if strength>.5:remove.append(v)
 bmesh.ops.delete(bm,geom=remove,context='VERTS');bm.to_mesh(ob.data);bm.free()
 if not len(ob.data.vertices):bpy.data.objects.remove(ob,do_unlink=True)
M={
 'shell':R.material('race boot synthetic shell',(.49,.51,.49),.47,330),
 'plate':R.material('race shin moulding',(.65,.68,.66),.36,280),
 'rubber':R.material('race boot grip rubber',(.021,.025,.028),.82,210),
 'flex':R.material('race ankle accordion',(.028,.036,.044),.68,460),
 'midsole':R.material('race boot midsole',(.16,.18,.18),.72,330),
 'color':R.material('race class protection inset',(.05,.13,.45),.45,410,'JB'),
 'stretch':R.material('race pant stretch gusset',(.016,.023,.035),.94,750),
 'knee':R.material('race shaped knee textile',(.07,.11,.17),.74,620,'PA',.2),
}
b=C.MeshBuilder('rider:articulated race boots');SEG=28
for side,sg in (('L',-1),('R',1)):
 ankle=arm.data.bones['foot.'+side].head_local;knee=arm.data.bones['shin.'+side].head_local
 d=(knee-ankle).normalized();f=Vector((d.z,0,-d.x)).normalized();l=d.cross(f).normalized()
 rings=[];groups=[]
 # Welted sole and toe/heel volumes share vertices with the ankle and calf.
 for row in range(13):
  ring=[]
  for i in range(SEG):
   theta=math.tau*i/SEG;c=math.cos(theta);s=math.sin(theta)
   if row<4:
    rx=.226 if c>=0 else .105;ry=.067
    z=(-.079,-.067,-.052)[row] if row<3 else (-.006-.028*max(0,c)+.013*max(0,-c))
    scale=(.975,1,1,.95)[row]
    pos=ankle+Vector((rx*c*scale,ry*s*scale,z));w={'foot.'+side:1}
   else:
    idx=row-4;u=(.040,.075,.110,.145,.190,.238,.280,.318,.328)[idx]
    rf=(.100,.076,.069,.068,.073,.080,.084,.082,.079)[idx]
    rb=(.070,.064,.061,.063,.068,.073,.078,.077,.075)[idx]
    ry=(.060,.058,.060,.064,.069,.074,.078,.078,.075)[idx]
    radius=rf if c>=0 else rb
    # Subtle longitudinal tibial ridge and flatter lateral shell replace a cylinder.
    ridge=.007*max(0,c)**5*max(0,min(1,(u-.10)/.12))
    pos=ankle+d*u+f*(radius*c+ridge)+l*(ry*math.copysign(abs(s)**.91,s))
    blend=R.G.blend_weights({0:1},{1:1},0) if False else max(0,min(1,(u-.025)/.105))
    blend=blend*blend*(3-2*blend);w={'foot.'+side:1-blend,'shin.'+side:blend}
   ring.append(b.bm.verts.new(pos))
  b.bm.verts.index_update()
  for v in ring:b.groups[v.index]=w.copy()
  rings.append(ring)
 for row in range(12):
  for i in range(SEG):
   angle=math.tau*(i+.5)/SEG;frontness=math.cos(angle)
   if row==0:mat=M['rubber']
   elif row==1:mat=M['midsole']
   elif row==2:mat=M['rubber'] if frontness>.55 or frontness<-.55 else M['shell']
   elif row in (3,4,5):mat=M['flex'] if row>3 or frontness<-.3 else M['shell']
   elif row>=6:mat=M['plate'] if frontness>.35 else M['shell']
   else:mat=M['shell']
   if row in (9,10) and -.35<frontness<.38:mat=M['color']
   face=b.bm.faces.new([rings[row][i],rings[row][(i+1)%SEG],rings[row+1][(i+1)%SEG],rings[row+1][i]])
   face.material_index=b.mat_index(mat);face.smooth=row>1
 # Sole bottom closes on the unchanged contact plane; top is an inset turned cuff.
 face=b.bm.faces.new(list(reversed(rings[0])));face.material_index=b.mat_index(M['rubber'])
 inner=[]
 for v in rings[-1]:
  c=ankle+d*.328;nv=b.bm.verts.new(c+(v.co-c)*.89-d*.007);inner.append(nv)
 b.bm.verts.index_update()
 for v in inner:b.groups[v.index]={'shin.'+side:1}
 for i in range(SEG):
  face=b.bm.faces.new([rings[-1][i],rings[-1][(i+1)%SEG],inner[(i+1)%SEG],inner[i]]);face.material_index=b.mat_index(M['flex']);face.smooth=True
 # Compact external closures span synthetic calf zones; 2 per boot, not giant rods.
 for u in (.155,.257):
  center=ankle+d*u+l*sg*.077+f*.020
  frame=Matrix(((f.x,l.x,d.x,center.x),(f.y,l.y,d.y,center.y),(f.z,l.z,d.z,center.z),(0,0,0,1)))
  geom=C.prim_box(.054,.012,.028,bevel=.005,segments=2);b.add(geom,frame,M['flex'],group='shin.'+side);geom.free()
  geom=C.prim_box(.026,.015,.015,bevel=.003,segments=2);b.add(geom,frame@Matrix.Translation((.012,sg*.005,0)),M['midsole'],group='shin.'+side);geom.free()
 # Five shallow bellows cross the ankle flexure, continuing around its back half.
 for u in (.058,.070,.082,.094,.106):
  points=[]
  for i in range(13):
   a=math.radians(70+220*i/12);points.append(ankle+d*u+f*(.072*math.cos(a))+l*(.061*math.sin(a)))
  geom=C.prim_tube(points,.0024,sides=5,samples=1)
  alpha=max(0,min(1,(u-.025)/.105));alpha=alpha*alpha*(3-2*alpha)
  b.add(geom,Matrix.Identity(4),M['flex'],group={'foot.'+side:1-alpha,'shin.'+side:alpha});geom.free()
ob=R.bind(b.build(),arm)
# Shape matching articulated textile knee zones directly on the connected trouser shell.
pants=bpy.data.objects['rider:pants'];matidx={}
for key in ('stretch','knee','color'):
 matidx[key]=len(pants.data.materials);pants.data.materials.append(M[key])
for v in pants.data.vertices:
 co=v.co;side='L' if co.y<0 else 'R';kn=arm.data.bones['shin.'+side].head_local;hip=arm.data.bones['thigh.'+side].head_local
 axis=(kn-hip).normalized();front=Vector((-axis.z,0,axis.x)).normalized();u=(co-kn).dot(axis);radial=co-kn-axis*u;facing=radial.normalized().dot(front)
 if -.14<u<.07 and facing>.1:
  # Central precurved knee, quieter back-knee silhouette.
  v.co+=front*.008*math.exp(-((u+.025)/.082)**2)*max(0,facing)**2
pants.data.update()
for p in pants.data.polygons:
 co=p.center;side='L' if co.y<0 else 'R';kn=arm.data.bones['shin.'+side].head_local;hip=arm.data.bones['thigh.'+side].head_local
 axis=(kn-hip).normalized();front=Vector((-axis.z,0,axis.x)).normalized();u=(co-kn).dot(axis);radial=co-kn-axis*u;facing=radial.normalized().dot(front)
 if -.15<u<.09:
  if facing<-.15:p.material_index=matidx['stretch']
  elif facing>.20:p.material_index=matidx['knee']
# One broad protective textile panel follows each bent knee, not a floating knee ball.
b=C.MeshBuilder('rider:race articulated knee panels');surface=R.Surface(pants,arm)
for side in ('L','R'):
 kn=arm.data.bones['shin.'+side].head_local;axis=(kn-arm.data.bones['thigh.'+side].head_local).normalized();front=Vector((-axis.z,0,axis.x)).normalized()
 surface.panel(b,'knee wing',kn,Vector((0,1,0)),axis,front,[(-.048,-.12),(.048,-.12),(.048,.045),(-.048,.045)],M['knee'],.004,.004,rows=7,cols=6,seam=M['stretch'])
R.bind(b.build(),arm)
P.clear_pose(arm);C.apply_colourway(json.loads(bpy.context.scene['heroColourways'])['rookie'])
assert sig=={k:v for k,v in G.invariant_signature().items() if k!='materials'};assert protected==H.mesh_signature(bpy.data.objects['rider:constructed_helmet'])
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH'];P.check_source(arm,meshes)
# A fresh source remains editable; no new bones, modifiers or actions are introduced.
bpy.ops.wm.save_as_mainfile(filepath=str(OUT),compress=True)
report={'source':str(SOURCE),'output':str(OUT),'output_sha256':G.sha(OUT),'script_sha256':G.sha(__file__),'rig_actions_sockets_helmet_unchanged':True,'new_boots':G.topology(ob.data),'boot_triangles':sum(len(p.vertices)-2 for p in ob.data.polygons),'total_triangles':sum(len(p.vertices)-2 for o in meshes for p in o.data.polygons),'sole_contact_z_relative_ankle':-.079}
OUT.with_suffix('.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
