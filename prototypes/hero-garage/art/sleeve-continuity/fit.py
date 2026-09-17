"""Restore garment volume at pinched elbow waists, preserving skin fields."""
import bpy,math
from mathutils import Vector

def improve_sleeves(shirt):
 arm=bpy.data.objects['rider_rig'];before=[v.co.copy() for v in shirt.data.vertices];weights=[[(g.group,g.weight)for g in v.groups]for v in shirt.data.vertices];rows=[]
 for side in ('L','R'):
  upper=arm.data.bones['upperArm.'+side];lower=arm.data.bones['forearm.'+side];origin=lower.head_local.copy();tangent=((upper.tail_local-upper.head_local).normalized()+(lower.tail_local-lower.head_local).normalized()).normalized();changed=[]
  for v in shirt.data.vertices:
   ws={shirt.vertex_groups[g.group].name:g.weight for g in v.groups}
   if ws.get('upperArm.'+side,0)+ws.get('forearm.'+side,0)<.99:continue
   d=v.co-origin;axial=d.dot(tangent);radial=d-tangent*axial
   if d.length>=.09 or radial.length<1e-6:continue
   # One continuous convex cloth envelope through elbow; taper to untouched
   # sleeve surface over a90mm joint neighborhood, not a separate cap.
   envelope=.045*math.exp(-(axial/.050)**4)
   if radial.length>=envelope:continue
   fade=max(0,min(1,(.09-d.length)/.025));fade=fade*fade*(3-2*fade)
   v.co+=radial.normalized()*(envelope-radial.length)*fade;changed.append(v.index)
  rows.append({'side':side,'changedVertices':len(changed),'joint':list(origin),'axis':list(tangent),'minimumWaistRadiusM':.045})
 shirt.data.update();assert weights==[[(g.group,g.weight)for g in v.groups]for v in shirt.data.vertices]
 changed=[i for i,v in enumerate(shirt.data.vertices)if(v.co-before[i]).length>1e-8]
 return {'method':'Continuous45mm elbow waist envelope tapering within90mm of anatomical joint; positions only','sides':rows,'changedVertices':len(changed),'maxDisplacementM':max((v.co-before[i]).length for i,v in enumerate(shirt.data.vertices)),'skinWeightsExact':True,'neckAndCuffsExact':all((v.co-before[i]).length==0 for i,v in enumerate(shirt.data.vertices)if v.co.z>1.2 or v.co.z<.9),'limitations':['Candidate volume treatment; six-clip measured and visual review required.']}
