"""Reuse the identity assembly with the refined body; frozen head source unchanged."""
from pathlib import Path
P=Path.cwd()/'prototypes/hero-garage'
s=(P/'art/full-rider-identity/build.py').read_text().replace('street01-rider-garment-repair.glb','street01-rider-hoodie-refine-body.glb').replace('street01-rider-identity.glb','street01-rider-hoodie-refine.glb').replace('reports/full-rider-identity.json','reports/hoodie-refine-identity.json')
exec(compile(s,'hoodie-refine-identity','exec'))
