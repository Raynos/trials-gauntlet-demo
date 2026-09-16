from pathlib import Path
P=Path.cwd()/'prototypes/hero-garage'
s=(P/'art/rider-garment-repair/verify.py').read_text().replace('street01-rider-garment-repair.glb','street01-rider-hoodie-refine-body.glb').replace('reports/rider-garment-repair.json','reports/hoodie-refine-build.json').replace("==583","==1751")
exec(compile(s,'hoodie-refine-verification','exec'))
