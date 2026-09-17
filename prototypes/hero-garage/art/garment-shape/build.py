"""One bounded cloth-volume candidate; immutable cotton source, existing atlas."""
import bpy,math,json,hashlib,sys
from pathlib import Path
from mathutils import Vector
R=Path.cwd();P=R/'prototypes/hero-garage';D=P/'art/garment-shape';sys.path.insert(0,str(R/'assets/blender'));import common as C
src=P/'art/cloth-surface/cotton-source.blend';sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();digest=sha(src);bpy.ops.wm.open_mainfile(filepath=str(src))
shirt=bpy.data.objects['rider:anatomical sweatshirt'];hood=bpy.data.objects['rider:folded hood'];arm=bpy.data.objects['rider_rig'];cloth=[shirt,hood,bpy.data.objects['rider:anatomical sweatshirt pocket']]
before={o.name:[v.co.copy()for v in o.data.vertices]for o in cloth};weights={o.name:[[(g.group,g.weight)for g in v.groups]for v in o.data.vertices]for o in cloth};uv={o.name:[tuple(v.uv)for v in o.data.uv_layers.active.data]for o in cloth}
# Existing hood is 2 coincident cloth walls, each 10 circumferential rings.
# cos(angle)=1 is the supported front panel: keep it exactly fixed.
up=(arm.data.bones['chest'].tail_local-arm.data.bones['chest'].head_local).normalized();front=Vector((up.z,0,-up.x))
assert len(hood.data.vertices)==960
for v in hood.data.vertices:
 ring=(v.index%480)//48;angle=(v.index%48)*math.tau/48;c=math.cos(angle)
 away=max(0,-c)**1.2
 taper=math.sin(math.pi*(ring+1)/11)**.8
 depth=.034*away*taper
 lift=.014*away*math.exp(-(ring/3.5)**2)
 v.co+=-front*depth+up*lift
# Broad, low-amplitude sleeve fabric rolls. No neck, cuffs or torso changes.
for side in ('L','R'):
 upper=arm.data.bones['upperArm.'+side];lower=arm.data.bones['forearm.'+side]
 for v in shirt.data.vertices:
  ws={shirt.vertex_groups[g.group].name:g.weight for g in v.groups}
  if ws.get('upperArm.'+side,0)+ws.get('forearm.'+side,0)<.995 or v.co.z>1.2 or v.co.z<.9:continue
  best=None
  for bone in (upper,lower):
   delta=bone.tail_local-bone.head_local;axis=delta.normalized();t=(v.co-bone.head_local).dot(axis);radial=v.co-bone.head_local-axis*t
   if 0.035<t<delta.length-.035 and radial.length>.015:
    if best is None or radial.length<best[0]:best=(radial.length,bone,t,radial)
  if best is None:continue
  radius,bone,t,radial=best;length=(bone.tail_local-bone.head_local).length
  # Diagonal displaced ridges with broad smooth valleys, never inward.
  angular=radial.normalized().dot(Vector((0,0,1)))
  centers=(.10,.19,.255) if bone==upper else (.075,.145)
  amount=sum(.0045*math.exp(-((t-center-.018*angular)/.012)**2)for center in centers)
  fade=min(1,(t-.035)/.025,(length-.035-t)/.025)
  v.co+=radial.normalized()*amount*max(0,fade)
for o in cloth:o.data.update()
assert all(weights[o.name]==[[(g.group,g.weight)for g in v.groups]for v in o.data.vertices]for o in cloth)
assert all(uv[o.name]==[tuple(v.uv)for v in o.data.uv_layers.active.data]for o in cloth)
assert all(v.co==before[shirt.name][i]for i,v in enumerate(shirt.data.vertices)if before[shirt.name][i].z>1.2 or before[shirt.name][i].z<.9)
bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(D/'garment-source.blend'))
paths={k:str(P/'art/cloth-surface/textures'/('cotton_'+k+'.png'))for k in ('albedo','normal','orm')};mat=C.atlas_material('Subdued mustard cotton',paths)
for o in cloth:
 o.data.materials.clear();o.data.materials.append(mat)
 for p in o.data.polygons:p.material_index=0
for a in list(bpy.data.actions):bpy.data.actions.remove(a)
out=P/'public/assets/street01-garment-shape-donor.glb';C.export_glb(str(out),list(bpy.context.scene.objects),animations=True,meshopt=False)
assert sha(src)==digest
r={'sourceSHA256':digest,'sourceUnchanged':True,'weightsExact':True,'uvExact':True,'neckAndCuffControlsExact':True,'hoodSupportedHalfExact':all(v.co==before[hood.name][i]for i,v in enumerate(hood.data.vertices)if math.cos((i%48)*math.tau/48)>=0),'changes':{o.name:{'vertices':sum((v.co-before[o.name][i]).length>1e-8 for i,v in enumerate(o.data.vertices)),'maxDisplacementM':max((v.co-before[o.name][i]).length for i,v in enumerate(o.data.vertices))}for o in cloth},'existingCottonAtlasRetained':True,'outputSHA256':sha(out),'limitations':['Parent must judge motion appearance; geometry changes retain existing atlas and skin weights.','Broad sleeve ridges limited to noncontact upper/forearm regions; torso remains unchanged.']};(D/'build-report.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r))
