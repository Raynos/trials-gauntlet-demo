"""Bounded Bystedt authored-groom fitting trial; retains A3 face/skin unchanged."""
import bpy,bmesh,json,math,struct,hashlib
import numpy as np
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
HERE=Path(__file__).resolve().parent;ART=HERE.parent
source=ART/'sources/replacement-hair/raw/bystedt-hair-styles.blend'
bpy.ops.wm.open_mainfile(filepath=str(source))
authored=bpy.data.objects['curly hair']
# Use the author's own groom controls, retaining guide/clump relationships.
author_settings={}
for node in bpy.data.node_groups['curly hair'].nodes:
 if node.type=='GROUP' and node.node_tree.name=='Curl Hair Curves':
  node.inputs['Radius'].default_value=.15;node.inputs['Frequency'].default_value=.65;author_settings['curl_radius_source_units']=.15;author_settings['curl_frequency']=.65
 if node.type=='GROUP' and node.node_tree.name=='Hair Curves Noise':
  node.inputs['Distance'].default_value=.10;author_settings['noise_distance_source_units']=.10
# Evaluate native spline interpolation rather than joining its control points linearly.
g=bpy.data.node_groups.new('Runtime smooth native curves','GeometryNodeTree');g.interface.new_socket(name='Geometry',in_out='INPUT',socket_type='NodeSocketGeometry');g.interface.new_socket(name='Geometry',in_out='OUTPUT',socket_type='NodeSocketGeometry')
a=g.nodes.new('NodeGroupInput');z=g.nodes.new('NodeGroupOutput');res=g.nodes.new('GeometryNodeResampleCurve');res.inputs['Mode'].default_value='Count';res.inputs['Count'].default_value=65;g.links.new(a.outputs['Geometry'],res.inputs['Curve']);g.links.new(res.outputs['Curve'],z.inputs['Geometry'])
m=authored.modifiers.new('Runtime native spline resample','NODES');m.node_group=g
bpy.context.view_layer.update();ev=authored.evaluated_get(bpy.context.evaluated_depsgraph_get())
fullcount=len(ev.data.curves)
growth=bpy.data.objects['curly growth mesh'];relative=authored.matrix_world.inverted()@growth.matrix_world
source_scalp=np.array([list(relative@v.co) for v in growth.data.vertices]);source_top=source_scalp[:,2].max();source_crown=np.median(source_scalp[source_scalp[:,2]>source_top-.03],axis=0);source_crown[2]=source_top
# Deterministic distributed subset of actual evaluated strands, not synthesized coils.
indices=[int(i*(fullcount-1)/8999) for i in range(9000)]
strands=[[Vector(p.position) for p in ev.data.curves[i].points] for i in indices]
guides=[[Vector(p.position) for p in c.points] for c in authored.data.curves]
bpy.ops.wm.open_mainfile(filepath=str(ART/'street01-head-authored.blend'))
human=bpy.data.objects['Street01_Authored_EditableBody']
for o in list(bpy.data.objects):
 if 'Cortu' in o.name:bpy.data.objects.remove(o,do_unlink=True)
deps=bpy.context.evaluated_depsgraph_get();bvh=BVHTree.FromObject(human,deps)
evhead=human.evaluated_get(deps);headmesh=evhead.to_mesh();target_points=np.array([list(v.co) for v in headmesh.vertices]);evhead.to_mesh_clear()
target_top=target_points[:,2].max();target_crown=np.median(target_points[target_points[:,2]>target_top-.003],axis=0);target_crown[2]=target_top
source_width=np.ptp(source_scalp[source_scalp[:,2]>source_top-.6,0]);target_width=np.ptp(target_points[target_points[:,2]>target_top-.06,0]);fit_scale=float(target_width/source_width)
fit_translation=target_crown-source_crown*fit_scale
fit_evidence={'source_crown':source_crown.tolist(),'target_evaluated_crown':target_crown.tolist(),'source_top_band_width':float(source_width),'target_top_band_width':float(target_width),'uniform_scale':fit_scale,'translation':fit_translation.tolist(),'source_curve_to_scalp_relative_matrix':[list(row) for row in relative]}
def fit(points):
 # Source and target anatomies share Zup/-Yfront. Uniform source-decimeter mapping
 # then per-root projection preserves authored curl shape, with uniform 0.70 length fit.
 transformed=[Vector(np.asarray(p)*fit_scale+fit_translation) for p in points]
 root=transformed[0];hit,n,idx,dist=bvh.find_nearest(root)
 fittedroot=hit+n*.0008
 # Blend source-guide length by anatomical root region: short nape/sides, longer fringe.
 factor=.35+.55*max(0.,min(1.,(fittedroot.z-1.59)/.105))
 if fittedroot.y<-.105 and fittedroot.z>1.665:factor=1.0
 return [fittedroot+(p-root)*factor for p in transformed]
