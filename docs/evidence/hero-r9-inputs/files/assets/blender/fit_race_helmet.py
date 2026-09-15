"""Fit the existing Race helmet around the shared CC0 anatomical human head.
Scratch outputs only; existing rig/actions/sockets and all non-head mesh signatures frozen.
"""
import argparse,json,math,sys
from pathlib import Path
import bpy
from mathutils import Vector,Matrix
from mathutils.bvhtree import BVHTree
sys.path.insert(0,str(Path(__file__).resolve().parent))
import author_garments as G
import author_hood as H
import rider_asset as P

def main():
 ap=argparse.ArgumentParser();ap.add_argument('--source',type=Path,required=True);ap.add_argument('--head-source',type=Path,required=True);ap.add_argument('--output',type=Path,required=True)
 a=ap.parse_args(sys.argv[sys.argv.index('--')+1:]);root=Path(__file__).resolve().parents[2];out=a.output.resolve()
 if not out.is_relative_to(root/'harness/out/blender/race-head') or out.exists():raise RuntimeError('Fresh race-head scratch output required')
 sourcehash=G.sha(a.source);headhash=G.sha(a.head_source)
 bpy.ops.wm.open_mainfile(filepath=str(a.source.resolve()));arm=bpy.data.objects['rider_rig'];P.clear_pose(arm)
 assert bpy.context.scene['heroOutfit']=='race'
 inv={k:v for k,v in G.invariant_signature().items() if k!='materials'}
 fixed={o.name:H.mesh_signature(o) for o in bpy.data.objects if o.type=='MESH' and o.name not in ('rider:constructed_helmet','rider:skin')}
 existing_objects=set(bpy.data.objects);existing_actions=set(bpy.data.actions)
 names=['rider:human head and neck','rider:human eyebrows','rider:sclera.L','rider:sclera.R','rider:iris.L','rider:iris.R']
 with bpy.data.libraries.load(str(a.head_source.resolve()),link=False) as (src,dst):
  assert all(n in src.objects for n in names);dst.objects=names
 imported=dst.objects
 for ob in imported:
  bpy.context.scene.collection.objects.link(ob);ob.parent=arm
  for mod in ob.modifiers:
   if mod.type=='ARMATURE':mod.object=arm
 for ob in list(bpy.data.objects):
  if ob not in existing_objects and ob not in imported:bpy.data.objects.remove(ob,do_unlink=True)
 for action in list(bpy.data.actions):
  if action not in existing_actions:bpy.data.actions.remove(action)
 # Original skin object is only the primitive neck (28 vertices), replaced by anatomical neck.
 neck=bpy.data.objects['rider:skin'];assert len(neck.data.vertices)==28
 bpy.data.objects.remove(neck,do_unlink=True)
 h=arm.data.bones['head'];up=(h.tail_local-h.head_local).normalized();front=Vector((up.z,0,-up.x));origin=h.head_local
 basis=Matrix(((front.x,0,up.x,origin.x),(0,1,0,origin.y),(front.z,0,up.z,origin.z),(0,0,0,1)))
 original=basis@Matrix.Translation((.01,0,.138))@Matrix.Rotation(-.17,4,'Y')
 # Skull-fit axes differ from the old stylized ellipsoid. New eyeport is centred on
 # the actual 12.3cm eye line, crown carries ~2cm shell/liner allowance, jaw remains enclosed.
 fitted=basis@Matrix.Translation((.018,0,.122))@Matrix.Rotation(-.06,4,'Y')@Matrix.Diagonal((.73,.80,.84,1))
 helmet=bpy.data.objects['rider:constructed_helmet'];parts=json.loads(helmet['author_helmet_parts'])
 before=[]
 for v in helmet.data.vertices:
  before.append(basis.inverted()@v.co);v.co=fitted@(original.inverted()@v.co)
 # Peak is slightly narrower than shell outrigger maximum, preserving its curved construction.
 for part in parts:
  if part['name']=='arched peak':
   for i in range(part['first'],part['first']+part['count']):helmet.data.vertices[i].co.y*=.93
 helmet.data.update();bpy.context.view_layer.update()
 assert fixed=={n:H.mesh_signature(bpy.data.objects[n]) for n in fixed}
 assert inv=={k:v for k,v in G.invariant_signature().items() if k!='materials'}
 P.check_source(arm,[o for o in bpy.data.objects if o.type=='MESH'])
 def bbox(points):return {'min':[min(p[i] for p in points) for i in range(3)],'max':[max(p[i] for p in points) for i in range(3)],'dimensions':[max(p[i] for p in points)-min(p[i] for p in points) for i in range(3)]}
 after=[basis.inverted()@v.co for v in helmet.data.vertices]
 human=bpy.data.objects['rider:human head and neck'];hp=[basis.inverted()@v.co for v in human.data.vertices]
 def tree(ob):return BVHTree.FromPolygons([v.co for v in ob.data.vertices],[list(p.vertices) for p in ob.data.polygons])
 collisions=tree(helmet).overlap(tree(human))
 # Report actual colliding locations, never infer clearance from a screenshot.
 crossing=[]
 for ha,he in collisions:
  p=human.data.polygons[he];c=sum((human.data.vertices[i].co for i in p.vertices),Vector())/len(p.vertices)
  crossing.append(list(basis.inverted()@c))
 clearance={}
 for name,test in [('crown',lambda p:p.z>.21),('jaw',lambda p:0<p.z<.04 and p.x>.06),('temples',lambda p:.08<p.z<.18 and abs(p.y)>.065)]:
  distances=[tree(helmet).find_nearest(v.co)[3] for v,p in zip(human.data.vertices,hp) if test(p)]
  clearance[name]={'sampled_vertices':len(distances),'minimum_surface_distance_m':min(distances),'maximum_surface_distance_m':max(distances)}
 checks=[];maxdrift=0;reference={}
 for action in sorted(existing_actions,key=lambda x:x.name):
  arm.animation_data.action=action;arm.animation_data.action_slot=action.slots[0]
  lo,hi=map(int,action.frame_range)
  for frame in sorted(set([lo,(lo+hi)//2,hi])):
   bpy.context.scene.frame_set(frame);bpy.context.view_layer.update();deps=bpy.context.evaluated_depsgraph_get();pose_inv=(arm.matrix_world@arm.pose.bones['head'].matrix).inverted()
   for ob in [helmet]+[o for o in imported if o!=human]:
    ev=ob.evaluated_get(deps);me=ev.to_mesh();assert all(math.isfinite(c) for v in me.vertices for c in v.co)
    for idx in (0,len(me.vertices)//2,len(me.vertices)-1):
     q=pose_inv@(ev.matrix_world@me.vertices[idx].co);key=(ob.name,idx)
     if key not in reference:reference[key]=q.copy()
     maxdrift=max(maxdrift,(q-reference[key]).length)
    ev.to_mesh_clear()
   evaluated_trees=[]
   for ob in (helmet,human):
    ev=ob.evaluated_get(deps);me=ev.to_mesh();assert all(math.isfinite(c) for v in me.vertices for c in v.co)
    evaluated_trees.append(BVHTree.FromPolygons([ev.matrix_world@v.co for v in me.vertices],[list(p.vertices) for p in me.polygons]));ev.to_mesh_clear()
   posed_crossings=len(evaluated_trees[0].overlap(evaluated_trees[1]))
   checks.append({'action':action.name,'frame':frame,'finite':True,'helmet_head_crossings':posed_crossings})
 assert maxdrift<1e-5
 P.clear_pose(arm)
 out.parent.mkdir(parents=True,exist_ok=True);bpy.ops.wm.save_as_mainfile(filepath=str(out),compress=True)
 report={'source':str(a.source),'source_sha256':sourcehash,'head_source':str(a.head_source),'head_source_sha256':headhash,'output_sha256':G.sha(out),'script_sha256':G.sha(__file__),'old_helmet_head_axes_m':bbox(before),'new_helmet_head_axes_m':bbox(after),'anatomical_chin_to_crown_m':.23344024,'head_above_chin_axes_m':bbox([p for p in hp if p.z>=.0008]),'nonhead_geometry_unchanged':True,'rig_actions_sockets_unchanged':True,'copied_head_objects':[o.name for o in imported],'scalp_hair_omitted':True,'helmet_human_crossing_triangle_pairs':len(collisions),'crossing_centers_head_axes_m':crossing,'sampled_surface_clearance':clearance,'pose_samples':checks,'max_rigid_head_local_drift_m':maxdrift,'triangles':sum(len(p.vertices)-2 for o in bpy.data.objects if o.type=='MESH' for p in o.data.polygons),'topology':G.topology(helmet.data),'visual_verdict':'Parent must judge played clip'}
 out.with_suffix('.json').write_text(json.dumps(report,indent=2));print(json.dumps({k:v for k,v in report.items() if k not in ['pose_samples','crossing_centers_head_axes_m']},indent=2));print('CROSSINGS',crossing[:20])
 assert sourcehash==G.sha(a.source) and headhash==G.sha(a.head_source)
if __name__=='__main__':main()
