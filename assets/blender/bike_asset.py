"""Protected editable bike sources and staged source-derived exports (inside Blender).

adopt --input authored.blend --source source/bike.blend
export --source source/bike.blend [--lod] [--lod-tris 6000]

Adopt copies an existing authored assembly; export never runs a geometry builder.
"""
import argparse
import hashlib
import json
import math
import subprocess
import sys
import tempfile
from pathlib import Path
import bpy
import bmesh
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).resolve().parent))
import common as C
from rider_asset import publish

HERE=Path(__file__).resolve().parent
SCHEMA='trials.bike.authoring.v1'
PARTS=set('frame bodywork engine exhaust handlebar pegs fork_upper fork_lower swingarm shock_body shock_shaft shock_clevis shock_spring wheel_front wheel_front_spokes wheel_front_blur wheel_rear wheel_rear_spokes wheel_rear_blur sprocket_front sprocket_rear chain brake_hose'.split())
MARKERS=set('frame_origin chassis_com swing_pivot swing_axle shock_link fork_top front_axle_rest rear_axle_rest shock_top shock_upper_seat shock_lower_seat shock_rod_top shock_eye countershaft front_pitch rear_sprocket rear_pitch exhaust_outlet grip_L grip_R peg_L peg_R'.split())
BODY={'frame','bodywork','fork_upper'}
COLOURS={
 'rookie':dict(PAINT=(.018,.095,.54),FRAME=(.035,.055,.075),PLATE=(.89,.92,.94),INK=(.07,.07,.08),LOGO=(.91,.95,1),num_u=0,num_v=2/8),
 'pro':dict(PAINT=(.025,.028,.031),FRAME=(.07,.075,.078),PLATE=(1,.69,.015),INK=(.78,.14,.1),LOGO=(1,.69,.015),num_u=2/8,num_v=2/8),
}

def digest(path):
 return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def check_source():
 scene=bpy.context.scene
 meshes=[o for o in scene.objects if o.type=='MESH']
 if {o.name for o in meshes}!=PARTS:
  raise RuntimeError('Expected the 23 exact runtime bike meshes; join authored additions into their mechanical parent part.')
 root=scene.objects.get('bike')
 if not root or root.type!='EMPTY' or root.get('mechanism_version')!=3:
  raise RuntimeError('Missing bike root / mechanism_version 3.')
 if any(scene.objects.get('attach_'+name) is None for name in MARKERS):
  raise RuntimeError('Missing required attachment marker.')
 for ob in meshes:
  if ob.modifiers or ob.data.shape_keys:
   raise RuntimeError(f'Apply modifiers and shape keys explicitly before export: {ob.name}')
  if not all(math.isfinite(c) for v in ob.data.vertices for c in v.co):
   raise RuntimeError(f'Nonfinite vertices: {ob.name}')
  if any(not m or not m.use_nodes for m in ob.data.materials):
   raise RuntimeError(f'Expected authored node materials on {ob.name}')
 hose=scene.objects['brake_hose']
 if not hose.get('hose_stations') or not hose.get('hose_length') or not scene.objects['chain'].get('rest_length'):
  raise RuntimeError('Missing chain/hose deformation metadata.')
 bpy.context.view_layer.update()
 return meshes

def expectations(meshes):
 result={}
 for o in bpy.context.scene.objects:
  if o.type not in ('MESH','EMPTY'): continue
  p=o.matrix_world.translation
  result[o.name]=dict(position=[p.x,p.z,-p.y],extras={k:(v.to_list() if hasattr(v,'to_list') else v) for k,v in o.items()})
 return result

