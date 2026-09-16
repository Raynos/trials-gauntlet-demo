"""Scratch-only human Street head from Blender's CC0 realistic animation topology.

Input anatomical JSON is extracted unchanged from human-base-meshes-bundle v1.4.1:
GEO-head_animation_realistic and its authored sclera/iris objects. No facial primitive
substitutes. Full human scalp/jaw, ears, nose, lips, eyes and neck are retained.
"""
import argparse,json,math,sys
from pathlib import Path
import bpy,bmesh
from mathutils import Matrix,Vector
from mathutils.bvhtree import BVHTree
sys.path.insert(0,str(Path(__file__).resolve().parent))
import common as C
import author_garments as G
import author_hood as H
import rider_asset as P


def material(name,color,rough,grain=False):
 m=C.new_mat(name,(*color,1),rough=rough)
 if grain:
  noise=C.noise_fac(m,scale=105,detail=3)
  C.link(m,C.mix_rgb(m,C.math_node(m,'MULTIPLY',noise,.16),(*color,1),tuple(c*.72 for c in color)+(1,)),C.bsdf(m).inputs['Base Color'])
  fine=C.noise_fac(m,scale=2200,detail=2);bump=C.node(m,'ShaderNodeBump');bump.inputs['Strength'].default_value=.18;bump.inputs['Distance'].default_value=.00012
  C.link(m,fine,bump.inputs['Height']);C.link(m,bump.outputs['Normal'],C.bsdf(m).inputs['Normal'])
 return m


def bind(ob,arm,ww):
 for name in sorted({k for w in ww for k in w}):ob.vertex_groups.new(name=name)
 for i,w in enumerate(ww):
  for name,value in w.items():
   if value>1e-8:ob.vertex_groups[name].add([i],value,'REPLACE')
 mod=ob.modifiers.new('rider head neck rig','ARMATURE');mod.object=arm;ob.parent=arm
 P.normalize_skin_weights(ob)
 return ob


