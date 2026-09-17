#!/usr/bin/env python3
"""Canonical local art rebuild. Default is read-only planning; --execute runs it."""
from __future__ import annotations
import argparse, datetime, hashlib, json, os, shutil, subprocess, sys, uuid
from dataclasses import dataclass
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
P=ROOT/'prototypes/hero-garage'
ART=P/'art'
ASSETS=P/'public/assets'

@dataclass
class Step:
    name: str
    script: Path
    inputs: list[Path]
    outputs: list[Path]
    args: tuple[str,...]=()

def fingerprint(path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda:f.read(1024*1024),b''):h.update(chunk)
    return {'path':str(path.relative_to(ROOT)) if path.is_relative_to(ROOT) else str(path),'bytes':path.stat().st_size,'sha256':h.hexdigest()}

def recipe(stage):
    steps=[]
    rider=ROOT/'assets/blender/source/rider-street.blend'
    identity=ASSETS/'street01-rider-identity.glb'
    def add(name,folder,script,inputs,outputs,args=()):
        steps.append(Step(name,ART/folder/script,list(inputs),list(outputs),tuple(map(str,args))))
    add('identity','full-rider-identity','build.py',[ASSETS/'street01-rider-garment-repair.glb',ASSETS/'street01-head-groom.glb'],[identity])
    add('hoodie-source','hoodie-shell','build.py',[rider],[ART/'hoodie-shell/hoodie-source.blend',ASSETS/'street01-hoodie-shell.glb'])
    add('hoodie-assembly','hoodie-shell','assemble.py',[rider,identity,ASSETS/'street01-hoodie-shell.glb'],[ASSETS/'street01-rider-tailored.glb'])
    add('cloth-finish','hoodie-finish','build.py',[ART/'hoodie-shell/hoodie-source.blend'],[ART/'hoodie-finish/cloth28-source.blend',ASSETS/'street01-cloth28-donor.glb'])
    current=ASSETS/'street01-rider-cloth28.glb'
    add('cloth-assembly','hoodie-finish','assemble.py',[rider,identity,ASSETS/'street01-cloth28-donor.glb'],[current])
    if stage==29:
        add('neck-fit','cloth-neckfit-v2','build.py',[ART/'hoodie-finish/cloth28-source.blend',current],[ART/'cloth-neckfit-v2/neckfit-source.blend',ASSETS/'street01-neckfit-v2-donor.glb'])
        current=ASSETS/'street01-rider-neckfit-v2.glb'
        add('neck-assembly','cloth-neckfit-v2','assemble.py',[rider,identity,ASSETS/'street01-neckfit-v2-donor.glb'],[current])
    add('footwear','footwear-refine','build.py',[rider],[ASSETS/'street01-footwear-refined.glb',ART/'footwear-refine/source-removal-triangles.json'])
    target=ASSETS/f'street01-rider-delivery-{stage}-footwear.glb'
    add('footwear-assembly','footwear-refine','assemble.py',[rider,current,ASSETS/'street01-footwear-refined.glb',ART/'footwear-refine/source-removal-triangles.json'],[target],['--base',current,'--out',target]);current=target
    add('cuff-boundaries','glove-refine/cuff3','extract.py',[ART/'hoodie-finish/cloth28-source.blend'],[ART/'glove-refine/cuff3/sleeve-boundaries.json'])
    add('gloves','glove-refine/cuff3','build.py',[rider,ART/'glove-refine/cuff3/sleeve-boundaries.json'],[ASSETS/'street01-gloves-cuff3.glb',ART/'glove-refine/cuff3/source-removal-triangles.json'])
    target=ASSETS/f'street01-rider-delivery-{stage}-gloves.glb'
    add('glove-assembly','glove-refine/cuff3','assemble.py',[rider,current,ASSETS/'street01-gloves-cuff3.glb',ART/'glove-refine/cuff3/source-removal-triangles.json'],[target],['--base',current,'--out',target]);current=target
    add('accepted-denim','denim-refine','build-accepted.py',[rider,identity,ART/'denim-refine/source-removal-triangles.json'],[ART/'denim-refine/denim-accepted-source.blend',ASSETS/'street01-denim-refined-accepted.glb'])
    if stage==28:
        target=ASSETS/'street01-rider-delivery-raw.glb'
        add('denim-assembly','denim-refine','assemble-accepted.py',[rider,current,ASSETS/'street01-denim-refined-accepted.glb',ART/'denim-refine/source-removal-triangles.json'],[target],['--base',current,'--out',target])
    else:
        add('denim-textures','denim-texture','build.py',[rider,ART/'denim-refine/denim-accepted-source.blend',ART/'denim-refine/source-removal-triangles.json'],[ASSETS/'street01-denim-textured.glb',ART/'denim-texture/denim-textured-source.blend'])
        target=ASSETS/'street01-rider-delivery-raw.glb'
        add('denim-texture-assembly','denim-texture','assemble.py',[rider,current,ASSETS/'street01-denim-textured.glb',ART/'denim-refine/source-removal-triangles.json'],[target],['--base',current,'--out',target])
    return steps

