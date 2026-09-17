"""Refine the exposed front mudguard arc while preserving its authored endpoints."""
import bpy,bmesh,sys,math,json,hashlib
from pathlib import Path
from mathutils import Vector
R=Path.cwd();P=R/'prototypes/hero-garage';D=P/'art/bike-contours';sys.path.insert(0,str(R/'assets/blender'));import common as C
source=P/'art/bike-paint/bike-paint-source.blend';sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest();sourcehash=sha(source);bpy.ops.wm.open_mainfile(filepath=str(source));ob=bpy.data.objects['fork_lower']
def snapshot(o):return {'matrix':[list(r)for r in o.matrix_world],'parent':o.parent.name if o.parent else None,'vertices':[list(v.co)for v in o.data.vertices]if o.type=='MESH' else None,'polygons':[list(p.vertices)for p in o.data.polygons]if o.type=='MESH' else None}
before={o.name:snapshot(o)for o in bpy.context.scene.objects if o.type in ['MESH','EMPTY']};mi=next(i for i,m in enumerate(ob.data.materials)if m.name=='hero_refine_blue_front_fender');faces=[p for p in ob.data.polygons if p.material_index==mi];ids={i for p in faces for i in p.vertices};assert len(ids)==96
old=[ob.data.vertices[i].co.copy()for i in sorted(ids)];survivors=[ob.data.vertices[i].co.copy()for i in range(len(ob.data.vertices))if i not in ids]
def bounds(points):return [[min(v[k]for v in points)for k in range(3)],[max(v[k]for v in points)for k in range(3)]]
def section(i):
 angle=math.radians(118-i*13);hw=.06-.012*abs(i-3.5)/3.5;ring=[]
 for j in range(12):
  t=2*math.pi*j/12;y=math.cos(t)*hw;rr=.4+.004*math.sin(t)-.010*(abs(y)/hw)**2;ring.append(Vector((rr*math.cos(angle),y,rr*math.sin(angle))))
 return ring
for i in range(8):
 for v in section(i):assert min((v-p).length for p in old)<1e-6
bm=bmesh.new();bm.from_mesh(ob.data);bm.verts.ensure_lookup_table();bmesh.ops.delete(bm,geom=[bm.verts[i]for i in ids],context='VERTS');uv=bm.loops.layers.uv.verify();rings=[]
for k in range(29):rings.append([bm.verts.new(v)for v in section(7*k/28)])
for k,(a,b)in enumerate(zip(rings[:-1],rings[1:])):
 for j in range(12):
  q=(j+1)%12;f=bm.faces.new([a[j],a[q],b[q],b[j]]);f.material_index=mi;f.smooth=True
  for loop,coord in zip(f.loops,[(j/12,k/28),((j+1)/12,k/28),((j+1)/12,(k+1)/28),(j/12,(k+1)/28)]):loop[uv].uv=coord
for ring in [list(reversed(rings[0])),rings[-1]]:
 f=bm.faces.new(ring);f.material_index=mi;f.smooth=False
bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(ob.data);bm.free();ob.data.update();newids={i for p in ob.data.polygons if p.material_index==mi for i in p.vertices};new=[ob.data.vertices[i].co.copy()for i in newids];assert len(new)==348
# Verify unchanged shell endrings and all surviving lower-fork vertices.
allpoints=[v.co for v in ob.data.vertices];survivor_error=max(min((v-p).length for p in allpoints)for v in survivors);assert survivor_error<1e-8
end_error=max(min((v-p).length for p in allpoints)for v in section(0)+section(7));assert end_error<1e-7
for name,oldstate in before.items():
 after=snapshot(bpy.data.objects[name]);assert oldstate['matrix']==after['matrix'] and oldstate['parent']==after['parent']
 if name!='fork_lower':assert oldstate==after,name
bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(D/'bike-contours-source.blend'),compress=True)
# Match the accepted paint export exactly: same atlas files and same polygon assignments.
paths={k:str(P/'art/bike-paint'/('paint_'+k+'.png'))for k in ['albedo','normal','orm']};mat=C.atlas_material('Clean blue white plastics with original decals',paths)
for name in ['bodywork','fork_upper']:
 o=bpy.data.objects[name];selected=[p.index for p in o.data.polygons if o.data.materials[p.material_index].name in ['hero_tank_paint','hero_factory_race_field','plate.001']];idx=len(o.data.materials);o.data.materials.append(mat)
 for i in selected:o.data.polygons[i].material_index=idx
out=P/'public/assets/street01-bike-contours.glb';C.export_glb(str(out),[o for o in bpy.context.scene.objects if o.type in ['MESH','EMPTY']],animations=False,meshopt=True);assert sha(source)==sourcehash
r={'sourceSHA256':sourcehash,'outputSHA256':sha(out),'outputBytes':out.stat().st_size,'selectedObject':'fork_lower','selectedRegionMaterial':'hero_refine_blue_front_fender','oldRings':8,'newRings':29,'crossSectionVertices':12,'oldFenderVertexCount':96,'newFenderVertexCount':348,'oldFenderBounds':bounds(old),'newFenderBounds':bounds(new),'maxEndRingDeviationM':end_error,'maxSurvivingForkVertexDeviationM':survivor_error,'allOtherGeometryAndAllHierarchyTransformsExact':True,'paintTextureFileHashes':{k:sha(Path(p))for k,p in paths.items()},'limitations':['Only exposed front mudguard contour refined. No wheel, suspension, frame, engine, rider-contact or logo edits.','Parent recorded orbit and compression review required.']};(P/'reports/bike-contours-build.json').write_text(json.dumps(r,indent=2));print(json.dumps(r))
