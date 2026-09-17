"""Standalone source-footwear refinement. Run with Blender from repository root."""
import bpy,bmesh,sys,json,hashlib,math
from pathlib import Path
from mathutils import Vector
R=Path.cwd(); P=R/'prototypes/hero-garage'; D=P/'art/footwear-refine';D.mkdir(exist_ok=True);sys.path.insert(0,str(R/'assets/blender'));import common as C
source=R/'assets/blender/source/rider-street.blend';bpy.ops.wm.open_mainfile(filepath=str(source))
arm=next(o for o in bpy.data.objects if o.type=='ARMATURE');arm.data.pose_position='REST'
names=['rider:trainer_upper','rider:trainer_rubber','rider:hero footwear construction','rider:cotton_laces'];obs=[bpy.data.objects[n] for n in names]
# Parent uses original atlas corner UVs to delete only these source triangles.
removal=[]
for ob in obs:
 ob.data.calc_loop_triangles();uv=ob.data.uv_layers.active
 for tri in ob.data.loop_triangles:
  if ob.name.endswith('cotton_laces') and any(ob.data.vertices[i].co.z>=.3 for i in tri.vertices):continue
  removal.append({'object':ob.name,'material':ob.data.materials[tri.material_index].name,'uv':([list(uv.data[i].uv) for i in tri.loops] if uv else None),'position':[list(ob.data.vertices[i].co) for i in tri.vertices]})
(D/'source-removal-triangles.json').write_text(json.dumps(removal))
laces=obs[-1];bm=bmesh.new();bm.from_mesh(laces.data);bmesh.ops.delete(bm,geom=[v for v in bm.verts if v.co.z>=.3],context='VERTS');bm.to_mesh(laces.data);bm.free()
for ob in list(bpy.data.objects):
 if ob not in obs+[arm]:bpy.data.objects.remove(ob,do_unlink=True)
def bounds(ob,sg):
 vs=[v.co for v in ob.data.vertices if v.co.y*sg>0];return [[min(v[k] for v in vs) for k in range(3)],[max(v[k] for v in vs) for k in range(3)]]
before={ob.name:{str(s):bounds(ob,s) for s in [-1,1]} for ob in obs}
# Smooth coarse upper and rounded sole corners, then recover exact per-foot extents.
for ob in obs[:2]:
 C.select_only([ob]);mod=ob.modifiers.new('Rounded footwear construction','SUBSURF' if ob==obs[0] else 'BEVEL')
 if ob==obs[0]:mod.levels=2;mod.subdivision_type='CATMULL_CLARK'
 else:mod.width=.0024;mod.segments=3;mod.limit_method='ANGLE'
 # Source modifiers include armature first; modifier apply only selected surface operation.
 bpy.ops.object.modifier_apply(modifier=mod.name)
 for sg in [-1,1]:
  old=before[ob.name][str(sg)];new=bounds(ob,sg)
  for v in ob.data.vertices:
   if v.co.y*sg>0:
    for k in range(3):v.co[k]=old[0][k]+(v.co[k]-new[0][k])*(old[1][k]-old[0][k])/(new[1][k]-new[0][k])
 for poly in ob.data.polygons:poly.use_smooth=True
# Rebuild overlays directly on refined upper: dense conforming suede panels and fine seams.
from mathutils.bvhtree import BVHTree
from mathutils import Matrix
upper=obs[0];tree=BVHTree.FromPolygons([v.co for v in upper.data.vertices],[p.vertices[:] for p in upper.data.polygons])
mb=C.MeshBuilder('fitted footwear panels');lb=C.MeshBuilder('fitted laces');suede=bpy.data.materials['hero suede reinforcement'];edge=bpy.data.materials['hero reflective binding'];dark=bpy.data.materials['hero stretch gusset'];lace=bpy.data.materials['cotton_laces']
fit_report={'method':'Rebuilt dense conforming panels, boundary tubes and laces directly on refined upper; no displaced coarse overlays retained.','suedeOffsetM':.001,'seamRadiusM':.00065}
def sample(co,direction,offset):
 hit,n,idx,d=tree.ray_cast(co+direction*.25,-direction,.5)
 assert hit is not None,(list(co),list(direction))
 return hit+n*offset
