"""One bounded cloth-volume candidate; immutable cotton source, existing atlas."""
import bpy,math,json,hashlib,sys,argparse
from pathlib import Path
from mathutils import Vector
R=Path.cwd();P=R/'prototypes/hero-garage';D=P/'art/garment-hem';sys.path.insert(0,str(R/'assets/blender'));import common as C
parser=argparse.ArgumentParser();parser.add_argument('--denim-source',required=True);args=parser.parse_args(sys.argv[sys.argv.index('--')+1:]);denim_source=Path(args.denim_source)
src=P/'art/garment-shape/garment-source.blend';sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();digest=sha(src);bpy.ops.wm.open_mainfile(filepath=str(src))
shirt=bpy.data.objects['rider:anatomical sweatshirt'];hood=bpy.data.objects['rider:folded hood'];arm=bpy.data.objects['rider_rig'];cloth=[shirt,hood,bpy.data.objects['rider:anatomical sweatshirt pocket']]
before={o.name:[v.co.copy()for v in o.data.vertices]for o in cloth};weights={o.name:[[(g.group,g.weight)for g in v.groups]for v in o.data.vertices]for o in cloth};uv={o.name:[tuple(v.uv)for v in o.data.uv_layers.active.data]for o in cloth}
# Gather only posterior lower torso; retain the front pocket and all limb fabric.
up=(arm.data.bones['spine'].tail_local-arm.data.bones['spine'].head_local).normalized();front=Vector((up.z,0,-up.x));origin=arm.data.bones['pelvis'].head_local.copy()
for v in shirt.data.vertices:
 d=v.co-origin;h=d.dot(up);x=d.dot(front);y=d.y
 ws={shirt.vertex_groups[g.group].name:g.weight for g in v.groups}
 if sum(ws.get(n,0)for n in ('pelvis','spine','chest'))<.995 or h>=.16 or x>=.035:continue
 fade=max(0,min(1,(.16-h)/.14));fade=fade*fade*(3-2*fade)
 back=max(0,min(1,(.035-x)/.12));back=back*back*(3-2*back)
 # The bottom gathers inward while the upper shell stays loose. Slight lift
 # avoids forcing the hem farther down onto the seated denim envelope.
 v.co+=front*(.025*fade*back)+up*(.014*fade*back)
 v.co.y*=1-.065*fade*back
sys.path.insert(0,str(D));import importlib;fit=importlib.import_module('fit-denim');changed=[i for i,v in enumerate(shirt.data.vertices)if(v.co-before[shirt.name][i]).length>1e-8];fitreport=fit.fit_denim(denim_source,shirt,changed)
for o in cloth:o.data.update()
assert all(weights[o.name]==[[(g.group,g.weight)for g in v.groups]for v in o.data.vertices]for o in cloth)
assert all(uv[o.name]==[tuple(v.uv)for v in o.data.uv_layers.active.data]for o in cloth)
assert all(v.co==before[shirt.name][i]for i,v in enumerate(shirt.data.vertices)if (before[shirt.name][i]-origin).dot(up)>=.16)
bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(D/'hem-fitted-source.blend'))
paths={k:str(P/'art/cloth-surface/textures'/('cotton_'+k+'.png'))for k in ('albedo','normal','orm')};mat=C.atlas_material('Subdued mustard cotton',paths)
for o in cloth:
 o.data.materials.clear();o.data.materials.append(mat)
 for p in o.data.polygons:p.material_index=0
for a in list(bpy.data.actions):bpy.data.actions.remove(a)
out=P/'public/assets/street01-garment-hem-fitted-donor.glb';C.export_glb(str(out),list(bpy.context.scene.objects),animations=True,meshopt=False)
assert sha(src)==digest
r={'denimSource':str(denim_source),'denimSourceSHA256':sha(denim_source),'denimFit':fitreport,'sourceSHA256':digest,'sourceUnchanged':True,'weightsExact':True,'uvExact':True,'upperTorsoNeckAndCuffControlsExact':True,'hoodExact':all(v.co==before[hood.name][i]for i,v in enumerate(hood.data.vertices)),'changes':{o.name:{'vertices':sum((v.co-before[o.name][i]).length>1e-8 for i,v in enumerate(o.data.vertices)),'maxDisplacementM':max((v.co-before[o.name][i]).length for i,v in enumerate(o.data.vertices))}for o in cloth},'existingCottonAtlasRetained':True,'outputSHA256':sha(out),'limitations':['Parent must judge motion appearance; geometry changes retain existing atlas and skin weights.','Posterior lower160mm only; actual animated denim audit required.']};(D/'fitted-build-report.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r))
