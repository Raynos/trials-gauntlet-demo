"""Measure actual assembled six-clip garment motion; never modifies source assets."""
import bpy,json,struct,tempfile,hashlib,sys,math,os
from pathlib import Path
from mathutils.bvhtree import BVHTree
from mathutils.geometry import intersect_ray_tri
P=Path.cwd()/'prototypes/hero-garage';src=P/'public/assets'/os.environ.get('SLEEVE_STUDY_SOURCE','street01-rider-sleeve-study.glb');raw=src.read_bytes();n=struct.unpack_from('<I',raw,12)[0];j=json.loads(raw[20:20+n]);blob=raw[28+n:];keep={'rider:anatomical sweatshirt','rider:anatomical sweatshirt pocket','rider:folded hood','fitted drawcord -1','fitted drawcord 1','collar eyelet -1','collar eyelet 1'};oldmeshes=j['meshes'];j['meshes']=[]
for node in j['nodes']:
 if 'mesh' not in node:continue
 if node.get('name') not in keep:node.pop('mesh');node.pop('skin',None);continue
 mesh=oldmeshes[node['mesh']];node['mesh']=len(j['meshes']);j['meshes'].append(mesh)
 for pr in mesh['primitives']:pr['material']=0
j['materials']=[{'name':'diagnostic-untextured'}];j.pop('images',None);j.pop('textures',None);j.pop('samplers',None)
js=json.dumps(j,separators=(',',':')).encode();js+=b' '*((-len(js))%4);payload=struct.pack('<III',0x46546c67,2,28+len(js)+len(blob))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(blob),0x004e4942)+blob
with tempfile.NamedTemporaryFile(suffix='.glb') as f:
 f.write(payload);f.flush();bpy.ops.wm.read_factory_settings(use_empty=True);bpy.context.scene.render.fps=30;bpy.ops.import_scene.gltf(filepath=f.name)
arm=next(o for o in bpy.data.objects if o.type=='ARMATURE');shirt=bpy.data.objects['rider:anatomical sweatshirt'];hood=bpy.data.objects['rider:folded hood'];actions=list(bpy.data.actions)
for tr in arm.animation_data.nla_tracks:tr.mute=True

def mesh(o):
 eo=o.evaluated_get(bpy.context.evaluated_depsgraph_get());m=eo.to_mesh();m.calc_loop_triangles();v=[eo.matrix_world@p.co for p in m.vertices];t=[tuple(x.vertices) for x in m.loop_triangles];eo.to_mesh_clear();return v,t

def intersection_count(a,at,b,bt):
 ta=BVHTree.FromPolygons(a,at,all_triangles=True);tb=BVHTree.FromPolygons(b,bt,all_triangles=True);count=0
 for i,j in ta.overlap(tb):
  crossed=False
  for vs,ids,other,oi in ((a,at[i],b,bt[j]),(b,bt[j],a,at[i])):
   for q in range(3):
    p=vs[ids[q]];d=vs[ids[(q+1)%3]]-p
    if d.length_squared<1e-16:continue
    hit=intersect_ray_tri(other[oi[0]],other[oi[1]],other[oi[2]],d,p,True)
    if hit is not None and 1e-6<(hit-p).dot(d)/d.length_squared<1-1e-6:crossed=True;break
   if crossed:break
  count+=crossed
 return count

