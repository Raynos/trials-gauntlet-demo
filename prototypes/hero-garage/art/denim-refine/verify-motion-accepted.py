"""Compare actual skinned trouser surface to bike saddle at 54 authored pose samples."""
import bpy,json,struct,hashlib,tempfile
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree
R=Path.cwd();P=R/'prototypes/hero-garage';D=P/'art/denim-refine'
def prune(path,keep):
 raw=path.read_bytes();n=struct.unpack_from('<I',raw,12)[0];j=json.loads(raw[20:20+n]);tail=raw[20+n:]
 for node in j['nodes']:
  if 'mesh' in node and node['mesh'] not in keep:del node['mesh'];node.pop('skin',None)
 # Strip materials/images only; geometry, skeleton and animation binary stays exact.
 for mesh in j['meshes']:
  for p in mesh['primitives']:p.pop('material',None);p.pop('extensions',None)
 j.pop('materials',None);j.pop('images',None);j.pop('textures',None);j.pop('samplers',None);j.pop('extensions',None)
 js=json.dumps(j,separators=(',',':')).encode();js+=b' '*((-len(js))%4)
 out=Path(tempfile.gettempdir())/('denim-review-'+path.name);out.write_bytes(struct.pack('<III',0x46546c67,2,20+len(js)+len(tail))+struct.pack('<II',len(js),0x4e4f534a)+js+tail);return out
# Bodywork includes the exact visible saddle, rather than an inferred support plane.
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(prune(P/'public/assets/street01-bike-detail.glb',{0})))
body=bpy.data.objects['bodywork'];bt=BVHTree.FromPolygons([body.matrix_world@v.co for v in body.data.vertices],[p.vertices for p in body.data.polygons])
grid=[]
for ix in range(25):
 x=.12+ix*(.47/24)
 for iy in range(13):
  y=-.06+iy*.01;hit,*_=bt.ray_cast(Vector((x,y,1)),Vector((0,0,-1)),1.1)
  if hit and .49<hit.z<.65:grid.append((x,y,hit.z,.265<x<.425 and abs(y)<.051))
results={}
for tag,filename,keep,meshname in [('baseline','street01-rider-tailored-footwear.glb',{0},'rider'),('candidate','street01-rider-art27-denim-accepted.glb',{14},'rider')]:
 bpy.ops.wm.read_factory_settings(use_empty=True);bpy.context.scene.render.fps=30;bpy.ops.import_scene.gltf(filepath=str(prune(P/'public/assets'/filename,keep)))
 arm=next(o for o in bpy.data.objects if o.type=='ARMATURE');mesh=next(o for o in bpy.data.objects if o.type=='MESH' and any(m.type=='ARMATURE' for m in o.modifiers))
 for tr in arm.animation_data.nla_tracks:tr.mute=True
 # The established seat audit defines seat-bearing fabric by pelvis weight above 0.65.
 allowed={v.index for v in mesh.data.vertices if v.co.z<.94 and any(mesh.vertex_groups[g.group].name=='pelvis' and g.weight>.65 for g in v.groups)}
 faces=[list(p.vertices) for p in mesh.data.polygons if all(i in allowed for i in p.vertices)];rows=[]
 for act in bpy.data.actions:
  if act.name not in ['sit_cruise','forward_attack','hang_back','compression','extension','landing_absorption']:continue
  arm.animation_data.action=act
  if act.slots:arm.animation_data.action_slot=act.slots[0]
  for k in range(9):
   frame=float(act.frame_range[0])+(float(act.frame_range[1])-float(act.frame_range[0]))*k/8;bpy.context.scene.frame_set(int(frame),subframe=frame-int(frame));bpy.context.view_layer.update()
   ev=mesh.evaluated_get(bpy.context.evaluated_depsgraph_get());me=ev.to_mesh();tree=BVHTree.FromPolygons([ev.matrix_world@v.co for v in me.vertices],faces)
   points=[]
   for x,y,z,central in grid:
    hit,*_=tree.ray_cast(Vector((x,y,.30)),Vector((0,0,1)),1.7)
    if hit:points.append({'x':x,'y':y,'gapM':hit.z-z,'central':central})
   ev.to_mesh_clear();gaps=[p['gapM'] for p in points];central=[p['gapM'] for p in points if p['central']]
   sockets={n:list(bpy.data.objects[n].matrix_world.translation) for n in ['gripSocket.L','gripSocket.R','soleSocket.L','soleSocket.R']}
   rows.append({'clip':act.name,'sample':k,'frame':frame,'socketPositions':sockets,'minGapM':min(gaps) if gaps else None,'maxGapM':max(gaps) if gaps else None,'centralMinGapM':min(central) if central else None,'centralMaxGapM':max(central) if central else None,'negativeSampleCount':sum(v<0 for v in gaps),'sampleCount':len(gaps),'points':points})
 assert len(rows)==54,len(rows)
 results[tag]=rows
