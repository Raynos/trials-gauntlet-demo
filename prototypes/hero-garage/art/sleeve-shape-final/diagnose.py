import bpy,json
from pathlib import Path
P=Path.cwd()/'prototypes/hero-garage';bpy.ops.wm.open_mainfile(filepath=str(P/'art/cloth-rib-finish/cloth-rib-source.blend'));o=bpy.data.objects['rider:anatomical sweatshirt'];arm=bpy.data.objects['rider_rig'];arm.data.pose_position='REST';mod=next(m for m in o.modifiers if m.type=='SOLIDIFY')
def sample():
 bpy.context.view_layer.update();e=o.evaluated_get(bpy.context.evaluated_depsgraph_get());m=e.to_mesh();vs=[v.co.copy()for v in m.vertices];e.to_mesh_clear();return vs
mod.show_viewport=False;base=sample();mod.show_viewport=True;rows=[]
for even in [True,False]:
 mod.use_even_offset=even;vs=sample();n=len(base);assert len(vs)==2*n;d=sorted([((vs[i+n]-base[i]).length,i,list(base[i]),list(vs[i+n]))for i in range(n)],reverse=True);rows.append({'evenOffset':even,'max':d[:12],'countOver5mm':sum(x[0]>.005 for x in d),'countOver10mm':sum(x[0]>.01 for x in d)})
(P/'art/sleeve-shape-final/diagnosis.json').write_text(json.dumps(rows,indent=2));print(json.dumps(rows))