for side,sg in [('L',-1),('R',1)]:
 ankle=arm.data.bones['foot.'+side].head_local;group='foot.'+side
 for sg2 in [-1,1]:
  normal=Vector((0,sg2,0));grid=[];rows=14;cols=20
  for iy in range(rows+1):
   t=iy/rows;row=[]
   for ix in range(cols+1):
    u=ix/cols;x=(-.068*(1-t)-.042*t)*(1-u)+(.072*(1-t)+.028*t)*u;z=-.039*(1-t)-.007*t
    co=sample(ankle+Vector((x,0,z)),normal,.001);v=mb.bm.verts.new(co);mb.bm.verts.index_update();mb.groups[v.index]={group:1};row.append(v)
   grid.append(row)
  for iy in range(rows):
   for ix in range(cols):
    quad=(grid[iy][ix],grid[iy][ix+1],grid[iy+1][ix+1],grid[iy+1][ix]);f=mb.bm.faces.new(quad if sg2<0 else tuple(reversed(quad)));f.material_index=mb.mat_index(suede);f.smooth=True
  border=grid[0]+[grid[y][-1] for y in range(1,rows+1)]+list(reversed(grid[-1][:-1]))+[grid[y][0] for y in reversed(range(1,rows))]
  pts=[v.co+normal*.0009 for v in border];g=C.prim_tube(pts,.00065,sides=6,samples=1,closed=True,smooth_path=False);mb.add(g,Matrix.Identity(4),edge,group=group);g.free()
 # Fitted fine toe cap seam follows the actual upper rather than spanning in air.
 pts=[sample(ankle+Vector((.143,y,0)),Vector((0,0,1)),.0012) for y in [i*.004 for i in range(-9,10)]]
 g=C.prim_tube(pts,.0007,sides=6,samples=1,smooth_path=False);mb.add(g,Matrix.Identity(4),dark,group=group);g.free()
 for x in [0,.018,.04,.062]:
  pts=[sample(ankle+Vector((x,y,0)),Vector((0,0,1)),.0015) for y in [i*.003 for i in range(-8,9)]]
  g=C.prim_tube(pts,.0011,sides=6,samples=1,smooth_path=False);lb.add(g,Matrix.Identity(4),lace,group=group);g.free()
for builder,index in [(mb,2),(lb,3)]:
 old=obs[index];name=old.name;replacement=builder.build();bpy.data.objects.remove(old,do_unlink=True);replacement.name=name;mod=replacement.modifiers.new('Rider skin','ARMATURE');mod.object=arm;replacement.parent=arm;obs[index]=replacement
