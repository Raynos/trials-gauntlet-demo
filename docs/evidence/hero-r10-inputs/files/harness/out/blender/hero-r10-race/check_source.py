import bpy,sys,json
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
sys.path.insert(0,str(Path('assets/blender').resolve()));import rider_asset as P
ROOT=Path('harness/out/blender/hero-r10-race')
def bounds(points):return [max(p[i] for p in points)-min(p[i] for p in points) for i in range(3)]
def inspect(path):
 bpy.ops.wm.open_mainfile(filepath=str(path));a=bpy.data.objects['rider_rig'];P.clear_pose(a);bone=a.data.bones['head'];up=(bone.tail_local-bone.head_local).normalized();f=Vector((up.z,0,-up.x));o=bpy.data.objects['rider:constructed_helmet'];vs=[v.co-bone.head_local for v in o.data.vertices]
 return dict(helmet_head_axes_m=bounds([Vector((p.dot(f),p.y,p.dot(up))) for p in vs]),helmet_bounds_m=bounds([v.co for v in o.data.vertices]))
base=inspect('harness/out/blender/race-head/finished-race/race-assembled-v1.blend');candidate=inspect(ROOT/'race-surface-v2.blend')
assert max(abs(a-b) for a,b in zip(base['helmet_bounds_m'],candidate['helmet_bounds_m']))<1e-6
human=bpy.data.objects['rider:human head and neck'];detail=bpy.data.objects['rider:r10 construction details']
def tree(o):return BVHTree.FromPolygons([v.co for v in o.data.vertices],[list(p.vertices) for p in o.data.polygons])
cross=len(tree(human).overlap(tree(detail)));assert cross==0
r=dict(base=base,candidate=candidate,helmet_outer_extent_unchanged=True,new_details_human_crossings=cross)
(ROOT/'focused-checks.json').write_text(json.dumps(r,indent=2));print(json.dumps(r))
