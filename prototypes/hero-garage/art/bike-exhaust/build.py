"""Restrained tempered warm steel on the accepted exhaust, with geometry unchanged."""
import bpy,bmesh,sys,json,hashlib
from pathlib import Path
R=Path.cwd();P=R/'prototypes/hero-garage';D=P/'art/bike-exhaust';sys.path.insert(0,str(R/'assets/blender'));import common as C
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();source=R/'assets/blender/source/bike.blend';accepted=P/'art/bike-contours/bike-contours-source.blend';hashes={str(p):sha(p)for p in [source,accepted]}
bpy.ops.wm.open_mainfile(filepath=str(source));o=bpy.data.objects['exhaust'];selected=[p.index for p in o.data.polygons if o.data.materials[p.material_index].name=='hero_header_bronze'];topology=([list(v.co)for v in o.data.vertices],[list(p.vertices)for p in o.data.polygons]);bpy.ops.wm.open_mainfile(filepath=str(accepted));o=bpy.data.objects['exhaust'];assert topology==([list(v.co)for v in o.data.vertices],[list(p.vertices)for p in o.data.polygons])
# Resolve the same accepted paint atlas after loading the procedural contour source.
paintpaths={k:str(P/'art/bike-paint'/('paint_'+k+'.png'))for k in ['albedo','normal','orm']};paint=C.atlas_material('Clean blue white plastics with original decals',paintpaths)
for name in ['bodywork','fork_upper']:
 ob=bpy.data.objects[name];ids=[p.index for p in ob.data.polygons if ob.data.materials[p.material_index].name in ['hero_tank_paint','hero_factory_race_field','plate.001']];mi=len(ob.data.materials);ob.data.materials.append(paint)
 for i in ids:ob.data.polygons[i].material_index=mi
def state():return {ob.name:{'matrix':[list(r)for r in ob.matrix_world],'parent':ob.parent.name if ob.parent else None,'positions':[list(v.co)for v in ob.data.vertices]if ob.type=='MESH' else None,'polygons':[list(p.vertices)for p in ob.data.polygons]if ob.type=='MESH' else None,'uv':[[list(d.uv)for d in uv.data]for uv in ob.data.uv_layers]if ob.type=='MESH' else None}for ob in bpy.context.scene.objects if ob.type in ['MESH','EMPTY']}
before=state();mat=C.new_mat('Tempered warm steel header',(.20,.19,.17,1),rough=.46,metal=.84);nt=mat.node_tree;bs=nt.nodes['BSDF'];tc=nt.nodes.new('ShaderNodeTexCoord');distance=nt.nodes.new('ShaderNodeVectorMath');distance.operation='DISTANCE';distance.inputs[1].default_value=(.80,0,.50);nt.links.new(tc.outputs['Object'],distance.inputs[0]);scale=nt.nodes.new('ShaderNodeMath');scale.operation='DIVIDE';scale.inputs[1].default_value=.36;nt.links.new(distance.outputs['Value'],scale.inputs[0]);ramp=nt.nodes.new('ShaderNodeValToRGB');ramp.name='Quiet heat temper from port';ramp.color_ramp.interpolation='EASE';ramp.color_ramp.elements.remove(ramp.color_ramp.elements[1]);stops=[(0,(.070,.052,.035,1)),(.30,(.145,.125,.095,1)),(.65,(.225,.21,.185,1)),(1,(.205,.205,.195,1))]
for index,(position,color)in enumerate(stops):
 element=ramp.color_ramp.elements[0]if index==0 else ramp.color_ramp.elements.new(position);element.position=position;element.color=color
nt.links.new(scale.outputs[0],ramp.inputs[0]);nt.links.new(ramp.outputs['Color'],bs.inputs['Base Color']);rough=nt.nodes.new('ShaderNodeMapRange');rough.clamp=True;rough.inputs['From Min'].default_value=0;rough.inputs['From Max'].default_value=1;rough.inputs['To Min'].default_value=.58;rough.inputs['To Max'].default_value=.43;nt.links.new(scale.outputs[0],rough.inputs['Value']);nt.links.new(rough.outputs['Result'],bs.inputs['Roughness']);mi=len(o.data.materials);o.data.materials.append(mat)
for i in selected:o.data.polygons[i].material_index=mi
bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(D/'bike-exhaust-source.blend'),compress=True)
dup=o.copy();dup.data=o.data.copy();bpy.context.collection.objects.link(dup);dup.name='BAKE_header';bm=bmesh.new();bm.from_mesh(dup.data);bm.faces.ensure_lookup_table();bmesh.ops.delete(bm,geom=[f for f in bm.faces if f.index not in selected],context='FACES');bm.to_mesh(dup.data);bm.free();dup.data.materials.clear();dup.data.materials.append(mat)
for poly in dup.data.polygons:poly.material_index=0
paths=C.bake_atlas([dup],1024,str(D),'header',normal_size=512,orm_size=1024,margin=8)
for key in ['albedo','normal','orm']:
 img=bpy.data.images['header_'+key];dest=D/('header_'+key+'.png');img.filepath_raw=str(dest);img.file_format='PNG';img.save();paths[key]=str(dest)
atlas=C.atlas_material('Tempered warm steel header atlas',paths);mi=len(o.data.materials);o.data.materials.append(atlas)
for i in selected:o.data.polygons[i].material_index=mi
bpy.data.objects.remove(dup,do_unlink=True);assert state()==before
out=P/'public/assets/street01-bike-exhaust.glb';C.export_glb(str(out),[ob for ob in bpy.context.scene.objects if ob.type in ['MESH','EMPTY']],animations=False,meshopt=True);assert all(sha(Path(p))==h for p,h in hashes.items())
r={'sourceHashes':hashes,'outputSHA256':sha(out),'outputBytes':out.stat().st_size,'geometryTopologyUVHierarchyTransformsExactlyUnchanged':True,'selectedObject':'exhaust','selectedPolygons':len(selected),'colorRampLinear':stops,'roughnessPortToCollector':[.58,.43],'metallic':.84,'noiseAdded':False,'paintTexturesUnchanged':{k:sha(Path(p))for k,p in paintpaths.items()},'limitations':['Only original bronze header region changes; silencer, heat shield and mechanical endpoints remain untouched.','Parent must judge matched neutral/garage bike and whole-scene recordings.']};(P/'reports/bike-exhaust-build.json').write_text(json.dumps(r,indent=2));print(json.dumps(r))
