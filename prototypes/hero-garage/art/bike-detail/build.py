"""Correct crossed triple-clamp dimensions and author numberboard mounting hardware."""
import bpy, sys, json, hashlib
from pathlib import Path
from mathutils import Vector, Quaternion
import math
R=Path.cwd(); P=R/'prototypes/hero-garage'; D=P/'art/bike-detail'; D.mkdir(exist_ok=True)
sys.path.insert(0,str(R/'assets/blender')); import common as C
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
source=R/'assets/blender/source/bike.blend'; accepted=P/'art/bike-refine/bike-refined.blend'; hashes={str(p.relative_to(R)):sha(p) for p in (source,accepted)}
bpy.ops.wm.open_mainfile(filepath=str(source));o=bpy.data.objects['fork_upper']; ids=sorted({i for poly in o.data.polygons if o.material_slots[poly.material_index].name.startswith('plate') for i in poly.vertices}); original_positions=[list(v.co) for v in o.data.vertices]; original_faces=[list(p.vertices) for p in o.data.polygons]
alloy_ids={i for poly in o.data.polygons if o.material_slots[poly.material_index].name=='alloy_brushed' for i in poly.vertices}
links={i:set() for i in alloy_ids}
for e in o.data.edges:
 a,b=e.vertices
 if a in links and b in links:links[a].add(b);links[b].add(a)
components=[];pending=set(alloy_ids)
while pending:
 todo=[pending.pop()];component=set(todo)
 while todo:
  for j in links[todo.pop()]:
   if j in pending:pending.remove(j);component.add(j);todo.append(j)
 components.append(sorted(component))
assert len(components)==2
assert ids
bpy.ops.wm.open_mainfile(filepath=str(accepted));o=bpy.data.objects['fork_upper']; assert [list(v.co) for v in o.data.vertices]==original_positions;assert [list(p.vertices) for p in o.data.polygons]==original_faces
before={ob.name:{'matrix':[list(r) for r in ob.matrix_world],'parent':ob.parent.name if ob.parent else None,'positions':[list(v.co) for v in ob.data.vertices] if ob.type=='MESH' else None} for ob in bpy.context.scene.objects}
n=Vector((-.22,0,.5)).normalized();f=Vector((n.z,0,-n.x)); centre=n*.03+f*.05
# Root cause: the two authored triple clamps have their width/depth axes swapped.
# Rotate only each clamp's connected geometry about its own fork-axis centre.
rotation=Quaternion(n,math.pi/2)
for component in components:
 centre_clamp=sum((o.data.vertices[i].co for i in component),Vector())/len(component)
 for i in component:o.data.vertices[i].co=centre_clamp+rotation@(o.data.vertices[i].co-centre_clamp)
# Board remains at the source stand-off; refine only its lower silhouette.
for i in ids:
 v=o.data.vertices[i]; height=(v.co-centre).dot(n); taper=1-.13*max(0,min(1,(.085-height)/.17)); v.co.y*=taper
# All original UV coordinates/materials and structural bike vertices are preserved.
def mat(name,col,metal,rough):
 m=bpy.data.materials.new(name);m.use_nodes=True;b=m.node_tree.nodes.get('Principled BSDF');b.inputs['Base Color'].default_value=(*col,1);b.inputs['Metallic'].default_value=metal;b.inputs['Roughness'].default_value=rough;return m
rubber=mat('numberboard_mount_rubber',(.014,.017,.019),0,.69);steel=mat('numberboard_mount_satin_alloy',(.23,.25,.27),.82,.34);dark=mat('numberboard_recess',(.006,.008,.009),.2,.55)
hardware=[]
def cyl(name,a,b,r,material,vertices=12):
 delta=b-a;bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=r,depth=delta.length,location=(a+b)*.5);ob=bpy.context.object;ob.name=name;ob.rotation_mode='QUATERNION';ob.rotation_quaternion=delta.to_track_quat('Z','Y');ob.data.materials.append(material);ob.parent=o;ob.location=(a+b)*.5 # coordinates are fork_upper-local
 for poly in ob.data.polygons:poly.use_smooth=len(poly.vertices)==4
 hardware.append(ob)
# Two rubber-isolated standoffs attach the board to the original lower-clamp area.
for s in [-1,1]:
 anchor=centre+Vector((0,s*.064,0))+n*.042
 cyl('numberboard_rubber_standoff',anchor-f*.020,anchor-f*.004,.008,rubber)
 cyl('numberboard_bolt_washer',anchor+f*.004,anchor+f*.006,.008,steel)
 cyl('numberboard_hex_bolt',anchor+f*.006,anchor+f*.009,.005,steel,6)
 cyl('numberboard_bolt_socket',anchor+f*.009,anchor+f*.0092,.0024,dark,6)
# Keep one mesh per articulated part so the existing suspension lookup remains authoritative.
bpy.ops.object.select_all(action='DESELECT');o.select_set(True)
for ob in hardware:ob.select_set(True)
bpy.context.view_layer.objects.active=o;bpy.ops.object.join()
for name,old in before.items():
 ob=bpy.data.objects[name];assert [list(r) for r in ob.matrix_world]==old['matrix'];assert (ob.parent.name if ob.parent else None)==old['parent']
 if ob.type=='MESH' and name!='fork_upper':assert [list(v.co) for v in ob.data.vertices]==old['positions'],name
for i,p in enumerate(original_positions):
 if i not in set(ids)|alloy_ids:assert list(o.data.vertices[i].co)==p
C.setup_variants([bpy.data.objects[n] for n in ('frame','bodywork','fork_upper')], [('bike_'+cw,{n:bpy.data.materials['bike_body_'+cw] for n in ('frame','bodywork','fork_upper')}) for cw in ('rookie','pro')])
bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(D/'bike-detail.blend'),compress=True)
out=P/'public/assets/street01-bike-detail.glb';C.export_glb(str(out),[ob for ob in bpy.context.scene.objects if ob.type in ('MESH','EMPTY')],animations=False,meshopt=True)
assert all(sha(R/path)==h for path,h in hashes.items())
report={'sourceHashes':hashes,'sourceUnchanged':True,'changedPlateVertices':len(ids),'plateOutwardShiftMeters':0,'clampCorrection':'Swap erroneous depth/width orientation by rotating each of two clamp shells 90 degrees around its fork axis centre','changedClampVertices':len(alloy_ids),'plateBottomWidthFactor':.87,'originalVerticesOutsidePlateAndClampUnchanged':True,'otherObjectsGeometryUnchanged':True,'hierarchyTransformsUnchanged':True,'hardware':'Two rubber-isolated standoffs with washers and recessed hex fasteners, joined into fork_upper','outputBytes':out.stat().st_size,'sha256':sha(out),'acceptance':'Candidate only; parent must judge actual recorded motion.'}
(P/'reports/bike-detail.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
