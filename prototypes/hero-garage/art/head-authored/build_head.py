"""Bounded authored MPFB head candidate; full editable body retained in source."""
import bpy,sys,json,math,bmesh,struct
from pathlib import Path
from mathutils import Vector
HERE=Path(__file__).resolve().parent
ART=HERE.parent; SOURCE=ART/'sources/authored-human'
sys.path.insert(0,str(SOURCE/'raw/mpfb2-2.0.17/src'))
_orig=bpy.utils.extension_path_user
bpy.utils.extension_path_user=lambda package,**kw: str(SOURCE/'raw/user-data') if package=='mpfb' else _orig(package,**kw)
import addon_utils
addon_utils.enable('mpfb',default_set=True)
from mpfb.services.humanservice import HumanService
from mpfb.services.targetservice import TargetService
from mpfb.services.locationservice import LocationService
LocationService._user_data=str(SOURCE/'raw/system-assets')
bpy.ops.wm.open_mainfile(filepath=str(SOURCE/'adult-male-source-probe.blend'))
human=bpy.data.objects['MPFB_AdultMale_SourceProbe'];human.name='Street01_Authored_EditableBody'
targets={
 'head/head-rectangular':.24,'head/head-fat-decr':.2,
 'chin/chin-bones-incr':.25,'chin/chin-width-incr':.12,'chin/chin-prominent-incr':.18,
 'nose/nose-scale-depth-incr':.18,'nose/nose-greek-incr':.18,'nose/nose-point-down':.12,
 'cheek/l-cheek-bones-incr':.16,'cheek/r-cheek-bones-incr':.16,
 'cheek/l-cheek-volume-decr':.1,'cheek/r-cheek-volume-decr':.1,
}
for name,weight in targets.items():
 TargetService.load_target(human,str(SOURCE/'raw/mpfb2-2.0.17/src/mpfb/data/targets'/(name+'.target.gz')),weight=weight)
HumanService.refit(human)
HumanService.set_character_skin(str(SOURCE/'raw/skins02/skins/jartur69_middleage_slavic_male_with_genitals_and_beard/jartur69_middleage_slavic_male_with_genitals_and_beard.mhmat'),human,skin_type='GAMEENGINE')
hairfile=ART/'sources/authored-hair/raw/hair01/hair/cortu_short_messy_hair/cortu_short_messy_hair.mhclo'
hair=HumanService.add_mhclo_asset(str(hairfile),human,asset_type='Hair',subdiv_levels=1)
hair.name='Street01_Cortu_AuthoredHair'
# Deliberate standard material conversion: glTF PBR textures, no imported object-space normal.
material_records=[]
for obj in list(bpy.data.objects):
 if obj.type!='MESH':continue
 for mat in obj.data.materials:
  if not mat:continue
  images=[n.image for n in mat.node_tree.nodes if n.type=='TEX_IMAGE' and n.image]
  color=next((i for i in images if not any(s in i.name.lower() for s in ['norm','bump','spec'])),None)
  oldnodes=[n.bl_idname for n in mat.node_tree.nodes]
  mat.use_nodes=True;nt=mat.node_tree;nt.nodes.clear()
  out=nt.nodes.new('ShaderNodeOutputMaterial');bs=nt.nodes.new('ShaderNodeBsdfPrincipled');nt.links.new(bs.outputs['BSDF'],out.inputs['Surface'])
  eye='high-poly' in obj.name;strand=obj==hair or 'eyebrow' in obj.name or 'eyelash' in obj.name
  bs.inputs['Roughness'].default_value=.28 if eye else (.72 if strand else .55)
  bs.inputs['Specular IOR Level'].default_value=.35
  if color:
   color.colorspace_settings.name='sRGB';tex=nt.nodes.new('ShaderNodeTexImage');tex.image=color
   nt.links.new(tex.outputs['Color'],bs.inputs['Base Color'])
   if strand or eye:nt.links.new(tex.outputs['Alpha'],bs.inputs['Alpha'])
  if obj==hair:
   # Multiply authored color using supported glTF base-color factor.
   mix=nt.nodes.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1
   mix.inputs[2].default_value=(.023,.012,.007,1);nt.links.new(tex.outputs['Color'],mix.inputs[1]);nt.links.new(mix.outputs[0],bs.inputs['Base Color'])
   bs.inputs['Roughness'].default_value=.7
  mat.use_backface_culling=not strand
  if strand or eye:
   mat.surface_render_method='DITHERED';mat['gltf_alpha_mode']='MASK';mat.alpha_threshold=.35
  material_records.append({'object':obj.name,'material':mat.name,'color_image':color.name if color else None,'alpha':'MASK' if strand or eye else 'OPAQUE','omitted_maps':[i.name for i in images if i!=color],'previous_nodes':oldnodes})
