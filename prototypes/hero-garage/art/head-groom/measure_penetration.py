import bpy,json,numpy as np,sys
from mathutils.bvhtree import BVHTree
from pathlib import Path
HERE=Path(__file__).resolve().parent;ART=HERE.parent
source=Path(sys.argv[sys.argv.index('--')+1]) if '--' in sys.argv else ART/'street01-head-groom.blend'
bpy.ops.wm.open_mainfile(filepath=str(source))
human=bpy.data.objects['Street01_Authored_EditableBody'];hair=bpy.data.objects['Street01_Bystedt_CurlyGroom'];tree=BVHTree.FromObject(human,bpy.context.evaluated_depsgraph_get());measure=[];crown=[]
cross_section=3 if 'CrossSections' in hair.data.name else 2
for i in range(0,len(hair.data.vertices),cross_section):
 p=sum((hair.data.vertices[i+j].co for j in range(cross_section)),hair.data.vertices[i].co*0)/cross_section;hit,n,index,dist=tree.find_nearest(p);s=(p-hit).dot(n);measure.append(s)
 if p.z>1.66:crown.append(s)
def summary(v):
 a=np.array(v);return {'points':len(v),'buried_count':int((a<-.00005).sum()),'buried_fraction':float((a<-.00005).mean()),'signed_distance_m_percentiles':np.percentile(a,[0,1,5,50,95]).tolist()}
report={'source':str(source),'all':summary(measure),'crown':summary(crown)}
(HERE/('penetration-before.json' if 'attempts' in str(source) else 'penetration-after.json')).write_text(json.dumps(report,indent=2)+'\n');print(report)
