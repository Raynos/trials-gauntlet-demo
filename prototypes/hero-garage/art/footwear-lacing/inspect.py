import bpy,json
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
P=Path.cwd()/'prototypes/hero-garage';bpy.ops.wm.open_mainfile(filepath=str(P/'art/footwear-finish/footwear-refined-source.blend'));arm=next(o for o in bpy.data.objects if o.type=='ARMATURE');o=bpy.data.objects['rider:trainer_upper'];shoe=BVHTree.FromPolygons([v.co for v in o.data.vertices],[list(p.vertices)for p in o.data.polygons]);ankles={s:arm.data.bones['foot.'+s].head_local.copy()for s in ['L','R']}
with bpy.data.libraries.load(str(P/'art/denim-finish/denim-finish-source.blend'),link=False)as(src,dst):dst.objects=['rider']
denim=dst.objects[0];dt=BVHTree.FromPolygons([v.co for v in denim.data.vertices],[list(p.vertices)for p in denim.data.polygons if max(denim.data.vertices[i].co.z for i in p.vertices)<max(a.z for a in ankles.values())+.07]);rows=[]
for s,a in ankles.items():
 for x in [.02,.04,.05,.06,.07,.08,.09,.10,.11,.12,.13,.14]:
  blocked=[];heights=[]
  for y in [-.021,0,.021]:
   origin=a+Vector((x,y,.25));sh,*_=shoe.ray_cast(origin,Vector((0,0,-1)),.5);dh,*_=dt.ray_cast(origin,Vector((0,0,-1)),.5);blocked.append(bool(dh and sh and dh.z>sh.z));heights.append(float(sh.z-a.z)if sh else None)
  rows.append({'side':s,'xFromAnkle':x,'denimOccludesAtSidesAndCenter':blocked,'shoeTopZFromAnkle':heights})
(P/'reports/footwear-lacing-zone.json').write_text(json.dumps({'method':'Rest-space vertical rays into exact accepted upper and dark-denim cuff faces entirely below ankle Z +70mm, excluding overhanging thigh; final posed camera visibility still parent-owned','samples':rows},indent=2));print(json.dumps(rows))