for p in human.data.polygons:p.use_smooth=True
sub=human.modifiers.new('Portrait subdivision','SUBSURF');sub.levels=1;sub.render_levels=1
human['identity_target_weights']=json.dumps(targets)
human['acceptance']='Unaccepted candidate; parent browser orbit required'
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(ART/'street01-head-authored.blend'))
# Evaluate official source body mask + authored morphs + subdivision, crop export copy only.
deps=bpy.context.evaluated_depsgraph_get();copies=[]
for obj in list(bpy.context.scene.objects):
 if obj.type!='MESH':continue
 mesh=bpy.data.meshes.new_from_object(obj.evaluated_get(deps),depsgraph=deps)
 copy=bpy.data.objects.new(obj.name.replace('EditableBody','HeadRuntime')+'_Runtime',mesh)
 bpy.context.collection.objects.link(copy);copy.matrix_world=obj.matrix_world.copy();copies.append(copy)
 if obj==human:
  bm=bmesh.new();bm.from_mesh(mesh)
  bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=0.000001,plane_co=(0,0,1.445),plane_no=(0,0,1),clear_inner=True)
  cut_edges=[e for e in bm.edges if e.is_boundary and all(abs(v.co.z-1.445)<.00001 for v in e.verts)]
  if cut_edges:bmesh.ops.holes_fill(bm,edges=cut_edges,sides=0)
  bm.to_mesh(mesh);bm.free()
# Uniform translation/scale into portrait envelope; standard glTF export maps Zup/-Yfront -> Yup/+Zfront.
points=[o.matrix_world@v.co for o in copies for v in o.data.vertices]
lo=min(p.z for p in points);hi=max(p.z for p in points)
scale=(1.833-1.531)/(hi-lo)
for o in copies:
 for v in o.data.vertices:
  p=o.matrix_world@v.co
  v.co=(p.x*scale,p.y*scale,(p.z-lo)*scale+1.531)
 o.matrix_world.identity()
# Full body source is preserved in saved blend; runtime contains exported copies only.
bpy.ops.object.select_all(action='DESELECT')
for o in copies:o.select_set(True)
bpy.context.view_layer.objects.active=copies[0]
out=ART.parent/'public/assets/street01-head-authored.glb'
bpy.ops.export_scene.gltf(filepath=str(out),export_format='GLB',use_selection=True,export_apply=True,export_animations=False,export_yup=True)
# DITHERED is Blender viewport policy; encode requested stable alpha coverage explicitly.
data=out.read_bytes();jsonlen,kind=struct.unpack_from('<II',data,12);doc=json.loads(data[20:20+jsonlen]);tail=data[20+jsonlen:]
for mat in doc.get('materials',[]):
 if 'cortu' in mat['name']:mat.setdefault('pbrMetallicRoughness',{})['baseColorFactor']=[.023,.012,.007,1]
 if any(part in mat['name'] for part in ['eyebrow','eyelash','high-poly','cortu']):
  mat['alphaMode']='MASK';mat['alphaCutoff']=.35
js=json.dumps(doc,separators=(',',':')).encode();js+=b' '*((-len(js))%4)
out.write_bytes(struct.pack('<III',0x46546C67,2,20+len(js)+len(tail))+struct.pack('<II',len(js),0x4E4F534A)+js+tail)
report={'status':'unaccepted first authored-source head candidate','source':'art/street01-head-authored.blend','runtime':str(out),'targets':targets,'materials':material_records,'uniform_scale':scale,'source_crop_min_z':1.445,'runtime_y_bounds':[1.531,1.833],'runtime_objects':[{'name':o.name,'vertices':len(o.data.vertices),'triangles':sum(len(p.vertices)-2 for p in o.data.polygons),'uv_layers':len(o.data.uv_layers)} for o in copies],'notes':['No procedural face displacements or replacement eye reconstruction.','Fitted Cortu short messy authored hair; no new procedural groom.','Body/helpers cropped only after official mask modifier evaluation on export copy.','Imported object-space hair normal deliberately omitted rather than mislabeled tangent.','Beard from jartur69 authored middleage Slavic male skin; unmodified source UV texture.']}
(ART.parent/'reports/authored-head-build.json').write_text(json.dumps(report,indent=2)+'\n')
# Diagnostics only; render source-derived runtime without grading target likeness.
for o in list(bpy.context.scene.objects):
 if o not in copies:bpy.data.objects.remove(o,do_unlink=True)
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=24
scene.render.resolution_x=700;scene.render.resolution_y=700;scene.render.resolution_percentage=100
scene.world.color=(.15,.15,.15)
camdata=bpy.data.cameras.new('diagnostic');cam=bpy.data.objects.new('diagnostic',camdata);scene.collection.objects.link(cam)
cam.location=(.3,-.65,1.72);look=Vector((0,-.025,1.69));cam.rotation_euler=(look-cam.location).to_track_quat('-Z','Y').to_euler();camdata.type='ORTHO';camdata.ortho_scale=.39;scene.camera=cam
for name,loc,power,size in [('key',(-.3,-.5,2.2),35,.5),('fill',(.5,-.2,1.85),15,.4),('rim',(0,.3,1.9),25,.3)]:
 d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='DISK';d.size=size;o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.location=loc;o.rotation_euler=(look-o.location).to_track_quat('-Z','Y').to_euler()
scene.render.filepath=str(HERE/'source-diagnostic.png');bpy.ops.render.render(write_still=True)
print('AUTHORED_HEAD_BUILD_PASS',out)