strands=[fit(p) for p in strands];guides=[fit(p) for p in guides]
# Editable authored guides retained independently of selected runtime strand mesh.
curvedata=bpy.data.curves.new('Bystedt_303_AuthoredGuides','CURVE');curvedata.dimensions='3D'
for pts in guides:
 s=curvedata.splines.new('POLY');s.points.add(len(pts)-1)
 for p,co in zip(s.points,pts):p.co=(*co,1)
guideobj=bpy.data.objects.new('Bystedt_EditableGuides',curvedata);bpy.context.collection.objects.link(guideobj);guideobj.hide_render=True;guideobj.hide_viewport=True
guideobj['attribution']='Daniel Bystedt, Hair Styles demo, CC BY-SA (version unspecified upstream)'
guideobj['original_source']=str(source)
# Actual 3D authored strand paths become thin double-sided ribbons. No shared opaque panels.
verts=[];faces=[]
for i,pts in enumerate(strands):
 offset=len(verts)
 for j,p in enumerate(pts):
  tangent=(pts[min(j+1,len(pts)-1)]-pts[max(0,j-1)]).normalized()
  radial=(p-Vector((0,-.025,1.615))).normalized()
  side=tangent.cross(radial)
  if side.length<.01:side=tangent.cross(Vector((1,0,0)))
  side.normalize();t=j/(len(pts)-1);width=.00026*(.12+.88*(1-t)**.4)
  verts.extend([p-side*width,p+side*width])
 for j in range(len(pts)-1):faces.append((offset+j*2,offset+j*2+1,offset+j*2+3,offset+j*2+2))
mesh=bpy.data.meshes.new('Bystedt_EvaluatedStrandRibbons');mesh.from_pydata(verts,[],faces);mesh.update()
hair=bpy.data.objects.new('Street01_Bystedt_CurlyGroom',mesh);bpy.context.collection.objects.link(hair)
mat=bpy.data.materials.new('Bystedt_DarkBrownStrands');mat.use_nodes=True;bs=mat.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(.028,.012,.006,1);bs.inputs['Roughness'].default_value=.63;bs.inputs['Specular IOR Level'].default_value=.23;mat.use_backface_culling=False
mesh.materials.append(mat)
for p in mesh.polygons:p.use_smooth=True
hair['attribution']=guideobj['attribution'];hair['guide_count']=303;hair['source_evaluated_count']=fullcount;hair['runtime_strands']=len(strands)
bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(ART/'street01-head-groom.blend'))
# Export copies retain exactly A3 face/body materials and beard modes.
deps=bpy.context.evaluated_depsgraph_get();copies=[]
for obj in list(bpy.context.scene.objects):
 if obj.type!='MESH':continue
 mesh=bpy.data.meshes.new_from_object(obj.evaluated_get(deps),depsgraph=deps)
 o=bpy.data.objects.new(obj.name+'_Runtime',mesh);bpy.context.collection.objects.link(o);o.matrix_world=obj.matrix_world.copy();copies.append(o)
 if obj==human:
  bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=.000001,plane_co=(0,0,1.445),plane_no=(0,0,1),clear_inner=True)
  edges=[e for e in bm.edges if e.is_boundary and all(abs(v.co.z-1.445)<.00001 for v in e.verts)]
  if edges:bmesh.ops.holes_fill(bm,edges=edges,sides=0)
  bm.to_mesh(mesh);bm.free()
# Same spatial transform as A3, rather than resizing face to new hair envelope.
a3=json.loads((ART.parent/'reports/authored-head-build.json').read_text());scale=a3['uniform_scale']
for o in copies:
 for v in o.data.vertices:
  p=o.matrix_world@v.co;v.co=(p.x*scale,p.y*scale,(p.z-1.445)*scale+1.531)
 o.matrix_world.identity()
