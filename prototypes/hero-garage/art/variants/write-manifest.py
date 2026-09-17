"""Snapshot reviewed named exports and their evidence for a local variant handoff."""
import hashlib,json
from pathlib import Path
P=Path(__file__).resolve().parents[2]
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def entry(identifier,url):
 p=P/'public'/url.lstrip('/')
 return {'id':identifier,'url':url,'bytes':p.stat().st_size,'sha256':sha(p),'position':[0,.34,0]}
riders=[entry('street-mustard','/assets/street01-rider-round33-lossless.glb')]+[entry(n,'/assets/variants/'+n+'.glb')for n in ['street-charcoal','street-openface','race-bluewhite','race-charcoalyellow']]
bikes=[entry(n,'/assets/variants/bike-'+n+'-art.glb')for n in ['rookie','pro']]
evidence=[]
for folder in ['street-variants','race-variants','bike-variants']:
 for p in (P/'art'/folder).iterdir():
  if p.suffix in ['.json','.py','.mjs','.md']:evidence.append(str(p.relative_to(P)))
for name in ['street-charcoal','street-openface','race-bluewhite','race-charcoalyellow']:
 evidence.append('captures/'+name+'-final/rider-bike-neutral.png')
 evidence.append('captures/'+name+'-final/face-curls-beard.png')
 motion=name+('-collar-final' if name.startswith('race') else '-review')
 evidence.append('captures/'+motion+'/six-clips.webm')
 evidence.append('reports/'+motion+'.json')
 evidence.append('reports/'+name+'-master.json')
 evidence.append('reports/'+name+('-rig.json' if name.startswith('street')else '-rig-contract.json'))
evidence+=['captures/delivery-stills/rider-bike-neutral.png','captures/variants-bike-pro/complete-bike.png','captures/variants-bike-pro-motion/six-clips.webm','reports/variants-bike-pro-motion.json','reports/art-round34-review.json','art/variants/build-review-master.py','art/variants/verify-master.py','art/ART_HANDOFF.md','art/delivery/requirements-images.txt']
for p in (P/'art/variants').glob('*-master-reopen.json'):evidence.append(str(p.relative_to(P)))
masters=[]
for n in ['street-charcoal','street-openface','race-bluewhite','race-charcoalyellow']:
 p=P/'art/delivery'/(n+'-master.blend')
 masters.append({'id':n,'path':str(p.relative_to(P)),'bytes':p.stat().st_size,'sha256':sha(p),'report':'reports/'+n+'-master.json'})
manifest={'schema':'hero-garage.variants.v1','scope':'Local art delivery; game integration remains Claude + Opus owned','riders':riders,'bikes':bikes,'additionalBikeDesigns':'Three requested skins not found in source; awaiting user identification','masters':masters,'evidence':sorted(set(evidence)),'approval':'Provisional parent review; final user visual and iPhone approval open'}
(P/'art/variants/manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps({'riders':len(riders),'bikes':len(bikes),'masters':len(masters),'evidence':len(evidence)}))
