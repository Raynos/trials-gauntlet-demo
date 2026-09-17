"""Assemble the catalog assets into one editable Blender review scene.

Canonical exports remain the component source/build recipes; this scene is an
editable consolidated handoff, not an assertion of byte-identical re-export.
"""
import bpy,json,hashlib,math,subprocess,tempfile,struct
from pathlib import Path
from mathutils import Vector
R=Path.cwd();P=R/'prototypes/hero-garage';D=P/'art/delivery';D.mkdir(exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene;scene.render.fps=30;scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1
catalog=json.loads((P/'public/assets/catalog.json').read_text());records=[]
for asset in catalog['assets']:
    path=P/'public'/asset['url'].lstrip('/');before=set(bpy.data.objects)
    # Decode authoritative catalog bytes; Blender5.2 cannot import this Meshopt filter path.
    with tempfile.TemporaryDirectory(prefix='hero-art-import-') as temporary:
        decoded=Path(temporary)/(path.stem+'-decoded.glb')
        result=subprocess.run(['node',str(P/'tools/unpack-art-lossless.mjs'),str(path),str(decoded)],check=True,capture_output=True,text=True)
        decode_report=json.loads(result.stdout)
        bpy.ops.import_scene.gltf(filepath=str(decoded))
    objects=set(bpy.data.objects)-before
    collection=bpy.data.collections.new(asset['kind'].upper());scene.collection.children.link(collection)
    for obj in objects:
        for c in list(obj.users_collection):c.objects.unlink(obj)
        collection.objects.link(obj)
    root=bpy.data.objects.new(asset['id']+' placement',None);collection.objects.link(root)
    for obj in objects:
        if obj.parent not in objects:
            matrix=obj.matrix_world.copy();obj.parent=root;obj.matrix_world=matrix
    x,y,z=asset.get('position',[0,0,0]);root.location=(x,-z,y)
    records.append({'kind':asset['kind'],'source':asset['url'],'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'decodedImport':decode_report,'objects':len(objects),'rigs':[o.name for o in objects if o.type=='ARMATURE']})
# Verify imported clip durations against decoded authoritative catalog samplers.
clip_checks=[]
for record in records:
    for clip in record['decodedImport']['animations']:
        action=bpy.data.actions.get(clip['name']);assert action is not None,clip['name']
        duration=(action.frame_range[1]-action.frame_range[0])/scene.render.fps
        assert abs(duration-clip['durationSeconds'])<1e-5,(clip['name'],duration,clip['durationSeconds'])
        clip_checks.append({'name':clip['name'],'catalogDurationSeconds':clip['durationSeconds'],'blenderDurationSeconds':duration})
assert len(clip_checks)==6,len(clip_checks)
# Separate studio collection makes asset selection/export explicit.
studio=bpy.data.collections.new('STUDIO - exclude from asset export');scene.collection.children.link(studio)
def move_to_studio(obj):
    for c in list(obj.users_collection):c.objects.unlink(obj)
    studio.objects.link(obj)
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.001));floor=bpy.context.object;floor.name='Review floor';move_to_studio(floor)
m=bpy.data.materials.new('Review floor matte');m.diffuse_color=(.10,.115,.105,1);m.use_nodes=True;m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=m.diffuse_color;m.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.95;floor.data.materials.append(m)
world=bpy.data.worlds.new('Neutral review world');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.32,.35,.33,1);world.node_tree.nodes['Background'].inputs[1].default_value=.6;scene.world=world
for name,location,power,size in [('Key',(2,-4,5),1100,4),('Fill',(-3,2,3),700,4),('Rim',(-2,-1,4),600,3)]:
    data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size;obj=bpy.data.objects.new(name,data);studio.objects.link(obj);obj.location=location;obj.rotation_euler=(Vector((.3,0,1))-obj.location).to_track_quat('-Z','Y').to_euler()
camdata=bpy.data.cameras.new('Whole rider and bike');cam=bpy.data.objects.new('Whole rider and bike',camdata);studio.objects.link(cam);cam.location=(3.3,-6,2.7);cam.rotation_euler=(Vector((.35,0,1.05))-cam.location).to_track_quat('-Z','Y').to_euler();camdata.type='ORTHO';camdata.ortho_scale=3.2;scene.camera=cam
scene.render.engine='CYCLES';scene.cycles.samples=32;scene.render.resolution_x=1920;scene.render.resolution_y=1080;scene.render.resolution_percentage=100
scene.render.fps=30;scene.frame_set(1)
scene['deliveryNote']='Component recipes are canonical. Choose retained NLA clips per rider rig; studio collection is review-only. Original local asset licenses apply.'
bpy.ops.file.pack_all();bpy.ops.outliner.orphans_purge(do_recursive=True)
out=D/'hero-garage-master.blend';bpy.ops.wm.save_as_mainfile(filepath=str(out),compress=True)
report={'output':str(out.relative_to(R)),'bytes':out.stat().st_size,'sha256':hashlib.sha256(out.read_bytes()).hexdigest(),'assets':records,'sixClipDurationChecks':clip_checks,'temporaryDecodedFilesCleaned':True,'actions':[{'name':a.name,'frames':list(a.frame_range)} for a in bpy.data.actions],'coordinateSpace':'Blender Z up, meters, +X forward. Catalog glTF Y placement converted to Blender Z.','limitations':['Consolidated imported edit/review scene; canonical exports remain component build recipes.','Studio lighting is Blender-native and not a pixel-identical match to Three.js.','Dense groom retained without reduction.']}
(P/'reports/delivery-master.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
