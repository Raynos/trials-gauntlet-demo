#!/usr/bin/env python3
"""Package the current catalog and matching editable master for local handoff."""
from pathlib import Path
import hashlib,json,zipfile
P=Path(__file__).resolve().parents[1];D=P/'art/delivery';catalog=json.loads((P/'public/assets/catalog.json').read_text());master=json.loads((P/'reports/delivery-master.json').read_text())
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
# Never package an old/edited master or rig report beside newer catalog exports.
if master.get('sha256')!=sha(D/'hero-garage-master.blend'):raise RuntimeError('Master file differs from delivery-master.json; rebuild master before packaging')
if master.get('catalogSHA256')!=sha(P/'public/assets/catalog.json'):raise RuntimeError('Master does not fingerprint the current catalog including placements; rebuild master before packaging')
contract=json.loads((P/'reports/rig-contract.json').read_text())
records=master.get('assets',master.get('sources',[]))
for a in catalog['assets']:
 p=P/'public'/a['url'].lstrip('/');record=next((r for r in records if r.get('kind')==a['kind']),None)
 if not record or record.get('sha256')!=sha(p) or record.get('source')!=a['url']:raise RuntimeError('Rebuild Blender master for current catalog before packaging: '+a['kind'])
 rig=next((r for r in contract['assets']if r.get('id')==a['id']),None)
 if not rig or rig.get('sha256')!=sha(p) or rig.get('url')!=a['url'] or rig.get('placement',{}).get('position')!=a.get('position',[0,0,0]):raise RuntimeError('Regenerate rig-contract.json for current catalog before packaging: '+a['id'])
files={}
def include(path,name=None):
 path=Path(path)
 if not path.is_file():raise FileNotFoundError(path)
 files[name or str(path.relative_to(P))]=path
include(D/'hero-garage-master.blend','hero-garage-master.blend')
include(P/'art/ART_HANDOFF.md','ART_HANDOFF.md');include(P/'art/delivery/REBUILD.md','REBUILD.md')
include(P/'art/delivery/REBUILD-BIKE.md','REBUILD-BIKE.md')
include(P/'art/delivery/requirements-images.txt','requirements-images.txt')
include(P/'art/rig-contract/README.md','RIG-CONTRACT.md')
include(P/'art/material-contract/README.md','MATERIAL-CONTRACT.md')
for a in catalog['assets']:include(P/'public'/a['url'].lstrip('/'),'exports/'+Path(a['url']).name)
include(P/'public/assets/catalog.json','exports/catalog.json')
for name in ['rig-contract.json','delivery-master.json','delivery-master-reopen.json','material-contract.json','delivery-asset-ledger.json','delivery-stills.json','delivery-transitions.json','art-round33-review.json']:
 include(P/'reports'/name,'reports/'+name)
include(P/'public/references/target01.png','reference/target01.png')
for image in sorted((P/'captures/delivery-stills').glob('*.png')):include(image,'review/'+image.name)
include(P/'captures/delivery-transitions/transitions.webm','review/transitions.webm')
for selected in ['authored-human','authored-beard','replacement-hair']:
 for path in (P/'art/sources'/selected).glob('*'):
  if path.name in ('provenance.json','license-evidence.html','README.md','SOURCE.md') or path.name.startswith('LICENSE'):include(path,'provenance/'+str(path.relative_to(P/'art/sources')))
beard_archive=P/'art/sources/authored-beard/raw/bodyparts06_cc-by.zip'
with zipfile.ZipFile(beard_archive)as source_zip:
 notices=['Embedded author/license headers from source archive SHA256 '+sha(beard_archive)+'. Pack CC-BY versus embedded AGPL3 conflict remains unresolved.']
 for member in ['clothes/grinsegold_full_beard/grinsegold_full_beard.mhclo','clothes/grinsegold_moustache/grinsegold_moustache.mhclo']:
  headers=[line for line in source_zip.read(member).decode('utf-8').splitlines() if line.startswith('#')]
  notices.extend(['',member,*headers])
notice_text='\n'.join(notices)+'\n'
manifest={'scope':'Local editable art handoff, not public distribution or game integration. Component rebuild recipes remain in the repository.','catalogAssets':catalog['assets'],'files':{name:{'bytes':p.stat().st_size,'sha256':sha(p)}for name,p in files.items()}}
D.mkdir(exist_ok=True);out=D/'hero-garage-handoff.zip';temp=out.with_suffix('.zip.tmp')
with zipfile.ZipFile(temp,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=3,allowZip64=True)as z:
 for name,p in files.items():z.write(p,name)
 z.writestr('provenance/authored-beard/EMBEDDED-NOTICES.txt',notice_text)
 manifest['files']['provenance/authored-beard/EMBEDDED-NOTICES.txt']={'bytes':len(notice_text.encode()),'sha256':hashlib.sha256(notice_text.encode()).hexdigest()}
 z.writestr('MANIFEST.json',json.dumps(manifest,indent=2)+'\n')
 z.writestr('START-HERE.txt','Open hero-garage-master.blend in Blender5.2.1. It contains rider, bike, studio and all six actions. Packed GLBs in exports require EXT_meshopt_compression support (Three MeshoptDecoder). See ART_HANDOFF.md for coordinate conventions, rig, limits and provenance. This ZIP is an inspection/editing delivery, not a standalone source-rebuild archive. Full recipes and frozen seeds are retained in the repository. No public distribution clearance is implied.\n')
with zipfile.ZipFile(temp)as z:
 bad=z.testzip()
 if bad:raise RuntimeError('ZIP CRC failed: '+bad)
 for name,expected in manifest['files'].items():
  data=z.read(name)
  if len(data)!=expected['bytes'] or hashlib.sha256(data).hexdigest()!=expected['sha256']:raise RuntimeError('ZIP manifest mismatch: '+name)
temp.replace(out);result={'file':str(out),'bytes':out.stat().st_size,'sha256':sha(out),'files':len(files)+3,'crcVerified':True,'manifestHashesVerified':True,'catalogMatchesMaster':True};(P/'reports/art-handoff-package.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