def main():
 ap=argparse.ArgumentParser();ap.add_argument('--source',type=Path,required=True);ap.add_argument('--anatomy-data',type=Path,required=True);ap.add_argument('--output',type=Path,required=True)
 args=ap.parse_args(sys.argv[sys.argv.index('--')+1:]);root=Path(__file__).resolve().parents[2];out=args.output.resolve()
 if not out.is_relative_to(root/'harness/out/blender/street-head') or out.exists():raise RuntimeError('Fresh street-head scratch path required')
 protected={str(p):G.sha(p) for p in (root/'assets/blender/source').glob('*.blend')}
 data=json.loads(args.anatomy_data.read_text());bpy.ops.wm.open_mainfile(filepath=str(args.source.resolve()));arm=bpy.data.objects['rider_rig'];P.clear_pose(arm)
 if bpy.context.scene['heroOutfit']!='street':raise RuntimeError('Street source required')
 sig={k:v for k,v in G.invariant_signature().items() if k!='materials'}
 other={o.name:H.mesh_signature(o) for o in bpy.data.objects if o.type=='MESH' and o.name not in ('rider:constructed_helmet','rider:skin')}
 for name in ('rider:constructed_helmet','rider:skin'):
  if name in bpy.data.objects:bpy.data.objects.remove(bpy.data.objects[name],do_unlink=True)
 head=arm.data.bones['head'];axis=(head.tail_local-head.head_local).normalized();front=Vector((axis.z,0,-axis.x)).normalized();lateral=Vector((0,1,0))
 scale=.88;pivot=Vector((0,0,.170))
 def place(p):
  q=(Vector(p)-pivot)*scale
  return head.head_local+lateral*q.x-front*q.y+axis*q.z
 def skin_weights(p):
  # Anatomical lower neck follows neck; skull/face/ears are rigid to existing head.
  t=max(0,min(1,(p.z-.135)/.085));t=t*t*(3-2*t)
  return {'neck':1-t,'head':t}
 M={
 'skin':material('street human skin',(.43,.25,.155),.54,True),
 'warm':material('street human warm skin',(.455,.225,.155),.56,True),
 'lips':material('street human lips',(.335,.135,.095),.50,True),
 'inner':material('street human mouth cavity',(.035,.013,.011),.75),
 'stubble':material('street subtle jaw stubble',(.31,.205,.135),.67,True),
 'hair':material('street short natural hair',(.025,.017,.011),.67,True),
 'sclera':material('street human sclera',(.69,.70,.66),.28),
 'iris':material('street human iris',(.080,.048,.020),.32),
 'pupil':material('street human pupil',(.003,.004,.003),.28),
 }
 base=data['GEO-head_animation_realistic'];bm=bmesh.new();verts=[bm.verts.new(Vector(p)) for p in base['vertices']]
 region=bm.faces.layers.int.new('source_anatomical_region')
 # Creating a layer can invalidate references; reacquire indexed vertices afterward.
 bm.verts.ensure_lookup_table();verts=list(bm.verts)
 for ids,tag in zip(base['faces'],base['face_sets']):
  face=bm.faces.new([verts[i] for i in ids]);face[region]=tag
 bmesh.ops.bisect_plane(bm,geom=list(bm.verts)+list(bm.edges)+list(bm.faces),dist=.000001,plane_co=Vector((0,0,.10)),plane_no=Vector((0,0,1)),clear_inner=True)
 bm.normal_update();bm.verts.ensure_lookup_table();bm.verts.index_update()
 local=[v.co.copy() for v in bm.verts]
 skinmats=['skin','warm','lips','inner','stubble']
 for face in bm.faces:
  c=face.calc_center_median();tag=face[region];key='skin'
  if tag in (3,4,11):key='warm'
  if tag==7 and c.y<-.116 and .225<c.z<.255:key='lips'
  if tag==7 and c.y>-.090:key='inner'
  if tag==24 and c.z<.229 and c.y<.045:key='stubble'
  face.material_index=skinmats.index(key);face.smooth=True
 # Tight cropped scalp cover: 1–3mm thick, never helmet-sized. No beard geometry.
 scalp=bmesh.new();vmap={};scalpf=[]
 for face in bm.faces:
  c=face.calc_center_median()
  # Receded forehead, temples above ear, low occiput; actual anatomical scalp surface.
  hairline=.354 if c.y<-.060 else (.318 if c.y<.015 else .265)
  if c.z<hairline or face[region] not in (33,35):continue
  inds=[]
  for v in face.verts:
   if v not in vmap:
    p=v.co.copy()+v.normal*(.0015+.0013*max(0,min(1,(v.co.z-.35)/.08)))
    vmap[v]=scalp.verts.new(place(p))
   inds.append(vmap[v])
  nf=scalp.faces.new(inds);nf.smooth=True
 for v,p in zip(bm.verts,local):v.co=place(p)
 bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));me=bpy.data.meshes.new('CC0 anatomical face and neck');bm.to_mesh(me);bm.free()
 for key in skinmats:me.materials.append(M[key])
 ob=bpy.data.objects.new('rider:human head and neck',me);bpy.context.scene.collection.objects.link(ob);bind(ob,arm,[skin_weights(p) for p in local])
 hairme=bpy.data.meshes.new('tight short scalp hair');bmesh.ops.recalc_face_normals(scalp,faces=list(scalp.faces));scalp.to_mesh(hairme);scalp.free();hairme.materials.append(M['hair'])
 hair=bpy.data.objects.new('rider:short hair prototype',hairme);bpy.context.scene.collection.objects.link(hair);bind(hair,arm,[{'head':1} for _ in hairme.vertices])
 # Preserve the authored eye assembly's actual transforms relative to the head.
 head_inverse=Matrix(base['matrix_world']).inverted()
 for name,part in data.items():
  if name=='GEO-head_animation_realistic':continue
  transform=head_inverse@Matrix(part['matrix_world']);coordinates=[place(transform@Vector(p)) for p in part['vertices']]
  me=bpy.data.meshes.new(name);me.from_pydata(coordinates,[],part['faces']);me.update()
  eye=bpy.data.objects.new('rider:'+name.replace('GEO-head_animation_realistic.',''),me);bpy.context.scene.collection.objects.link(eye)
  if '.sclera.' in name:me.materials.append(M['sclera'])
  else:
   me.materials.append(M['iris']);me.materials.append(M['pupil'])
   for f in me.polygons:
    center=sum((Vector(part['vertices'][i]) for i in f.vertices),Vector())/len(f.vertices)
    if math.hypot(center.x,center.z)<.0033:f.material_index=1
  for f in me.polygons:f.use_smooth=True
  bind(eye,arm,[{'head':1} for _ in me.vertices])
 # Eyebrows follow anatomical forehead; fine physical profile avoids painted-on blocks.
 tree=BVHTree.FromPolygons(base['vertices'],base['faces']);b=C.MeshBuilder('rider:human eyebrows')
 for sign in (-1,1):
  points=[]
  for i in range(8):
   x=sign*(.012+i*.006);z=.338+.009*math.sin(math.pi*i/9)-.003*i/7
   p,n,idx,d=tree.ray_cast(Vector((x,-.30,z)),Vector((0,1,0)),.4)
   if p is not None:points.append(place(p+n*.0008))
  if len(points)>1:
   geom=C.prim_tube(points,.00145,sides=5,samples=1);b.add(geom,Matrix.Identity(4),M['hair'],group='head');geom.free()
 brows=b.build();mod=brows.modifiers.new('rider head rig','ARMATURE');mod.object=arm;brows.parent=arm
 P.clear_pose(arm);assert sig=={k:v for k,v in G.invariant_signature().items() if k!='materials'}
 assert other=={name:H.mesh_signature(bpy.data.objects[name]) for name in other}
 meshes=[o for o in bpy.context.scene.objects if o.type=='MESH'];P.check_source(arm,meshes)
 out.parent.mkdir(parents=True,exist_ok=True);bpy.ops.wm.save_as_mainfile(filepath=str(out),compress=True)
 assert protected=={p:G.sha(p) for p in protected}
 report={'source':str(args.source),'source_sha256':G.sha(args.source),'anatomy_data_sha256':G.sha(args.anatomy_data),'script_sha256':G.sha(__file__),'output_sha256':G.sha(out),'source_asset':'Blender CC0 Human Base Meshes v1.4.1 / realistic animation head + actual eyes','chin_to_crown_m':(.436273-.171)*scale,'hair_max_thickness_m':.0028,'rig_actions_sockets_and_nonhead_meshes_unchanged':True,'head_topology':G.topology(ob.data),'head_triangles':sum(len(f.vertices)-2 for f in ob.data.polygons),'all_triangles':sum(len(f.vertices)-2 for mesh in meshes for f in mesh.data.polygons)}
 out.with_suffix('.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))

if __name__=='__main__':main()
