"""Rebake only authored paint/numberboard regions, preserving decals and all mechanics."""
import bpy,bmesh,sys,json,hashlib
from pathlib import Path
R=Path.cwd();P=R/'prototypes/hero-garage';D=P/'art/bike-variants';sys.path.insert(0,str(R/'assets/blender'));import common as C
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();original=R/'assets/blender/source/bike.blend';accepted=P/'art/bike-exhaust/bike-exhaust-source.blend';hashes={str(p):sha(p) for p in [original,accepted]}
bpy.ops.wm.open_mainfile(filepath=str(original));selection={}
for name in ['bodywork','fork_upper']:
 o=bpy.data.objects[name];selection[name]={p.index:o.data.materials[p.material_index].name for p in o.data.polygons if o.data.materials[p.material_index].name in ['hero_tank_paint','hero_factory_race_field','plate.001']}
bpy.ops.wm.open_mainfile(filepath=str(accepted));obs=[bpy.data.objects[n] for n in selection]
def state():
 return {o.name:{'matrix':[list(r)for r in o.matrix_world],'parent':o.parent.name if o.parent else None,'positions':[list(v.co)for v in o.data.vertices] if o.type=='MESH' else None,'faces':[list(p.vertices)for p in o.data.polygons]if o.type=='MESH' else None,'uvs':[[list(d.uv)for d in uv.data]for uv in o.data.uv_layers]if o.type=='MESH' else None}for o in bpy.context.scene.objects if o.type in ['MESH','EMPTY']}
before=state();names=['hero_tank_paint','hero_factory_race_field','plate.001']
with bpy.data.libraries.load(str(original),link=False)as(src,dst):dst.materials=list(names)
mats=dict(zip(names,dst.materials));changes=[]
for name,mat in mats.items():
 nt=mat.node_tree;bs=nt.nodes.get('BSDF') or next(n for n in nt.nodes if n.type=='BSDF_PRINCIPLED');removed=[]
 # Keep every decal node and its image/projection intact; disable wear/flake generators.
 for node in nt.nodes:
  if node.type=='TEX_NOISE':
   for output in node.outputs:
    for link in list(output.links):
     target=link.to_socket;nt.links.remove(link)
     try:target.default_value=0.0
     except(TypeError,ValueError):target.default_value=(0,0,0,1)
     removed.append(node.name)
  if node.type=='NEW_GEOMETRY':
   for link in list(node.outputs['Pointiness'].links):
    target=link.to_socket;nt.links.remove(link);target.default_value=0.0
 for key,val in [('Roughness',.38 if name=='hero_tank_paint' else .47),('Metallic',.06 if name=='hero_tank_paint' else 0),('Normal',None)]:
  for link in list(bs.inputs[key].links):nt.links.remove(link)
  if val is not None:bs.inputs[key].default_value=val
 bs.inputs['Coat Weight'].default_value=.18 if name=='hero_tank_paint' else .05;bs.inputs['Coat Roughness'].default_value=.3
 changes.append({'material':name,'noiseLinksDisabled':removed,'decalImageNodesRetained':[(n.name,n.image.name if n.image else None)for n in nt.nodes if n.type=='TEX_IMAGE'],'roughness':bs.inputs['Roughness'].default_value,'metallic':bs.inputs['Metallic'].default_value})
# Canonical authored hero Pro palette from author_bike_hero.py + build_bike.py.
pro=dict(PAINT=(.025,.028,.031),FRAME=(.07,.075,.078),PLATE=(1,.69,.015),INK=(.78,.14,.10),LOGO=(1,.69,.015),num_u=2/8,num_v=2/8)
C.apply_colourway(pro,list(mats.values()))
# Blender duplicates per-projection CW nodes with .001/.002 suffixes.
# Canonical apply_colourway only matches unsuffixed names; set all digit cells.
for material in mats.values():
 for node in material.node_tree.nodes:
  key=node.name.split('.')[0]
  if key in ['CW_num_u','CW_num_v']:node.outputs[0].default_value=pro[key[3:]]
pro_image=bpy.data.images['bike_body_pro_albedo'];pro_image.filepath_raw=str(D/'original_pro_body.png');pro_image.file_format='PNG';pro_image.save()
for ob in obs:
 slot={n:len(ob.data.materials)+i for i,n in enumerate(names)}
 for mat in mats.values():ob.data.materials.append(mat)
 for pi,mat in selection[ob.name].items():ob.data.polygons[pi].material_index=slot[mat]
bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(D/'bike-pro-paint-source.blend'),compress=True)
# Bake just the selected original atlas regions, with their exact original UV coordinates.
copies=[]
for ob in obs:
 dup=ob.copy();dup.data=ob.data.copy();bpy.context.collection.objects.link(dup);dup.name='BAKE_'+ob.name
 bm=bmesh.new();bm.from_mesh(dup.data);bm.faces.ensure_lookup_table();bmesh.ops.delete(bm,geom=[p for p in bm.faces if p.index not in selection[ob.name]],context='FACES');bm.to_mesh(dup.data);bm.free()
 used=sorted({p.material_index for p in dup.data.polygons});assigned=[dup.data.materials[i] for i in used];indices=[used.index(p.material_index) for p in dup.data.polygons];dup.data.materials.clear()
 for material in assigned:dup.data.materials.append(material)
 for poly,idx in zip(dup.data.polygons,indices):poly.material_index=idx
 copies.append(dup)
paths=C.bake_atlas(copies,2048,str(D),'paint',normal_size=1024,orm_size=1024,margin=8)
for key in ['albedo','normal','orm']:
 img=bpy.data.images.get('paint_'+key);assert img;dest=D/('paint_'+key+'.png');img.filepath_raw=str(dest);img.file_format='PNG';img.save();paths[key]=str(dest)
mat=C.atlas_material('Clean blue white plastics with original decals',paths)
for ob in obs:
 mi=len(ob.data.materials);ob.data.materials.append(mat)
 for pi in selection[ob.name]:ob.data.polygons[pi].material_index=mi
for ob in copies:bpy.data.objects.remove(ob,do_unlink=True)
assert state()==before,'Geometry hierarchy or UV changed'
assert all(sha(Path(p))==h for p,h in hashes.items())
(D/'bake-report.json').write_text(json.dumps({'sourceHashes':hashes,'canonicalProPalette':pro,'geometryHierarchyUVExact':True,'selectedFaces':{n:len(v)for n,v in selection.items()},'maps':{k:sha(Path(p))for k,p in paths.items()}},indent=2))
