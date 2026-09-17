"""Existing authored knit material regions only; immutable geometry and source."""
import bpy,json,sys,hashlib
import numpy as np
from pathlib import Path
R=Path.cwd();P=R/'prototypes/hero-garage';D=P/'art/cloth-rib-finish';sys.path.insert(0,str(R/'assets/blender'));import common as C
source=P/'art/garment-hem/hem-fitted-source.blend';sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();sourcehash=sha(source);bpy.ops.wm.open_mainfile(filepath=str(source));cloth=[bpy.data.objects[n] for n in ['rider:anatomical sweatshirt','rider:anatomical sweatshirt pocket','rider:folded hood']]
def signature():return hashlib.sha256(repr({o.name:{'positions':[tuple(v.co)for v in o.data.vertices],'faces':[tuple(p.vertices)for p in o.data.polygons],'weights':[[(g.group,g.weight)for g in v.groups]for v in o.data.vertices],'uv':[tuple(x.uv)for x in o.data.uv_layers.active.data]if o.data.uv_layers.active else None}for o in bpy.data.objects if o.type=='MESH'}).encode()).hexdigest()
before=signature();selected={o.name:[p.index for p in o.data.polygons if o.data.materials[p.material_index].name=='hero knitted rib']for o in cloth};assert sum(map(len,selected.values()))==1032
paths={k:str(P/'art/cloth-surface/textures'/('cotton_'+k+'.png')) for k in ['albedo','normal','orm']};ribpaths=paths.copy()
for key in ['albedo','orm']:
 original=bpy.data.images.load(paths[key],check_existing=False);original.colorspace_settings.name='sRGB' if key=='albedo' else 'Non-Color';pixels=np.array(original.pixels[:],dtype=np.float32)
 if key=='albedo':
  for channel,factor in enumerate([.74,.72,.70]):pixels[channel::4]*=factor
 else:pixels[1::4]=.93
 target=bpy.data.images.new('rib_'+key,width=original.size[0],height=original.size[1],alpha=True);target.colorspace_settings.name=original.colorspace_settings.name;target.pixels.foreach_set(pixels);target.filepath_raw=str(D/('rib_'+key+'.png'));target.file_format='PNG';target.save();ribpaths[key]=target.filepath_raw
plain=C.atlas_material('Existing subdued mustard cotton',paths);rib=C.atlas_material('Darker gathered mustard knit',ribpaths)
for o in cloth:
 o.data.materials.clear();o.data.materials.append(plain);o.data.materials.append(rib);ids=set(selected[o.name])
 for poly in o.data.polygons:poly.material_index=1 if poly.index in ids else 0
assert signature()==before
bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(D/'cloth-rib-source.blend'),compress=True)
for a in list(bpy.data.actions):bpy.data.actions.remove(a)
out=P/'public/assets/street01-cloth-rib-donor.glb';C.export_glb(str(out),list(bpy.context.scene.objects),animations=True,meshopt=False);assert signature()==before;assert sha(source)==sourcehash
r={'sourceSHA256':sourcehash,'sourceUnchanged':True,'outputSHA256':sha(out),'bytes':out.stat().st_size,'geometryTopologyUVSkinSignature':before,'geometryTopologyUVSkinExactlyPreserved':True,'originalRibRegions':{n:len(ids)for n,ids in selected.items()},'linearAlbedoMultiply':[.74,.72,.70],'ribRoughness':.93,'normal':'Original accepted fine cotton/rib normal map unchanged; no added macro noise or displacement.','limits':['Parent full and cuff/hem closeup acceptance required.','Includes existing pocket piping rib region; no spatially invented bands.']};(D/'build-report.json').write_text(json.dumps(r,indent=2));print(json.dumps(r))
