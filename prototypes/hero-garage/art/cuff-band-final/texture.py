from pathlib import Path
from PIL import Image
import numpy as np,json
D=Path(__file__).resolve().parent;P=D.parents[1];mask=np.load(D/'cuff-mask.npy');report={}
for key in ['albedo','orm']:
 src=P/'art/cloth-surface/textures'/('cotton_'+key+'.png');im=Image.open(src);original=np.asarray(im).copy();m=mask if original.shape[0]==mask.shape[0]else np.asarray(Image.fromarray(mask,mode='F').resize(im.size,Image.Resampling.BOX));out=original.copy()
 if key=='albedo':
  srgb=original[:,:,:3]/255.;linear=np.where(srgb<=.04045,srgb/12.92,((srgb+.055)/1.055)**2.4);linear*=1-m[:,:,None]*(1-np.array([.74,.72,.70]));s=np.where(linear<=.0031308,linear*12.92,1.055*linear**(1/2.4)-.055);out[:,:,:3]=np.round(np.clip(s,0,1)*255).astype('uint8')
 else:out[:,:,1]=np.round(original[:,:,1]*(1-m)+(.93*255)*m).astype('uint8')
 out[m==0]=original[m==0];Image.fromarray(out).save(D/('cuff_'+key+'.png'));report[key]={'affectedTexels':int(np.count_nonzero(m)),'outsideMaskBytesExactlyPreserved':bool(np.array_equal(out[m==0],original[m==0]))}
(D/'texture-report.json').write_text(json.dumps(report,indent=2))
