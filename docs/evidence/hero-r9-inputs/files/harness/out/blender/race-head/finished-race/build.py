"""One Race jersey candidate from accepted same-rig anatomical Street shell.
Only upper garment geometry/materials change; headgear, lower body and hands are frozen.
"""
import bpy,bmesh,json,math,sys
from pathlib import Path
from mathutils import Vector
sys.path.insert(0,str(Path('assets/blender').resolve()))
import common as C
import author_garments as G
import author_hood as H
import author_rider_hero as R
import rider_asset as P
ROOT=Path('harness/out/blender/race-head/finished-race')
SOURCE=Path('harness/out/blender/race-head/race-head-v1c.blend')
TOP=Path('harness/out/blender/street-head/finished-street/street-assembled-v3.blend')
OUT=ROOT/'race-assembled-v1.blend';assert not OUT.exists()
source_hash=G.sha(SOURCE);top_hash=G.sha(TOP)
bpy.ops.wm.open_mainfile(filepath=str(SOURCE));arm=bpy.data.objects['rider_rig'];P.clear_pose(arm)
sig={k:v for k,v in G.invariant_signature().items() if k!='materials'}
changed={'rider:upper-garment','rider:hero garment construction','rider:armour'}
fixed={o.name:H.mesh_signature(o) for o in bpy.data.objects if o.type=='MESH' and o.name not in changed}
original_materials={r[0]:r for r in G.invariant_signature()['materials']}
existing_objects=set(bpy.data.objects);existing_actions=set(bpy.data.actions)
with bpy.data.libraries.load(str(TOP.resolve()),link=False) as (src,dst):dst.objects=['rider:anatomical sweatshirt']
top=dst.objects[0];bpy.context.scene.collection.objects.link(top);top.parent=arm
for mod in top.modifiers:
 if mod.type=='ARMATURE':mod.object=arm
for ob in list(bpy.data.objects):
 if ob not in existing_objects and ob!=top:bpy.data.objects.remove(ob,do_unlink=True)
for action in list(bpy.data.actions):
 if action not in existing_actions:bpy.data.actions.remove(action)
for name in changed:bpy.data.objects.remove(bpy.data.objects[name],do_unlink=True)
top.name='rider:anatomical race jersey'
H0=arm.data.bones['pelvis'].head_local;t=(arm.data.bones['pelvis'].tail_local-H0).normalized();front=Vector((t.z,0,-t.x))
def smooth(x):x=max(0,min(1,x));return x*x*(3-2*x)
before=[];after=[]
for v in top.data.vertices:
 co=v.co.copy();w=R.weights(top,v);side='L' if co.y<0 else 'R';uw=w.get('upperArm.'+side,0);fw=w.get('forearm.'+side,0)
 if uw+fw>.08:
  upper=uw>=fw;b=arm.data.bones[('upperArm.' if upper else 'forearm.')+side];axis=(b.tail_local-b.head_local).normalized();u=(co-b.head_local).dot(axis);center=b.head_local+axis*u;radial=co-center;radius=radial.length
  if -.065<u<b.length+.01:
   cap=(.063-.010*smooth((u-.01)/.28)) if upper else (.049-.009*smooth(u/b.length))
   if radius>cap:v.co-=radial.normalized()*(radius-cap)*.85*smooth(max(uw,fw)/.58)
   if upper and uw>.8:before.append(radius);after.append((v.co-center).length)
 else:
  u=(co-H0).dot(t)
  # Jersey follows torso rather than heavyweight sweatshirt volume. No new periodic folds.
  if .035<u<.45:
   center=H0+t*u;radial=co-center;v.co-=radial*.045*math.sin(math.pi*(u-.035)/.415)**2

top.data.update()
colourways=json.loads(bpy.context.scene['heroColourways'])
for cls,cw in colourways.items():
 cw['RACE_JERSEY_MAIN']=cw['JB'] if cls=='rookie' else cw['JA']
 cw['RACE_JERSEY_PANEL']=cw['JA'] if cls=='rookie' else cw['JB']
bpy.context.scene['heroColourways']=json.dumps(colourways)

def textile(name,key=None,color=(.018,.022,.031),rough=.76):
 m=C.new_mat(name,(*color,1),rough=rough)
 if key:C.link(m,C.cw_rgb(m,key),C.bsdf(m).inputs['Base Color'])
 # Defined 0.5mm knit spacing, 0.03mm bump distance. Micro-normal only, no fake print.
 tc=C.texcoord(m);xyz=C.node(m,'ShaderNodeSeparateXYZ');C.link(m,tc.outputs['Object'],xyz.inputs[0])
 a=C.math_node(m,'SINE',C.math_node(m,'MULTIPLY',xyz.outputs['X'],math.tau/.0005))
 b=C.math_node(m,'SINE',C.math_node(m,'MULTIPLY',xyz.outputs['Z'],math.tau/.0005))
 h=C.math_node(m,'MULTIPLY',a,b);C.bump(m,h,strength=.12,distance=.00003)
 m['fabric_contract']='0.5mm structural knit;0.03mm normal distance;flat class albedo;no noise/dirt'
 return m
