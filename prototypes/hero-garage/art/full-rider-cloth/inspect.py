import bpy,json,bmesh
from mathutils.kdtree import KDTree
from pathlib import Path
R=Path.cwd();bpy.ops.wm.open_mainfile(filepath=str(R/'assets/blender/source/rider-street.blend'))
pts=[]
for name in ('rider:anatomical sweatshirt','rider:denim'):
 o=bpy.data.objects[name];print(name,len(o.data.vertices));pts.extend([(tuple(o.matrix_world@v.co),name) for v in o.data.vertices])
bpy.ops.wm.read_factory_settings(use_empty=True);bpy.ops.import_scene.gltf(filepath=str(R/'prototypes/hero-garage/public/assets/street01-rider-posed.glb'))
o=bpy.data.objects['rider'];kd=KDTree(len(pts))
for i,(co,name) in enumerate(pts):kd.insert(co,i)
kd.balance();counts={};ids={}
for v in o.data.vertices:
 co,i,d=kd.find(v.co)
 if d<.001:counts[pts[i][1]]=counts.get(pts[i][1],0)+1;ids[v.index]=pts[i][1]
print('MATCH',counts,'CUSTOMNORMAL',o.data.has_custom_normals)
bm=bmesh.new();bm.from_mesh(o.data);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=.00001);bm.verts.ensure_lookup_table()
print('WELDED',len(bm.verts))
be=[e for e in bm.edges if e.is_boundary and all(kd.find(v.co)[2]<.001 and pts[kd.find(v.co)[1]][1]=='rider:anatomical sweatshirt' for v in e.verts)]
print('CLOTHBOUNDARY',len(be));print([(tuple(e.verts[0].co),tuple(e.verts[1].co)) for e in be[:35]])
