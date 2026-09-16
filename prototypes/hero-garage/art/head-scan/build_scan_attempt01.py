"""Bounded changed-source trial, CC BY3 Lee Perry-Smith scan with textured groom cards."""
import bpy,bmesh,math,random,json,struct,hashlib
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
R=Path(__file__).resolve().parents[2];D=R/'art/sources/alternates/lee-perry-smith';random.seed(711)
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(D/'LeePerrySmith.glb'))
head=bpy.context.selected_objects[0];head.name='Street01_ScanHead';bpy.context.view_layer.objects.active=head;bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
lo=min(v.co.z for v in head.data.vertices);hi=max(v.co.z for v in head.data.vertices);scale=.44/(hi-lo)
for v in head.data.vertices:v.co*=scale;v.co.z+=1.355-lo*scale;v.co.x+=.013
# Texture-coordinate convention repaired for native Blender JPEG sampling.
for d in head.data.uv_layers.active.data:d.uv.y=1-d.uv.y
head['attribution']='Adapted from Infinite, 3D Head Scan, Lee Perry-Smith, triplegangers.com; three.js r186; CC BY 3.0. Changes: normalized scale, eye apertures and separate eyes, scalp/groom.'
head['license']='https://creativecommons.org/licenses/by/3.0/'
def mat(name,color,rough=.5):
 m=bpy.data.materials.new(name);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=rough;return m
skin=mat('Scan color + authored tangent normal',(.5,.3,.2),.53);nt=skin.node_tree
tex=nt.nodes.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(D/'Map-COL.jpg'));nt.links.new(tex.outputs['Color'],nt.nodes.get('Principled BSDF').inputs['Base Color'])
norm=nt.nodes.new('ShaderNodeTexImage');norm.image=bpy.data.images.load(str(D/'Infinite-Level_02_Tangent_SmoothUV.jpg'));norm.image.colorspace_settings.name='Non-Color';node=nt.nodes.new('ShaderNodeNormalMap');node.inputs['Strength'].default_value=.42;nt.links.new(norm.outputs['Color'],node.inputs['Color']);nt.links.new(node.outputs['Normal'],nt.nodes.get('Principled BSDF').inputs['Normal'])
head.data.materials.clear();head.data.materials.append(skin)
# Small apertures through closed scanned eyelids; surrounding scanned lid surfaces retained.
eyes=[(-.0325,-.1025,1.665),(.0305,-.1035,1.665)]
bm=bmesh.new();bm.from_mesh(head.data);removed=0
for f in list(bm.faces):
 c=f.calc_center_median()
 if any(((c.x-x)/.0118)**2+((c.z-z)/.0037)**2<1 and c.y<-.087 for x,y,z in eyes):bm.faces.remove(f);removed+=1
bm.to_mesh(head.data);bm.free()
white=mat('Warm sclera',(.68,.64,.56),.23);iris=mat('Brown irises',(.078,.037,.017),.22);pupil=mat('Pupils',(.005,.003,.002),.12)
for i,(x,y,z) in enumerate(eyes):
 for name,loc,sc,material in [('Sclera',(x,y+.005,z),(.0125,.010,.0075),white),('Iris',(x,y-.0052,z),(.005,.0008,.005),iris),('Pupil',(x,y-.0060,z),(.0023,.00045,.0023),pupil)]:
  bpy.ops.mesh.primitive_uv_sphere_add(segments=32,ring_count=16,radius=1,location=loc);o=bpy.context.object;o.name=name+str(i);o.scale=sc;o.data.materials.append(material)
  for p in o.data.polygons:p.use_smooth=True
for p in head.data.polygons:p.use_smooth=True
bpy.context.view_layer.update();bv=BVHTree.FromObject(head,bpy.context.evaluated_depsgraph_get())
# Actual scalp coverage is an offset subset of the authored scan, beneath layered strand cards.
def scalp(v):
 x,y,z=v
 return z>(1.726 if y<-.05 else 1.635) and (not(abs(x)>.085 and z<1.686))
sv=[];sf=[];mapping={}
for f in head.data.polygons:
 if all(scalp(head.data.vertices[i].co) for i in f.vertices):
  poly=[]
  for i in f.vertices:
   if i not in mapping:
    v=head.data.vertices[i];mapping[i]=len(sv);sv.append(tuple(v.co+v.normal*.0014))
   poly.append(mapping[i])
  sf.append(poly)
