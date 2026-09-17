"""Clamp proposed hem control points outside actual rest denim by6mm."""
import bpy,json,struct,tempfile
from mathutils.bvhtree import BVHTree

def fit_denim(src,shirt,indices):
 raw=src.read_bytes();n=struct.unpack_from('<I',raw,12)[0];j=json.loads(raw[20:20+n]);blob=raw[28+n:];meshes=j['meshes'];j['meshes']=[]
 for node in j['nodes']:
  if 'mesh'not in node:continue
  mesh=meshes[node['mesh']]
  if not any('indigo denim' in j['materials'][p['material']].get('name','')for p in mesh['primitives']):node.pop('mesh');node.pop('skin',None);continue
  node['mesh']=len(j['meshes']);node['name']='FIT_DENIM';j['meshes'].append(mesh)
  for p in mesh['primitives']:p['material']=0
 j['materials']=[{'name':'diagnostic'}]
 for key in ('animations','images','textures','samplers'):j.pop(key,None)
 js=json.dumps(j,separators=(',',':')).encode();js+=b' '*((-len(js))%4);payload=struct.pack('<III',0x46546c67,2,28+len(js)+len(blob))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(blob),0x004e4942)+blob
 before=set(bpy.data.objects)
 with tempfile.NamedTemporaryFile(suffix='.glb')as f:
  f.write(payload);f.flush();bpy.ops.import_scene.gltf(filepath=f.name)
 imported=set(bpy.data.objects)-before
 for o in imported:
  if o.type=='ARMATURE':o.data.pose_position='REST'
 bpy.context.view_layer.update();o=bpy.data.objects['FIT_DENIM'];eo=o.evaluated_get(bpy.context.evaluated_depsgraph_get());m=eo.to_mesh();tree=BVHTree.FromPolygons([eo.matrix_world@v.co for v in m.vertices],[p.vertices for p in m.polygons]);eo.to_mesh_clear();clamped=[]
 for i in indices:
  v=shirt.data.vertices[i];hit,n,_,dist=tree.find_nearest(v.co);signed=(v.co-hit).dot(n)
  if signed<.006:
   delta=n*(.006-signed);v.co+=delta;clamped.append({'vertex':i,'offsetM':list(delta),'signedBeforeM':signed})
 for o in imported:bpy.data.objects.remove(o,do_unlink=True)
 return {'minimumTargetGapM':.006,'clamps':clamped,'weightsChanged':False,'method':'Nearest actual rest-denim surface normal; outward signed6mm clamp after proposed posterior gathering.'}
