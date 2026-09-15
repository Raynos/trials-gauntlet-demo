import bpy,json
from pathlib import Path
ob=bpy.data.objects['GEO-body_male_realistic']
print('OBJECT',ob.location[:],ob.scale[:],ob.rotation_euler[:])
print('BOUNDS',[(min(v.co[i] for v in ob.data.vertices),max(v.co[i] for v in ob.data.vertices)) for i in range(3)])
print('ATTRIBUTES',[(a.name,a.domain,a.data_type) for a in ob.data.attributes])
print('MOD',[(m.name,m.levels,m.sculpt_levels,m.total_levels) for m in ob.modifiers if m.type=='MULTIRES'])
Path('harness/out/blender/mega-outfits/anatomy-v3/male.json').write_text(json.dumps({'vertices':[list(v.co) for v in ob.data.vertices],'faces':[list(p.vertices) for p in ob.data.polygons]}))
