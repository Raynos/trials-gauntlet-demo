"""Correct exceptional solidify miter spikes using editable post-shell node offsets."""
import bpy,json,hashlib,sys,argparse
from pathlib import Path
R=Path.cwd();P=R/'prototypes/hero-garage';D=P/'art/sleeve-shape-final';sys.path.insert(0,str(R/'assets/blender'));import common as C
parser=argparse.ArgumentParser();parser.add_argument('--source',required=True);args=parser.parse_args(sys.argv[sys.argv.index('--')+1:]);src=Path(args.source);sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();digest=sha(src);bpy.ops.wm.open_mainfile(filepath=str(src));o=bpy.data.objects['rider:anatomical sweatshirt'];arm=bpy.data.objects['rider_rig'];arm.data.pose_position='REST';solid=next(m for m in o.modifiers if m.type=='SOLIDIFY')
def signature():return hashlib.sha256(repr([(tuple(v.co),[(g.group,g.weight)for g in v.groups])for v in o.data.vertices]+[tuple(x.uv)for x in o.data.uv_layers.active.data]).encode()).hexdigest()
before=signature()
def sample():
 bpy.context.view_layer.update();e=o.evaluated_get(bpy.context.evaluated_depsgraph_get());m=e.to_mesh();v=[x.co.copy()for x in m.vertices];e.to_mesh_clear();return v
solid.show_viewport=False;base=sample();solid.show_viewport=True;original=sample();solid.use_even_offset=False;bounded=sample();solid.use_even_offset=True
N=len(base);assert len(original)==2*N;fix=[]
for i in range(N):
 if (original[i+N]-base[i]).length<=.005:continue
 if min((base[i]-arm.data.bones['forearm.'+s].head_local).length for s in ('L','R'))>.16:continue
 fix.append({'index':i+N,'originalOffsetM':(original[i+N]-base[i]).length,'correctionM':list(bounded[i+N]-original[i+N])})
assert fix
ng=bpy.data.node_groups.new('Bound exceptional elbow inner shell miters','GeometryNodeTree');ng.interface.new_socket(name='Geometry',in_out='INPUT',socket_type='NodeSocketGeometry');ng.interface.new_socket(name='Geometry',in_out='OUTPUT',socket_type='NodeSocketGeometry');inp=ng.nodes.new('NodeGroupInput');out=ng.nodes.new('NodeGroupOutput');idx=ng.nodes.new('GeometryNodeInputIndex');last=inp.outputs['Geometry']
for row in fix:
 cmp=ng.nodes.new('FunctionNodeCompare');cmp.data_type='INT';cmp.operation='EQUAL';ng.links.new(idx.outputs[0],cmp.inputs[0]);cmp.inputs[1].default_value=row['index'];setp=ng.nodes.new('GeometryNodeSetPosition');ng.links.new(last,setp.inputs['Geometry']);ng.links.new(cmp.outputs[0],setp.inputs['Selection']);setp.inputs['Offset'].default_value=row['correctionM'];last=setp.outputs['Geometry']
ng.links.new(last,out.inputs['Geometry']);mod=o.modifiers.new('Repair elbow shell miter spikes only','NODES');mod.node_group=ng;bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_move_up(modifier=mod.name)
after=sample();ids={x['index']for x in fix};assert all((after[i]-original[i]).length<1e-7 for i in range(len(after))if i not in ids);assert all((after[i]-bounded[i]).length<1e-7 for i in ids);assert signature()==before
bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(D/'sleeve-source.blend'),compress=True)
for a in list(bpy.data.actions):bpy.data.actions.remove(a)
arm.data.pose_position='POSE';outpath=P/'public/assets/street01-sleeve-shape-final-donor.glb';C.export_glb(str(outpath),list(bpy.context.scene.objects),animations=True,meshopt=False);assert sha(src)==digest
r={'sourceSHA256':digest,'sourceImmutable':True,'controlPositionsUVWeightsExact':True,'allUnselectedEvaluatedVerticesExact':True,'outerSurfaceAndEveryContactRimExact':True,'correctedInnerVertices':fix,'outputSHA256':sha(outpath),'limits':['Repairs only pathological inner shell miters. Angular broad outer silhouette is unchanged.','Parent must judge played motion; source edits are geometry-node offsets after shell, before armature.']};(D/'build-report.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r))
