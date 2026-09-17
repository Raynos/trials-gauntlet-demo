import bpy,json
from pathlib import Path
P=Path.cwd()/'prototypes/hero-garage';D=P/'art/bike-variants';bpy.ops.wm.open_mainfile(filepath=str(D/'bike-pro-paint-source.blend'));o=bpy.data.objects['fork_upper'];mats={o.data.materials[p.material_index]for p in o.data.polygons};rows=[]
for m in mats:
 nodes=[n for n in m.node_tree.nodes if n.name.startswith('CW_num_')]if m.use_nodes else []
 if not nodes:continue
 values={n.name:float(n.outputs[0].default_value)for n in nodes};assert len(values)==6;assert all(v==.25 for v in values.values());rows.append({'material':m.name,'allThreeDigitProjections':values})
assert len(rows)==1; (D/'digit-verification.json').write_text(json.dumps({'canonicalDigit':'1','sheetCellOrigin':[.25,.25],'selectedFrontPlateSourceMaterials':rows,'cause':'Common apply_colourway ignores Blender .001/.002 node suffixes; local recipe explicitly sets all digit-cell nodes.'},indent=2))
