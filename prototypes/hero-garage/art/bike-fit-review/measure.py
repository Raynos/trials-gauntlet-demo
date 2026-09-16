import bpy,json
from pathlib import Path
r=Path.cwd(); bpy.ops.wm.open_mainfile(filepath=str(r/'prototypes/hero-garage/art/street01-bike-materials.blend'))
out={}
for name in ['wheel_front','wheel_rear','wheel_front_spokes','wheel_rear_spokes','frame','bodywork']:
 o=bpy.data.objects[name];v=[o.matrix_world @ x.co for x in o.data.vertices]
 out[name]={'minimumWorldYAfterCatalogOffset':min(x.z for x in v)+.34,'maximumWorldYAfterCatalogOffset':max(x.z for x in v)+.34,'boundsThree':[ [min(x[i] for x in v) for i in [0,2,1]],[max(x[i] for x in v) for i in [0,2,1]]]}
print('MEASURE_RESULT '+json.dumps(out))
