"""Ten-degree settled seated study; existing IK, unchanged lower body and hands."""
import bpy,sys,json,struct,copy,hashlib,tempfile,math
from pathlib import Path
from mathutils import Vector,Matrix
R=Path.cwd();P=R/'prototypes/hero-garage';D=P/'art/seated-posture/family';sys.path.insert(0,str(R/'assets/blender'));import common as C;import build_rider as B
import argparse
parser=argparse.ArgumentParser();parser.add_argument('--base',required=True);parser.add_argument('--out',required=True);args=parser.parse_args(sys.argv[sys.argv.index('--')+1:]);base=Path(args.base);data=base.read_bytes();n=struct.unpack_from('<I',data,12)[0];original=json.loads(data[20:20+n]);basebin=data[28+n:];doc=copy.deepcopy(original)
for node in doc['nodes']:node.pop('mesh',None);node.pop('skin',None)
for key in ['meshes','materials','images','textures','samplers']:doc.pop(key,None)
def write(path,j,blob):
 js=json.dumps(j,separators=(',',':')).encode();js+=b' '*((-len(js))%4);blob=bytes(blob)+b'\0'*((-len(blob))%4);path.write_bytes(struct.pack('<III',0x46546c67,2,28+len(js)+len(blob))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(blob),0x004e4942)+blob)
with tempfile.TemporaryDirectory() as td:
 p=Path(td)/'rig.glb';write(p,doc,basebin);bpy.ops.wm.read_factory_settings(use_empty=True);bpy.context.scene.render.fps=30;bpy.ops.import_scene.gltf(filepath=str(p))
arm=next(o for o in bpy.data.objects if o.type=='ARMATURE')
for tr in arm.animation_data.nla_tracks:tr.mute=True
oldactions=list(bpy.data.actions)
def activate(action,frame):
 arm.animation_data.action=action;arm.animation_data.action_slot=action.slots[0];bpy.context.scene.frame_set(frame);bpy.context.view_layer.update()
 return {pb.name:pb.matrix.copy() for pb in arm.pose.bones}
neutral=activate(bpy.data.actions['sit_cruise'],0)
def difference(a,b):return max(abs(a[n][r][c]-b[n][r][c]) for n in a for r in range(4) for c in range(4))
family={};family_report={}
for old in oldactions:
 lo,hi=map(int,old.frame_range);start=activate(old,lo);end=activate(old,hi);initial_delta=difference(start,neutral);end_delta=difference(end,neutral);assert initial_delta<1e-4,(old.name,initial_delta);cyclic=end_delta<1e-4;targets=[];offsets=[]
 for frame in range(lo,hi+1):
  mat=activate(old,frame);pivot=arm.pose.bones['pelvis'].tail.copy()
  smooth=lambda t:max(0,min(1,t))**2*(3-2*max(0,min(1,t)))
  blend=1 if old.name=='sit_cruise' else max(1-smooth((frame-lo)/15),1-smooth((hi-frame)/15) if cyclic else 0)
  angle=10*blend;offsets.append(angle);rot=Matrix.Rotation(math.radians(angle),4,'Y');xf=Matrix.Translation(pivot)@rot@Matrix.Translation(-pivot);new={k:v.copy() for k,v in mat.items()}
  if blend>0:
   for name in ['spine','chest','neck','head','shoulder.L','shoulder.R']:new[name]=xf@mat[name]
   for side,sg in [('L',-1),('R',1)]:
    ua='upperArm.'+side;fa='forearm.'+side;sh=xf@mat[ua].translation;wr=mat['hand.'+side].translation
    elbow,_=B.ik3(sh,wr,arm.data.bones[ua].length,arm.data.bones[fa].length,Vector((-.55,sg*.3,-.7)))
    for name,a,b in [(ua,sh,elbow),(fa,elbow,wr)]:
     d0=mat[name].to_3x3()@Vector((0,1,0));q=d0.normalized().rotation_difference((b-a).normalized());new[name]=Matrix.Translation(a)@(q.to_matrix()@mat[name].to_3x3()).to_4x4()
  targets.append(new)
 family[old.name]=(lo,hi,targets);family_report[old.name]={'frameRange':[lo,hi],'initialSourceNeutralMaxMatrixDifference':initial_delta,'endingSourceNeutralMaxMatrixDifference':end_delta,'returnsToNeutral':cyclic,'offsetDegreesByFrame':offsets}
arm.animation_data_clear()
for action in list(bpy.data.actions):bpy.data.actions.remove(action)
for name,(lo,hi,targets) in family.items():
 act=bpy.data.actions.new(name);arm.animation_data_create();arm.animation_data.action=act
 for frame,new in zip(range(lo,hi+1),targets):
  for bone in B.BONE_ORDER:arm.pose.bones[bone].matrix=new[bone];bpy.context.view_layer.update()
  B.key_all(arm,frame)
 for fc in B.action_fcurves(act,arm):
  for key in fc.keyframe_points:key.interpolation='LINEAR'
 act.use_frame_range=True;act.frame_range=(lo,hi);track=arm.animation_data.nla_tracks.new();track.name=name;track.strips.new(name,lo,act);track.mute=True;arm.animation_data.action=None
bpy.context.scene.frame_start=0;bpy.context.scene.frame_end=149
bpy.ops.wm.save_as_mainfile(filepath=str(D/'seated-posture-rig.blend'))
donor=D/'seated-animation.glb';C.export_glb(str(donor),list(bpy.context.scene.objects),animations=True,meshopt=False)
b=donor.read_bytes();nn=struct.unpack_from('<I',b,12)[0];h=json.loads(b[20:20+nn]);hb=b[28+nn:];assert len(h['animations'])==6
j=copy.deepcopy(original);blob=bytearray(basebin);vo=len(j['bufferViews']);ao=len(j['accessors']);offset=len(blob)
for v in h['bufferViews']:
 v=copy.deepcopy(v);v['buffer']=0;v['byteOffset']=offset+v.get('byteOffset',0);j['bufferViews'].append(v)
blob.extend(hb)
for a in h['accessors']:
 a=copy.deepcopy(a);a['bufferView']+=vo;j['accessors'].append(a)
lookup={node['name']:i for i,node in enumerate(j['nodes']) if 'name' in node}
for animation in h['animations']:
 a=copy.deepcopy(animation)
 for sam in a['samplers']:sam['input']+=ao;sam['output']+=ao
 for channel in a['channels']:
  target=channel['target'];target['node']=lookup[h['nodes'][target['node']]['name']]
 idx=next(i for i,x in enumerate(j['animations']) if x['name']==a['name']);j['animations'][idx]=a
j['buffers'][0]['byteLength']=len(blob)
out=Path(args.out);write(out,j,blob)
assert j['meshes']==original['meshes'] and j['skins']==original['skins'] and j['nodes']==original['nodes'];assert bytes(blob[:len(basebin)])==basebin
r={'source':str(base),'sourceSHA256':hashlib.sha256(data).hexdigest(),'output':str(out),'outputSHA256':hashlib.sha256(out.read_bytes()).hexdigest(),'family':family_report,'meshSkinNodesAndOriginalBinaryIdentical':True,'limits':['Actual exported allframe verification and parent render acceptance required.']};(D/'build-report.json').write_text(json.dumps(r,indent=2));print('BUILT',out)
