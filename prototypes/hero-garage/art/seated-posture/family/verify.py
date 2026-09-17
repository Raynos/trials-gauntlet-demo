import bpy,json,struct,tempfile,hashlib
from pathlib import Path
from mathutils import Vector
P=Path.cwd()/'prototypes/hero-garage';D=P/'art/seated-posture/family'
# Compare actual exported animation, hierarchy, sockets and full protected bone matrices.
def sample(path):
 data=path.read_bytes();n=struct.unpack_from('<I',data,12)[0];j=json.loads(data[20:20+n]);blob=data[28+n:]
 for node in j['nodes']:node.pop('mesh',None);node.pop('skin',None)
 for k in ['meshes','materials','textures','images','samplers']:j.pop(k,None)
 js=json.dumps(j,separators=(',',':')).encode();js+=b' '*((-len(js))%4);raw=struct.pack('<III',0x46546c67,2,28+len(js)+len(blob))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(blob),0x004e4942)+blob
 with tempfile.NamedTemporaryFile(suffix='.glb') as f:
  f.write(raw);f.flush();bpy.ops.wm.read_factory_settings(use_empty=True);bpy.context.scene.render.fps=30;bpy.ops.import_scene.gltf(filepath=f.name)
 arm=next(o for o in bpy.data.objects if o.type=='ARMATURE');result={}
 for tr in arm.animation_data.nla_tracks:tr.mute=True
 for act in bpy.data.actions:
  arm.animation_data.action=act;arm.animation_data.action_slot=act.slots[0];rows=[]
  for frame in range(int(act.frame_range[0]),int(act.frame_range[1])+1):
   bpy.context.scene.frame_set(frame);bpy.context.view_layer.update();bones={pb.name:[list(row) for row in arm.matrix_world@pb.matrix] for pb in arm.pose.bones};sockets={n:list(bpy.data.objects[n].matrix_world.translation) for n in ['gripSocket.L','gripSocket.R','soleSocket.L','soleSocket.R']};rows.append({'frame':frame,'bones':bones,'sockets':sockets})
  result[act.name]=rows
 return result
import argparse,sys
parser=argparse.ArgumentParser();parser.add_argument('--base',required=True);parser.add_argument('--candidate',required=True);args=parser.parse_args(sys.argv[sys.argv.index('--')+1:]);base=sample(Path(args.base));new=sample(Path(args.candidate));build=json.loads((D/'build-report.json').read_text());protected=['pelvis','hand.L','hand.R','thigh.L','shin.L','foot.L','thigh.R','shin.R','foot.R']
def delta(a,b,names):return max(abs(a['bones'][n][r][c]-b['bones'][n][r][c]) for n in names for r in range(4) for c in range(4))
rows=[];initial=new['sit_cruise'][0]
for name,frames in new.items():
 info=build['family'][name];matrix_error=max(delta(base[name][i],frame,protected) for i,frame in enumerate(frames));socket_error=max((Vector(base[name][i]['sockets'][n])-Vector(frame['sockets'][n])).length for i,frame in enumerate(frames) for n in frame['sockets']);zero=[i for i,o in enumerate(info['offsetDegreesByFrame']) if o==0];target_error=max((delta(base[name][i],frames[i],frames[i]['bones']) for i in zero),default=0);start_error=delta(initial,frames[0],initial['bones']);end_error=delta(initial,frames[-1],initial['bones']) if info['returnsToNeutral'] else None
 assert matrix_error<1e-5 and socket_error<1e-5 and target_error<1e-5 and start_error<1e-5,(name,matrix_error,socket_error,target_error,start_error)
 if end_error is not None:assert end_error<1e-5,(name,end_error)
 rows.append({'clip':name,'framesVerified':len(frames),'maxProtectedWorldMatrixDifference':matrix_error,'maxGripSoleWorldDisplacementM':socket_error,'unchangedTargetFramesVerified':len(zero),'maxUnchangedTargetMatrixDifference':target_error,'initialSharedNeutralMatrixDifference':start_error,'endingSharedNeutralMatrixDifference':end_error})
r={'source':args.base,'candidate':args.candidate,'totalFramesVerified':sum(x['framesVerified'] for x in rows),'protectedWorldMatrices':protected,'clips':rows,'method':'Actual source/candidate exported GLB animations imported at30fps. All750frames checked for hand/sole/pelvis and lowerbody world matrix preservation, every zero-offset target frame checked across all bones, all six initial poses agree, only measured neutral-ending clips return to sharedneutral.','limitations':['No collision simulation.','Parent visual acceptance remains required.']};(D/'verification.json').write_text(json.dumps(r,indent=2));print(json.dumps(r))