# The production loader decodes the actual vertex, index and UV buffers. Images
# are omitted only in memory so this structural gate needs neither DOM nor GPU.
VERIFY=r'''
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as T from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/examples/jsm/libs/meshopt_decoder.module.js';
const [file,expectFile,limit,aoEnabled]=process.argv.slice(1),expected=JSON.parse(await fs.readFile(expectFile));
const original=await fs.readFile(file),len=original.readUInt32LE(12),d=JSON.parse(original.subarray(20,20+len));
assert.equal(original.readUInt32LE(0),0x46546c67);assert.equal(original.readUInt32LE(8),original.length);
assert(d.extensionsUsed.includes('EXT_meshopt_compression'));
assert.deepEqual(d.extensions.KHR_materials_variants.variants.map(v=>v.name),['bike_rookie','bike_pro']);
assert.deepEqual(d.nodes.map(n=>n.name).sort(),Object.keys(expected).sort());
for(const name of ['frame','bodywork','fork_upper']) {
 const m=d.meshes.find(m=>m.name===name);assert.equal(m.primitives.length,1);
 const p=m.primitives[0];
 for(let i=0;i<2;i++)assert(p.extensions.KHR_materials_variants.mappings.some(x=>x.variants.includes(i)&&d.materials[x.material].name===`bike_body_${i?'pro':'rookie'}`));
}
let occlusionMaterials=0;
if(aoEnabled==='1')for(const name of ['bike_body_rookie','bike_body_pro','bike_mech']){
 const m=d.materials.find(m=>m.name===name),a=m.occlusionTexture,r=m.pbrMetallicRoughness.metallicRoughnessTexture;
 assert(a&&r&&a.index===r.index,`Shared ORM occlusion: ${name}`);occlusionMaterials++;
}
for(const img of d.images)assert(Number.isInteger(img.bufferView)&&!img.uri);
for(const b of d.buffers)assert(!b.uri);
for(const mesh of d.meshes)for(const p of mesh.primitives){delete p.material;if(p.extensions)delete p.extensions.KHR_materials_variants;}
d.materials=[];d.images=[];d.textures=[];delete d.extensions.KHR_materials_variants;
const j=Buffer.from(JSON.stringify(d)),pad=Buffer.concat([j,Buffer.alloc((4-j.length%4)%4,32)]),bin=original.subarray(20+len),input=Buffer.alloc(20+pad.length+bin.length);
original.copy(input,0,0,12);input.writeUInt32LE(input.length,8);input.writeUInt32LE(pad.length,12);input.writeUInt32LE(0x4e4f534a,16);pad.copy(input,20);bin.copy(input,20+pad.length);
const gltf=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(input.buffer,'');gltf.scene.updateMatrixWorld(true);
let triangles=0,meshes=0,maxPositionError=0;
gltf.scene.traverse(o=>{
 if(expected[o.name]){const e=expected[o.name],p=o.getWorldPosition(new T.Vector3());maxPositionError=Math.max(maxPositionError,p.distanceTo(new T.Vector3(...e.position)));for(const [k,v] of Object.entries(e.extras))assert.deepEqual(o.userData[k],v,`${o.name}/${k}`);}
 if(o.isMesh){meshes++;const g=o.geometry;triangles+=g.index?g.index.count/3:g.attributes.position.count/3;for(const a of Object.values(g.attributes))for(const v of a.array)assert(Number.isFinite(v));if(g.index)for(const i of g.index.array)assert(i<g.attributes.position.count);assert(g.attributes.uv);}
});
assert.equal(meshes,23);assert(maxPositionError<2e-6);if(Number(limit))assert(triangles<=Number(limit));
const bounds=new T.Box3().setFromObject(gltf.scene);
console.log(JSON.stringify({triangles,meshes,maxPositionError,occlusionMaterials,bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()},bytes:original.length}));
'''

local_ao_settings = C.local_ao_settings


def adopt(args):
 source=args.source.resolve()
 if not args.input: raise RuntimeError('adopt requires --input authored.blend')
 original=args.input.resolve()
 if original==source: raise RuntimeError('Adoption must copy to a distinct source path.')
 if source.exists(): raise RuntimeError('Refusing to replace an existing authored source.')
 original_hash=digest(original)
 bpy.ops.wm.open_mainfile(filepath=str(original));check_source()
 scene=bpy.context.scene
 scene['heroSourceSchema']=SCHEMA
 scene['heroColourways']=scene.get('heroColourways') or json.dumps(COLOURS)
 if args.ao_distance is not None:
  scene['heroLocalAO'] = json.dumps(dict(distance=args.ao_distance, samples=32 if args.ao_samples is None else args.ao_samples, strength=.8 if args.ao_strength is None else args.ao_strength))
 local_ao_settings(scene)
 scene['heroSourceNote']='Authoritative editable bike assembly. Export copies; never regenerate this file.'
 source.parent.mkdir(parents=True,exist_ok=True)
 bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(source),compress=True,copy=True)
 if digest(original)!=original_hash: raise RuntimeError('Input was altered during adoption.')
 C.log('adopted protected bike source',source,digest(source))