def sample():
 a,at=mesh(shirt);b,bt=mesh(hood);ta=BVHTree.FromPolygons(a,at,all_triangles=True);tb=BVHTree.FromPolygons(b,bt,all_triangles=True);pairs=ta.overlap(tb);cross=[]
 for i,k in pairs:
  ia,ib=at[i],bt[k];hitpair=False
  for verts,ids,target,other in ((a,ia,b,ib),(b,ib,a,ia)):
   for q in range(3):
    start,end=verts[ids[q]],verts[ids[(q+1)%3]];d=end-start
    if d.length_squared<1e-16:continue
    hit=intersect_ray_tri(target[other[0]],target[other[1]],target[other[2]],d,start,True)
    if hit is not None and 1e-6<(hit-start).dot(d)/d.length_squared<1-1e-6:hitpair=True;break
   if hitpair:break
  if hitpair:cross.append([i,k])
 signed=[];dist=[]
 for p in b:
  hit,n,_,dd=ta.find_nearest(p)
  if hit is not None:signed.append((p-hit).dot(n));dist.append(dd)
 areas=lambda vs,ts:[(vs[t[1]]-vs[t[0]]).cross(vs[t[2]]-vs[t[0]]).length*.5 for t in ts]
 sa,ha=areas(a,at),areas(b,bt)
 cordchecks={}
 for name in ('fitted drawcord -1','fitted drawcord 1','collar eyelet -1','collar eyelet 1'):
  cv,ct=mesh(bpy.data.objects[name]);cordchecks[name]={'shirtTriangleCrossings':intersection_count(a,at,cv,ct),'minimumVertexDistanceM':min(ta.find_nearest(v)[3] for v in cv)}
 elbows={}
 for side in ('L','R'):
  upper=arm.pose.bones['upperArm.'+side];lower=arm.pose.bones['forearm.'+side];origin=lower.head;normal=((upper.tail-upper.head).normalized()+(lower.tail-lower.head).normalized()).normalized();values=[]
  for tri in at:
   ps=[a[i]for i in tri]
   if min((p-origin).length for p in ps)>.11:continue
   ds=[(p-origin).dot(normal)for p in ps]
   for i in range(3):
    k=(i+1)%3
    if ds[i]*ds[k]<0:
     point=ps[i].lerp(ps[k],ds[i]/(ds[i]-ds[k]));radius=(point-origin).length
     if radius<.11:values.append(radius)
  values.sort();elbows[side]={'sectionSamples':len(values),'minimumRadiusM':min(values)if values else None,'medianRadiusM':values[len(values)//2]if values else None,'maximumRadiusM':max(values)if values else None}
 return {'elbowSection':elbows,'cordChecks':cordchecks,'shirtWorldBounds':[[min(v[k] for v in a) for k in range(3)],[max(v[k] for v in a) for k in range(3)]],'shirtTriangles':len(at),'hoodTriangles':len(bt),'broadphasePairs':len(pairs),'actualTriangleCrossings':len(cross),'firstCrossingPairs':cross[:10],'hoodMinimumDistanceM':min(dist),'hoodMinimumSignedDistanceM':min(signed),'hoodVerticesInsideLocalNormal':sum(x< -1e-6 for x in signed),'shirtDegenerateTriangles':sum(x<1e-12 for x in sa),'hoodDegenerateTriangles':sum(x<1e-12 for x in ha),'minimumShirtTriangleArea':min(sa),'minimumHoodTriangleArea':min(ha),'nonfiniteVertices':sum(not all(math.isfinite(c) for c in v) for v in a+b)}
rows=[]
for action in sorted(actions,key=lambda a:a.name):
 arm.animation_data.action=action
 if action.slots:arm.animation_data.action_slot=action.slots[0]
 lo,hi=action.frame_range;samples=[]
 for i in range(9):
  frame=lo+(hi-lo)*i/8;bpy.context.scene.frame_set(int(frame),subframe=frame-int(frame));bpy.context.view_layer.update();r=sample();r['frame']=frame;samples.append(r)
 row={'clip':action.name,'frameRange':[lo,hi],'samples':samples};rows.append(row);print('CLIP',action.name,'crossings',max(s['actualTriangleCrossings'] for s in samples),flush=True)
r={'source':str(src.relative_to(P)),'sourceSHA256':hashlib.sha256(raw).hexdigest(),'sampling':'Nine evenly spaced times including endpoints in each of six actual assembled GLB actions; imported at30fps. NLA tracks muted; one imported action selected at a time.','diagnosticStripping':'Only mesh references outside sweatshirt/pocket/hood and materials/textures removed for import. Accessor bytes, rig, inverse binds and all animation data unchanged.','clips':rows,'limitations':['Triangle edge intersection counts exclude coplanar/tangent/shared-edge special cases; zero counts would not prove no containment.','Signed distance is nearest surface normal side, not watertight signed volume.','No rendered appearance/normal-map/seam-color judgment here. Source topology verifier separately covers closed boundary loops; this motion audit measures triangles and proximity.']};(P/'art/sleeve-continuity'/os.environ.get('SLEEVE_STUDY_REPORT','motion-report.json')).write_text(json.dumps(r,indent=2)+'\n');print('REPORT COMPLETE')
