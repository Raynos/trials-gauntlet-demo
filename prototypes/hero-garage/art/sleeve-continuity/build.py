"""R28 connected cloth UV, inward thickness, mustard finish and fitted drawcords."""
import bpy,json,sys,math,hashlib
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
R=Path.cwd();P=R/'prototypes/hero-garage';D=P/'art/sleeve-continuity';sys.path[:0]=[str(R/'assets/blender'),str(P/'art/hoodie-shell')]
import common as C
from unwrap_cloth import unwrap_cloth
source=P/'art/cloth-neckfit-v2/neckfit-source.blend';digest=hashlib.sha256(source.read_bytes()).hexdigest();bpy.ops.wm.open_mainfile(filepath=str(source));arm=bpy.data.objects['rider_rig'];shirt=bpy.data.objects['rider:anatomical sweatshirt'];
for obj in list(bpy.context.scene.objects):
 if obj.type=='MESH' and obj.name not in ('rider:anatomical sweatshirt','rider:anatomical sweatshirt pocket','rider:folded hood'):bpy.data.objects.remove(obj,do_unlink=True)
for mod in list(shirt.modifiers):
 if mod.type=='SOLIDIFY':shirt.modifiers.remove(mod)
sys.path.insert(0,str(D));from fit import improve_sleeves
neck_report=improve_sleeves(shirt)
cloth=[o for o in bpy.context.scene.objects if o.type=='MESH'];uvreport=unwrap_cloth(cloth)
for o in cloth:
 for mat in o.data.materials:
  if not mat or not mat.use_nodes:continue
  for n in mat.node_tree.nodes:
   if n.name in ('CW_JA','CW_JB'):n.outputs[0].default_value=(.32,.155,.032,1)
   if n.type=='BSDF_PRINCIPLED':
    for link in list(n.inputs['Roughness'].links):mat.node_tree.links.remove(link)
    n.inputs['Roughness'].default_value=.88
paths=C.bake_atlas(cloth,2048,str(D/'textures'),'cloth28',normal_size=1024,orm_size=1024)
for key in ('normal','orm'):
 im=bpy.data.images['cloth28_'+key];im.filepath_raw=str(D/'textures'/('cloth28_'+key+'.png'));im.file_format='PNG';im.save();paths[key]=im.filepath_raw
# Thickness is evaluated only AFTER the outward UV atlas bake.
solid=shirt.modifiers.new('2mm inward cotton shell','SOLIDIFY');solid.thickness=.002;solid.offset=-1;solid.use_rim=True;solid.use_even_offset=True
bpy.context.view_layer.objects.active=shirt;bpy.ops.object.modifier_move_up(modifier=solid.name)
bpy.context.view_layer.update();ev=shirt.evaluated_get(bpy.context.evaluated_depsgraph_get());me=ev.to_mesh();surface=BVHTree.FromPolygons([v.co for v in me.vertices],[p.vertices for p in me.polygons]);ev.to_mesh_clear();control=BVHTree.FromPolygons([v.co for v in shirt.data.vertices],[p.vertices for p in shirt.data.polygons]);center=Vector((.828,0,1.247));axis=Vector((.407,0,.914)).normalized();front=Vector((axis.z,0,-axis.x));side=Vector((0,1,0))
def weights(co):
 hit,_,pi,_=control.find_nearest(co);ws={}
 for vi in shirt.data.polygons[pi].vertices:
  v=shirt.data.vertices[vi];w=1/max(1e-5,(v.co-hit).length)**2
  for g in v.groups:
   name=shirt.vertex_groups[g.group].name;ws[name]=ws.get(name,0)+w*g.weight
 ws=dict(sorted(ws.items(),key=lambda a:-a[1])[:4]);s=sum(ws.values());return {k:v/s for k,v in ws.items()}
def mesh_object(name,verts,faces,mat):
 m=bpy.data.meshes.new(name);m.from_pydata(verts,[],faces);m.update();o=bpy.data.objects.new(name,m);bpy.context.collection.objects.link(o);m.materials.append(mat)
 for p in m.polygons:p.use_smooth=True
 for v in m.vertices:
  for name,w in weights(v.co).items():g=o.vertex_groups.get(name) or o.vertex_groups.new(name=name);g.add([v.index],w,'REPLACE')
 mod=o.modifiers.new('rig','ARMATURE');mod.object=arm;return o
