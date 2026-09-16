import bpy,json
from collections import defaultdict
from pathlib import Path
ob=bpy.data.objects['GEO-body_male_realistic'];a=ob.data.attributes['.sculpt_face_set'];r=defaultdict(list)
for p in ob.data.polygons:r[a.data[p.index].value].extend(p.vertices)
for key,inds in sorted(r.items()):
 v=[ob.data.vertices[i].co for i in set(inds)];print(key,len(v),'bounds',[[round(min(p[i] for p in v),3),round(max(p[i] for p in v),3)] for i in range(3)])
p=Path('harness/out/blender/mega-outfits/anatomy-v3/male.json');j=json.loads(p.read_text());j['face_sets']=[x.value for x in a.data];p.write_text(json.dumps(j))
