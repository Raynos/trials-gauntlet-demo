"""Qualify freshly available played recordings serially against frozen build."""
import json, pathlib, subprocess, time
root=pathlib.Path('docs/evidence/riding-poses/goldens-round3')
pending=[r['file'] for r in json.loads((root/'refresh.json').read_text())['rows']]
while pending:
 ready=[p for p in pending if 'src=1255af7f' in json.loads(pathlib.Path(p).read_text())['header'].get('note','')]
 for file in ready:
  p=pathlib.Path(file); name=p.parent.name+('-pro' if '-pro' in p.name else '-rookie')
  report=root/f'verified-{name}.json'
  if not report.exists():
   with (root/f'verified-{name}.log').open('w') as log:
    code=subprocess.run(['pnpm','exec','tsx',str(root/'verify.mts'),str(report),file],stdout=log,stderr=subprocess.STDOUT).returncode
   print(name,code,flush=True)
  pending.remove(file)
 if pending:time.sleep(15)
reports=[json.loads(p.read_text()) for p in sorted(root.glob('verified-*.json'))]
(root/'browser-all.json').write_text(json.dumps({'fingerprint':'1255af7f','rows':[r for p in reports for r in p['rows']]},indent=2)+'\n')
