"""Bounded authored MPFB head candidate; full editable body retained in source."""
import bpy,sys,json,math,bmesh,struct
import numpy as np
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
 'head/head-rectangular':.42,'head/head-fat-decr':.3,
 'head/head-age-incr':.20,
 'eyebrows/eyebrows-trans-forward':.42,'eyebrows/eyebrows-trans-down':.19,
 'eyes/l-eye-push2-in':.18,'eyes/r-eye-push2-in':.18,
 'chin/chin-bones-incr':.42,'chin/chin-width-incr':.23,'chin/chin-prominent-incr':.24,
 'nose/nose-scale-depth-incr':.08,'nose/nose-greek-incr':.10,'nose/nose-point-down':.09,
 'cheek/l-cheek-bones-incr':.25,'cheek/r-cheek-bones-incr':.25,
 'cheek/l-cheek-volume-decr':.1,'cheek/r-cheek-volume-decr':.1,
}
for name,weight in targets.items():
 TargetService.load_target(human,str(SOURCE/'raw/mpfb2-2.0.17/src/mpfb/data/targets'/(name+'.target.gz')),weight=weight)
HumanService.refit(human)
# Keep authored eyelids and eyes; remove the overly heavy separate lash sheet.
for obj in list(bpy.data.objects):
 if 'eyelashes01' in obj.name:bpy.data.objects.remove(obj,do_unlink=True)
HumanService.set_character_skin(str(SOURCE/'raw/skins02/skins/jartur69_middleage_slavic_male_with_genitals_and_beard/jartur69_middleage_slavic_male_with_genitals_and_beard.mhmat'),human,skin_type='GAMEENGINE')
hairfile=ART/'sources/authored-hair/raw/hair01/hair/cortu_short_messy_hair/cortu_short_messy_hair.mhclo'
hair=HumanService.add_mhclo_asset(str(hairfile),human,asset_type='Hair',subdiv_levels=1)
hair.name='Street01_Cortu_AuthoredHair'
beard_objects=[]
for asset in ['grinsegold_full_beard','grinsegold_moustache']:
 path=ART/'sources/authored-beard/raw/bodyparts06/clothes'/asset/(asset+'.mhclo')
 obj=HumanService.add_mhclo_asset(str(path),human,asset_type='Clothes',subdiv_levels=1)
 obj.name='Street01_'+asset;beard_objects.append(obj)
# The inferred card normal failed the parent's relighting review. Preserve source
# but omit it from this candidate; it does not supply absent curl geometry.
normal_stats={'status':'disabled after parent observed mottled plate shading','prior_inference':'card-space normal interpretation remains unverified'}
# Standard materials keep authored texture information and use explicit runtime factors.
material_records=[]
for obj in list(bpy.data.objects):
 if obj.type!='MESH':continue
 for mat in obj.data.materials:
  if not mat:continue
  images=[n.image for n in mat.node_tree.nodes if n.type=='TEX_IMAGE' and n.image]
  color=next((i for i in images if not any(s in i.name.lower() for s in ['norm','bump','spec','_hn'])),None)
  oldnodes=[n.bl_idname for n in mat.node_tree.nodes]
  mat.use_nodes=True;nt=mat.node_tree;nt.nodes.clear()
  out=nt.nodes.new('ShaderNodeOutputMaterial');bs=nt.nodes.new('ShaderNodeBsdfPrincipled');nt.links.new(bs.outputs['BSDF'],out.inputs['Surface'])
  eye='high-poly' in obj.name;strand=obj==hair or obj in beard_objects or 'eyebrow' in obj.name or 'eyelash' in obj.name
  bs.inputs['Roughness'].default_value=.28 if eye else (.72 if strand else .55)
  bs.inputs['Specular IOR Level'].default_value=.35
  if color:
   color.colorspace_settings.name='sRGB';tex=nt.nodes.new('ShaderNodeTexImage');tex.image=color
   nt.links.new(tex.outputs['Color'],bs.inputs['Base Color'])
   if strand or eye:nt.links.new(tex.outputs['Alpha'],bs.inputs['Alpha'])
  if obj==hair:
   # Multiply authored color using supported glTF base-color factor.
   mix=nt.nodes.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1
   mix.inputs[2].default_value=(.065,.033,.017,1);nt.links.new(tex.outputs['Color'],mix.inputs[1]);nt.links.new(mix.outputs[0],bs.inputs['Base Color'])
   bs.inputs['Roughness'].default_value=.76;bs.inputs['Specular IOR Level'].default_value=.18
  if obj in beard_objects:
   bs.inputs['Roughness'].default_value=.86;bs.inputs['Specular IOR Level'].default_value=.12
   # Thin near-surface authored strands, not an opaque beard shell.
   mix=nt.nodes.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1;mix.inputs[2].default_value=(1,.72,.5,1)
   nt.links.new(tex.outputs['Color'],mix.inputs[1]);nt.links.new(mix.outputs[0],bs.inputs['Base Color'])
   coverage=nt.nodes.new('ShaderNodeMath');coverage.operation='MULTIPLY';coverage.inputs[1].default_value=.58
   nt.links.new(tex.outputs['Alpha'],coverage.inputs[0]);nt.links.new(coverage.outputs[0],bs.inputs['Alpha'])
  if obj==human:
   mix=nt.nodes.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1;mix.inputs[2].default_value=(.78,.66,.53,1)
   nt.links.new(tex.outputs['Color'],mix.inputs[1]);nt.links.new(mix.outputs[0],bs.inputs['Base Color'])
   bs.inputs['Roughness'].default_value=.62
  mat.use_backface_culling=(not strand) or obj in beard_objects
  if strand or eye:
   mat.surface_render_method='DITHERED';mat['gltf_alpha_mode']='MASK';mat.alpha_threshold=.12 if obj==hair else .35
  material_records.append({'object':obj.name,'material':mat.name,'color_image':color.name if color else None,'alpha':'BLEND' if obj in beard_objects else ('MASK' if strand or eye else 'OPAQUE'),'normal_map':None,'omitted_maps':[i.name for i in images if i!=color],'previous_nodes':oldnodes})
