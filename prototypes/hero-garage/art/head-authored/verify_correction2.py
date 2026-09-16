"""Verify actual evaluated beard distance and final GLB contracts; no art acceptance."""
import bpy,json,struct,hashlib,numpy as np
from pathlib import Path
from mathutils.bvhtree import BVHTree
HERE=Path(__file__).resolve().parent;ART=HERE.parent
bpy.ops.wm.open_mainfile(filepath=str(ART/'street01-head-authored.blend'))
deps=bpy.context.evaluated_depsgraph_get();human=bpy.data.objects['Street01_Authored_EditableBody'];bvh=BVHTree.FromObject(human,deps)
fits=[]
for o in bpy.data.objects:
 if o.type=='MESH' and 'grinsegold' in o.name:
  ev=o.evaluated_get(deps);mesh=ev.to_mesh();dist=[bvh.find_nearest(o.matrix_world@v.co)[3] for v in mesh.vertices];ev.to_mesh_clear()
  fits.append({'name':o.name,'distance_m_percentiles':np.percentile(dist,[0,50,95,100]).tolist(),'modifier_offset_m':next(m.offset for m in o.modifiers if m.type=='SHRINKWRAP')})
  assert max(dist)<.0011
p=ART.parent/'public/assets/street01-head-authored.glb';b=p.read_bytes();n=struct.unpack_from('<I',b,12)[0];d=json.loads(b[20:20+n]);assert len(d['meshes'])==6
assert not any('eyelashes' in m['name'] for m in d['materials'])
for m in d['materials']:
 assert not m.get('normalTexture')
 if 'grinsegold' in m['name']:assert m['alphaMode']=='BLEND' and m['doubleSided']==False and m['pbrMetallicRoughness']['baseColorFactor'][3]==.58
r=ART.parent/'reports/authored-head-build.json';report=json.loads(r.read_text());report.update(runtime_sha256=hashlib.sha256(b).hexdigest(),runtime_bytes=len(b),beard_fit_verification=fits,gltf_material_verification=[{'name':m['name'],'alphaMode':m.get('alphaMode','OPAQUE'),'alphaCutoff':m.get('alphaCutoff'),'normalTexture':m.get('normalTexture'),'baseColorFactor':m['pbrMetallicRoughness'].get('baseColorFactor',[1,1,1,1])} for m in d['materials']],hair_source_limit='Cortu shared broad strand panels cannot become target irregular curl groups by material adjustments; parent must judge in played orbit. No further source correction authorized in this round.',beard_transparency_limit='BLEND near-surface single-sided mesh; motion sorting requires browser orbit review. Not claimed sorted from static source diagnostic.',license_scope='Grinsegold local personal trial; official CC-BY pack vs embedded AGPL header remains unresolved for public release.')
r.write_text(json.dumps(report,indent=2)+'\n');print('VERIFIED',report['runtime_sha256'],report['runtime_bytes'],fits)
