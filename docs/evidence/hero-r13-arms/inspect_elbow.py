import bpy,sys,json,math
from pathlib import Path
from mathutils import Matrix,Vector
from mathutils.bvhtree import BVHTree
sys.path.insert(0,str(Path('assets/blender').resolve()))
import rider_asset as P
args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
source=Path(args[0]) if args else Path('assets/blender/source/rider-street.blend')
output=Path(args[1]) if len(args)>1 else Path('harness/out/blender/arms-r13/inspection.json')
bpy.ops.wm.open_mainfile(filepath=str(source.resolve()))
arm=bpy.data.objects['rider_rig'];P.clear_pose(arm)
ob=bpy.data.objects['rider:anatomical sweatshirt']
C=Matrix(((1,0,0,0),(0,0,1,0),(0,-1,0,0),(0,0,0,1)))
def matrix(values):return Matrix([values[i::4] for i in range(4)])
ob.data.calc_loop_triangles()
report={'source':str(Path(bpy.data.filepath)), 'mesh':ob.name,'vertices':len(ob.data.vertices),'samples':[]}
for tick in [242,292,316,336]:
 raw=json.loads(Path(f'harness/out/blender/arms-r13/pose-{tick}.json').read_text());T=raw['transforms']
 deform={n:C.inverted()@matrix(t['deform'])@C for n,t in T.items()}
 rest_errors={n:max(abs(a-b) for row1,row2 in zip(C@arm.matrix_world@arm.data.bones[n].matrix_local,matrix(t['rest'])) for a,b in zip(row1,row2)) for n,t in T.items()}
 rows=[]
 for side in ['L','R']:
  ua=arm.data.bones['upperArm.'+side];fa=arm.data.bones['forearm.'+side];joint=fa.head_local
  for v in ob.data.vertices:
   weights={ob.vertex_groups[g.group].name:g.weight for g in v.groups}
   u=weights.get(ua.name,0);f=weights.get(fa.name,0)
   if u+f<.95 or (v.co-joint).length>.12:continue
   blend=Matrix(((0,)*4,)*4)
   for n,w in weights.items():
    if n in deform:blend+=deform[n]*w
   scale=blend.to_3x3().determinant()
   rows.append({'vertex':v.index,'side':side,'distanceJoint':(v.co-joint).length,'upperWeight':u,'foreWeight':f,'volumeRatio':scale,'rest':list(v.co),'posed':list(blend@v.co)})
 ids={r['vertex'] for r in rows}; posed={r['vertex']:Vector(r['posed']) for r in rows}
 tris=[tuple(t.vertices) for t in ob.data.loop_triangles if all(i in ids for i in t.vertices)]
 def crossings(points):
  tree=BVHTree.FromPolygons(points,tris,all_triangles=True,epsilon=0)
  pairs=[]
  for a,b in tree.overlap(tree):
   if a>=b or set(tris[a])&set(tris[b]):continue
   if any((points[i]-points[j]).length<1e-6 for i in tris[a] for j in tris[b]):continue
   pairs.append([a,b])
  return pairs
 original=[v.co.copy() for v in ob.data.vertices]; moved=[posed.get(v.index,v.co.copy()) for v in ob.data.vertices]
 def area(points,t):a,b,c=[points[i] for i in t];return (b-a).cross(c-a).length/2
 ratios=sorted(area(moved,t)/area(original,t) for t in tris if area(original,t)>1e-12)
 geometry={'bandTriangles':len(tris),'restNonadjacentCrossings':len(crossings(original)),'posedNonadjacentCrossings':len(crossings(moved)), 'triangleAreaRatio':{'min':min(ratios),'p05':ratios[int(len(ratios)*.05)],'median':ratios[len(ratios)//2],'p95':ratios[int(len(ratios)*.95)],'max':max(ratios)}}
 report['samples'].append({'tick':tick,'pose':raw['row'],'maxBindMatrixError':max(rest_errors.values()),'geometry':geometry,'elbowVertices':rows})
output.write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps([{'tick':r['tick'],'maxBindMatrixError':r['maxBindMatrixError'],'vertices':len(r['elbowVertices']),'minVolumeRatio':min(v['volumeRatio'] for v in r['elbowVertices']),'geometry':r['geometry'],'mixed':sum(.05<v['foreWeight']<.95 for v in r['elbowVertices'])} for r in report['samples']],indent=2))