cordmat=bpy.data.materials.new('warm ivory cotton cord');cordmat.diffuse_color=(.57,.50,.35,1);cordmat.use_nodes=True;bs=cordmat.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(.57,.50,.35,1);bs.inputs['Roughness'].default_value=.92
eye=bpy.data.materials.new('muted antique eyelet');eye.use_nodes=True;bs=eye.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(.09,.07,.035,1);bs.inputs['Roughness'].default_value=.62;bs.inputs['Metallic'].default_value=.55
cords=[];cord_report=[]
for sign in (-1,1):
 points=[];normals=[]
 for i in range(25):
  t=i/24;z=.012+.174*t;y=sign*(.044+.009*math.sin(t*math.pi*1.4))
  hit,n,_,_=surface.ray_cast(center-axis*z+side*y+front*.5,-front,1.)
  if hit is None:raise RuntimeError('Drawcord ray missed cloth')
  points.append(hit+n*(.0020+.001*math.sin(math.pi*t)));normals.append(n)
 verts=[];faces=[];N=8
 for i,p in enumerate(points):
  tangent=(points[min(24,i+1)]-points[max(0,i-1)]).normalized();u=tangent.cross(normals[i]).normalized();v=tangent.cross(u).normalized()
  for k in range(N):verts.append(p+.0015*(u*math.cos(k*math.tau/N)+v*math.sin(k*math.tau/N)))
 for i in range(24):
  for k in range(N):j=(k+1)%N;faces.append((i*N+k,i*N+j,(i+1)*N+j,(i+1)*N+k))
 faces.extend([tuple(reversed(range(N))),tuple(24*N+k for k in range(N))]);cords.append(mesh_object('fitted drawcord '+str(sign),verts,faces,cordmat))
 # Small 5.6mm diameter eyelet, tangent to the underlying cloth.
 normal=normals[0];u=normal.cross(side).normalized();v=normal.cross(u);origin=points[0]-normal*.0008;verts=[];faces=[]
 for a in range(16):
  radial=u*math.cos(a*math.tau/16)+v*math.sin(a*math.tau/16)
  for b in range(6):verts.append(origin+radial*(.0023+.0005*math.cos(b*math.tau/6))+normal*.0005*math.sin(b*math.tau/6))
 for a in range(16):
  for b in range(6):faces.append((a*6+b,((a+1)%16)*6+b,((a+1)%16)*6+(b+1)%6,a*6+(b+1)%6))
 cords.append(mesh_object('collar eyelet '+str(sign),verts,faces,eye));cord_report.append({'side':sign,'centerline':[list(p) for p in points],'radiusM':.0015})
# Editable source retains procedural cotton and non-destructive thickness.
bpy.ops.wm.save_as_mainfile(filepath=str(D/'sleeve-source.blend'))
mat=C.atlas_material('mustard continuous cotton',paths)
for o in cloth:
 o.data.materials.clear();o.data.materials.append(mat)
 for p in o.data.polygons:p.material_index=0
for a in list(bpy.data.actions):bpy.data.actions.remove(a)
C.export_glb(str(P/'public/assets/street01-sleeve-donor.glb'),list(bpy.context.scene.objects),animations=True,meshopt=False)
assert hashlib.sha256(source.read_bytes()).hexdigest()==digest
r={'sourceSHA256':digest,'sourceUnchanged':True,'sleeveFit':neck_report,'uv':uvreport,'inwardThicknessM':.002,'thicknessAfterBake':True,'mustardLinearRGB':[.32,.155,.032],'cottonRoughness':.88,'drawcords':cord_report,'textures':paths,'limitations':['Candidate only; parent must inspect material appearance and drawcord movement.','Inner surface deliberately shares outer UVs; thickness is evaluated after bake to avoid overlapping bake writes.']};(D/'build-report.json').write_text(json.dumps(r,indent=2)+'\n');print('CLOTH28 DONE')
