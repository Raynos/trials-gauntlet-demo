"""Technical source probe only; no target likeness sculpt or production export."""
from pathlib import Path
import sys,json,bpy
ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'raw/mpfb2-2.0.17/src'))
# Source checkout has no installed extension namespace. Isolate user/cache files locally.
_original_extension_path_user=bpy.utils.extension_path_user
bpy.utils.extension_path_user=lambda package,**kwargs: str(ROOT/'raw/user-data') if package=='mpfb' else _original_extension_path_user(package,**kwargs)
import addon_utils
addon_utils.enable("mpfb", default_set=True)
from mpfb.services.humanservice import HumanService
from mpfb.services.targetservice import TargetService
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
macro=TargetService.get_default_macro_info_dict()
macro.update(gender=1.0,age=0.48,muscle=0.58,weight=0.48)
macro['race']={'caucasian':0.8,'asian':0.1,'african':0.1}
human=HumanService.create_human(macro_detail_dict=macro)
human.name='MPFB_AdultMale_SourceProbe'
assets=ROOT/'raw/system-assets'
skin=assets/'skins/middleage_caucasian_male/middleage_caucasian_male.mhmat'
print('SKIN',skin,skin.exists())
HumanService.set_character_skin(str(skin),human,skin_type='GAMEENGINE')
for folder,name,kind in [('eyes','high-poly','Eyes'),('eyebrows','eyebrow001','Eyebrows'),('eyelashes','eyelashes01','Eyelashes')]:
 path=assets/folder/name/(name+'.mhclo')
 HumanService.add_mhclo_asset(str(path),human,asset_type=kind,subdiv_levels=1)
bpy.ops.file.pack_all()
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'adult-male-source-probe.blend'))
report={'blender':bpy.app.version_string,'macros':macro,'objects':[{'name':o.name,'vertices':len(o.data.vertices),'polygons':len(o.data.polygons),'uv_layers':len(o.data.uv_layers),'materials':[m.name if m else None for m in o.data.materials]} for o in bpy.data.objects if o.type=='MESH'],'images':[{'name':i.name,'size':list(i.size),'packed':bool(i.packed_file),'filepath':i.filepath} for i in bpy.data.images],'shape_keys':[k.name for k in human.data.shape_keys.key_blocks],'status':'technical import only, not likeness acceptance'}
(ROOT/'verification.json').write_text(json.dumps(report,indent=2))
print('SOURCE_PROBE_PASS')