def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--stage',type=int,choices=(28,29),required=True)
    ap.add_argument('--blender',default=os.environ.get('BLENDER') or '/Applications/Blender.app/Contents/MacOS/Blender')
    ap.add_argument('--node',default='node')
    ap.add_argument('--pack',action='store_true',help='Also write losslessly packed delivery; currently requires Blender5.2 Mac meshopt libraries.')
    ap.add_argument('--execute',action='store_true',help='Run recipes; without this flag print the exact commands and preflight findings only.')
    args=ap.parse_args();steps=recipe(args.stage)
    blender=shutil.which(args.blender) or (str(Path(args.blender).resolve()) if Path(args.blender).is_file() else None)
    node=shutil.which(args.node)
    def command(s):return [blender or args.blender,'-b','--python-exit-code','1','--python',str(s.script)]+(['--',*s.args] if s.args else [])
    generated=set();seeds=set();missing=[]
    for s in steps:
        if not s.script.is_file():missing.append(str(s.script))
        for p in s.inputs:
            if p not in generated:
                seeds.add(p)
                if not p.is_file():missing.append(str(p))
        generated.update(s.outputs)
    # Include transitive project helpers in the recipe manifest, even when only imported.
    helpers=sorted((ROOT/'assets/blender').glob('*.py'))+[ART/'hoodie-shell'/n for n in ('repair_annulus.py','build_hood.py','unwrap_cloth.py')]
    if args.stage==29:helpers.append(ART/'cloth-neckfit-v2/fit.py')
    for p in helpers:
        if not p.is_file():missing.append(str(p))
    if blender is None:missing.append('Blender executable: '+args.blender)
    pack_script=P/'tools/pack-art-lossless.mjs'
    if args.pack:
        libraries=[Path('/Applications/Blender.app/Contents/Resources/5.2/scripts/addons_core/io_scene_gltf2/libbf_intern_meshopt_bridge.dylib'),Path('/Applications/Blender.app/Contents/Resources/lib/libmeshoptimizer.dylib')]
        for p in [pack_script,P/'node_modules/three/package.json',*libraries]:
            if not p.is_file():missing.append(str(p))
        if node is None:missing.append('Node executable: '+args.node)
        if shutil.which('python3') is None:missing.append('python3 required by the lossless packer')
    plan={'stage':args.stage,'cwd':str(ROOT),'commands':[{'name':s.name,'argv':command(s),'inputs':[str(p)for p in s.inputs],'outputs':[str(p)for p in s.outputs]}for s in steps],'missing':sorted(set(missing)),'pack':args.pack}
    if not args.execute:
        print(json.dumps(plan,indent=2));return 1 if missing else 0
    if missing:raise SystemExit('Preflight failed; no recipes executed:\n'+'\n'.join(sorted(set(missing))))
    run=ART/'delivery/runs'/(datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'-'+uuid.uuid4().hex[:8]);run.mkdir(parents=True)
    manifest={'status':'running','stage':args.stage,'plan':plan,'sources':[fingerprint(p)for p in sorted(seeds)],'recipes':[fingerprint(p)for p in sorted(set([s.script for s in steps]+helpers+[Path(__file__).resolve()]))],'steps':[]}
    file=run/'manifest.json'
    def save():file.write_text(json.dumps(manifest,indent=2)+'\n')
    save()
    # Fixed recipe targets are intentional. Never run concurrently with art builders.
    try:
        with (run/'blender-version.log').open('w') as log:subprocess.run([blender,'--version'],cwd=ROOT,stdout=log,stderr=subprocess.STDOUT,check=True)
        for i,s in enumerate(steps):
            row={'name':s.name,'argv':command(s),'inputs':[fingerprint(p)for p in s.inputs],'log':f'{i:02d}-{s.name}.log'};manifest['steps'].append(row);save()
            print(f'[{i+1}/{len(steps)}] {s.name}',flush=True)
            with (run/row['log']).open('w') as log:result=subprocess.run(command(s),cwd=ROOT,stdout=log,stderr=subprocess.STDOUT)
            row['exitCode']=result.returncode
            if result.returncode:raise RuntimeError(f'{s.name} failed; see {run/row["log"]}')
            row['outputs']=[fingerprint(p)for p in s.outputs];save()
        final=ASSETS/'street01-rider-delivery-raw.glb';manifest['rawDelivery']=fingerprint(final)
        if args.pack:
            packed=ASSETS/'street01-rider-delivery-lossless.glb';cmd=[node,str(pack_script),str(final),str(packed)];row={'name':'lossless-pack','argv':cmd,'cwd':str(P),'inputs':[fingerprint(final),fingerprint(pack_script)],'log':'lossless-pack.log'};manifest['steps'].append(row);save()
            with (run/row['log']).open('w') as log:result=subprocess.run(cmd,cwd=P,stdout=log,stderr=subprocess.STDOUT)
            row['exitCode']=result.returncode
            if result.returncode:raise RuntimeError('Lossless packing failed; raw delivery remains available.')
            row['outputs']=[fingerprint(packed)];manifest['packedDelivery']=fingerprint(packed);shutil.copy2(P/'reports/art-lossless-pack.json',run/'lossless-proof.json')
        changed=[old['path']for old in manifest['sources'] if fingerprint(ROOT/old['path'])['sha256']!=old['sha256']]
        if changed:raise RuntimeError('Frozen inputs changed during rebuild: '+', '.join(changed))
        manifest['status']='built-not-visually-approved';save();print(str(file))
    except BaseException as e:
        manifest['status']='failed';manifest['error']=str(e);save();raise

if __name__=='__main__':main()
