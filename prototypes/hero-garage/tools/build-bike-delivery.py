#!/usr/bin/env python3
"""Bike art rebuild from frozen sources. Dry preflight by default."""
import argparse,datetime,hashlib,json,shutil,subprocess,time,uuid
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3];P=ROOT/'prototypes/hero-garage';A=P/'art';AS=P/'public/assets';BLENDER=Path('/Applications/Blender.app/Contents/MacOS/Blender')
def fp(p):return {'path':str(p.relative_to(ROOT)),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
def recipe():
 source=ROOT/'assets/blender/source/bike.blend';paint=[A/'bike-paint'/f'paint_{k}.png'for k in ['albedo','normal','orm']]
 rows=[('detail',[source,A/'bike-refine/bike-refined.blend'],[A/'bike-detail/bike-detail.blend']),('finish',[source,A/'bike-detail/bike-detail.blend'],[A/'bike-finish/bike-finish.blend']),('paint',[source,A/'bike-finish/bike-finish.blend'],[A/'bike-paint/bike-paint-source.blend',*paint]),('contours',[A/'bike-paint/bike-paint-source.blend',*paint],[A/'bike-contours/bike-contours-source.blend']),('exhaust',[source,A/'bike-contours/bike-contours-source.blend',*paint],[A/'bike-exhaust/bike-exhaust-source.blend',*[A/'bike-exhaust'/f'header_{k}.png'for k in ['albedo','normal','orm']]])]
 return [{'name':n,'script':A/f'bike-{n}/build.py','inputs':i,'outputs':o+[AS/f'street01-bike-{n}.glb']}for n,i,o in rows]
def main():
 ap=argparse.ArgumentParser();ap.add_argument('--execute',action='store_true');ap.add_argument('--repeat',type=int,choices=[1,2],default=1);args=ap.parse_args();steps=recipe();generated=set();external=set();missing=[]
 for s in steps:
  if not s['script'].is_file():missing.append(str(s['script']))
  for p in s['inputs']:
   if p not in generated:
    external.add(p)
    if not p.is_file():missing.append(str(p))
  generated.update(s['outputs'])
 external.add(ROOT/'assets/blender/common.py');external.add(Path(__file__).resolve());external.add(P/'art/bike-exhaust/verify.mjs');external.add(P/'src/bikeSuspension.ts');external.add(AS/'street01-rider-garment-repair.glb')
 if not BLENDER.is_file():missing.append(str(BLENDER))
 external=sorted(external);manifest={'mode':'execute'if args.execute else 'dry-preflight','missing':missing,'frozenAndSharedInputs':[fp(p)for p in external if p.exists()],'recipes':[fp(s['script'])for s in steps],'steps':[{'name':s['name'],'inputs':[str(p.relative_to(ROOT))for p in s['inputs']],'outputs':[str(p.relative_to(ROOT))for p in s['outputs']]}for s in steps]}
 if missing:print(json.dumps(manifest,indent=2));raise SystemExit(1)
 if not args.execute:print(json.dumps(manifest,indent=2));return
 out=AS/'street01-bike-exhaust.glb';backup=AS/'street01-bike-reviewed-backup.glb';expected='7877404ef7e9e2f5f25550a7d979b8f62e6e20774109294221a14e9877c8d9de'
 if not backup.exists():
  assert fp(out)['sha256']==expected,'Reviewed source does not match expected approved hash';shutil.copy2(out,backup)
 assert fp(backup)['sha256']==expected,'Reviewed backup mismatch'
 manifest['reviewedBackup']=fp(backup);manifest['blenderVersion']=subprocess.check_output([str(BLENDER),'--version'],text=True).splitlines()[0]
 runid=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'-'+uuid.uuid4().hex[:8];run=A/'delivery/bike-runs'/runid;run.mkdir(parents=True);mp=run/'manifest.json';manifest['runs']=[];started=time.monotonic()
 def save():mp.write_text(json.dumps(manifest,indent=2)+'\n')
 try:
  for ri in range(args.repeat):
   rr={'index':ri+1,'steps':[]};manifest['runs'].append(rr);rstart=time.monotonic()
   for s in steps:
    row={'name':s['name'],'recipe':fp(s['script']),'inputs':[fp(p)for p in s['inputs']]};rr['steps'].append(row);t=time.monotonic();log=run/f'run{ri+1}-{s["name"]}.log';row['log']=str(log.relative_to(ROOT));save()
    with log.open('w')as f:r=subprocess.run([str(BLENDER),'-b','--python-exit-code','1','--python',str(s['script'])],cwd=ROOT,stdout=f,stderr=subprocess.STDOUT)
    row['seconds']=round(time.monotonic()-t,3);row['exitCode']=r.returncode
    if r.returncode:raise RuntimeError(f'{s["name"]} failed: {log}')
    row['outputs']=[fp(p)for p in s['outputs']];save()
   log=run/f'run{ri+1}-mechanics.log';t=time.monotonic()
   with log.open('w')as f:r=subprocess.run(['node','--experimental-strip-types','art/bike-exhaust/verify.mjs'],cwd=P,stdout=f,stderr=subprocess.STDOUT)
   rr['mechanics']={'exitCode':r.returncode,'seconds':round(time.monotonic()-t,3),'log':str(log.relative_to(ROOT))};assert r.returncode==0,'Mechanical verification failed'
   snap=run/f'run{ri+1}-bike-exhaust.glb';shutil.copy2(out,snap);rr['final']=fp(snap);rr['seconds']=round(time.monotonic()-rstart,3);save()
  manifest['repeatByteIdentical']=len({r['final']['sha256']for r in manifest['runs']})==1;manifest['reviewedByteIdentical']=all(r['final']['sha256']==expected for r in manifest['runs']);manifest['frozenAndSharedInputsUnchanged']=manifest['frozenAndSharedInputs']==[fp(p)for p in external];assert manifest['frozenAndSharedInputsUnchanged'];manifest['status']='complete'
 except Exception as e:manifest['status']='failed';manifest['error']=str(e);raise
 finally:
  if fp(out)['sha256']!=expected:shutil.copy2(backup,out);manifest['reviewedFinalRestored']=True
  else:manifest['reviewedFinalRestored']=False
  manifest['totalSeconds']=round(time.monotonic()-started,3);save();print(str(mp));print(json.dumps({k:v for k,v in manifest.items()if k in ['status','repeatByteIdentical','reviewedByteIdentical','reviewedFinalRestored','totalSeconds']}))
if __name__=='__main__':main()
