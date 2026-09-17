"""Actual skinned lace clearance at 54 clip samples. Blender, repository root."""
import bpy,json,struct,hashlib,tempfile,sys,argparse,copy
from pathlib import Path
from mathutils.bvhtree import BVHTree
P=Path.cwd()/'prototypes/hero-garage'
a=argparse.ArgumentParser();a.add_argument('--input',required=True);a.add_argument('--baseline',required=True);a.add_argument('--report',default=str(P/'reports/footwear-lacing-motion.json'));args=a.parse_args(sys.argv[sys.argv.index('--')+1:]);candidate=Path(args.input);baseline=Path(args.baseline)
CLIPS=['sit_cruise','forward_attack','hang_back','compression','extension','landing_absorption'];SOCKETS=['gripSocket.L','gripSocket.R','soleSocket.L','soleSocket.R']
def read(p):
 b=p.read_bytes();n=struct.unpack_from('<I',b,12)[0];return json.loads(b[20:20+n]),b[28+n:]
bj,bb=read(baseline);cj,cb=read(candidate)
# Assembly changes a single node reference and appends its payload. This comparison
# proves every pre-existing non-lace attribute/triangle/weight and clip stays exact.
cn=copy.deepcopy(cj['nodes']);bn=bj['nodes'];laceidx=next(i for i,n in enumerate(cn)if n.get('name')=='rider:cotton_laces')
cn[laceidx]['mesh']=bn[laceidx]['mesh'];assert cn==bn
assert cj['meshes'][:len(bj['meshes'])]==bj['meshes'];assert cb[:len(bb)]==bb
for key in ['animations','skins','scenes','scene']:assert cj.get(key)==bj.get(key),key
assert cj['accessors'][:len(bj['accessors'])]==bj['accessors'];assert cj['bufferViews'][:len(bj['bufferViews'])]==bj['bufferViews']
def import_relevant(path,full):
 j,b=read(path);keep={n['mesh']for n in j['nodes']if 'mesh'in n and (n.get('name') in ['rider:cotton_laces','rider:trainer_upper'] or sum(j['accessors'][p['indices']]['count']//3 for p in j['meshes'][n['mesh']]['primitives'])==8068)}
 for n in j['nodes']:
  if 'mesh'in n and n['mesh']not in keep:del n['mesh'];n.pop('skin',None)
 for m in j['meshes']:
  for p in m['primitives']:p.pop('material',None);p.pop('extensions',None)
 for k in ['materials','images','textures','samplers','extensions','extensionsUsed','extensionsRequired']:j.pop(k,None)
 js=json.dumps(j,separators=(',',':')).encode();js+=b' '*((-len(js))%4);tmp=Path(tempfile.gettempdir())/('lace-motion-'+path.name);tmp.write_bytes(struct.pack('<III',0x46546c67,2,28+len(js)+len(b))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(b),0x004e4942)+b)
 bpy.ops.wm.read_factory_settings(use_empty=True);bpy.context.scene.render.fps=30;bpy.ops.import_scene.gltf(filepath=str(tmp));arm=next(o for o in bpy.data.objects if o.type=='ARMATURE')
 for t in arm.animation_data.nla_tracks:t.mute=True
 return arm

def pose(arm,act,k):
 arm.animation_data.action=act
 if act.slots:arm.animation_data.action_slot=act.slots[0]
 frame=float(act.frame_range[0])+(float(act.frame_range[1])-float(act.frame_range[0]))*k/8;bpy.context.scene.frame_set(int(frame),subframe=frame-int(frame));bpy.context.view_layer.update();return frame

def geometry(obj):
 ev=obj.evaluated_get(bpy.context.evaluated_depsgraph_get());me=ev.to_mesh();me.calc_loop_triangles();verts=[ev.matrix_world@v.co for v in me.vertices];faces=[list(t.vertices)for t in me.loop_triangles];ev.to_mesh_clear();return verts,faces,BVHTree.FromPolygons(verts,faces,all_triangles=True)
basepos={};arm=import_relevant(baseline,False)
for act in bpy.data.actions:
 if act.name not in CLIPS:continue
 for k in range(9):
  pose(arm,act,k);basepos[act.name,k]={n:list(bpy.data.objects[n].matrix_world.translation)for n in SOCKETS}
assert len(basepos)==54,len(basepos)
arm=import_relevant(candidate,True);laces=bpy.data.objects['rider:cotton_laces'];upper=bpy.data.objects['rider:trainer_upper'];denim=next(o for o in bpy.data.objects if o.type=='MESH' and len(o.data.polygons)==8068);rows=[];socketdelta=0
for act in bpy.data.actions:
 if act.name not in CLIPS:continue
 for k in range(9):
  frame=pose(arm,act,k);lv,lf,lt=geometry(laces);uv,uf,ut=geometry(upper);dv,df,dt=geometry(denim)
  # All lace vertices and triangle centroids include the underside of each tube.
  points=lv+[sum((lv[i]for i in f),lv[0]*0)/3 for f in lf];upper_gaps=[];denim_gaps=[];denim_signed=[]
  for v in points:
   hit,n,_,d=ut.find_nearest(v);upper_gaps.append((v-hit).dot(n));hit,n,_,d=dt.find_nearest(v);denim_gaps.append(d);denim_signed.append((v-hit).dot(n))
  up_pairs=lt.overlap(ut);den_pairs=lt.overlap(dt)
  sd=max(abs(bpy.data.objects[n].matrix_world.translation[i]-basepos[act.name,k][n][i])for n in SOCKETS for i in range(3));socketdelta=max(socketdelta,sd)
  rows.append({'clip':act.name,'sample':k,'frame':frame,'minUpperSignedGapM':min(upper_gaps),'maxUpperSignedGapM':max(upper_gaps),'upperNegativeSamples':sum(g<-.00001 for g in upper_gaps),'upperTriangleIntersectionPairs':len(up_pairs),'minDenimDistanceM':min(denim_gaps),'denimNearestNormalSignedMinM':min(denim_signed),'denimTriangleIntersectionPairs':len(den_pairs),'socketDeltaM':sd})
assert len(rows)==54,len(rows)
r={'method':'Actual GLB skin evaluated in Blender for all six retained clips at nine uniform times. Lace vertices and triangle centroids queried against shoe upper and denim BVHs; triangle overlap pairs measured independently. Same 54 baseline socket poses compared.','input':str(candidate),'baseline':str(baseline),'inputSHA256':hashlib.sha256(candidate.read_bytes()).hexdigest(),'baselineSHA256':hashlib.sha256(baseline.read_bytes()).hexdigest(),'allNonLaceGeometryTopologyNormalsUVWeightsExact':True,'allNodesExceptLaceMeshReferenceExact':True,'sixClipsSkinsExact':True,'maxGripSoleSocketDeltaM':socketdelta,'sampledPoses':len(rows),'pointsPerPose':len(points),'summary':{'minUpperSignedGapM':min(r['minUpperSignedGapM']for r in rows),'upperTriangleIntersectionPairsTotal':sum(r['upperTriangleIntersectionPairs']for r in rows),'minDenimDistanceM':min(r['minDenimDistanceM']for r in rows),'denimTriangleIntersectionPairsTotal':sum(r['denimTriangleIntersectionPairs']for r in rows)},'limits':['Discrete 54-pose sampling cannot establish continuous collision freedom between samples.','Nearest-normal signs on open cloth are local surface ordering, not a closed-volume inside/outside test.','Minimum vertex/centroid clearance is sampled, not exact continuous triangle-to-triangle distance; BVH overlap separately tests triangle intersections.','Baseline-prefix proof targets append-only raw assembly; packed/pruned input is intentionally rejected.'],'poses':rows};Path(args.report).write_text(json.dumps(r,indent=2));print(json.dumps({k:v for k,v in r.items()if k!='poses'}))
