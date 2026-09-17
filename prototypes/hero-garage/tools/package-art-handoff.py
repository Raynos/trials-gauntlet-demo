#!/usr/bin/env python3
"""Package the current catalog and matching editable master for local handoff."""
from pathlib import Path
import hashlib,json,subprocess,tempfile,zipfile
P=Path(__file__).resolve().parents[1];D=P/'art/delivery';catalog=json.loads((P/'public/assets/catalog.json').read_text());master=json.loads((P/'reports/delivery-master.json').read_text())
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
# Never package an old Blender master beside newer catalog exports.
print('Master report keys:',list(master))
records=master.get('assets',master.get('sources',[]))
for a in catalog['assets']:
 p=P/'public'/a['url'].lstrip('/');record=next((r for r in records if r.get('kind')==a['kind']),None)
 if not record or record.get('sha256')!=sha(p):raise RuntimeError('Rebuild Blender master for current catalog before packaging: '+a['kind'])
files={}
def include(path,name=None):
 path=Path(path)
 if not path.is_file():raise FileNotFoundError(path)
 files[name or str(path.relative_to(P))]=path
include(D/'hero-garage-master.blend','hero-garage-master.blend')
include(P/'art/ART_HANDOFF.md','ART_HANDOFF.md');include(P/'art/delivery/REBUILD.md','REBUILD.md')
for a in catalog['assets']:include(P/'public'/a['url'].lstrip('/'),'exports/'+Path(a['url']).name)
include(P/'public/assets/catalog.json','exports/catalog.json')
for name in ['rig-contract.json','delivery-master.json','runtime-package.json']:
 include(P/'reports'/name,'reports/'+name)
for path in (P/'art/sources').rglob('*'):
 if path.name in ('provenance.json','license-evidence.html','README.md','BUNDLE-README.txt') and 'downloads' not in path.parts and 'local-only' not in path.parts:include(path,'provenance/'+str(path.relative_to(P/'art/sources')))
manifest={'scope':'Local editable art handoff, not public distribution or game integration. Component rebuild recipes remain in the repository.','catalogAssets':catalog['assets'],'files':{name:{'bytes':p.stat().st_size,'sha256':sha(p)}for name,p in files.items()}}
D.mkdir(exist_ok=True);out=D/'hero-garage-handoff.zip';temp=out.with_suffix('.zip.tmp')
with zipfile.ZipFile(temp,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=3,allowZip64=True)as z:
 for name,p in files.items():z.write(p,name)
 z.writestr('MANIFEST.json',json.dumps(manifest,indent=2)+'\n')
 z.writestr('START-HERE.txt','Open hero-garage-master.blend in Blender5.2.1. It contains rider, bike, studio and all six actions. Packed GLBs in exports require EXT_meshopt_compression support (Three MeshoptDecoder). See ART_HANDOFF.md for coordinate conventions, rig, limits and provenance. This ZIP is an inspection/editing delivery, not a standalone source-rebuild archive. Full recipes and frozen seeds are retained in the repository. No public distribution clearance is implied.\n')
with zipfile.ZipFile(temp)as z:
 bad=z.testzip()
 if bad:raise RuntimeError('ZIP CRC failed: '+bad)
temp.replace(out);result={'file':str(out),'bytes':out.stat().st_size,'sha256':sha(out),'files':len(files),'crcVerified':True,'catalogMatchesMaster':True};(P/'reports/art-handoff-package.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
