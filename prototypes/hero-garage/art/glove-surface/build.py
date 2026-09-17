import bpy,sys,json,hashlib
from pathlib import Path
from mathutils.bvhtree import BVHTree
from mathutils import Vector
R=Path.cwd();P=R/'prototypes/hero-garage';D=P/'art/glove-surface';sys.path.insert(0,str(R/'assets/blender'));import common as C
source=P/'art/glove-refine/cuff3/glove-refined-source.blend';bpy.ops.wm.open_mainfile(filepath=str(source));arm=next(o for o in bpy.data.objects if o.type=='ARMATURE');arm.data.pose_position='REST';obs=[bpy.data.objects[n] for n in ['rider:glove_top','rider:gloves','rider:hero glove construction']]
def signature(o):return {'positions':[list(v.co) for v in o.data.vertices],'weights':[[(g.group,g.weight) for g in v.groups] for v in o.data.vertices]}
protected={o.name:signature(o) for o in obs[:2]};top=obs[0];tree=BVHTree.FromPolygons([v.co for v in top.data.vertices],[p.vertices[:] for p in top.data.polygons]);maxmove=0
for v in obs[2].data.vertices:
 hit,n,i,d=tree.find_nearest(v.co);old=v.co.copy();v.co=hit+n*min(.001,max(.00045,d*.22));maxmove=max(maxmove,(old-v.co).length)
# Finger ring topology is authoritative: each finger has11rings of8 vertices.
fingers=obs[1];adj={v.index:set() for v in fingers.data.vertices}
for edge in fingers.data.edges:
 a,b=edge.vertices;adj[a].add(b);adj[b].add(a)
pending=set(adj);components=[]
while pending:
 todo=[pending.pop()];part=set(todo)
 while todo:
  for n in adj[todo.pop()]:
   if n in pending:pending.remove(n);part.add(n);todo.append(n)
 components.append(sorted(part))
assert sorted(map(len,components))==[70,70]+[88]*8
changed=[];contact=[]
for comp in components:
 if len(comp)==70:contact.extend(comp);continue # opposing thumbs remain untouched
 for start in range(0,len(comp),8):
  ring=comp[start:start+8];center=sum((fingers.data.vertices[i].co for i in ring),Vector())/8;grip=Vector((.92,-.33 if center.y<0 else .33,.78));radial=center-grip;radial.y=0;radial.normalize()
  for vi in ring:
   vertex=fingers.data.vertices[vi];outward=(vertex.co-center).dot(radial)
   if outward>1e-7:
    before=vertex.co.copy();vertex.co-=radial*outward*.45;changed.append({'vertex':vi,'before':list(before),'after':list(vertex.co),'displacementM':(vertex.co-before).length})
   else:contact.append(vi)
assert signature(top)==protected[top.name]
for vi in contact:assert list(fingers.data.vertices[vi].co)==protected[fingers.name]['positions'][vi]
contact_manifest=[{'before':protected[fingers.name]['positions'][vi],'after':list(fingers.data.vertices[vi].co),'weights':{fingers.vertex_groups[g.group].name:g.weight for g in fingers.data.vertices[vi].groups}} for vi in contact]
(D/'contact-points.json').write_text(json.dumps(contact_manifest));(D/'changed-dorsal-vertices.json').write_text(json.dumps(changed))

colors={'glove_top':(.038,.043,.046,1),'gloves':(.033,.039,.042,1),'hero moulded protection':(.035,.041,.044,1),'hero reflective binding':(.05,.06,.06,1)}
for mat in {m for o in obs for m in o.data.materials}:
 mat.use_nodes=True;nt=mat.node_tree;nt.nodes.clear();out=nt.nodes.new('ShaderNodeOutputMaterial');out.name='OUT';bs=nt.nodes.new('ShaderNodeBsdfPrincipled');bs.name='BSDF';nt.links.new(bs.outputs[0],out.inputs[0]);base=colors[mat.name];bs.inputs['Base Color'].default_value=base;bs.inputs['Roughness'].default_value=.91 if mat.name!='hero reflective binding' else .88
 tc=nt.nodes.new('ShaderNodeTexCoord');noise=nt.nodes.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=650 if 'rubber' not in mat.name else 350;noise.inputs['Detail'].default_value=2;nt.links.new(tc.outputs['Object'],noise.inputs['Vector']);bump=nt.nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.17;bump.inputs['Distance'].default_value=.00018;nt.links.new(noise.outputs['Fac'],bump.inputs['Height']);nt.links.new(bump.outputs['Normal'],bs.inputs['Normal'])
# Preserve source weights, including cuff forearm/hand blend; no finger-contact drift.
C.unwrap_all(obs,margin=.008)
bpy.ops.wm.save_as_mainfile(filepath=str(D/'glove-refined-source.blend'))
paths=C.bake_atlas(obs,1024,str(D),'glove',normal_size=1024,orm_size=1024)
# Save lossless maps from in-memory bake pixels, not JPEG reloads.
for key in ['albedo','normal','orm']:
 img=bpy.data.images.get('glove_'+key);assert img,key
 dest=D/('glove_'+key+'.png');img.filepath_raw=str(dest);img.file_format='PNG';img.save();paths[key]=str(dest)
mat=C.atlas_material('Glove textile rubber',paths)
for ob in obs:
 ob.data.materials.clear();ob.data.materials.append(mat)
 for poly in ob.data.polygons:poly.material_index=0
arm.data.pose_position='POSE';bpy.context.scene.frame_set(1);out=P/'public/assets/street01-gloves-surface.glb';C.export_glb(str(out),obs+[arm],animations=True,meshopt=False)
r={'sourceSHA256':hashlib.sha256(source.read_bytes()).hexdigest(),'outputSHA256':hashlib.sha256(out.read_bytes()).hexdigest(),'bytes':out.stat().st_size,'palmCuffAndFingerUndersidesIdentical':True,'changedDorsalVertices':len(changed),'protectedContactVertices':len(contact),'maxDorsalMoveM':max(v['displacementM'] for v in changed),'shortProtectionReliefM':[.00045,.001],'maxProtectionMoveM':maxmove,'diagnosis':'Long ridges are source finger tubes: reduce only radially outward halves45percent, retain inward gripcontact halves and thumbs exactly; soften textile material and flatten separate short pads.','limits':['Parent visual acceptance required.','Actual sixclip contact surface verification required before acceptance.']};(D/'build-report.json').write_text(json.dumps(r,indent=2));print(json.dumps(r))