panel_obj=obs[2];panel_distances=[tree.find_nearest(sum((panel_obj.data.vertices[i].co for i in poly.vertices),Vector())/len(poly.vertices))[3] for poly in panel_obj.data.polygons if panel_obj.data.materials[poly.material_index].name=='hero suede reinforcement'];fit_report['panelQuadCenterSeparationM']=[min(panel_distances),max(panel_distances)];assert min(panel_distances)>.0008
# Explicit neutral white / warm grey textile upper, graphite reinforcement, ivory rubber.
colors={'trainer_upper':(.16,.19,.19,1),'trainer_rubber':(.56,.54,.47,1),'cotton_laces':(.67,.65,.56,1),'hero suede reinforcement':(.045,.063,.068,1),'hero reflective binding':(.31,.33,.31,1),'hero stretch gusset':(.065,.075,.075,1)}
for mat in {m for o in obs for m in o.data.materials}:
 mat.use_nodes=True;nt=mat.node_tree;nt.nodes.clear();out=nt.nodes.new('ShaderNodeOutputMaterial');out.name='OUT';bs=nt.nodes.new('ShaderNodeBsdfPrincipled');bs.name='BSDF';nt.links.new(bs.outputs[0],out.inputs[0]);base=colors[mat.name];bs.inputs['Base Color'].default_value=base;bs.inputs['Roughness'].default_value=.82 if 'rubber' not in mat.name else .76
 tc=nt.nodes.new('ShaderNodeTexCoord');noise=nt.nodes.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=650 if 'rubber' not in mat.name else 350;noise.inputs['Detail'].default_value=2;nt.links.new(tc.outputs['Object'],noise.inputs['Vector']);bump=nt.nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.28;bump.inputs['Distance'].default_value=.00035;nt.links.new(noise.outputs['Fac'],bump.inputs['Height']);nt.links.new(bump.outputs['Normal'],bs.inputs['Normal'])
# Every shoe vertex belongs rigidly to its existing foot joint; no ankle/peg drift.
for ob in obs:
 for v in ob.data.vertices:
  for g in ob.vertex_groups:g.remove([v.index])
  side='L' if v.co.y<0 else 'R';g=ob.vertex_groups.get('foot.'+side) or ob.vertex_groups.new(name='foot.'+side);g.add([v.index],1,'REPLACE')
C.unwrap_all(obs,margin=.008)
bpy.ops.wm.save_as_mainfile(filepath=str(D/'footwear-refined-source.blend'))
paths=C.bake_atlas(obs,1024,str(D),'footwear',normal_size=1024,orm_size=1024)
# Save lossless maps from in-memory bake pixels, not JPEG reloads.
for key in ['albedo','normal','orm']:
 img=bpy.data.images.get('footwear_'+key);assert img,key
 dest=D/('footwear_'+key+'.png');img.filepath_raw=str(dest);img.file_format='PNG';img.save();paths[key]=str(dest)
mat=C.atlas_material('Footwear canvas suede rubber',paths)
for ob in obs:
 ob.data.materials.clear();ob.data.materials.append(mat)
 for poly in ob.data.polygons:poly.material_index=0
arm.data.pose_position='POSE';bpy.context.scene.frame_set(1)
out=P/'public/assets/street01-footwear-refined.glb';C.export_glb(str(out),obs+[arm],animations=True,meshopt=False)
after={ob.name:{str(s):bounds(ob,s) for s in [-1,1]} for ob in obs}
report={'source':str(source.relative_to(R)),'sourceSHA256':hashlib.sha256(source.read_bytes()).hexdigest(),'outputSHA256':hashlib.sha256(out.read_bytes()).hexdigest(),'bytes':out.stat().st_size,'bones':[b.name for b in arm.data.bones],'beforeBounds':before,'afterBounds':after,'maxBoundsDelta':max(abs(before[n][s][a][k]-after[n][s][a][k]) for n in before for s in ['-1','1'] for a in range(2) for k in range(3)),'removedSourceTriangles':len(removal),'removalManifest':str((D/'source-removal-triangles.json').relative_to(R)),'drawcordsExcluded':True,'fittedConstruction':fit_report,'rigidFootWeights':True,'colorCorrection':{'cause':'Original linear canvas RGB .47-.49 bakes to roughly sRGB .72, suede .27 to .56; neutral bright lighting washed out weak separation. Atlas and export retained distinct colors correctly.','linearColors':colors,'intent':'Muted grey canvas, dark charcoal suede, ivory rubber and cream laces; geometry and bone weights unchanged.'},'sourceMeshVertices':{o.name:len(o.data.vertices) for o in obs},'limitations':['Parent visual acceptance and six-clip assembled motion review pending.','Export source animations are not replacement production clips; parent should retain existing accepted animation family.']}
(P/'reports/footwear-refine-build.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
