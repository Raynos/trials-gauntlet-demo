"""Color only the attached portrait skin to identify residual body-neck surfaces.
Run from the repository root. Only the disposable dist asset is temporarily changed;
it is restored even if the headless capture fails. No production asset is edited.
"""
from pathlib import Path
import hashlib, json, struct, subprocess
P = Path(__file__).resolve().parents[2]
source = P/'public/assets/street01-rider-identity.glb'
destination = P/'dist/assets/street01-rider-identity.glb'
raw = source.read_bytes()
n = struct.unpack_from('<I', raw, 12)[0]
doc = json.loads(raw[20:20+n])
binary_chunk = raw[20+n:]
mesh = next(m for m in doc['meshes'] if m.get('name') == 'base.001')
material_ids = sorted({p['material'] for p in mesh['primitives']})
for i in material_ids:
    doc['materials'][i] = {'name':'DIAGNOSTIC_attached_portrait_skin_GREEN',
        'pbrMetallicRoughness':{'baseColorFactor':[0,1,0,1],'metallicFactor':0,'roughnessFactor':1},
        'doubleSided':True,'extensions':{'KHR_materials_unlit':{}}}
if 'KHR_materials_unlit' not in doc.setdefault('extensionsUsed',[]):
    doc['extensionsUsed'].append('KHR_materials_unlit')
encoded = json.dumps(doc,separators=(',',':')).encode()
encoded += b' '*((-len(encoded))%4)
trial = struct.pack('<III',0x46546c67,2,20+len(encoded)+len(binary_chunk))+struct.pack('<II',len(encoded),0x4e4f534a)+encoded+binary_chunk
previous = destination.read_bytes()
try:
    destination.write_bytes(trial)
    result = subprocess.run(['node','tools/capture.mjs','--url','http://127.0.0.1:4179','--engine','webkit','--seconds','3','--name','neck-component-round23','--camera','face','--clip','forward_attack'],cwd=P)
finally:
    destination.write_bytes(previous)
report = {'purpose':'Component attribution only; false-color diagnostic is not an art candidate.',
    'sourceSHA256':hashlib.sha256(raw).hexdigest(),'diagnosticSHA256':hashlib.sha256(trial).hexdigest(),
    'changedMaterials':material_ids,'binaryChunkIdentical':trial[-len(binary_chunk):]==binary_chunk,
    'productionSourceUnchanged':source.read_bytes()==raw,'previewRestored':destination.read_bytes()==previous,
    'captureExitCode':result.returncode}
(P/'reports/neck-component-round23-build.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report))
raise SystemExit(result.returncode)
