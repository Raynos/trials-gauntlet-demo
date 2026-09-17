#!/usr/bin/env python3
"""Package reviewed variant exports named by the variant manifest, without changing the hero catalog."""
from pathlib import Path
import hashlib, json, zipfile
P=Path(__file__).resolve().parents[1]
manifest_path=P/'art/variants/manifest.json'
manifest=json.loads(manifest_path.read_text())
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
files={'manifest.json':manifest_path,'README.md':P/'art/variants/README.md'}
for row in manifest['riders']+manifest['bikes']:
 p=P/'public'/row['url'].lstrip('/')
 if sha(p)!=row['sha256']: raise RuntimeError('Variant changed since review: '+row['id'])
 files['exports/'+p.name]=p
for row in manifest.get('masters',[]):
 p=P/row['path']
 if sha(p)!=row['sha256']:raise RuntimeError('Master changed: '+row['path'])
 report=json.loads((P/row['report']).read_text())
 for asset in report['assets']:
  if sha(P/'public'/asset['source'].lstrip('/'))!=asset['sha256']:raise RuntimeError('Stale master asset: '+asset['source'])
 files['masters/'+p.name]=p
for name in manifest['evidence']:
 p=P/name
 if not p.is_file(): raise FileNotFoundError(p)
 files[name]=p
out=P/'art/delivery/hero-garage-variants.zip';tmp=out.with_suffix('.zip.tmp')
ledger={k:{'bytes':p.stat().st_size,'sha256':sha(p)} for k,p in files.items()}
with zipfile.ZipFile(tmp,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=3,allowZip64=True) as z:
 for k,p in files.items():z.write(p,k)
 z.writestr('CHECKSUMS.json',json.dumps(ledger,indent=2)+'\n')
with zipfile.ZipFile(tmp) as z:
 if z.testzip(): raise RuntimeError('ZIP CRC failed')
 for k,v in ledger.items():
  data=z.read(k)
  if len(data)!=v['bytes'] or hashlib.sha256(data).hexdigest()!=v['sha256']:raise RuntimeError('ZIP data mismatch: '+k)
tmp.replace(out)
report={'file':str(out),'bytes':out.stat().st_size,'sha256':sha(out),'files':len(files)+1,'crcVerified':True,'manifestHashesVerified':True}
(P/'reports/variant-package.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
