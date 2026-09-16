"""Transplant the source-baked pro albedo only; retain every other original GLB payload."""
import json, struct, hashlib, copy
from pathlib import Path
ROOT = Path('harness/out/blender/five-presets-palettes')
sha = lambda b: hashlib.sha256(b).hexdigest()
def read(path):
    data = path.read_bytes()
    n = struct.unpack_from('<I', data, 12)[0]
    return json.loads(data[20:20+n]), data[28+n:]
def image_view(doc):
    material = next(m for m in doc['materials'] if m['name'] == 'rider_pro')
    texture = doc['textures'][material['pbrMetallicRoughness']['baseColorTexture']['index']]
    return doc['images'][texture['source']]['bufferView']
def payload(doc, data, i):
    view = doc['bufferViews'][i]
    view = view.get('extensions', {}).get('EXT_meshopt_compression', view)
    assert view['buffer'] == 0
    start = view.get('byteOffset', 0)
    return data[start:start+view['byteLength']]
reports = []
for suffix in ('', '-lod'):
    stem = 'rider-street'+suffix
    source = ROOT/'originals/public/models'/(stem+'.glb')
    rebaked = ROOT/'rebaked-models'/(stem+'.glb')
    original, old = read(source)
    baked, new = read(rebaked)
    for key in ('accessors', 'meshes', 'nodes', 'skins', 'animations'):
        assert original[key] == baked[key], key
    image_views = {i['bufferView'] for i in original['images']}
    assert len(original['bufferViews']) == len(baked['bufferViews'])
    for i in range(len(original['bufferViews'])):
        if i not in image_views:
            assert payload(original, old, i) == payload(baked, new, i), ('geometry/rig data', i)
    index = image_view(original)
    replacement = payload(baked, new, image_view(baked))
    view = original['bufferViews'][index]
    start = view['byteOffset']
    old_end = (start+view['byteLength']+3)//4*4
    padded = replacement + bytes((-len(replacement))%4)
    delta = len(padded)-(old_end-start)
    binary = old[:start]+padded+old[old_end:]
    result = copy.deepcopy(original)
    for i, v in enumerate(result['bufferViews']):
        if i == index:
            v['byteLength'] = len(replacement)
        elif v['buffer'] == 0 and v.get('byteOffset', 0) >= old_end:
            v['byteOffset'] += delta
        ext = v.get('extensions', {}).get('EXT_meshopt_compression')
        if ext and ext['buffer'] == 0 and ext['byteOffset'] >= old_end:
            ext['byteOffset'] += delta
    result['buffers'][0]['byteLength'] = len(binary)
    encoded = json.dumps(result, separators=(',', ':')).encode()
    encoded += b' '*((-len(encoded))%4)
    output = struct.pack('<III', 0x46546c67, 2, 28+len(encoded)+len(binary))+struct.pack('<II',len(encoded),0x4e4f534a)+encoded+struct.pack('<II',len(binary),0x004e4942)+binary
    dest = ROOT/'models'/(stem+'.glb'); dest.parent.mkdir(exist_ok=True)
    dest.write_bytes(output)
    verify, vb = read(dest)
    for i in range(len(original['bufferViews'])):
        assert payload(original, old, i) == payload(verify, vb, i) if i != index else payload(verify, vb, i) == replacement
    reports.append({'model':str(dest),'sha256':sha(output),'original':str(source),'originalSha256':sha(source.read_bytes()),'sourceBake':str(rebaked),'sourceBakeSha256':sha(rebaked.read_bytes()),'changedImage':original['images'][next(i for i,v in enumerate(original['images']) if v['bufferView']==index)]['name'],'allOtherBufferPayloadsByteIdentical':True,'accessorsMeshesNodesSkinsAnimationsExact':True,'unchangedImagePayloads':[v['name'] for v in original['images'] if v['bufferView']!=index]})
(ROOT/'palette-parity.json').write_text(json.dumps(reports,indent=2)+'\n')
print(json.dumps(reports,indent=2))
