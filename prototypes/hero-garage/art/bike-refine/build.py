"""Bounded source-correspondent bike finish pass; run Blender from repo root."""
import bpy, sys, json, hashlib
from pathlib import Path
R=Path.cwd(); P=R/'prototypes/hero-garage'; D=P/'art/bike-refine'; D.mkdir(exist_ok=True)
sys.path.insert(0,str(R/'assets/blender')); import common as C
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
source=R/'assets/blender/source/bike.blend'; baked=P/'art/street01-bike-materials.blend'
hashes={str(p.relative_to(R)):sha(p) for p in (source,baked)}
bpy.ops.wm.open_mainfile(filepath=str(source))
selection={}
for name, mat in [('fork_lower','fender'),('engine','hero_machined_edge')]:
 o=bpy.data.objects[name]; selection[name]=[p.index for p in o.data.polygons if o.material_slots[p.material_index].name==mat]
source_topology={name:([list(v.co) for v in bpy.data.objects[name].data.vertices],[list(p.vertices) for p in bpy.data.objects[name].data.polygons]) for name in selection}
bpy.ops.wm.open_mainfile(filepath=str(baked))
def snapshot():
 return {o.name:{'matrix':[list(row) for row in o.matrix_world],'vertices':[list(v.co) for v in o.data.vertices] if o.type=='MESH' else None,'polygons':[list(p.vertices) for p in o.data.polygons] if o.type=='MESH' else None,'parent':o.parent.name if o.parent else None} for o in bpy.context.scene.objects if o.type in ('MESH','EMPTY')}
before=snapshot()
def material(name,color,metal,rough):
 m=bpy.data.materials.new(name);m.use_nodes=True;bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(*color,1);bs.inputs['Metallic'].default_value=metal;bs.inputs['Roughness'].default_value=rough
 return m
paint=material('hero_refine_blue_front_fender',(.018,.095,.54),.12,.29)
paint.node_tree.nodes.get('Principled BSDF').inputs['Coat Weight'].default_value=.28
paint.node_tree.nodes.get('Principled BSDF').inputs['Coat Roughness'].default_value=.22
edge=material('hero_refine_satin_engine_edges',(.16,.175,.19),.85,.38)
for name,mat in [('fork_lower',paint),('engine',edge)]:
 o=bpy.data.objects[name]
 assert ([list(v.co) for v in o.data.vertices],[list(p.vertices) for p in o.data.polygons])==source_topology[name], name+' source polygon correspondence mismatch'
 o.data.materials.append(mat);idx=len(o.data.materials)-1
 for pi in selection[name]:o.data.polygons[pi].material_index=idx
C.setup_variants([bpy.data.objects[n] for n in ('frame','bodywork','fork_upper')], [('bike_'+cw,{n:bpy.data.materials['bike_body_'+cw] for n in ('frame','bodywork','fork_upper')}) for cw in ('rookie','pro')])
assert snapshot()==before,'Geometry, parent or transform changed'
bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(D/'bike-refined.blend'),compress=True)
out=P/'public/assets/street01-bike-refined.glb'
C.export_glb(str(out),[o for o in bpy.context.scene.objects if o.type in ('MESH','EMPTY')],animations=False,meshopt=True)
assert all(sha(R/path)==h for path,h in hashes.items())
report={'sourceHashes':hashes,'sourceUnchanged':True,'geometryTransformsHierarchyUnchanged':True,'materialPolygonCounts':{k:len(v) for k,v in selection.items()},'changes':['Front fender blue clearcoat matches target01 blue front mudguard rather than black generic panel.','Engine machined edges use satin dark aluminium rather than overbright atlas metal.'],'output':str(out.relative_to(R)),'outputBytes':out.stat().st_size,'outputSHA256':sha(out),'acceptance':'Candidate only; parent must review recorded orbit and suspension movement. No dimensional/contact changes.'}
(P/'reports/bike-refine.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
