"""Bounded garment-only surface/skin correction. Run from repository root in Blender."""
import bpy,json,sys,hashlib,math
from pathlib import Path
from mathutils import Vector
from mathutils.kdtree import KDTree
R=Path.cwd();P=R/'prototypes/hero-garage';sys.path.insert(0,str(R/'assets/blender'));import common as C
bpy.ops.wm.open_mainfile(filepath=str(R/'assets/blender/source/rider-street.blend'))
pts=[]
for name in ('rider:anatomical sweatshirt','rider:denim'):
 ob=bpy.data.objects[name];pts.extend([(tuple(ob.matrix_world@v.co),name) for v in ob.data.vertices])
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.context.scene.render.fps=30
source=P/'public/assets/street01-rider-posed.glb';bpy.ops.import_scene.gltf(filepath=str(source));ob=bpy.data.objects['rider'];arm=next(o for o in bpy.data.objects if o.type=='ARMATURE')
kd=KDTree(len(pts))
for i,(co,n) in enumerate(pts):kd.insert(co,i)
kd.balance();cloth={}
for v in ob.data.vertices:
 _,i,d=kd.find(v.co)
 if d<.001:cloth[v.index]=pts[i][1]
# Use coincident seam groups: exported UV splits retain separate vertices but identical position/weights.
buckets={}
for i in cloth:
 key=tuple(round(x,5) for x in ob.data.vertices[i].co);buckets.setdefault(key,[]).append(i)
byid={i:k for k,vs in buckets.items() for i in vs};adj={k:set() for k in buckets}
for e in ob.data.edges:
 a,b=e.vertices
 if a in byid and b in byid and byid[a]!=byid[b]:adj[byid[a]].add(byid[b]);adj[byid[b]].add(byid[a])
old={k:ob.data.vertices[ids[0]].co.copy() for k,ids in buckets.items()};changed=0;maxmove=0;neck=0;weightfix=0
for k,ids in buckets.items():
 co=old[k];neighbors=adj[k]
 delta=(sum((old[n] for n in neighbors),Vector())/len(neighbors)-co)*.22 if len(neighbors)>3 else Vector()
 if delta.length>.002:delta=delta.normalized()*.002
 # Taper upper neckline toward anatomical neck; fade by height and transverse position.
 if cloth[ids[0]]=='rider:anatomical sweatshirt' and co.z>1.18 and abs(co.y)<.18:
  f=max(0,min(1,(co.z-1.18)/.10));delta.y-=co.y*.20*f;neck+=len(ids)
 for i in ids:ob.data.vertices[i].co=co+delta
 if delta.length>1e-8:changed+=len(ids);maxmove=max(maxmove,delta.length)
 if len(ids)>1:
  ws={}
  for i in ids:
   for g in ob.data.vertices[i].groups:ws[g.group]=ws.get(g.group,0)+g.weight/len(ids)
  ws=dict(sorted(ws.items(),key=lambda p:-p[1])[:4]);total=sum(ws.values())
  for g in ob.vertex_groups:g.remove(ids)
  for g,w in ws.items():ob.vertex_groups[g].add(ids,w/total,'REPLACE')
  weightfix+=len(ids)
# Preserve authored normals outside garments; smooth garment normals across UV splits.
original=[n.vector.copy() for n in ob.data.corner_normals];ob.data.update();sums={k:Vector() for k in buckets}
for p in ob.data.polygons:
 if all(i in cloth for i in p.vertices):
  for i in p.vertices:sums[byid[i]]+=p.normal*p.area
norms=[]
for li,loop in enumerate(ob.data.loops):
 n=sums.get(byid.get(loop.vertex_index))
 norms.append(n.normalized() if n and n.length>1e-8 else original[li])
ob.data.normals_split_custom_set(norms)
# Keep the first 60 authored samples, then return smoothly and hold neutral.
import build_rider as B
for action in list(bpy.data.actions):
 if action.name not in ('forward_attack','hang_back'):continue
 arm.animation_data.action=action
 if action.slots:arm.animation_data.action_slot=action.slots[0]
 for fc in B.action_fcurves(action,arm):
  values={fr:fc.evaluate(fr) for fr in range(0,60)}
  for fr in range(60,120):
   sample=max(0,99-fr)
   kp=fc.keyframe_points.insert(fr,values[sample]);kp.interpolation='LINEAR'
 action.use_frame_range=True;action.frame_range=(0,119)
 for tr in arm.animation_data.nla_tracks:
  for st in tr.strips:
   if st.action==action:st.action_frame_end=119;st.frame_end=119
arm.animation_data.action=None
bpy.context.scene.frame_set(1)
out=P/'public/assets/street01-rider-cloth.glb';bpy.ops.wm.save_as_mainfile(filepath=str(P/'art/street01-rider-cloth.blend'))
C.export_glb(str(out),list(bpy.context.scene.objects),animations=True,meshopt=False)
r=dict(sourceSHA256=hashlib.sha256(source.read_bytes()).hexdigest(),outputSHA256=hashlib.sha256(out.read_bytes()).hexdigest(),garmentVerticesMatched=len(cloth),surfaceVerticesMoved=changed,maxDisplacementM=maxmove,necklineVerticesTapered=neck,seamVerticesWeightNormalized=weightfix,topologyChanged=False,notes=['Bounded local 2mm Laplacian smoothing plus upper neckline width taper (max20%).','Coincident garment UV seam groups receive identical averaged normalized skin weights.','Garment shading normals smoothed across UV splits; non-garment custom normals retained.','No skeleton edits; forward/rear actions extended to120frames for smooth out-and-back loops. No hair/beard edits. Geometric seated support is unchanged except local 2mm surface smoothing; visual support remains review item.'])
(P/'reports/full-rider-cloth.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r))
