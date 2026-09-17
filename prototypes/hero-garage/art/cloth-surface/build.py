"""Subdue cotton shading; preserve sleeve source geometry, UVs and weights exactly."""
import bpy,json,sys,hashlib
from pathlib import Path
R=Path.cwd();P=R/'prototypes/hero-garage';D=P/'art/cloth-surface';sys.path.insert(0,str(R/'assets/blender'));import common as C
source=P/'art/sleeve-continuity/sleeve-source.blend';sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();sourcehash=sha(source);bpy.ops.wm.open_mainfile(filepath=str(source));cloth=[bpy.data.objects[n]for n in ('rider:anatomical sweatshirt','rider:anatomical sweatshirt pocket','rider:folded hood')]
def signature():
 return hashlib.sha256(repr({o.name:{'positions':[tuple(v.co)for v in o.data.vertices],'polys':[tuple(p.vertices)for p in o.data.polygons],'weights':[[(g.group,g.weight)for g in v.groups]for v in o.data.vertices],'uv':[tuple(x.uv)for x in o.data.uv_layers.active.data]if o.data.uv_layers.active else None}for o in bpy.data.objects if o.type=='MESH'}).encode()).hexdigest()
before=signature();changes=[]
for m in {m for o in cloth for m in o.data.materials}:
 nt=m.node_tree;bs=next(n for n in nt.nodes if n.type=='BSDF_PRINCIPLED');cw=nt.nodes.get('CW_JA')
 if cw:
  for link in list(bs.inputs['Base Color'].links):nt.links.remove(link)
  nt.links.new(cw.outputs[0],bs.inputs['Base Color'])
 for n in nt.nodes:
  if n.type=='BUMP':
   old=[n.inputs['Strength'].default_value,n.inputs['Distance'].default_value];n.inputs['Strength'].default_value=.10;n.inputs['Distance'].default_value=.00005 if 'PHOTO' in n.name else .00010;changes.append({'material':m.name,'node':n.name,'oldStrengthDistance':old,'newStrengthDistance':[n.inputs['Strength'].default_value,n.inputs['Distance'].default_value]})
 bs.inputs['Roughness'].default_value=.88
# Same UV atlas, outward surface only. Restore existing inward shell after bake.
mods=[m for o in cloth for m in o.modifiers if m.type=='SOLIDIFY'];states=[(m.show_viewport,m.show_render)for m in mods]
for m in mods:m.show_viewport=False;m.show_render=False
paths=C.bake_atlas(cloth,2048,str(D/'textures'),'cotton',normal_size=1024,orm_size=1024)
for key in ('albedo','normal','orm'):
 im=bpy.data.images['cotton_'+key];im.filepath_raw=str(D/'textures'/('cotton_'+key+'.png'));im.file_format='PNG';im.save();paths[key]=im.filepath_raw
for m,(v,r) in zip(mods,states):m.show_viewport=v;m.show_render=r
assert signature()==before;bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(D/'cotton-source.blend'))
mat=C.atlas_material('Subdued mustard cotton',paths)
for o in cloth:
 o.data.materials.clear();o.data.materials.append(mat)
 for poly in o.data.polygons:poly.material_index=0
for a in list(bpy.data.actions):bpy.data.actions.remove(a)
out=P/'public/assets/street01-cotton-donor.glb';C.export_glb(str(out),list(bpy.context.scene.objects),animations=True,meshopt=False);assert signature()==before;assert sha(source)==sourcehash
r={'sourceSHA256':sourcehash,'outputSHA256':sha(out),'geometryTopologyUVSkinExactlyPreserved':True,'geometrySignature':before,'changes':changes,'baseColor':'Original CW_JA mustard connected directly; removed macro noise/color mixing','roughness':.88,'allMapsLosslessPNG':True,'textures':paths,'limitations':['Material-only candidate; geometry shadows and actual folds remain. Parent must judge visual change and motion.']};(D/'build-report.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r))