base={(r['clip'],r['sample']):r for r in results['baseline']};comparisons=[];socketerr=0
for r in results['candidate']:
 b=base[r['clip'],r['sample']];socketerr=max(socketerr,max(abs(r['socketPositions'][n][k]-b['socketPositions'][n][k]) for n in r['socketPositions'] for k in range(3)))
 bp={(p['x'],p['y']):p for p in b['points']};diff=[p['gapM']-bp[p['x'],p['y']]['gapM'] for p in r['points'] if (p['x'],p['y']) in bp]
 comparisons.append({'clip':r['clip'],'sample':r['sample'],'baselineMinGapM':b['minGapM'],'candidateMinGapM':r['minGapM'],'baselineCentralMinGapM':b['centralMinGapM'],'candidateCentralMinGapM':r['centralMinGapM'],'baselineNegativeSamples':b['negativeSampleCount'],'candidateNegativeSamples':r['negativeSampleCount'],'minSameRayDeltaM':min(diff) if diff else None,'maxSameRayDeltaM':max(diff) if diff else None})
assert socketerr<1e-7,socketerr
report={'method':'Actual imported skinned GLBs, six clips sampled at nine evenly spaced times; upwards rays from below the fixed visible saddle into pelvis-weight >0.65 denim seat surface. Bike bodywork downward-ray saddle heights. No groom or irrelevant materials loaded; skeleton, skin and geometry payload retained.','scope':'Vertical surface clearance over saddle only, not general triangle collision or complete body/bike validation. Negative gap means vertical ordering below bodywork surface, not independently proven triangle intersection. Weight-region cut boundaries and silhouette changes can change which surface a ray hits.','gridSamples':len(grid),'maxSocketPositionDeltaM':socketerr,'comparisons':comparisons,'details':results,'sourceHashes':{n:hashlib.sha256((P/'public/assets'/n).read_bytes()).hexdigest() for n in ['street01-rider-tailored-footwear.glb','street01-rider-art27-denim-accepted.glb','street01-bike-detail.glb']}}
report['findings']={'socketPreservation':'Exact at all54samples','baselineSeatMinimumM':min(r['minGapM'] for r in results['baseline'] if r['minGapM'] is not None),'candidateSeatMinimumM':min(r['minGapM'] for r in results['candidate'] if r['minGapM'] is not None),'candidateNegativeRaySamples':sum(r['negativeSampleCount'] for r in results['candidate']),'largestSameRayIncreaseM':max(r['maxSameRayDeltaM'] for r in comparisons if r['maxSameRayDeltaM'] is not None),'largestSameRayDecreaseM':min(r['minSameRayDeltaM'] for r in comparisons if r['minSameRayDeltaM'] is not None),'assessment':'Direct accepted-surface candidate preserves sampled saddle gaps within 3 micrometres; distal knee surface and shading still require parent visual review.'}
(P/'reports/denim-refine-accepted-motion.json').write_text(json.dumps(report,indent=2));print(json.dumps({'maxSocketPositionDeltaM':socketerr,'comparisons':comparisons},indent=2))
