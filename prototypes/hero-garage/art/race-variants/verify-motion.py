"""Finite geometry and degenerate-face measurements on six actual race clips."""
import bpy,json,math,hashlib,sys,argparse
from pathlib import Path
P=Path.cwd()/'prototypes/hero-garage';D=P/'art/race-variants';parser=argparse.ArgumentParser();parser.add_argument('--variant',required=True,choices=['race-bluewhite','race-charcoalyellow']);args=parser.parse_args(sys.argv[sys.argv.index('--')+1:]);src=P/'public/assets/variants'/(args.variant+'.glb');bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(src));arm=next(o for o in bpy.data.objects if o.type=='ARMATURE')
for tr in arm.animation_data.nla_tracks:tr.mute=True
rows=[]
for action in sorted(bpy.data.actions,key=lambda a:a.name):
 arm.animation_data.action=action;arm.animation_data.action_slot=action.slots[0];lo,hi=action.frame_range
 for i in range(9):
  t=lo+(hi-lo)*i/8;bpy.context.scene.frame_set(int(t),subframe=t-int(t));bpy.context.view_layer.update();nonfinite=0;degenerate=0;count=0;maxposition=0
  for ob in [o for o in bpy.data.objects if o.type=='MESH']:
   eo=ob.evaluated_get(bpy.context.evaluated_depsgraph_get());m=eo.to_mesh();m.calc_loop_triangles();v=[eo.matrix_world@x.co for x in m.vertices];count+=len(v);nonfinite+=sum(not all(math.isfinite(c)for c in p)for p in v);degenerate+=sum((v[t.vertices[1]]-v[t.vertices[0]]).cross(v[t.vertices[2]]-v[t.vertices[0]]).length<2e-12 for t in m.loop_triangles);maxposition=max(maxposition,max(p.length for p in v));eo.to_mesh_clear()
  assert nonfinite==0 and maxposition<3
  rows.append({'clip':action.name,'frame':t,'vertices':count,'nonfiniteVertices':nonfinite,'degenerateTriangles':degenerate,'maximumDistanceFromOriginM':maxposition})
assert len(rows)==54;(D/(args.variant+'-motion.json')).write_text(json.dumps({'sourceSHA256':hashlib.sha256(src.read_bytes()).hexdigest(),'samples':rows,'limitations':['Finite/degenerate measurement and separate750-frame socket proof are not whole-body collision proof.','Parent judges recorded motion; preserved source geometry retains original panel faceting.']},indent=2)+'\n');print(args.variant,'54poses','maxDegenerate',max(r['degenerateTriangles']for r in rows))
