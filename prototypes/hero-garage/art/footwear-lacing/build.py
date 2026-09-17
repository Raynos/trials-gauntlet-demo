"""Replace only shoe laces on accepted footwear. Blender, repository root."""
import bpy,sys,json,hashlib
from pathlib import Path
from mathutils import Vector,Matrix
from mathutils.bvhtree import BVHTree
R=Path.cwd();P=R/'prototypes/hero-garage';D=P/'art/footwear-lacing';sys.path.insert(0,str(R/'assets/blender'));import common as C
source=P/'art/footwear-finish/footwear-refined-source.blend';bpy.ops.wm.open_mainfile(filepath=str(source));arm=next(o for o in bpy.data.objects if o.type=='ARMATURE');arm.data.pose_position='REST'
untouched=[bpy.data.objects[n] for n in ['rider:trainer_upper','rider:trainer_rubber','rider:hero footwear construction']]
def signature(o):
 return {'p':[list(v.co) for v in o.data.vertices],'n':[list(v.normal) for v in o.data.vertices],'w':[[(g.group,g.weight)for g in v.groups]for v in o.data.vertices],'f':[list(p.vertices)for p in o.data.polygons],'uv':[[list(u.uv)for u in uv.data]for uv in o.data.uv_layers]}
before={o.name:signature(o)for o in untouched};upper=untouched[0];tree=BVHTree.FromPolygons([v.co for v in upper.data.vertices],[list(p.vertices)for p in upper.data.polygons]);lb=C.MeshBuilder('Crossed instep cotton laces')
mat=bpy.data.materials.new('Ivory woven trainer laces');mat.use_nodes=True;bs=mat.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(.55,.54,.50,1);bs.inputs['Roughness'].default_value=.84
centers=[.100,.109,.118,.127];samples=[]
for side in ['L','R']:
 ankle=arm.data.bones['foot.'+side].head_local
 for x in centers:
  for sign in [-1,1]:
   pts=[]
   for i in range(25):
    t=i/24;y=(2*t-1)*.0215;xx=x+sign*(2*t-1)*.0035
    hit,n,*_=tree.ray_cast(ankle+Vector((xx,y,.25)),Vector((0,0,-1)),.5);assert hit is not None
    # Raised center of one strand crosses over its partner, endpoints remain fitted.
    clearance=.00175+(0.00175*(1-abs(2*t-1))**3 if sign==1 else 0)
    pts.append(hit+n*clearance)
   g=C.prim_tube(pts,.00085,sides=8,samples=1,smooth_path=False);lb.add(g,Matrix.Identity(4),mat,group='foot.'+side);g.free();samples.extend(float(tree.find_nearest(p)[3])for p in pts)
old=bpy.data.objects['rider:cotton_laces'];bpy.data.objects.remove(old,do_unlink=True);ob=lb.build();ob.name='rider:cotton_laces';mod=ob.modifiers.new('Rider skin','ARMATURE');mod.object=arm;ob.parent=arm
C.unwrap_all([ob],margin=.01)
assert before=={o.name:signature(o)for o in untouched}
bpy.ops.wm.save_as_mainfile(filepath=str(D/'footwear-lacing-source.blend'))
arm.animation_data_clear()
for action in list(bpy.data.actions):bpy.data.actions.remove(action)
arm.data.pose_position='POSE'
for pb in arm.pose.bones:pb.matrix_basis=Matrix.Identity(4)
out=P/'public/assets/street01-footwear-lacing.glb';C.export_glb(str(out),[ob,arm],animations=True,meshopt=False,extra={'export_animations':False})
r={'sourceSHA256':hashlib.sha256(source.read_bytes()).hexdigest(),'outputSHA256':hashlib.sha256(out.read_bytes()).hexdigest(),'bytes':out.stat().st_size,'untouchedUpperSolePanelPositionsNormalsUVWeightsFacesExact':True,'laceCentersRelativeAnkleM':centers,'laceXExtentM':[.0965,.1305],'toeCapSeamXM':.143,'radiusM':.00085,'sampledCenterlineSurfaceGapM':[min(samples),max(samples)],'crossingsPerShoe':4,'vertices':len(ob.data.vertices),'visibilityEvidence':'Exact dark-denim local cuff ray samples clear at x .10-.13 on both feet; parent camera/motion review pending.','limits':['No claim that lace/denim clearance is maintained across all poses until rendered review.']};(P/'reports/footwear-lacing-build.json').write_text(json.dumps(r,indent=2));print(json.dumps(r))
