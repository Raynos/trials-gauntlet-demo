from pathlib import Path
import bpy,json
r=Path(__file__).resolve().parent
bpy.ops.wm.open_mainfile(filepath=str(r/'raw/bystedt-hair-styles.blend'))
report={'version':bpy.app.version_string,'objects':[],'texts':{t.name:t.as_string() for t in bpy.data.texts},'images':[{'name':i.name,'size':list(i.size),'packed':bool(i.packed_file)} for i in bpy.data.images]}
for o in bpy.data.objects:
 d={'name':o.name,'type':o.type,'data':o.data.name if o.data else None,'modifiers':[{'name':m.name,'type':m.type,'node_group':m.node_group.name if m.type=='NODES' and m.node_group else None} for m in o.modifiers]}
 if o.type=='CURVES':d.update(curves=len(o.data.curves),points=len(o.data.points),surface=o.data.surface.name if o.data.surface else None)
 if o.type=='MESH':d.update(vertices=len(o.data.vertices),faces=len(o.data.polygons))
 report['objects'].append(d)
(r/'inspection.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2)[:25000])
