"""Rebuild both genuine race designs with restrained textile normals and 2K atlas."""
import bpy,json,sys,hashlib
from pathlib import Path
R=Path.cwd();P=R/'prototypes/hero-garage';D=P/'art/race-variants';sys.path.insert(0,str(R/'assets/blender'));import common as C;import rider_asset as RA
source=R/'assets/blender/source/rider-race.blend';sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();digest=sha(source);bpy.ops.wm.open_mainfile(filepath=str(source));arm=bpy.data.objects['rider_rig'];RA.clear_pose(arm)
def geometry():return hashlib.sha256(repr({o.name:{'v':[tuple(v.co)for v in o.data.vertices],'p':[tuple(p.vertices)for p in o.data.polygons],'w':[[(g.group,g.weight)for g in v.groups]for v in o.data.vertices]}for o in bpy.data.objects if o.type=='MESH'}).encode()).hexdigest()
# Fit a low continuous neckline to the actual race head/neck surface.
jersey=bpy.data.objects['rider:anatomical race jersey'];sys.path.insert(0,str(D));import importlib;neckreport=importlib.import_module('fit-collar').fit(jersey,arm);neckchanges=neckreport['positionChanges']
mod=jersey.modifiers.new('Continuous jersey shoulder surface','SUBSURF');mod.levels=1;mod.render_levels=1;bpy.context.view_layer.objects.active=jersey;bpy.ops.object.modifier_move_up(modifier=mod.name)
# Blend upper shoulder gussets into the actual main colourway continuously.
mat=bpy.data.materials['race jersey stretch gusset'];nt=mat.node_tree;bs=next(n for n in nt.nodes if n.type=='BSDF_PRINCIPLED');old=bs.inputs['Base Color'].links[0].from_socket if bs.inputs['Base Color'].links else None
coord=nt.nodes.new('ShaderNodeNewGeometry');xyz=nt.nodes.new('ShaderNodeSeparateXYZ');nt.links.new(coord.outputs['Position'],xyz.inputs[0]);fade=nt.nodes.new('ShaderNodeMapRange');fade.interpolation_type='SMOOTHSTEP';fade.clamp=True;fade.inputs['From Min'].default_value=1.07;fade.inputs['From Max'].default_value=1.145;nt.links.new(xyz.outputs['Z'],fade.inputs['Value']);main=nt.nodes.new('ShaderNodeRGB');main.name='CW_RACE_JERSEY_MAIN';mix=nt.nodes.new('ShaderNodeMixRGB');nt.links.new(fade.outputs[0],mix.inputs[0]);nt.links.new(main.outputs[0],mix.inputs[2])
if old:nt.links.new(old,mix.inputs[1])
else:mix.inputs[1].default_value=bs.inputs['Base Color'].default_value
nt.links.new(mix.outputs[0],bs.inputs['Base Color'])
before=geometry();changes=[]
for m in bpy.data.materials:
 if not m.use_nodes:continue
 name=m.name.lower();fabric=any(k in name for k in ('jersey','pant','knee textile','glove'));rubber=any(k in name for k in ('rubber','accordion'));plastic=any(k in name for k in ('synthetic shell','shin moulding','protection inset','moulded protection'))
 if not(fabric or rubber or plastic):continue
 for n in m.node_tree.nodes:
  if n.type=='BUMP':
   old=[float(n.inputs['Strength'].default_value),float(n.inputs['Distance'].default_value)];n.inputs['Strength'].default_value=min(old[0],.16 if fabric else .12);n.inputs['Distance'].default_value=min(old[1],.00015 if fabric else .0002);changes.append({'material':m.name,'node':n.name,'before':old,'after':[float(n.inputs['Strength'].default_value),float(n.inputs['Distance'].default_value)]})
  if n.type=='BSDF_PRINCIPLED':
   for link in list(n.inputs['Roughness'].links):m.node_tree.links.remove(link)
   n.inputs['Roughness'].default_value=.82 if fabric else .88 if rubber else .48
assert geometry()==before;C.apply_colourway(json.loads(bpy.context.scene['heroColourways'])['rookie']);bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(D/'race-quality-source.blend'),compress=True)
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH'];C.unwrap_all(meshes,margin=.003);cw=json.loads(bpy.context.scene['heroColourways']);C.apply_colourway(cw['rookie'])
paths=C.bake_atlas(meshes,2048,str(D/'textures'),'race',normal_size=1024,orm_size=1024,variants=[(v,lambda v=v:C.apply_colourway(cw[v]))for v in ('rookie','pro')],ao_distance=.025,ao_samples=32,ao_strength=.65)
for key in ('normal','orm'):
 im=bpy.data.images['race_'+key];im.filepath_raw=str(D/'textures'/('race_'+key+'.png'));im.file_format='PNG';im.save();paths[key]=im.filepath_raw
for a in list(bpy.data.actions):bpy.data.actions.remove(a)
outputs=[]
for variant,name in [('rookie','race-bluewhite'),('pro','race-charcoalyellow')]:
 mat=C.atlas_material(name+' technical fabric rubber and moulded protection',paths,albedo='albedo:'+variant)
 for o in meshes:
  o.data.materials.clear();o.data.materials.append(mat)
  for p in o.data.polygons:p.material_index=0
 out=P/'public/assets/variants'/(name+'-geometry.glb');C.export_glb(str(out),list(bpy.context.scene.objects),animations=True,meshopt=False);outputs.append({'path':str(out.relative_to(P)),'sha256':sha(out)})
assert geometry()==before;assert sha(source)==digest
(D/'build-report.json').write_text(json.dumps({'sourceSHA256':digest,'sourceImmutable':True,'postNeckFitGeometryTopologyWeightsExact':True,'raceCollarFit':neckreport,'shoulderGussetBlendHeightM':[1.07,1.145],'jerseySubdivisionLevel':1,'atlasRepacked':True,'albedoResolution':2048,'normalORMResolution':1024,'changes':changes,'outputs':outputs,'limits':['Preserves existing fitted helmet and anatomical source head; saved curly groom not forced inside helmet.','Source race boot/glove constructions retained; matching upper-neck fit and jersey subdivision are the only geometry changes.','Material and motion upgrade, not a new anatomy sculpt or reference-parity claim.']},indent=2)+'\n')