mats=[textile('race jersey main','RACE_JERSEY_MAIN'),textile('race jersey contrast','RACE_JERSEY_PANEL'),textile('race jersey stretch gusset',rough=.85),textile('race jersey collar cuff',rough=.80)]
top.data.materials.clear()
for m in mats:top.data.materials.append(m)
counts=[0]*4
for p in top.data.polygons:
 c=p.center;side='L' if c.y<0 else 'R';ws={}
 for idx in p.vertices:
  for k,v in R.weights(top,top.data.vertices[idx]).items():ws[k]=ws.get(k,0)+v/len(p.vertices)
 uw=ws.get('upperArm.'+side,0);fw=ws.get('forearm.'+side,0);u=(c-H0).dot(t);idx=0
 if uw+fw>.20:
  wrist=arm.data.bones['hand.'+side].head_local
  if (c-wrist).length<.063:idx=3
  elif fw>uw:
   # Broad forearm colour panel, dark inside elbow rather than padded rings.
   idx=1 if p.normal.dot(front)>-.25 else 2
  elif p.normal.dot(front)<-.45:idx=2
 else:
  across=abs(c.y)
  if across>.125 and .03<u<.31:idx=2
  elif .089+u*.055<across<.125+u*.045 and .035<u<.36:idx=1
  if u<.027 or (c-arm.data.bones['head'].head_local).length<.083:idx=3
 p.material_index=idx;counts[idx]+=1
# Discard unused imported Street materials so large packed cotton images do not enter source.
for m in list(bpy.data.materials):
 if m.users==0 and m.name not in original_materials:bpy.data.materials.remove(m)
assert fixed=={n:H.mesh_signature(bpy.data.objects[n]) for n in fixed}
assert sig=={k:v for k,v in G.invariant_signature().items() if k!='materials'}
assert original_materials=={r[0]:r for r in G.invariant_signature()['materials'] if r[0] in original_materials}
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH'];P.check_source(arm,meshes)
checks=[]
for action in sorted(existing_actions,key=lambda a:a.name):
 arm.animation_data.action=action;arm.animation_data.action_slot=action.slots[0]
 lo,hi=map(int,action.frame_range)
 for frame in sorted(set((lo,(lo+hi)//2,hi))):
  bpy.context.scene.frame_set(frame);ev=top.evaluated_get(bpy.context.evaluated_depsgraph_get());me=ev.to_mesh();assert all(math.isfinite(x) for v in me.vertices for x in v.co);ev.to_mesh_clear();checks.append({'action':action.name,'frame':frame,'finite':True})
P.clear_pose(arm);C.apply_colourway(colourways['rookie'])
bpy.context.scene['heroLocalAO']=json.dumps(dict(distance=.025,samples=32,strength=.8))
assert fixed=={n:H.mesh_signature(bpy.data.objects[n]) for n in fixed}
assert sig=={k:v for k,v in G.invariant_signature().items() if k!='materials'}
checks_top=G.topology(top.data);assert checks_top['degenerate_faces']==0 and checks_top['nonmanifold_interior_edges']==0
bpy.ops.wm.save_as_mainfile(filepath=str(OUT),compress=True)
assert source_hash==G.sha(SOURCE) and top_hash==G.sha(TOP)
report={'source':str(SOURCE),'source_sha256':source_hash,'anatomical_top_source':str(TOP),'anatomical_top_source_sha256':top_hash,'output_sha256':G.sha(OUT),'script_sha256':G.sha(__file__),'nonupper_meshes_unchanged':list(fixed),'rig_actions_sockets_unchanged':True,'original_material_graphs_unchanged_before_class_application':True,'removed_upper_objects':list(changed),'street_hood_pouch_details_not_imported':True,'upperarm_radius_before_max_m':max(before),'upperarm_radius_after_max_m':max(after),'jersey_topology':checks_top,'panel_polygon_counts':dict(zip([m.name for m in mats],counts)),'heroLocalAO':json.loads(bpy.context.scene['heroLocalAO']),'pose_checks':checks,'triangles':sum(len(p.vertices)-2 for o in meshes for p in o.data.polygons),'visual_verdict':'Parent plays and judges'}
OUT.with_suffix('.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