mesh=bpy.data.meshes.new('Scan fitted scalp undercoverage');mesh.from_pydata(sv,[],sf);mesh.update();o=bpy.data.objects.new('Scalp undercoverage',mesh);bpy.context.scene.collection.objects.link(o);mesh.materials.append(mat('Deep brown scalp',(.023,.014,.009),.78))
cardmat=mat('Rendered strand group • alpha coverage',(.06,.03,.018),.64);cardmat.diffuse_color=(.06,.03,.018,1);nt=cardmat.node_tree;tex=nt.nodes.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(R/'art/head-scan/hair-strand-atlas.png'));p=nt.nodes.get('Principled BSDF');nt.links.new(tex.outputs['Color'],p.inputs['Base Color']);nt.links.new(tex.outputs['Alpha'],p.inputs['Alpha']);cardmat.surface_render_method='DITHERED';cardmat.alpha_threshold=.25;cardmat.use_backface_culling=False
# Broad layered surface-following cards plus varied lock outlines; no tube-field strategy.
guides=bpy.data.collections.new('Editable scalp card guides');bpy.context.scene.collection.children.link(guides);guides.hide_render=True
vs=[];fs=[];uvs=[];rootcount=0;center=Vector((0,.004,1.710))
for idx in range(260):
 theta=random.uniform(.05,2.2);phi=random.uniform(0,math.tau);d=Vector((math.sin(theta)*math.cos(phi),math.sin(theta)*math.sin(phi),math.cos(theta)))
 hit,normal,_,_=bv.ray_cast(center,d,.3)
 if hit is None or not scalp(hit):continue
 rootcount+=1;flow=Vector((random.uniform(-.35,.35),-.8 if hit.y<.02 else .3,-.15 if hit.z>1.75 else -1));flow=(flow-normal*flow.dot(normal)).normalized();cross=normal.cross(flow).normalized()
 length=random.uniform(.053,.09);width=random.uniform(.012,.022);wave=random.uniform(.002,.008);points=[];start=len(vs)
 for j in range(9):
  t=j/8;candidate=hit+flow*length*t+cross*wave*math.sin(t*math.tau*1.1)
  near,n,_,_=bv.find_nearest(candidate)
  # Following scalp surface avoids intersections; irregular raised tips break silhouette.
  p=near+n*(.0025+.008*math.sin(math.pi*t*.9)+.006*t*t);points.append(p)
  taper=.85-.70*t*t
  for side in (-1,1):vs.append(tuple(p+cross*width*.5*taper*side));uvs.append(((side+1)/2,t))
 for j in range(8):fs.append((start+2*j,start+2*j+1,start+2*j+3,start+2*j+2))
 cu=bpy.data.curves.new('Scalp guide %03d'%idx,'CURVE');cu.dimensions='3D';sp=cu.splines.new('POLY');sp.points.add(8)
 for p,co in zip(sp.points,points):p.co=(*co,1)
 ob=bpy.data.objects.new(cu.name,cu);guides.objects.link(ob)
mesh=bpy.data.meshes.new('Layered strand cards');mesh.from_pydata(vs,[],fs);mesh.update();uv=mesh.uv_layers.new(name='Strand atlas UV')
for l in mesh.loops:uv.data[l.index].uv=uvs[l.vertex_index]
o=bpy.data.objects.new('Tousled layered strand cards',mesh);bpy.context.scene.collection.objects.link(o);mesh.materials.append(cardmat)
for p in mesh.polygons:p.use_smooth=True
# Pack licensed texture sources, keep eyelid edits and scalp guide source editable.
bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(R/'art/street01-head-scan.blend'))
bpy.ops.object.select_all(action='DESELECT')
for o in bpy.context.scene.objects:
 if o.type=='MESH':o.select_set(True)
bpy.context.view_layer.objects.active=head
bpy.ops.export_scene.gltf(filepath=str(R/'public/assets/street01-head-scan.glb'),export_format='GLB',use_selection=True,export_apply=True,export_extras=True,export_animations=False)
# Blender's dither material exports BLEND; enforce measured alpha-test runtime contract.
path=R/'public/assets/street01-head-scan.glb';raw=path.read_bytes();jl=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+jl])
for m in doc['materials']:
 if m['name'].startswith('Rendered strand group'):m['alphaMode']='MASK';m['alphaCutoff']=.25
encoded=json.dumps(doc,separators=(',',':')).encode();encoded+=b' '*((-len(encoded))%4);rest=raw[20+jl:];path.write_bytes(struct.pack('<III',0x46546C67,2,20+len(encoded)+len(rest))+struct.pack('<II',len(encoded),0x4E4F534A)+encoded+rest)
b=(R/'public/assets/street01-head-scan.glb').read_bytes();n=struct.unpack_from('<I',b,12)[0];g=json.loads(b[20:20+n]);report={'status':'changed-source trial, unaccepted','source':'Lee Perry-Smith Infinite head scan, CC BY 3.0','method':'genuine scan color/tangent normal; small scanned eyelid apertures+separate eyes; fitted scalp mesh; Blender-rendered alpha haircards','removed_lid_faces':removed,'hair_card_groups':rootcount,'triangles':sum(g['accessors'][p['indices']]['count']//3 for m in g['meshes'] for p in m['primitives']),'primitives':sum(len(m['primitives']) for m in g['meshes']),'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest(),'limitations':['Scan identity not yet sculpted into target; no acceptance claimed','Eyelid openings require orbit inspection; no facial deformation rig','Scanned color may retain photographed light, evaluate relight','Hair atlas is rendered from editable Blender strands; hair still needs provisional art acceptance','Displacement4K retained as external source, not applied or baked in this trial','No high-to-low transfer or roughness map authored; constant skin roughness']}
(R/'reports/head-scan-build.json').write_text(json.dumps(report,indent=2)+'\n');print('SCAN_EXPORT',json.dumps(report))