def detach_interface_components(ob):
 """Preserve whole manufactured pieces, not isolated witness vertices.

 Fork cylinders and swingarm axle caps are disconnected components in the
 authored assembly. Their exact surfaces define moving mechanical interfaces;
 collapse-decimation may not move or remove any of their vertices.
 """
 if ob.name not in {'fork_upper', 'fork_lower', 'swingarm'}:
  return None
 scene = bpy.context.scene
 axle = scene.objects['attach_front_axle_rest'].matrix_world.translation
 top = scene.objects['attach_fork_top'].matrix_world.translation
 axis = (top - axle).normalized()
 rear = scene.objects['attach_rear_axle_rest'].matrix_world.translation
 bm = bmesh.new()
 bm.from_mesh(ob.data)
 bm.verts.ensure_lookup_table()
 seeds = set()
 for v in bm.verts:
  p = ob.matrix_world @ v.co
  if ob.name == 'swingarm':
   q = p - rear
   if abs(abs(q.y) - .15) < 1e-5 and math.hypot(q.x, q.z) < .016:
    seeds.add(v)
  else:
   q = p - axle
   along = q.dot(axis)
   for sign in (-1, 1):
    radial = (q - axis * along - Vector((0, sign * .10, 0))).length
    rings = ((.34, .019),) if ob.name == 'fork_upper' else ((-.01, .025), (.42, .024))
    if any(abs(along - station) < 1e-5 and abs(radial - radius) < 1e-5 for station, radius in rings):
     seeds.add(v)
 # Expand to entire connected components, retaining caps and all intermediate
 # surface vertices, including authored edits inside the manufactured piece.
 keep = set(seeds)
 pending = list(seeds)
 while pending:
  v = pending.pop()
  for edge in v.link_edges:
   other = edge.other_vert(v)
   if other not in keep:
    keep.add(other)
    pending.append(other)
 if not keep:
  bm.free()
  raise RuntimeError(f'Missing authored mechanical interface on {ob.name}; update the interface contract explicitly.')
 keep_indices = {v.index for v in keep}
 protected = ob.copy()
 protected.data = ob.data.copy()
 protected.name = ob.name + ':preserved_interfaces'
 bpy.context.scene.collection.objects.link(protected)
 bmesh.ops.delete(bm, geom=list(keep), context='VERTS')
 bm.to_mesh(ob.data)
 bm.free()
 bm = bmesh.new()
 bm.from_mesh(protected.data)
 bm.verts.ensure_lookup_table()
 bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.index not in keep_indices], context='VERTS')
 bm.to_mesh(protected.data)
 bm.free()
 return protected


def derive_lod(meshes, budget):
 """Spend LOD budget only after reserving deformation and interface topology."""
 protected_names = {'chain', 'brake_hose', 'wheel_front_blur', 'wheel_rear_blur',
                    'wheel_front_spokes', 'wheel_rear_spokes',
                    'shock_body', 'shock_shaft', 'shock_clevis'}
 interfaces = {}
 for ob in meshes:
  preserved = detach_interface_components(ob)
  if preserved is not None:
   interfaces[ob.name] = preserved
 fixed = sum(C.tri_count(ob) for ob in meshes if ob.name in protected_names)
 fixed += sum(C.tri_count(ob) for ob in interfaces.values())
 reducible = sum(C.tri_count(ob) for ob in meshes if ob.name not in protected_names)
 minimum = fixed + 12 * (len(meshes) - len(protected_names))
 if budget <= minimum:
  raise RuntimeError(f'LOD budget {budget} cannot retain {fixed} interface/deformation triangles.')
 ratio = min(1, (budget - fixed - 100) / reducible)
 for ob in meshes:
  if ob.name not in protected_names:
   C.decimate_to(ob, max(12, int(C.tri_count(ob) * ratio)))
  if ob.name in interfaces:
   C.select_only([ob, interfaces[ob.name]])
   bpy.context.view_layer.objects.active = ob
   bpy.ops.object.join()
 total = sum(C.tri_count(ob) for ob in meshes)
 if total > budget:
  raise RuntimeError(f'LOD exceeded budget before baking: {total} > {budget}')
 C.log('LOD preserved mechanical interfaces', dict(reservedTriangles=fixed, totalTriangles=total, budget=budget))


