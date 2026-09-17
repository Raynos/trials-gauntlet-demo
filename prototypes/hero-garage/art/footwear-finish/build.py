import bpy,sys,json,hashlib
from pathlib import Path
R=Path.cwd();P=R/'prototypes/hero-garage';D=P/'art/footwear-finish';sys.path.insert(0,str(R/'assets/blender'));import common as C
source=P/'art/footwear-refine/footwear-refined-source.blend';bpy.ops.wm.open_mainfile(filepath=str(source));arm=next(o for o in bpy.data.objects if o.type=='ARMATURE');arm.data.pose_position='REST';obs=[bpy.data.objects[n] for n in ['rider:trainer_upper','rider:trainer_rubber','rider:hero footwear construction','rider:cotton_laces']]
def signature(o):return {'positions':[list(v.co) for v in o.data.vertices],'weights':[[(g.group,g.weight) for g in v.groups] for v in o.data.vertices],'faces':[list(p.vertices) for p in o.data.polygons]}
before={o.name:signature(o) for o in obs}
colors={'trainer_upper':(.055,.057,.060,1),'trainer_rubber':(.45,.44,.405,1),'cotton_laces':(.55,.54,.50,1),'hero suede reinforcement':(.028,.030,.033,1),'hero reflective binding':(.16,.165,.17,1),'hero stretch gusset':(.027,.028,.030,1)}
for mat in {m for o in obs for m in o.data.materials}:
 mat.use_nodes=True;nt=mat.node_tree;nt.nodes.clear();out=nt.nodes.new('ShaderNodeOutputMaterial');out.name='OUT';bs=nt.nodes.new('ShaderNodeBsdfPrincipled');bs.name='BSDF';nt.links.new(bs.outputs[0],out.inputs[0]);base=colors[mat.name];bs.inputs['Base Color'].default_value=base;bs.inputs['Roughness'].default_value=.82 if 'rubber' not in mat.name else .76
 tc=nt.nodes.new('ShaderNodeTexCoord');noise=nt.nodes.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=650 if 'rubber' not in mat.name else 350;noise.inputs['Detail'].default_value=2;nt.links.new(tc.outputs['Object'],noise.inputs['Vector']);bump=nt.nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.28;bump.inputs['Distance'].default_value=.00035;nt.links.new(noise.outputs['Fac'],bump.inputs['Height']);nt.links.new(bump.outputs['Normal'],bs.inputs['Normal'])
C.unwrap_all(obs,margin=.008)
bpy.ops.wm.save_as_mainfile(filepath=str(D/'footwear-refined-source.blend'))
paths=C.bake_atlas(obs,1024,str(D),'footwear',normal_size=1024,orm_size=1024)
# Save lossless maps from in-memory bake pixels, not JPEG reloads.
for key in ['albedo','normal','orm']:
 img=bpy.data.images.get('footwear_'+key);assert img,key
 dest=D/('footwear_'+key+'.png');img.filepath_raw=str(dest);img.file_format='PNG';img.save();paths[key]=str(dest)
mat=C.atlas_material('Footwear canvas suede rubber',paths)
for ob in obs:
 ob.data.materials.clear();ob.data.materials.append(mat)
 for poly in ob.data.polygons:poly.material_index=0
assert before=={o.name:signature(o) for o in obs}
arm.data.pose_position='POSE';bpy.context.scene.frame_set(1);out=P/'public/assets/street01-footwear-finish.glb';C.export_glb(str(out),obs+[arm],animations=True,meshopt=False)
r={'sourceSHA256':hashlib.sha256(source.read_bytes()).hexdigest(),'outputSHA256':hashlib.sha256(out.read_bytes()).hexdigest(),'bytes':out.stat().st_size,'positionsFacesWeightsIdentical':True,'linearColors':colors,'change':'Dark neutral grey canvas and suede; restrained ivory sole and laces, reduced green cast. All geometry and contact weights preserved.','limits':['Parent rendered acceptance required.']};(D/'build-report.json').write_text(json.dumps(r,indent=2));print(json.dumps(r))
