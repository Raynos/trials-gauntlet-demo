"""Two independent search workers; every played frame is preserved, no state edits."""
import concurrent.futures, glob, json, os, pathlib, subprocess, threading
ROOT=pathlib.Path('docs/evidence/riding-poses/goldens-final')
FP='ae2c0bca'
lock=threading.Lock()
files=list((ROOT/'before').glob('*/bot-*.json'))
core=['b1-first-ride','b2-lean-back','b3-kicker-row','e1-uphill-weight','e2-rear-wheel-first','e3-stairway','flat-test','gap-test']
files.sort(key=lambda p:(0 if p.parent.name in core else 1, '-pro' in p.name, core.index(p.parent.name) if p.parent.name in core else p.parent.name))

def run(p):
 track=p.parent.name; bike='pro' if '-pro' in p.name else 'rookie'; target=pathlib.Path('harness/inputs')/track/p.name
 if f'src={FP}' in json.load(open(target))['header'].get('note',''):return (track,bike,'already-node-fresh')
 prefix=None
 for f in sorted(glob.glob(f'harness/out/bot/{track}/*skill3*.json'),key=os.path.getmtime,reverse=True):
  if '.rec.' in f:continue
  r=json.load(open(f))
  if r.get('srcFingerprint')==FP and r.get('bike')==bike and r.get('outcome')=='wallTimeout' and r.get('playReplayDivergence') is None:
   prefix=r['recordingFile'];break
 base=ROOT/f'{track}-{bike}'
 cmd=['pnpm','exec','tsx','docs/evidence/riding-poses/goldens-final/continue.mts',prefix,str(base), '240'] if prefix else ['pnpm','harness:bot',track,'--bike',bike,'--skill','3','--seeds','1','--jobs','1','--track-wall-s','300','--no-verify']
 with open(f'{base}.log','w') as log:r=subprocess.run(cmd,stdout=log,stderr=subprocess.STDOUT)
 fresh=f'src={FP}' in json.load(open(target))['header'].get('note','')
 row=(track,bike,r.returncode,'node-fresh' if fresh else 'still-stale')
 with lock:print(row,flush=True)
 return row
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
 rows=list(pool.map(run,files))
(ROOT/'search-remaining.json').write_text(json.dumps(rows,indent=2)+'\n')
