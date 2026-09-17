"""Snapshot explicitly selected, reviewed exports for a local variant handoff."""
import hashlib,json
from pathlib import Path
P=Path(__file__).resolve().parents[2];config=json.loads((P/'art/variants/selection.json').read_text())
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def entry(identifier,url):
 p=P/'public'/url.lstrip('/')
 return {'id':identifier,'url':url,'bytes':p.stat().st_size,'sha256':sha(p),'position':[0,.34,0]}
riders=[entry('street-mustard','/assets/street01-rider-round33-lossless.glb')]+[entry(n['id'],'/assets/variants/'+n['export']+'.glb')for n in config['riders']]
bikes=[entry(n,'/assets/variants/bike-'+n+'-art.glb')for n in ['rookie','pro']]
evidence=[]
for folder in config['sourceFolders']:
 for p in (P/'art'/folder).iterdir():
  if p.suffix in ['.json','.py','.mjs','.md']:evidence.append(str(p.relative_to(P)))
masters=[]
for row in config['riders']:
 n=row['export'];stills=row['stills'];motion=row['motion']
 evidence.extend(['captures/'+stills+'/rider-bike-neutral.png','captures/'+stills+'/face-curls-beard.png','captures/'+motion+'/six-clips.webm','reports/'+motion+'.json',row['rig'],'reports/'+n+'-master.json',row['masterVerification']])
 p=P/'art/delivery'/(n+'-master.blend')
 masters.append({'id':row['id'],'path':str(p.relative_to(P)),'bytes':p.stat().st_size,'sha256':sha(p),'report':'reports/'+n+'-master.json'})
evidence+=['captures/delivery-stills/rider-bike-neutral.png','captures/variants-bike-pro/complete-bike.png','captures/variants-bike-pro-motion/six-clips.webm','reports/variants-bike-pro-motion.json',config['review'],'art/variants/build-review-master.py','art/variants/verify-master.py','art/variants/selection.json','art/variants/OPUS_HANDOFF.md','art/ART_HANDOFF.md','art/delivery/requirements-images.txt']
manifest={'schema':'hero-garage.variants.v1','scope':'Local art delivery; game integration remains Claude + Opus owned','riders':riders,'bikes':bikes,'additionalBikeDesigns':'Three requested skins not found in source; awaiting user identification','masters':masters,'evidence':sorted(set(evidence)),'approval':'Provisional parent review; final user visual and iPhone approval open'}
(P/'art/variants/manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps({'riders':len(riders),'bikes':len(bikes),'masters':len(masters),'evidence':len(evidence)}))
