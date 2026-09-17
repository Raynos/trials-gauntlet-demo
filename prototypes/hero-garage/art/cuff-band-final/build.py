"""Smooth authored wrist rib boundaries in texture space; stage39 geometry immutable."""
import bpy,sys,json,hashlib,subprocess,os
import numpy as np
from pathlib import Path
R=Path.cwd();P=R/'prototypes/hero-garage';D=P/'art/cuff-band-final';sys.path.insert(0,str(R/'assets/blender'));import common as C
source=P/'art/sleeve-shape-final/sleeve-source.blend';sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();sourcehash=sha(source);bpy.ops.wm.open_mainfile(filepath=str(source))
def signature():return hashlib.sha256(repr({o.name:{'positions':[tuple(v.co)for v in o.data.vertices],'faces':[tuple(p.vertices)for p in o.data.polygons],'weights':[[(g.group,g.weight)for g in v.groups]for v in o.data.vertices],'uv':[tuple(x.uv)for x in o.data.uv_layers.active.data]if o.data.uv_layers.active else None,'modifiers':[(m.name,m.type,m.show_viewport,m.show_render)for m in o.modifiers]}for o in bpy.data.objects if o.type=='MESH'}).encode()).hexdigest()
before=signature();o=bpy.data.objects['rider:anatomical sweatshirt'];arm=next(x for x in bpy.data.objects if x.type=='ARMATURE');arm.data.pose_position='REST'
# The authored material transition sets band width; no arbitrary new band height.
edgepolys={}
for p in o.data.polygons:
 for e in p.edge_keys:edgepolys.setdefault(tuple(sorted(e)),[]).append(p)
threshold={};axes={};origins={};boundarycounts={}
for side,sgn in [('L',-1),('R',1)]:
 bone=arm.data.bones['forearm.'+side];origin=np.array(bone.tail_local);axis=np.array(bone.head_local)-origin;axis/=np.linalg.norm(axis);axes[side]=axis;origins[side]=origin
 points=[]
 for e,ps in edgepolys.items():
  if len(ps)!=2 or ps[0].material_index==ps[1].material_index:continue
  c=np.mean([np.array(o.data.vertices[i].co)for i in e],axis=0)
  if c[0]>.75 and sgn*c[1]>.22 and c[2]<1.02:points.append(c)
 assert len(points)>10
 ds=(np.array(points)-origin)@axis;threshold[side]=float(np.median(ds));boundarycounts[side]=len(points)
 print('BOUNDARY',side,len(points),threshold[side],float(ds.min()),float(ds.max()))
states=[(m,m.show_viewport)for m in o.modifiers]
for m,_ in states:
 if m.type!='SUBSURF':m.show_viewport=False
bpy.context.view_layer.update();ev=o.evaluated_get(bpy.context.evaluated_depsgraph_get());me=ev.to_mesh(preserve_all_data_layers=True,depsgraph=bpy.context.evaluated_depsgraph_get());me.calc_loop_triangles();verts=np.array([v.co[:]for v in me.vertices]);uvs=np.array([x.uv[:]for x in me.uv_layers.active.data]);N=2048;mask=np.zeros((N,N),dtype=np.float32)
for tri in me.loop_triangles:
 xyz=verts[list(tri.vertices)];cent=xyz.mean(0)
 if cent[0]<.72 or abs(cent[1])<.22 or cent[2]>1.04:continue
 side='L'if cent[1]<0 else'R';dist=(xyz-origins[side])@axes[side]
 if dist.min()>threshold[side]+.015:continue
 uv=uvs[list(tri.loops)]*N-.5;lo=np.maximum(np.floor(uv.min(0)).astype(int),0);hi=np.minimum(np.ceil(uv.max(0)).astype(int),N-1)
 if np.any(hi<lo):continue
 x,y=np.meshgrid(np.arange(lo[0],hi[0]+1),np.arange(lo[1],hi[1]+1));v0=uv[1]-uv[0];v1=uv[2]-uv[0];den=v0[0]*v1[1]-v1[0]*v0[1]
 if abs(den)<1e-9:continue
 px=x-uv[0,0];py=y-uv[0,1];b=(px*v1[1]-v1[0]*py)/den;c=(v0[0]*py-px*v0[1])/den;a=1-b-c;inside=(a>=-1e-6)&(b>=-1e-6)&(c>=-1e-6);distance=a*dist[0]+b*dist[1]+c*dist[2];t=np.clip((threshold[side]+.001-distance)/.002,0,1);value=t*t*(3-2*t);patch=mask[lo[1]:hi[1]+1,lo[0]:hi[0]+1];np.maximum(patch,np.where(inside,value,0),out=patch)
ev.to_mesh_clear()
for m,state in states:m.show_viewport=state
# Six texels of island padding prevents UV seam whitening; body islands are separate.
for _ in range(6):
 old=mask.copy();mask[1:]=np.maximum(mask[1:],old[:-1]);mask[:-1]=np.maximum(mask[:-1],old[1:]);mask[:,1:]=np.maximum(mask[:,1:],old[:,:-1]);mask[:,:-1]=np.maximum(mask[:,:-1],old[:,1:])
np.save(D/'cuff-mask.npy',np.flipud(mask))
subprocess.run([os.environ.get('ART_IMAGE_PYTHON',str(P/'.venv-art-images/bin/python')),str(D/'texture.py')],check=True)
paths={k:str(P/'art/cloth-surface/textures'/('cotton_'+k+'.png'))for k in ['albedo','normal','orm']};paths['albedo']=str(D/'cuff_albedo.png');paths['orm']=str(D/'cuff_orm.png');mat=C.atlas_material('Smooth continuous wrist rib boundary',paths);o.data.materials[0]=mat
changed=[]
for p in o.data.polygons:
 if p.material_index==1 and p.center.x>.72 and abs(p.center.y)>.22 and p.center.z<1.04:p.material_index=0;changed.append(p.index)
assert signature()==before;bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(D/'cuff-band-source.blend'),compress=True)
for action in list(bpy.data.actions):bpy.data.actions.remove(action)
out=P/'public/assets/street01-cuff-band-final-donor.glb';C.export_glb(str(out),list(bpy.context.scene.objects),animations=True,meshopt=False)
assert signature()==before;assert sha(source)==sourcehash
report={'source':str(source.relative_to(R)),'sourceSHA256':sourcehash,'geometryUVSkinModifiersExactlyPreserved':True,'signature':before,'boundaryDistanceFromWristMetres':threshold,'authoredTransitionEdges':boundarycounts,'transitionWidthMetres':.002,'cuffFacesRemapped':len(changed),'donorSHA256':sha(out),'texture':json.loads((D/'texture-report.json').read_text()),'limits':['Boundary is an interpolated colour/roughness transition, not an added physical seam.','Parent motion and closeup judgement required.']};(D/'build-report.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