bpy.ops.object.select_all(action='DESELECT')
for o in copies:o.select_set(True)
bpy.context.view_layer.objects.active=copies[0]
out=ART.parent/'public/assets/street01-head-groom.glb'
bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',use_selection=True,export_apply=True,export_animations=False,export_yup=True)
b=out.read_bytes();n=struct.unpack_from('<I',b,12)[0];doc=json.loads(b[20:20+n]);tail=b[20+n:]
for m in doc['materials']:
 if m['name'].endswith('.body'):m['pbrMetallicRoughness']['baseColorFactor']=[.78,.66,.53,1]
 if any(x in m['name'] for x in ['eyebrow','high-poly']):m['alphaMode']='MASK';m['alphaCutoff']=.35
 if 'grinsegold' in m['name']:m['alphaMode']='BLEND';m.pop('alphaCutoff',None);m['doubleSided']=False;m['pbrMetallicRoughness']['baseColorFactor']=[1,.72,.5,.58]
j=json.dumps(doc,separators=(',',':')).encode();j+=b' '*((-len(j))%4);out.write_bytes(struct.pack('<III',0x46546c67,2,20+len(j)+len(tail))+struct.pack('<II',len(j),0x4e4f534a)+j+tail)
hairruntime=next(o for o in copies if 'Bystedt' in o.name)
report={'status':'unaccepted changed-source groom correction1','attribution':guideobj['attribution'],'original_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'source_evaluated_strands':fullcount,'runtime_strands':len(strands),'runtime_hair_triangles':len(faces)*2,'runtime_hair_bounds_xyz':[[min(v.co[i] for v in hairruntime.data.vertices),max(v.co[i] for v in hairruntime.data.vertices)] for i in range(3)],'runtime_sha256':hashlib.sha256(out.read_bytes()).hexdigest(),'runtime_bytes':out.stat().st_size,'head_transform_scale_from_a3':scale,'fit':fit_evidence,'root_projection_offset_m':.0008,'author_groom_controls':author_settings,'native_curve_resample_points':65,'regional_curve_length_factor':{'nape':.35,'crown':.9,'fringe':1.0},'limitations':['9000 sampled actual strands replace 22418 originals; appearance trial exceeds final hair triangle budget and needs later baking/reduction only if art improves.','Thin double-sided ribbons follow full 3D curls; still not hair-card atlas baking or full production groom optimization.','Face, skin, beard and eyes are frozen A3 source; no visual acceptance implied.','CC BY-SA version unspecified upstream; retain attribution/share-alike for derivative groom.']}
(ART.parent/'reports/groom-head-build.json').write_text(json.dumps(report,indent=2)+'\n')
# Source diagnostic, using identical camera/light to A3.
for o in list(bpy.context.scene.objects):
 if o not in copies:bpy.data.objects.remove(o,do_unlink=True)
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=24;scene.render.resolution_x=700;scene.render.resolution_y=700;scene.render.resolution_percentage=100;scene.world.color=(.15,.15,.15)
cd=bpy.data.cameras.new('diagnostic');cam=bpy.data.objects.new('diagnostic',cd);scene.collection.objects.link(cam);cam.location=(.3,-.65,1.72);look=Vector((0,-.025,1.69));cam.rotation_euler=(look-cam.location).to_track_quat('-Z','Y').to_euler();cd.type='ORTHO';cd.ortho_scale=.45;scene.camera=cam
for name,loc,power,size in [('key',(-.3,-.5,2.2),35,.5),('fill',(.5,-.2,1.85),15,.4),('rim',(0,.3,1.9),25,.3)]:
 d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='DISK';d.size=size;o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.location=loc;o.rotation_euler=(look-o.location).to_track_quat('-Z','Y').to_euler()
scene.render.filepath=str(HERE/'source-diagnostic.png');bpy.ops.render.render(write_still=True)
for label,position in [('left',(-.6,-.2,1.72)),('right',(.6,-.2,1.72)),('rear',(0,.65,1.72))]:
 cam.location=position;cam.rotation_euler=(look-cam.location).to_track_quat('-Z','Y').to_euler();scene.render.filepath=str(HERE/('source-'+label+'.png'));bpy.ops.render.render(write_still=True)
print('GROOM_BUILD_PASS',report['runtime_sha256'])
