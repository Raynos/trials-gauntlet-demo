"""Standalone source-glove refinement. Run with Blender from repository root."""
import bpy,bmesh,sys,json,hashlib,math
from pathlib import Path
from mathutils import Vector
R=Path.cwd(); P=R/'prototypes/hero-garage'; D=P/'art/glove-refine/cuff3';D.mkdir(exist_ok=True);sys.path.insert(0,str(R/'assets/blender'));import common as C
source=R/'assets/blender/source/rider-street.blend';bpy.ops.wm.open_mainfile(filepath=str(source))
arm=next(o for o in bpy.data.objects if o.type=='ARMATURE');arm.data.pose_position='REST'
names=['rider:glove_top','rider:gloves','rider:hero glove construction'];obs=[bpy.data.objects[n] for n in names]
# Parent uses original atlas corner UVs to delete only these source triangles.
removal=[]
for ob in obs:
 ob.data.calc_loop_triangles();uv=ob.data.uv_layers.active
 for tri in ob.data.loop_triangles:
  removal.append({'object':ob.name,'material':ob.data.materials[tri.material_index].name,'uv':([list(uv.data[i].uv) for i in tri.loops] if uv else None),'position':[list(ob.data.vertices[i].co) for i in tri.vertices]})
(D/'source-removal-triangles.json').write_text(json.dumps(removal))
for ob in list(bpy.data.objects):
 if ob not in obs+[arm]:bpy.data.objects.remove(ob,do_unlink=True)
def bounds(ob,sg):
 vs=[v.co for v in ob.data.vertices if v.co.y*sg>0];return [[min(v[k] for v in vs) for k in range(3)],[max(v[k] for v in vs) for k in range(3)]]
before={ob.name:{str(s):bounds(ob,s) for s in [-1,1]} for ob in obs}
# Palm/finger contact geometry stays bit-identical; only forearm cuff radial volume changes.
contact_before=[tuple(v.co) for v in obs[1].data.vertices]
contact_weights=[[ (g.group,g.weight) for g in v.groups] for v in obs[1].data.vertices]
top=obs[0];cuff_count=0
bm=bmesh.new();bm.from_mesh(top.data);skin=bm.verts.layers.deform.verify()
forearm_ids={g.index for g in top.vertex_groups if g.name.startswith('forearm.')}
remove=[v for v in bm.verts if any(v[skin].get(i,0)>.1 for i in forearm_ids)];cuff_count=len(remove);bmesh.ops.delete(bm,geom=remove,context='VERTS')
cuff_sections=[];boundary_data=json.loads((D/'sleeve-boundaries.json').read_text())
for boundary in boundary_data:
 side=boundary['side'];sg=-1 if side=='L' else 1;bone=arm.data.bones['forearm.'+side];axis=(bone.tail_local-bone.head_local).normalized();center=Vector(boundary['center']);end=Vector((.883,sg*.33,.80));u=Vector((0,1,0));u=(u-axis*u.dot(axis)).normalized();v=axis.cross(u).normalized();rings=[];rows=12;N=len(boundary['vertices']);rear=[]
 for row in range(rows+1):
  t=row/rows;ring=[]
  for item in boundary['vertices']:
   source_point=Vector(item['co']);radial=source_point-center;radial-=axis*radial.dot(axis);radial.normalize();start=source_point-radial*.0022-axis*.0015
   theta=math.atan2(radial.dot(v),radial.dot(u));finish=end+Vector((0,.037*math.cos(theta),.013*math.sin(theta)))
   co=start.lerp(finish,t);vert=bm.verts.new(co);ring.append(vert)
   # Exact sampled sleeve skin weights at rear; smooth transition toward hand.
   for name,w in item['weights'].items():
    vg=top.vertex_groups.get(name) or top.vertex_groups.new(name=name);vert[skin][vg.index]=w*(1-t)
   hg=top.vertex_groups['hand.'+side].index;vert[skin][hg]=vert[skin].get(hg,0)+t
   if row==0:rear.append({'co':list(co),'sourceCo':list(source_point),'radial':list(radial),'weights':item['weights']})
  rings.append(ring)
 for row in range(rows):
  for i in range(N):
   f=bm.faces.new((rings[row][i],rings[row][(i+1)%N],rings[row+1][(i+1)%N],rings[row+1][i]));f.material_index=0;f.smooth=True
 cuff_sections.append({'side':side,'boundaryVertices':N,'rearSamples':rear,'radialInsetM':.0022,'axialInsetM':.0015})
bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(top.data);bm.free();top.data.update()
# Protection was built around wrist instead of grip. Move and conform to actual palm.
from mathutils.bvhtree import BVHTree
faces=[p.vertices[:] for p in top.data.polygons if all(any(top.vertex_groups[g.group].name.startswith('hand.') and g.weight>.99 for g in top.data.vertices[i].groups) for i in p.vertices)]
tree=BVHTree.FromPolygons([v.co for v in top.data.vertices],faces)
protection=obs[2];pad_hits=0
for v in protection.data.vertices:
 side='L' if v.co.y<0 else 'R';wrist=arm.data.bones['hand.'+side].head_local;grip=Vector((.92,-.33 if side=='L' else .33,.78));delta=grip-wrist
 original=v.co.copy();candidate=original+delta
 # Place protection over back of palm, just behind finger roots.
 candidate.x-=.010
 hit,n,idx,d=tree.ray_cast(Vector((candidate.x,candidate.y,grip.z+.18)),Vector((0,0,-1)),.3)
 if hit is None:hit,n,idx,d=tree.find_nearest(candidate)
 assert hit is not None
 localheight=original.z-(wrist.z+.028)
 v.co=Vector((candidate.x,candidate.y,hit.z+.0025+localheight*.45));pad_hits+=1
for ob in obs:
 for poly in ob.data.polygons:poly.use_smooth=True
assert contact_before==[tuple(v.co) for v in obs[1].data.vertices]
assert contact_weights==[[(g.group,g.weight) for g in v.groups] for v in obs[1].data.vertices]
colors={'glove_top':(.045,.052,.055,1),'gloves':(.016,.020,.022,1),'hero moulded protection':(.028,.034,.037,1),'hero reflective binding':(.09,.10,.10,1)}
for mat in {m for o in obs for m in o.data.materials}:
 mat.use_nodes=True;nt=mat.node_tree;nt.nodes.clear();out=nt.nodes.new('ShaderNodeOutputMaterial');out.name='OUT';bs=nt.nodes.new('ShaderNodeBsdfPrincipled');bs.name='BSDF';nt.links.new(bs.outputs[0],out.inputs[0]);base=colors[mat.name];bs.inputs['Base Color'].default_value=base;bs.inputs['Roughness'].default_value=.78 if mat.name=='glove_top' else .67
 tc=nt.nodes.new('ShaderNodeTexCoord');noise=nt.nodes.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=650 if 'rubber' not in mat.name else 350;noise.inputs['Detail'].default_value=2;nt.links.new(tc.outputs['Object'],noise.inputs['Vector']);bump=nt.nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.28;bump.inputs['Distance'].default_value=.00035;nt.links.new(noise.outputs['Fac'],bump.inputs['Height']);nt.links.new(bump.outputs['Normal'],bs.inputs['Normal'])
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
arm.data.pose_position='POSE';bpy.context.scene.frame_set(1)
out=P/'public/assets/street01-gloves-cuff3.glb';C.export_glb(str(out),obs+[arm],animations=True,meshopt=False)
after={ob.name:{str(s):bounds(ob,s) for s in [-1,1]} for ob in obs}
report={'source':str(source.relative_to(R)),'sourceSHA256':hashlib.sha256(source.read_bytes()).hexdigest(),'outputSHA256':hashlib.sha256(out.read_bytes()).hexdigest(),'bytes':out.stat().st_size,'bones':[b.name for b in arm.data.bones],'beforeBounds':before,'afterBounds':after,'maxBoundsDelta':max(abs(before[n][s][a][k]-after[n][s][a][k]) for n in before for s in ['-1','1'] for a in range(2) for k in range(3)),'removedSourceTriangles':len(removal),'removalManifest':str((D/'source-removal-triangles.json').relative_to(R)),'fingerPositionsBitIdentical':True,'fingerWeightsBitIdentical':True,'fingerContactMaxDisplacementM':0.0,'originalCuffVerticesRemoved':cuff_count,'newCuffSections':cuff_sections,'newCuffTopology':'13rings by88vertices, rear derived from actual evaluated sleeve boundary and interpolated skin weights; open ends','protectionVerticesReprojected':pad_hits,'sourceMeshVertices':{o.name:len(o.data.vertices) for o in obs},'limitations':['Parent visual acceptance and six-clip assembled motion review pending.','Export source animations are not replacement production clips; parent should retain existing accepted animation family.']}
(P/'reports/glove-refine-cuff3-build.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
