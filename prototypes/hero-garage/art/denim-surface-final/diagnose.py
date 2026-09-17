import bpy,json,numpy as np
from pathlib import Path
P=Path.cwd()/'prototypes/hero-garage';bpy.ops.wm.open_mainfile(filepath=str(P/'art/denim-finish/denim-finish-source.blend'));r={}
for m in bpy.data.objects['rider'].data.materials:
 r[m.name]=[{'type':n.bl_idname,'name':n.name,'inputs':{s.name:float(s.default_value)for s in n.inputs if hasattr(s,'default_value')and isinstance(s.default_value,(int,float))}}for n in m.node_tree.nodes if n.bl_idname in ['ShaderNodeBump','ShaderNodeTexNoise','ShaderNodeTexWave','ShaderNodeMath']]
r['normalMapAngularTiltDegreesPercentiles']={}
for label,path in [('accepted',P/'art/denim-texture/denim_normal.png'),('candidate',P/'art/denim-surface-final/denim_normal.png')]:
 im=bpy.data.images.load(str(path),check_existing=False);im.colorspace_settings.name='Non-Color';pix=np.array(im.pixels[:]).reshape(-1,4);n=pix[:,:3]*2-1;active=(pix[:,3]>.5)&(n[:,2]>.2)&(np.abs(n[:,0])+np.abs(n[:,1])>.015);angles=np.degrees(np.arctan2(np.linalg.norm(n[active,:2],axis=1),n[active,2]));r['normalMapAngularTiltDegreesPercentiles'][label]={str(q):float(np.percentile(angles,q))for q in [10,50,90,99]}
r['diagnosis']='Active normal comes from PHOTO image-derived micro normal strength0.65; original procedural fine weave is disconnected. Candidate reduces photo bump strength to0.18 while preserving the weave image, 0.271m tiling, albedo and ORM.'
r['statisticsScope']='Forward-facing non-flat normal texels including gutters; not a per-face material mask. Excludes inverse-facing/background texels. PNG read as non-color data.'
(P/'reports/denim-surface-final-diagnosis.json').write_text(json.dumps(r,indent=2));print(json.dumps(r['normalMapAngularTiltDegreesPercentiles']))