for p in human.data.polygons:p.use_smooth=True
sub=human.modifiers.new('Portrait subdivision','SUBSURF');sub.levels=1;sub.render_levels=1
for obj in beard_objects:
 wrap=obj.modifiers.new('Short beard fit to actual face','SHRINKWRAP');wrap.target=human;wrap.wrap_method='NEAREST_SURFACEPOINT';wrap.wrap_mode='ABOVE_SURFACE';wrap.offset=.001
 bpy.context.view_layer.update()
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
 if mat['name'].endswith('.body'):mat.setdefault('pbrMetallicRoughness',{})['baseColorFactor']=[.78,.66,.53,1]
 if 'cortu' in mat['name']:mat.setdefault('pbrMetallicRoughness',{})['baseColorFactor']=[.065,.033,.017,1]
 if any(part in mat['name'] for part in ['eyebrow','eyelash','high-poly','cortu','grinsegold']):
  mat['alphaMode']='MASK';mat['alphaCutoff']=.12 if 'cortu' in mat['name'] else .35
for mat in doc.get('materials',[]):
 if 'grinsegold' in mat['name']:
  mat['alphaMode']='BLEND';mat.pop('alphaCutoff',None);mat['doubleSided']=False;mat.setdefault('pbrMetallicRoughness',{})['baseColorFactor']=[1,.72,.5,.58]
js=json.dumps(doc,separators=(',',':')).encode();js+=b' '*((-len(js))%4)
out.write_bytes(struct.pack('<III',0x46546C67,2,20+len(js)+len(tail))+struct.pack('<II',len(js),0x4E4F534A)+js+tail)
report={'status':'unaccepted correction 2 authored-source head candidate','normal_conversion':normal_stats,'source':'art/street01-head-authored.blend','runtime':str(out),'targets':targets,'materials':material_records,'uniform_scale':scale,'source_crop_min_z':1.445,'runtime_y_bounds':[1.531,1.833],'runtime_objects':[{'name':o.name,'vertices':len(o.data.vertices),'triangles':sum(len(p.vertices)-2 for p in o.data.polygons),'uv_layers':len(o.data.uv_layers)} for o in copies],'notes':['No procedural face displacements or replacement eye reconstruction.','Fitted Cortu short messy authored hair; original strand coverage retained, broad atlas panels remain a source limitation.','Body/helpers cropped only after official mask modifier evaluation on export copy.','Unverified hair and beard normal interpretation disabled after parent observed mottled plates; no normal map in this candidate.','Skin from jartur69 plus fitted grinsegold full beard and moustache; authored geometry/textures. Local personal trial only pending conflicting CC-BY/AGPL metadata resolution.']}
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
