"""Verify this source/recipe snapshot; optional --workspace checks retained large inputs too."""
import argparse,hashlib,json
from pathlib import Path
ap=argparse.ArgumentParser();ap.add_argument('--workspace',type=Path);args=ap.parse_args()
root=Path(__file__).resolve().parent;data=json.loads((root/'manifest.json').read_text());count=0
for item in data['package_files']:
 p=root/item['package_path'];assert p.is_file(),str(p)
 assert hashlib.sha256(p.read_bytes()).hexdigest()==item['sha256'],str(p);count+=1
if args.workspace:
 for item in data['workspace_files']:
  p=args.workspace/item['path'];assert p.is_file(),str(p)
  assert hashlib.sha256(p.read_bytes()).hexdigest()==item['sha256'],str(p);count+=1
print(json.dumps({'verified_files':count,'workspace_checked':bool(args.workspace),'models_in_manifest':len(data['models'])}))