def export(args):
 source=args.source.resolve();source_hash=digest(source)
 stem='bike'+('-lod' if args.lod else '')
 generated=args.generated.resolve()/(stem+'.blend');glb=args.models.resolve()/(stem+'.glb')
 if source in (generated,glb): raise RuntimeError('Export destination aliases the authored source.')
 bpy.ops.wm.open_mainfile(filepath=str(source))
 if bpy.context.scene.get('heroSourceSchema')!=SCHEMA: raise RuntimeError('Adopt the authored source before exporting.')
 meshes=check_source();expected=expectations(meshes)
 colours=json.loads(bpy.context.scene['heroColourways'])
 ao = local_ao_settings(bpy.context.scene)
 ao_kwargs = {'ao_' + key: value for key, value in ao.items()}
 if args.lod:
  derive_lod(meshes, args.lod_tris)

 body=[o for o in meshes if o.name in BODY]
 mech=[o for o in meshes if o.name not in BODY|{'chain','wheel_front_blur','wheel_rear_blur'}]
 C.unwrap_all(body,angle=66,margin=.002);C.unwrap_all(mech,angle=66,margin=.0015)
 C.apply_colourway(colours['rookie'])
 generated.parent.mkdir(parents=True,exist_ok=True)
 with tempfile.TemporaryDirectory(prefix='.bike-export-',dir=generated.parent) as temp:
  stage=Path(temp);textures=stage/'textures';textures.mkdir();size=args.size or (512 if args.lod else 1024)
  try:
   pb=C.bake_atlas(body,size,str(textures),stem+'_body',jpeg_quality=86,normal_size=size//2,orm_size=size//2,variants=[(cw,lambda cw=cw:C.apply_colourway(colours[cw])) for cw in ('rookie','pro')], **ao_kwargs)
   pm=C.bake_atlas(mech,size,str(textures),stem+'_mech',jpeg_quality=86,normal_size=size//2,orm_size=size//2, **ao_kwargs)
   mats={cw:C.atlas_material('bike_body_'+cw,pb,albedo='albedo:'+cw) for cw in ('rookie','pro')}
   C.assign_atlas(body,mats['rookie']);C.assign_atlas(mech,C.atlas_material('bike_mech',pm))
   C.setup_variants(body,[('bike_'+cw,{name:mats[cw] for name in BODY}) for cw in ('rookie','pro')])
   bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(stage/generated.name),compress=True,copy=True)
   from io_scene_gltf2.io.exp import meshopt as encoder
   previous=encoder.EXP_FILTER_BITS
   try:
    encoder.EXP_FILTER_BITS=20
    C.export_glb(str(stage/glb.name),meshes+[o for o in bpy.context.scene.objects if o.type=='EMPTY'],animations=False,meshopt=True)
   finally: encoder.EXP_FILTER_BITS=previous
   (stage/'expected.json').write_text(json.dumps(expected))
   verified=subprocess.run([args.node,'--input-type=module','-e',VERIFY,str(stage/glb.name),str(stage/'expected.json'),str(args.lod_tris if args.lod else 0),'1' if ao['distance'] > 0 and ao['strength'] > 0 else '0'],cwd=C.ROOT,check=True,capture_output=True,text=True)
   report=dict(source=str(source),sourceSha256=source_hash,exportSha256=digest(stage/glb.name),lod=args.lod,localAO=ao,lodBudget=args.lod_tris if args.lod else None,verified=json.loads(verified.stdout))
   report_path=stage/(stem+'.source.json');report_path.write_text(json.dumps(report,indent=2)+'\n')
   if digest(source)!=source_hash: raise RuntimeError('Authoring source changed during export.')
   publish([(p,args.textures.resolve()/p.name) for p in textures.iterdir()]+[(stage/generated.name,generated),(stage/glb.name,glb),(report_path,glb.with_suffix('.source.json'))],source)
  except subprocess.CalledProcessError as error:
   raise RuntimeError(f'Production decoder rejected export before publication:\n{error.stdout}\n{error.stderr}') from error
  finally:
   if digest(source)!=source_hash: raise RuntimeError('Authoring source changed during export.')
 C.log('exported derived bike; source unchanged',report)

def main():
 parser=argparse.ArgumentParser(description=__doc__)
 parser.add_argument('action',choices=('adopt','export'))
 parser.add_argument('--input',type=Path)
 parser.add_argument('--ao-distance',type=float,help='Adoption only: persist local AO radius in metres (0..0.10).')
 parser.add_argument('--ao-samples',type=int,help='Adoption only: local AO samples (default 32).')
 parser.add_argument('--ao-strength',type=float,help='Adoption only: local AO strength (default .8).')
 parser.add_argument('--source',type=Path,default=HERE/'source/bike.blend')
 parser.add_argument('--models',type=Path,default=Path(C.MODELS))
 parser.add_argument('--textures',type=Path,default=Path(C.BAKE_DIR))
 parser.add_argument('--generated',type=Path,default=HERE/'generated')
 parser.add_argument('--lod',action='store_true');parser.add_argument('--lod-tris',type=int,default=6000)
 parser.add_argument('--size',type=int,choices=(256,512,1024,2048));parser.add_argument('--node',default='node')
 args=parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
 if args.action=='export' and any(v is not None for v in (args.ao_distance,args.ao_samples,args.ao_strength)): parser.error('Set AO on an adopted source; export honors saved settings.')
 if args.action=='adopt' and args.ao_distance is None and any(v is not None for v in (args.ao_samples,args.ao_strength)): parser.error('AO adoption options require --ao-distance.')
 if args.action=='adopt' and args.lod: parser.error('Only full authored sources can be adopted.')
 (adopt if args.action=='adopt' else export)(args)

if __name__=='__main__': main()
