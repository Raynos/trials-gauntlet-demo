"""Two extra user-authorized workers, prioritizing the trailing extreme Pro cells."""
import concurrent.futures,json,pathlib,subprocess
root=pathlib.Path('docs/evidence/riding-poses/goldens-round3')
def run(track):
 base=root/f'{track}-pro-priority'
 with open(f'{base}.log','w') as log:
  result=subprocess.run(['pnpm','harness:bot',track,'--bike','pro','--skill','3','--seeds','1','--jobs','1','--track-wall-s','300','--no-verify'],stdout=log,stderr=subprocess.STDOUT)
 fresh='src=1255af7f' in json.loads(pathlib.Path(f'harness/inputs/{track}/bot-3-pro.json').read_text())['header'].get('note','')
 row=[track,'pro',result.returncode,'node-fresh' if fresh else 'still-stale'];print(row,flush=True);return row
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
 rows=list(pool.map(run,['x3-gauntlet','x2-pipe-dream','x1-vertical-limit','p5-foundry-floor','p4-night-circuit','p3-snow-line']))
(root/'search-priority.json').write_text(json.dumps(rows,indent=2)+'\n')
